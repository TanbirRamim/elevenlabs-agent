# Backend image for Render's free Docker web service (512 MB RAM, 0.1 CPU): the Fastify API
# plus ONE Python process serving Presidio analyzer, anonymizer and image redactor
# (presidio_shim.py) with spaCy en_core_web_sm. Presidio listens on 127.0.0.1 only.
#
#   docker build -f infra/render/Dockerfile -t shadow-render .   # from the repo root
#   docker run -m 512m -p 7891:10000 -e PORT=10000 --env-file .env shadow-render
#
# See docs/DEPLOY_RENDER.md. Render injects $PORT; start.sh maps it to API_PORT.

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


# ---------- 2. runtime: Python (Presidio shim) + Node 22 (API) ----------
FROM python:3.12-slim-bookworm

# tesseract-ocr: OCR for the image redactor. tini: PID 1. libglib2.0-0: opencv-headless runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tini libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node

ARG PRESIDIO_VERSION=2.2.362
ARG PRESIDIO_IMAGE_REDACTOR_VERSION=0.0.58
ARG SPACY_MODEL_URL=https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# opencv-python is swapped for the headless build (no GUI libs, smaller, same cv2 API).
RUN python -m venv /opt/presidio-venv \
  && /opt/presidio-venv/bin/pip install \
    "presidio-analyzer==${PRESIDIO_VERSION}" \
    "presidio-anonymizer==${PRESIDIO_VERSION}" \
    "presidio-image-redactor==${PRESIDIO_IMAGE_REDACTOR_VERSION}" \
    "flask>=3,<4" "gunicorn>=23,<26" \
    "${SPACY_MODEL_URL}" \
  && /opt/presidio-venv/bin/pip uninstall -y opencv-python \
  && /opt/presidio-venv/bin/pip install opencv-python-headless

COPY infra/render/presidio_shim.py /opt/presidio/presidio_shim.py
RUN chmod -R a+rX /opt/presidio

RUN useradd -m -u 1000 user
WORKDIR /app
COPY --from=build --chown=user /out ./
COPY --chown=user seed ./seed
# Sessions and (without S3) recordings/frames live under /app/infra/data: ephemeral on Render
# free (lost on every sleep/redeploy). The published Work Map comes back from seed/boot.
RUN mkdir -p /app/infra/data/state /app/infra/data/objects && chown -R user /app/infra
COPY --chmod=755 infra/render/start.sh /usr/local/bin/shadow-start

USER user
# Warm caches (tldextract suffix list, matplotlib fonts) at build time, not on cold start.
RUN HOME=/home/user /opt/presidio-venv/bin/python -W ignore -c \
  "import sys; sys.path.insert(0,'/opt/presidio'); import presidio_shim, matplotlib.pyplot; presidio_shim.analyzer.analyze('jane@example.com', language='en')"
ENV HOME=/home/user \
    NODE_ENV=production \
    PORT=10000 \
    PRESIDIO_ANALYZER_URL=http://127.0.0.1:5101 \
    PRESIDIO_ANONYMIZER_URL=http://127.0.0.1:5101 \
    PRESIDIO_IMAGE_REDACTOR_URL=http://127.0.0.1:5101 \
    SHADOW_BOOT_DIR=/app/seed/boot \
    GUARD_JUDGE_TIMEOUT_MS=6000 \
    NODE_OPTIONS=--max-old-space-size=160 \
    MALLOC_ARENA_MAX=2
EXPOSE 10000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/shadow-start"]
