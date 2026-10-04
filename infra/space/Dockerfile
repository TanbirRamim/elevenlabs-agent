# Single-image backend for a Hugging Face Docker Space (free CPU tier): the Fastify API
# plus Microsoft Presidio analyzer, anonymizer and image redactor, all in one container.
# Only port 7860 is public; Presidio listens on 127.0.0.1 and is never reachable from outside.
#
#   docker build -f infra/space/Dockerfile -t shadow-space .   # from the repo root
#   docker run -p 7861:7860 --env-file .env shadow-space
#
# The build only needs the files COPY'd below, so infra/space/bundle.sh can ship a small
# subset of the repo to the Space (Hugging Face rejects pushes that carry binary files).

# ---------- 1. build the API (same steps as apps/api/Dockerfile) ----------
FROM node:22-slim AS build
WORKDIR /repo
# LEFTHOOK=0: git hooks are for developer machines, not image builds.
ENV LEFTHOOK=0 CI=1
RUN corepack enable
# Every workspace manifest, so the frozen lockfile matches; only the API's graph is installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/edge/package.json apps/edge/
COPY apps/web/package.json apps/web/
COPY packages/guard/package.json packages/guard/
COPY packages/prompts/package.json packages/prompts/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile --filter shadow --filter "@shadow/api..."
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter "@shadow/api..." build && pnpm deploy --filter @shadow/api --prod /out

# ---------- 2. runtime: Python (Presidio) + Node 22 (API) ----------
FROM python:3.12-slim-bookworm

# tesseract-ocr: OCR for the image redactor. tini: PID 1 that forwards signals and reaps.
# libgl1/libglib2.0-0/libsm6/libxext6: runtime libraries opencv-python needs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tini libgl1 libglib2.0-0 libsm6 libxext6 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

# Same Presidio release as the live demo's mcr.microsoft.com images; spaCy model as theirs.
ARG PRESIDIO_VERSION=2.2.362
ARG PRESIDIO_IMAGE_REDACTOR_VERSION=0.0.58
ARG SPACY_MODEL_URL=https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.8.0/en_core_web_lg-3.8.0-py3-none-any.whl
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN python -m venv /opt/presidio-venv \
  && /opt/presidio-venv/bin/pip install \
    "presidio-analyzer==${PRESIDIO_VERSION}" \
    "presidio-anonymizer==${PRESIDIO_VERSION}" \
    "presidio-image-redactor==${PRESIDIO_IMAGE_REDACTOR_VERSION}" \
    "flask>=3,<4" "gunicorn>=23,<26" \
    "${SPACY_MODEL_URL}"

# Microsoft's own REST servers (app.py), unmodified, from the same release tag.
ARG PRESIDIO_SRC=https://raw.githubusercontent.com/microsoft/presidio/${PRESIDIO_VERSION}
ADD ${PRESIDIO_SRC}/presidio-analyzer/app.py /opt/presidio/analyzer/app.py
ADD ${PRESIDIO_SRC}/presidio-analyzer/logging.ini /opt/presidio/analyzer/logging.ini
ADD ${PRESIDIO_SRC}/presidio-anonymizer/app.py /opt/presidio/anonymizer/app.py
ADD ${PRESIDIO_SRC}/presidio-anonymizer/logging.ini /opt/presidio/anonymizer/logging.ini
ADD ${PRESIDIO_SRC}/presidio-image-redactor/app.py /opt/presidio/image-redactor/app.py
RUN chmod -R a+rX /opt/presidio

# Hugging Face runs Docker Spaces as uid 1000.
RUN useradd -m -u 1000 user
WORKDIR /app
COPY --from=build --chown=user /out ./
COPY --chown=user seed ./seed
# The API keeps sessions as JSONL under <seed>/../infra/data/state and, without S3, recordings
# and frames under <seed>/../infra/data/objects (apps/api/src/main.ts). The Space disk is
# ephemeral: both survive API restarts but not a Space restart, unless S3_* points at durable
# storage. What a restart must not lose (the published Work Map and its clips) is committed in
# seed/boot and restored at startup via SHADOW_BOOT_DIR (see docs/DEPLOY_SPACE.md).
RUN mkdir -p /app/infra/data/state /app/infra/data/objects && chown -R user /app/infra
COPY --chmod=755 infra/space/start.sh /usr/local/bin/shadow-start

USER user
# Warm the per-user caches (matplotlib fonts, fontconfig, tldextract's suffix list) at build
# time, so a cold start on the Space does not rebuild or download them.
RUN HOME=/home/user /opt/presidio-venv/bin/python -W ignore -c \
  "import presidio_image_redactor, matplotlib.pyplot; from presidio_analyzer import AnalyzerEngine; AnalyzerEngine().analyze('jane@example.com', language='en')"
ENV HOME=/home/user \
    NODE_ENV=production \
    API_PORT=7860 \
    PRESIDIO_ANALYZER_URL=http://127.0.0.1:5102 \
    PRESIDIO_ANONYMIZER_URL=http://127.0.0.1:5101 \
    PRESIDIO_IMAGE_REDACTOR_URL=http://127.0.0.1:5103 \
    SHADOW_BOOT_DIR=/app/seed/boot \
    GUARD_JUDGE_TIMEOUT_MS=6000
EXPOSE 7860
HEALTHCHECK --start-period=120s CMD node -e "fetch('http://127.0.0.1:7860/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/shadow-start"]
