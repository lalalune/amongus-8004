#!/bin/bash
# Deploy ERC-8004 Contracts to Base Mainnet

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Deploying ERC-8004 Contracts to Base Mainnet"
echo "⚠️  THIS IS PRODUCTION - REAL MONEY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Safety check
read -p "Are you sure you want to deploy to MAINNET? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Deployment cancelled"
    exit 0
fi

# Check environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ DEPLOYER_PRIVATE_KEY not set"
    exit 1
fi

if [ -z "$BASESCAN_API_KEY" ]; then
    echo "⚠️  BASESCAN_API_KEY not set (contracts won't be verified)"
fi

echo "🔗 Network: Base Mainnet"
echo "📡 RPC: https://mainnet.base.org"
echo "🔍 Explorer: https://basescan.org"
echo ""

cd ./contracts

echo "🔨 Deploying contracts to MAINNET..."
forge script script/Deploy.s.sol \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key ${BASESCAN_API_KEY:-""}

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "✅ Contracts deployed to MAINNET!"
echo ""
echo "⚠️  IMPORTANT: Save contract addresses to contracts/addresses.production.json"
echo ""

