#!/usr/bin/env bash
# Installs Rust, the Solana (Agave) CLI and Anchor into $HOME, no sudo needed.
# Run inside WSL: bash scripts/install-toolchain.sh
set -euo pipefail

if ! command -v rustup >/dev/null 2>&1 && [ ! -x "$HOME/.cargo/bin/rustup" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

if ! command -v solana >/dev/null 2>&1; then
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
fi

grep -q 'solana/install/active_release/bin' "$HOME/.bashrc" || \
  echo 'export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"

rustc --version
solana --version
