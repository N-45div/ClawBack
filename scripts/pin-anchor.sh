#!/usr/bin/env bash
# anchor-lang =1.0.2 depends on its macro crates with a caret, so Cargo pulls 1.2.x macros
# that emit code for a newer anchor-lang. Pin every anchor-* macro crate to 1.0.2.
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
for c in anchor-attribute-access-control anchor-attribute-account anchor-attribute-constant \
         anchor-attribute-error anchor-attribute-event anchor-attribute-program \
         anchor-derive-accounts anchor-derive-serde anchor-derive-space anchor-syn; do
  cargo update -p "$c" --precise 1.0.2 2>&1 | grep -vE '^\s*Updating crates.io' || true
done
grep -A1 -E '^name = "anchor-' Cargo.lock | grep version | sort | uniq -c
