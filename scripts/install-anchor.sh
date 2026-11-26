#!/usr/bin/env bash
# Pins the versions MagicBlock's examples use: Agave 3.1.9 + Anchor CLI 1.0.2.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"

agave-install init 3.1.9 >/dev/null
solana --version

mkdir -p "$HOME/.local/bin"
ANCHOR="$HOME/.local/bin/anchor"
if [ ! -x "$ANCHOR" ]; then
  for org in solana-foundation coral-xyz; do
    url="https://github.com/$org/anchor/releases/download/v1.0.2/anchor-1.0.2-x86_64-unknown-linux-gnu"
    if curl -fsSL "$url" -o "$ANCHOR"; then echo "anchor from $org"; break; fi
  done
  chmod +x "$ANCHOR"
fi
grep -q '.local/bin' "$HOME/.bashrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.bashrc"
"$ANCHOR" --version
