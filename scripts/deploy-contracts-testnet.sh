#!/bin/bash
# Deploy ERC-8004 Contracts to Base Sepolia

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 Deploying ERC-8004 Contracts to Base Sepolia"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ DEPLOYER_PRIVATE_KEY not set"
    echo "   export DEPLOYER_PRIVATE_KEY=<your-key>"
    exit 1
fi

if [ -z "$BASESCAN_API_KEY" ]; then
    echo "⚠️  BASESCAN_API_KEY not set (contracts won't be verified)"
    echo "   Get one from https://basescan.org/myapikey"
fi

echo "🔗 Network: Base Sepolia"
echo "📡 RPC: https://sepolia.base.org"
echo "🔍 Explorer: https://sepolia.basescan.org"
echo ""

cd ./contracts

echo "🔨 Deploying contracts..."
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key ${BASESCAN_API_KEY:-""}

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo ""
echo "✅ Contracts deployed successfully!"
echo ""

# Extract addresses from broadcast folder
BROADCAST_FILE=$(ls -t broadcast/Deploy.s.sol/84532/run-latest.json 2>/dev/null | head -1)

if [ -f "$BROADCAST_FILE" ]; then
    echo "📋 Extracting contract addresses..."
    
    # Parse addresses (this is a simplified example - adjust based on actual JSON structure)
    IDENTITY=$(cat $BROADCAST_FILE | grep -A 2 "IdentityRegistry" | grep "contractAddress" | cut -d'"' -f4 | head -1)
    
    # Create addresses file
    cat > addresses.testnet.json << EOF
{
  "network": "base-sepolia",
  "chainId": 84532,
  "identityRegistry": "$IDENTITY",
  "reputationRegistry": "CHECK_BROADCAST_FILE",
  "validationRegistry": "CHECK_BROADCAST_FILE"
}
EOF
    
    echo "✅ Addresses saved to contracts/addresses.testnet.json"
    echo "⚠️  Please manually verify and update all addresses from:"
    echo "   $BROADCAST_FILE"
else
    echo "⚠️  Could not find broadcast file"
    echo "   Manually create contracts/addresses.testnet.json"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Testnet Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "1. Verify addresses in contracts/addresses.testnet.json"
echo "2. Update server env.testnet with contract addresses"
echo "3. Deploy server: railway up"
echo ""

