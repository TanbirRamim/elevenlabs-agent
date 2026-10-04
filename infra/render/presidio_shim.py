"""One-process Presidio for the 512 MB Render image (infra/render/Dockerfile).

Serves the endpoints apps/api calls, with the same request/response shapes as Microsoft's
presidio-analyzer, presidio-anonymizer and presidio-image-redactor REST apps:
  POST /analyze    {"text", "language"}                -> [{entity_type, start, end, score}]
  POST /anonymize  {"text", "analyzer_results"}        -> {"text", "items"}
  POST /redact     multipart "image"                   -> redacted image bytes
  GET  /health                                         -> 200
One AnalyzerEngine (spaCy en_core_web_sm) is shared by text and image redaction, so the model
is loaded once. The image redactor is optional: it is imported lazily on the first /redact;
SHADOW_IMAGE_REDACTOR=0 disables it and
/redact answers 503, which the API treats as "drop the frame" (fails closed).
"""

import io
import os
import threading

from flask import Flask, Response, jsonify, request
from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine

MODEL = os.environ.get("SPACY_MODEL", "en_core_web_sm")
nlp = NlpEngineProvider(
    nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": MODEL}],
    }
).create_engine()
analyzer = AnalyzerEngine(nlp_engine=nlp, supported_languages=["en"])
anonymizer = AnonymizerEngine()

IMAGE_ENABLED = os.environ.get("SHADOW_IMAGE_REDACTOR", "1") == "1"
_image_redactor = None
_image_lock = threading.Lock()


def image_redactor():
    """Imported on first /redact: opencv + tesseract bindings cost minutes of a 0.1 CPU boot."""
    global _image_redactor
    with _image_lock:
        if _image_redactor is None:
            from presidio_image_redactor import ImageAnalyzerEngine, ImageRedactorEngine

            _image_redactor = ImageRedactorEngine(
                image_analyzer_engine=ImageAnalyzerEngine(analyzer_engine=analyzer)
            )
        return _image_redactor


app = Flask(__name__)


@app.get("/health")
def health():
    return "Presidio shim service is up"


@app.post("/analyze")
def analyze():
    body = request.get_json(force=True)
    results = analyzer.analyze(
        text=body["text"],
        language=body.get("language", "en"),
        entities=body.get("entities"),
        score_threshold=body.get("score_threshold"),
    )
    return jsonify(
        [
            {"entity_type": r.entity_type, "start": r.start, "end": r.end, "score": r.score}
            for r in results
        ]
    )


@app.post("/anonymize")
def anonymize():
    body = request.get_json(force=True)
    results = [
        RecognizerResult(r["entity_type"], r["start"], r["end"], r.get("score", 1.0))
        for r in body.get("analyzer_results", [])
    ]
    out = anonymizer.anonymize(text=body["text"], analyzer_results=results)
    return jsonify(
        {
            "text": out.text,
            "items": [
                {"start": i.start, "end": i.end, "entity_type": i.entity_type, "text": i.text}
                for i in out.items
            ],
        }
    )


@app.post("/redact")
def redact():
    if not IMAGE_ENABLED:
        return Response("image redaction disabled", status=503)
    from PIL import Image

    f = request.files.get("image")
    if f is None:
        return Response("missing image", status=400)
    img = Image.open(f.stream).convert("RGB")
    redacted = image_redactor().redact(img, fill=(0, 0, 0))
    buf = io.BytesIO()
    redacted.save(buf, format="JPEG", quality=85)
    return Response(buf.getvalue(), mimetype="image/jpeg")
