#!/usr/bin/env bash
# Build the program (and sync its program id on the first run). Run in WSL from the repo root.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."

if [ "${1:-}" = "errors" ]; then
  anchor build 2>&1 | grep -B2 -A16 -E '^(error|warning: unused)' | head -150 || true
  exit 0
fi

if [ "${1:-}" = "test" ]; then
  cargo test -p clawback --lib -- --nocapture
  exit 0
fi

first_run=0
[ -f target/deploy/clawback-keypair.json ] || first_run=1
anchor build 2>&1 | grep -vE '^\s*(Compiling|Downloaded|Downloading)' || true
if [ "$first_run" = 1 ] && [ -f target/deploy/clawback-keypair.json ]; then
  anchor keys sync
  anchor build 2>&1 | tail -5
fi
ls -la target/deploy/ target/idl/ 2>/dev/null || true
