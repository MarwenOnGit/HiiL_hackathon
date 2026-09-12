#!/usr/bin/env bash
# Resets the demo to its seeded state. One command, safe to re-run.
#
# Clears the agent service's contract store and in-memory chain, then rebuilds
# the seeded dataset. The Node backend's own in-memory state is wiped by
# restarting it, which start.sh does anyway.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_PORT="${AGENT_PORT:-5001}"

if ! curl -s -o /dev/null -m 3 "http://127.0.0.1:${AGENT_PORT}/health"; then
  echo "The agent service is not answering on port ${AGENT_PORT}."
  echo "Start the stack first:  ./start.sh mock"
  exit 1
fi

echo "Resetting and re-seeding the demo…"
(cd "$ROOT_DIR/agent" && python3 scripts/seed_demo.py)
