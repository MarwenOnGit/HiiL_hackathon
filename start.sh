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

log() { printf '\033[1;34m[start.sh]\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m[start.sh]\033[0m %s\n' "$1" >&2; exit 1; }

cleanup() {
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

log "Starting backend on http://localhost:4000 (serves the frontend too)…"
log "Press Ctrl+C to stop everything."
(cd "$BACKEND_DIR" && exec npm start)
