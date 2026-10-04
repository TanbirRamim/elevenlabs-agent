#!/usr/bin/env bash
# Process runner for the Render image (infra/render/Dockerfile).
# 1. Maps Render's $PORT to the API's API_PORT (no app change needed).
# 2. Starts the API first, so Render sees $PORT open as early as possible.
# 3. Then starts the one-process Presidio shim on 127.0.0.1:5101 (never public). At 0.1 CPU it
#    takes minutes to load spaCy; until it answers, redaction fails closed.
# 4. If either process exits, both stop and the container exits.
set -euo pipefail

export API_PORT="${PORT:-${API_PORT:-10000}}"
pids=()
stop_all() {
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  wait || true
}
trap 'stop_all; exit 0' TERM INT

node /app/dist/main.js &
pids+=("$!")
echo "[render] API starting on 0.0.0.0:${API_PORT}"

# Presidio starts only once the API answers: at 0.1 CPU the two would otherwise share the
# CPU and Render would see no open port for minutes.
# A bash TCP probe, not `node -e`: each extra node boot costs seconds at 0.1 CPU.
until (exec 3<>"/dev/tcp/127.0.0.1/${API_PORT}") 2>/dev/null; do
  kill -0 "${pids[0]}" 2>/dev/null || exit 1
  sleep 1
done
echo "[render] API listening after ${SECONDS}s"

if [ "${MOCK_AI:-0}" = "1" ]; then
  echo "[render] MOCK_AI=1: Presidio not started"
else
  # One worker (one copy of the spaCy model), a few threads. --timeout 600: at 0.1 CPU loading
  # spaCy and OCR takes minutes, and gunicorn must not kill the worker mid-load.
  (cd /opt/presidio && exec /opt/presidio-venv/bin/gunicorn -w 1 --threads 4 --timeout 600 \
    -b 127.0.0.1:5101 --no-control-socket --error-logfile - "presidio_shim:app") &
  pids+=("$!")
  echo "[render] presidio starting in the background; redaction fails closed until it answers"
fi

set +e
wait -n
code=$?
echo "[render] a process exited (code $code); stopping the rest"
stop_all
exit "$code"
