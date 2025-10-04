#!/bin/bash
# Complete orchestration script for Among Us ERC-8004 game
# Starts blockchain, deploys contracts, starts server, and launches agents
#
# Modes:
#   dev/local:  bash scripts/start-all.sh (default)
#   testnet:    NODE_ENV=testnet bash scripts/start-all.sh
#   production: NODE_ENV=production bash scripts/start-all.sh

set -e

# Determine environment
ENV_MODE="${NODE_ENV:-local}"
if [ "$ENV_MODE" = "" ] || [ "$ENV_MODE" = "development" ]; then
    ENV_MODE="local"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 Among Us ERC-8004 - Full System Startup"
echo "   Environment: $ENV_MODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Environment defaults and safety
# Auto-shutdown (default 2 minutes to avoid runaway loops)
export AUTO_SHUTDOWN_MS="${AUTO_SHUTDOWN_MS:-120000}"

# OpenAI key passthrough
if [ -z "$OPENAI_API_KEY" ]; then
  echo "⚠️  Warning: OPENAI_API_KEY not set. Agents may have limited functionality."
fi

# Provide default Anvil private keys for 5 players in local mode
if [ "$ENV_MODE" = "local" ]; then
  export PLAYER1_PRIVATE_KEY="${PLAYER1_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
  export PLAYER2_PRIVATE_KEY="${PLAYER2_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"
  export PLAYER3_PRIVATE_KEY="${PLAYER3_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}"
  export PLAYER4_PRIVATE_KEY="${PLAYER4_PRIVATE_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}"
  export PLAYER5_PRIVATE_KEY="${PLAYER5_PRIVATE_KEY:-0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a}"
fi

# Only start Anvil and deploy contracts for local/dev environment
if [ "$ENV_MODE" = "local" ]; then
    # Check if Anvil is already running
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
        echo "✅ Anvil already running on port 8545"
    else
        echo "🔨 Starting Anvil blockchain..."
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        bash "$SCRIPT_DIR/start-anvil.sh" &
        ANVIL_PID=$!
        sleep 3
        echo "✅ Anvil started (PID: $ANVIL_PID)"
    fi

    echo ""
    echo "🛠️  Building workspace (shared, server, agents)..."
    bun run build:shared
    bun run build:server
    bun run build:agents

    echo ""
    echo "📝 Deploying ERC-8004 contracts to local Anvil..."
    bun run deploy:contracts

    if [ $? -ne 0 ]; then
        echo "❌ Contract deployment failed"
        exit 1
    fi

    echo ""
    echo "🔐 Registering agents on ERC-8004 registry..."
    bun run scripts/register-agents.ts
    
    if [ $? -ne 0 ]; then
        echo "❌ Agent registration failed"
        exit 1
    fi
else
    echo "ℹ️  $ENV_MODE mode - using existing blockchain and contracts"
    echo "   Make sure contracts are deployed, agents registered, and .env configured"
fi

echo ""
echo "🎮 Starting Game Master server ($ENV_MODE mode)..."
cd server

# Force PORT=3000
export PORT=3000

# Prefer non-watch mode for stability
if [ "$ENV_MODE" = "production" ]; then
  bun run start &
elif [ "$ENV_MODE" = "testnet" ]; then
  bun run start &
else
  # local
  bun run start &
fi

SERVER_PID=$!
cd ..

# Wait for server readiness on :3000/health with timeout
printf "⏳ Waiting for server health on http://localhost:3000/health"
for i in {1..40}; do
  if curl -sSf http://localhost:3000/health >/dev/null; then
    echo "\n✅ Server is healthy"
    break
  fi
  printf "."
  sleep 0.5
  if [ $i -eq 40 ]; then
    echo "\n❌ Server failed to become healthy"
    exit 1
  fi
done

# Verify Agent Card
if ! curl -sSf http://localhost:3000/.well-known/agent-card.json >/dev/null; then
  echo "❌ Agent Card endpoint not responding"
  exit 1
fi

echo ""
echo "🤖 Starting 5 player agents (manual runtime)..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd agents
mkdir -p logs

# Ensure .env exists and GAME_SERVER_URL is 3000
if ! grep -q "GAME_SERVER_URL=http://localhost:3000" .env; then
  sed -i '' "s|^GAME_SERVER_URL=.*$|GAME_SERVER_URL=http://localhost:3000|" .env 2>/dev/null || true
fi

# Rebuild agents to ensure dist is up-to-date
bun run build >/dev/null 2>&1 || true

# Start agents via manual runtime (dist/index.js) with required env vars
GAME_SERVER_URL="http://localhost:3000" \
RPC_URL="http://localhost:8545" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
AUTO_SHUTDOWN_MS="$AUTO_SHUTDOWN_MS" \
PLAYER1_PRIVATE_KEY="$PLAYER1_PRIVATE_KEY" \
PLAYER2_PRIVATE_KEY="$PLAYER2_PRIVATE_KEY" \
PLAYER3_PRIVATE_KEY="$PLAYER3_PRIVATE_KEY" \
PLAYER4_PRIVATE_KEY="$PLAYER4_PRIVATE_KEY" \
PLAYER5_PRIVATE_KEY="$PLAYER5_PRIVATE_KEY" \
bun dist/index.js > logs/agents-orch.log 2>&1 &
AGENTS_PID=$!
cd ..

# Wait a bit, then verify streaming connections and log status
sleep 3
HEALTH=$(curl -s http://localhost:3000/health || echo "{}")
CONN=$(echo "$HEALTH" | grep -o '"connections":[0-9]*' | cut -d: -f2 || echo 0)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ All systems running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Access Points:"
echo "  Agent Card:  http://localhost:3000/.well-known/agent-card.json"
echo "  Health:      http://localhost:3000/health"
echo "  Game State:  http://localhost:3000/debug/state"
echo ""
echo "PIDs: server=$SERVER_PID agents=$AGENTS_PID"
echo "Streaming connections: $CONN"
echo ""
echo "Press Ctrl+C to stop all services"

# Handle shutdown
trap "echo '\n🛑 Shutting down...'; kill $SERVER_PID $AGENTS_PID 2>/dev/null; [ ! -z \"$ANVIL_PID\" ] && kill $ANVIL_PID 2>/dev/null; exit" INT TERM

wait

