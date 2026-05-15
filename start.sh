#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUICK_START_URL="http://localhost:5173/quick-start"
DRY_RUN="${LLAMA_GATEWAY_DRY_RUN:-0}"
PIDS=()
LABELS=()

port_ready() {
  local url="$1"
  curl --silent --fail "$url" >/dev/null 2>&1
}

launch_process() {
  local label="$1"
  local workdir="$2"
  shift 2

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "[llama-gateway] dry-run: would launch $label in $workdir attached to this terminal"
    return 0
  fi

  (
    cd "$workdir"
    "$@" 2>&1 | sed -u "s/^/[$label] /"
  ) &

  local pid="$!"
  PIDS+=("$pid")
  LABELS+=("$label")
  echo "[llama-gateway] $label attached to this terminal (PID $pid)"
}

stop_attached_processes() {
  local pid
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
}

trap 'echo "[llama-gateway] stopping attached services..."; stop_attached_processes' EXIT INT TERM

echo "[llama-gateway] starting development services..."

if ! port_ready "http://127.0.0.1:11435/api/status"; then
  echo "[llama-gateway] launching proxy on :11435"
  launch_process proxy "$ROOT_DIR/proxy" env OPEN_BROWSER=false npm run dev
else
  echo "[llama-gateway] proxy already appears to be running on :11435"
fi

if ! port_ready "http://127.0.0.1:5173"; then
  echo "[llama-gateway] launching ui on :5173"
  launch_process ui "$ROOT_DIR/ui" npm run dev
else
  echo "[llama-gateway] ui already appears to be running on :5173"
fi

for _ in $(seq 1 180); do
  if port_ready "http://127.0.0.1:5173"; then
    break
  fi
  sleep 0.5
done

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[llama-gateway] dry-run: would open $QUICK_START_URL"
  exit 0
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$QUICK_START_URL" >/dev/null 2>&1 || true
else
  echo "[llama-gateway] open $QUICK_START_URL in your browser"
fi

if [[ ${#PIDS[@]} -eq 0 ]]; then
  echo "[llama-gateway] no new processes were started by this launcher."
  exit 0
fi

echo "[llama-gateway] services are attached to this terminal. Press Ctrl+C to stop them."

while true; do
  for i in "${!PIDS[@]}"; do
    pid="${PIDS[$i]}"
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      set +e
      wait "$pid"
      exit_code="$?"
      set -e
      echo "[llama-gateway] ${LABELS[$i]} exited with code $exit_code"
      exit "$exit_code"
    fi
  done

  sleep 0.5
done