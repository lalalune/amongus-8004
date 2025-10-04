#!/bin/bash
# Deploy Game Server to Railway

set -e

ENV=${1:-testnet}

if [ "$ENV" != "testnet" ] && [ "$ENV" != "production" ]; then
    echo "❌ Invalid environment. Use: testnet or production"
    echo "Usage: ./deploy-server-railway.sh [testnet|production]"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Deploying Server to Railway ($ENV)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not installed"
    echo "   Install: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Not logged in to Railway"
    railway login
fi

cd server

# Check if project is linked
if [ ! -f ".railway/config.json" ]; then
    echo "🔗 Linking Railway project..."
    echo "   Select the $ENV environment when prompted"
    railway init
else
    echo "✅ Railway project already linked"
fi

# Load environment template (optional)
ENV_FILE="../server/env.${ENV}.example"

if [ ! -f "$ENV_FILE" ]; then
    echo "⚠️  Environment file not found: $ENV_FILE"
    echo "   Skipping variable sync. Ensure variables are set in Railway."
else
    echo ""
    echo "📋 Setting environment variables from $ENV_FILE..."

    # Read and set variables (skip comments and empty lines)
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ $key =~ ^#.*$  ]] || [ -z "$key" ]; then
            continue
        fi
        
        # Skip placeholder values
        if [[ $value =~ .*DEPLOY.*FIRST.* ]] || [[ $value =~ .*YOUR_.* ]]; then
            echo "   ⚠️  Skipping $key (needs manual configuration)"
            continue
        fi
        
        # Set the variable
        echo "   Setting $key..."
        railway variables set "$key=$value" &> /dev/null || true
    done < "$ENV_FILE"
fi

echo ""
echo "🚀 Deploying to Railway..."
railway up

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 Getting deployment info..."
    railway status
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ Server Deployed to Railway!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Next steps:"
    echo "1. Get your Railway URL: railway status"
    echo "2. Update agents/.env with GAME_SERVER_URL=<railway-url>"
    echo "3. Register agents: bun run register:agents"
    echo "4. Start agents: cd agents && bun run start"
    echo ""
else
    echo "❌ Deployment failed"
    exit 1
fi

