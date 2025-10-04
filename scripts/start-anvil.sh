#!/bin/bash
# Start Anvil local Ethereum node

echo "🔨 Starting Anvil local blockchain..."
echo ""

# Kill any existing Anvil process
pkill -f anvil || true

# Start Anvil with deterministic accounts
anvil \
  --chain-id 31337 \
  --block-time 1 \
  --accounts 10 \
  --balance 10000 \
  --gas-limit 30000000 \
  --host 0.0.0.0 \
  --port 8545

