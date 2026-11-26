#!/usr/bin/env bash
# Devnet deploy. Uses a throwaway devnet wallet at .keys/deployer.json (gitignored).
#   bash scripts/deploy.sh wallet   # create wallet if missing, show address + balance, try airdrops
#   bash scripts/deploy.sh deploy   # deploy target/deploy/clawback.so
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd "$(dirname "$0")/.."
KEY=.keys/deployer.json
URL=${BASE_RPC:-https://api.devnet.solana.com}
mkdir -p .keys
[ -f "$KEY" ] || solana-keygen new --no-bip39-passphrase --silent -o "$KEY"
ADDR=$(solana-keygen pubkey "$KEY")

case "${1:-wallet}" in
  wallet)
    echo "deployer: $ADDR"
    for i in 1 2 3; do
      solana airdrop 2 "$ADDR" -u "$URL" 2>&1 | tail -1 || true
      sleep 2
    done
    solana balance "$ADDR" -u "$URL"
    SIZE=$(stat -c %s target/deploy/clawback.so)
    echo "program size: $SIZE bytes, rent: $(solana rent "$SIZE" -u "$URL" | grep -i 'Rent-exempt' )"
    ;;
  deploy)
    solana program deploy target/deploy/clawback.so \
      --program-id target/deploy/clawback-keypair.json \
      --keypair "$KEY" -u "$URL" --with-compute-unit-price 10000
    solana program show "$(solana-keygen pubkey target/deploy/clawback-keypair.json)" -u "$URL" --keypair "$KEY"
    ;;
esac
