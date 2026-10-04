#!/usr/bin/env bash
# Process runner for the Hugging Face Space image (infra/space/Dockerfile).
# 1. Starts Presidio analyzer, anonymizer and image redactor on 127.0.0.1 (not public).
# 2. Waits until they answer /health (bounded: redaction fails closed until they do).
# 3. Starts the API on 0.0.0.0:$API_PORT (7860, the Space's only public port).
# If any process exits, everything stops and the container exits, so the Space restarts it.
set -euo pipefail

PY=/opt/presidio-venv/bin
WAIT_SECONDS="${PRESIDIO_WAIT_SECONDS:-240}"
pids=()

stop_all() {
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  wait || true
}
trap 'stop_all; exit 0' TERM INT

presidio() { # name dir port
  # Unset conf vars make each engine use its built-in defaults (spaCy en_core_web_lg).
  (cd "/opt/presidio/$2" && exec "$PY/gunicorn" -w 1 --timeout 120 -b "127.0.0.1:$3" \
    --no-control-socket --error-logfile - "app:create_app()") &
  pids+=("$!")
  echo "[space] started presidio-$1 on 127.0.0.1:$3"
}

healthy() { # url
  node -e "fetch(process.argv[1],{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$1"
}

started=$(date +%s)
if [ "${MOCK_AI:-0}" = "1" ]; then
  echo "[space] MOCK_AI=1: fixture mode never calls Presidio, so it is not started"
else
  presidio anonymizer anonymizer 5101
  presidio analyzer analyzer 5102
  presidio image-redactor image-redactor 5103
  for url in "$PRESIDIO_ANONYMIZER_URL" "$PRESIDIO_ANALYZER_URL" "$PRESIDIO_IMAGE_REDACTOR_URL"; do
    until healthy "$url/health"; do
      if [ $(($(date +%s) - started)) -ge "$WAIT_SECONDS" ]; then
        echo "[space] $url not healthy after ${WAIT_SECONDS}s; starting the API anyway (redaction fails closed)"
        break 2
      fi
      sleep 1
    done
    echo "[space] $url healthy after $(($(date +%s) - started))s"
  done
  echo "[space] presidio ready after $(($(date +%s) - started))s"
fi

node /app/dist/main.js &
pids+=("$!")
echo "[space] API starting on 0.0.0.0:${API_PORT}"

# Exit as soon as any child dies; tini (PID 1) passes the exit code on.
set +e
wait -n
code=$?
echo "[space] a process exited (code $code); stopping the rest"
stop_all
exit "$code"
