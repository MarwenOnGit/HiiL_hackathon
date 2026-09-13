#!/usr/bin/env bash
# Starts the whole Insaf prototype: local chain, contract deploy, backend
# (which also serves the frontend). Run `./start.sh mock` to skip the chain
# entirely and demo the full flow with faked chain calls instead.
#
# Ctrl+C stops everything this script started.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
BACKEND_DIR="$ROOT_DIR/backend"
RPC_URL="http://127.0.0.1:8545"

MODE="${1:-real}"
HARDHAT_PID=""
STARTED_HARDHAT=0
AGENT_PID=""
AGENT_PORT="${AGENT_PORT:-5001}"
WEB_PID=""

log() { printf '\033[1;34m[start.sh]\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m[start.sh]\033[0m %s\n' "$1" >&2; exit 1; }

cleanup() {
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    log "Stopping dashboard (pid $WEB_PID)…"
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [[ -n "$AGENT_PID" ]] && kill -0 "$AGENT_PID" 2>/dev/null; then
    log "Stopping agent service (pid $AGENT_PID)…"
    # Kill the supervisor first so it doesn't restart the child we're stopping,
    # then whatever still holds the port.
    kill "$AGENT_PID" 2>/dev/null || true
    sleep 0.3
    fuser -k -TERM "${AGENT_PORT}/tcp" 2>/dev/null || true
  fi
  if [[ "$STARTED_HARDHAT" == "1" && -n "$HARDHAT_PID" ]] && kill -0 "$HARDHAT_PID" 2>/dev/null; then
    log "Stopping local chain (pid $HARDHAT_PID)…"
    kill "$HARDHAT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

command -v node >/dev/null 2>&1 || die "node is not installed or not on PATH."
command -v npm  >/dev/null 2>&1 || die "npm is not installed or not on PATH."

install_if_needed() {
  local dir="$1"
  if [[ ! -d "$dir/node_modules" ]]; then
    log "Installing dependencies in ${dir#"$ROOT_DIR/"}…"
    (cd "$dir" && npm install)
  fi
}

chain_is_up() {
  curl -s -o /dev/null -m 2 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    "$RPC_URL"
}

ensure_backend_env() {
  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    log "Creating backend/.env from .env.example…"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi
}

set_env_var() {
  # set_env_var KEY VALUE — replaces an existing KEY=... line in backend/.env,
  # or appends it if the key isn't there yet.
  local key="$1" value="$2" file="$BACKEND_DIR/.env"
  if grep -q "^${key}=" "$file"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

ensure_backend_env

if [[ "$MODE" == "mock" ]]; then
  log "Mock mode — skipping the local chain entirely."
  set_env_var CHAIN_MODE mock
else
  install_if_needed "$CONTRACTS_DIR"

  if chain_is_up; then
    log "A local chain is already answering on $RPC_URL — reusing it."
  else
    log "Starting local chain (Hardhat node)…"
    (cd "$CONTRACTS_DIR" && npx hardhat node > "$ROOT_DIR/hardhat-node.log" 2>&1) &
    HARDHAT_PID=$!
    STARTED_HARDHAT=1

    log "Waiting for it to come up…"
    for _ in $(seq 1 30); do
      if chain_is_up; then break; fi
      sleep 1
    done
    chain_is_up || die "Local chain didn't come up — check hardhat-node.log"
  fi

  log "Deploying MSMEContractRegistry…"
  (cd "$CONTRACTS_DIR" && npx hardhat run scripts/deploy.js --network localhost)

  DEPLOYMENT_FILE="$BACKEND_DIR/src/chain/deployment.json"
  [[ -f "$DEPLOYMENT_FILE" ]] || die "Deploy script didn't produce $DEPLOYMENT_FILE"
  CONTRACT_ADDRESS="$(node -e "console.log(require('$DEPLOYMENT_FILE').address)")"
  log "Deployed at $CONTRACT_ADDRESS"

  set_env_var CHAIN_MODE real
  set_env_var REGISTRY_CONTRACT_ADDRESS "$CONTRACT_ADDRESS"
  set_env_var RPC_URL "$RPC_URL"
fi

install_if_needed "$BACKEND_DIR"

# --- v3 dashboard (Next.js) --------------------------------------------------
# The one-and-only login surface on :3000. Rewrites /api/* to the backend, so
# invite links and OAuth callbacks can point at this origin regardless of where
# the legacy app lives. PUBLIC_BASE_URL above lets the backend build the right
# URLs; here we just make sure it matches the Next port.
WEB_DIR="$ROOT_DIR/web"
WEB_PUBLIC_URL="http://localhost:3000"
set_env_var PUBLIC_BASE_URL "$WEB_PUBLIC_URL"
if [[ -d "$WEB_DIR" ]]; then
  install_if_needed "$WEB_DIR"
  if [[ -d "$WEB_DIR/node_modules/next" ]] && command -v curl >/dev/null 2>&1 \
     && curl -s -o /dev/null -m 2 "$WEB_PUBLIC_URL"; then
    log "A dashboard is already answering on ${WEB_PUBLIC_URL} — reusing it."
  else
    log "Starting dashboard on ${WEB_PUBLIC_URL}…"
    (cd "$WEB_DIR" && exec npm run dev > "$ROOT_DIR/web-dashboard.log" 2>&1) &
    WEB_PID=$!
    for _ in $(seq 1 60); do
      curl -s -o /dev/null -m 1 "$WEB_PUBLIC_URL" && break
      sleep 1
    done
    if curl -s -o /dev/null -m 1 "$WEB_PUBLIC_URL"; then
      log "Dashboard up on ${WEB_PUBLIC_URL}."
    else
      log "Dashboard didn't come up after ~60s — check web-dashboard.log."
    fi
  fi
fi

# --- Agent service (v3 analysis layer, ARCHITECTURE.md Section 3) -------------
# The backend degrades gracefully without it: anchoring and confirmation keep
# working and the UI says analysis is unavailable. So a failure to start here is
# a warning, never a reason to abort the demo.
AGENT_DIR="$ROOT_DIR/agent"
if [[ -d "$AGENT_DIR" ]] && command -v python3 >/dev/null 2>&1; then
  if python3 -c "import fastapi, uvicorn" >/dev/null 2>&1; then
    if curl -s -o /dev/null -m 2 "http://127.0.0.1:${AGENT_PORT}/health"; then
      log "An agent service is already answering on port ${AGENT_PORT} — reusing it."
    else
      log "Starting agent service on http://127.0.0.1:${AGENT_PORT}…"
      # Supervised: if the agent dies mid-demo, bring it straight back rather
      # than leaving the UI stuck on "analysis unavailable" until someone
      # notices. Capped so a genuinely broken service doesn't spin forever.
      (
        cd "$AGENT_DIR"
        attempts=0
        while [[ $attempts -lt 20 ]]; do
          python3 -m uvicorn service:app \
            --host 127.0.0.1 --port "$AGENT_PORT" --log-level warning \
            >> "$ROOT_DIR/agent-service.log" 2>&1
          status=$?
          # 0 or 143 (SIGTERM) means we asked it to stop — don't fight cleanup.
          if [[ $status -eq 0 || $status -eq 143 ]]; then break; fi
          attempts=$((attempts + 1))
          echo "[start.sh] agent service exited ($status); restart $attempts/20" \
            >> "$ROOT_DIR/agent-service.log"
          sleep 1
        done
      ) &
      AGENT_PID=$!
      for _ in $(seq 1 20); do
        curl -s -o /dev/null -m 1 "http://127.0.0.1:${AGENT_PORT}/health" && break
        sleep 0.5
      done
      if curl -s -o /dev/null -m 1 "http://127.0.0.1:${AGENT_PORT}/health"; then
        log "Agent service up."
      else
        log "Agent service didn't come up — check agent-service.log. Continuing without it."
      fi
    fi
  else
    log "python3 is present but fastapi/uvicorn are not — skipping the agent service."
  fi
fi

log "Starting backend on http://localhost:4000 (serves the legacy frontend too)…"
log "Dashboard on http://localhost:3000 — sign in there."
log "Press Ctrl+C to stop everything."
(cd "$BACKEND_DIR" && exec npm start)
