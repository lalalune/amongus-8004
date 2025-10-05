#!/bin/bash
# Complete orchestration script for Among Us ERC-8004 game
# Starts blockchain, deploys contracts, starts server, and launches agents
#
# Modes:
#   dev/local:  bash scripts/start-all.sh (default)
#   testnet:    NODE_ENV=testnet bash scripts/start-all.sh
#   production: NODE_ENV=production bash scripts/start-all.sh

set -e

# Load .env if present (exporting all variables)
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

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

# Parse optional flags (e.g., --fresh)
FRESH_FLAG=0
for arg in "$@"; do
  if [ "$arg" = "--fresh" ] || [ "$arg" = "fresh" ]; then
    FRESH_FLAG=1
  fi
done

ANVIL_WAS_STARTED=0

# Only start Anvil and deploy contracts for local/dev environment
if [ "$ENV_MODE" = "local" ]; then
    # Check if Anvil is already running
    if lsof -Pi :8545 -sTCP:LISTEN -t >/dev/null ; then
        if [ $FRESH_FLAG -eq 1 ]; then
            echo "♻️  Fresh flag set: restarting Anvil..."
            pkill -f anvil || true
            sleep 1
            echo "🔨 Starting Anvil blockchain... (silenced)"
            SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            bash "$SCRIPT_DIR/start-anvil.sh" >/dev/null 2>&1 &
            ANVIL_PID=$!
            sleep 3
            echo "✅ Anvil started (PID: $ANVIL_PID)"
            ANVIL_WAS_STARTED=1
        else
            echo "✅ Anvil already running on port 8545"
        fi
    else
        echo "🔨 Starting Anvil blockchain... (silenced)"
        SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
        bash "$SCRIPT_DIR/start-anvil.sh" >/dev/null 2>&1 &
        ANVIL_PID=$!
        sleep 3
        echo "✅ Anvil started (PID: $ANVIL_PID)"
        ANVIL_WAS_STARTED=1
    fi

    echo ""
    echo "🛠️  Building workspace via turbo (shared, server, agents)..."
    if [ -z "$SKIP_UI" ]; then
      ./node_modules/.bin/turbo run build --cache=local:r
    else
      ./node_modules/.bin/turbo run build
    fi

    echo ""
    echo "📝 Deploying ERC-8004 contracts to local Anvil..."
    if [ $FRESH_FLAG -eq 1 ]; then
      FRESH=1 bun run deploy:contracts --fresh || DEPLOY_STATUS=$?
    else
      bun run deploy:contracts || DEPLOY_STATUS=$?
    fi

    if [ -n "$DEPLOY_STATUS" ] && [ "$DEPLOY_STATUS" -ne 0 ]; then
        echo "⚠️  Contract deployment failed; attempting to continue if contracts/addresses.json exists"
        if [ -f contracts/addresses.json ]; then
          echo "ℹ️  Found contracts/addresses.json; proceeding without fresh deploy"
        else
          echo "❌ No contracts/addresses.json present; cannot proceed without deployment"
          exit 1
        fi
    fi

    echo ""
    echo "🔐 Registering agents on ERC-8004 registry..."
    bun run scripts/register-agents.ts
    
    if [ $? -ne 0 ]; then
        echo "❌ Agent registration failed"
        exit 1
    fi
    
    # Note: Registration happens regardless of SKIP_AGENTS flag
    # The server needs agents registered even for scripted tests
else
    echo "ℹ️  $ENV_MODE mode - using existing blockchain and contracts"
    echo "   Make sure contracts are deployed, agents registered, and .env configured"
    if [ "$ENV_MODE" = "testnet" ]; then
        echo "🔗 Configuring Base Sepolia RPC and addresses"
        export RPC_URL="${RPC_URL:-https://sepolia.base.org}"
        if [ -f contracts/addresses.testnet.json ]; then
          cp contracts/addresses.testnet.json contracts/addresses.json
          echo "✅ Using contracts/addresses.testnet.json"
        else
          echo "⚠️  contracts/addresses.testnet.json not found; ensure contracts/addresses.json points to testnet addresses"
        fi
    fi
fi

echo ""
echo "🎮 Starting Game Master server ($ENV_MODE mode)..."
cd server

# Force PORT=3000
export PORT=3000

# Prefer non-watch mode for stability
# Fast timers for dev/E2E (can be overridden by env)
export DISCUSSION_TIME_MS=${DISCUSSION_TIME_MS:-4000}
export VOTING_TIME_MS=${VOTING_TIME_MS:-3000}
export KILL_COOLDOWN_MS=${KILL_COOLDOWN_MS:-1000}
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

# Wait for server readiness on :3000/health with extended timeout
printf "⏳ Waiting for server health on http://localhost:3000/health"
for i in {1..120}; do
  if curl -sSf http://localhost:3000/health >/dev/null; then
    echo "\n✅ Server is healthy"
    break
  fi
  printf "."
  sleep 0.5
  if [ $i -eq 120 ]; then
    echo "\n❌ Server failed to become healthy"
    exit 1
  fi
done

# Verify Agent Card
if ! curl -sSf http://localhost:3000/.well-known/agent-card.json >/dev/null; then
  echo "❌ Agent Card endpoint not responding"
  exit 1
fi

if [ "$ENV_MODE" = "local" ]; then
  if [ -z "$SKIP_AGENTS" ]; then
    echo ""
    echo "🤖 Starting agents..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    cd agents
    mkdir -p logs
    
    # Ensure .env exists and GAME_SERVER_URL is 3000
    if ! grep -q "GAME_SERVER_URL=http://localhost:3000" .env; then
      sed -i '' "s|^GAME_SERVER_URL=.*$|GAME_SERVER_URL=http://localhost:3000|" .env 2>/dev/null || true
    fi
    
    # Rebuild agents to ensure dist is up-to-date
    bun run build >/dev/null 2>&1 || true
    
    # Start agents (log to console rather than file)
    GAME_SERVER_URL="http://localhost:3000" \
    RPC_URL="http://localhost:8545" \
    AGENT_AUTOPLAY="1" \
    OPENAI_API_KEY="$OPENAI_API_KEY" \
    AUTO_SHUTDOWN_MS="$AUTO_SHUTDOWN_MS" \
    PLAYER1_PRIVATE_KEY="$PLAYER1_PRIVATE_KEY" \
    PLAYER2_PRIVATE_KEY="$PLAYER2_PRIVATE_KEY" \
    PLAYER3_PRIVATE_KEY="$PLAYER3_PRIVATE_KEY" \
    PLAYER4_PRIVATE_KEY="$PLAYER4_PRIVATE_KEY" \
    PLAYER5_PRIVATE_KEY="$PLAYER5_PRIVATE_KEY" \
    bun dist/index.js &
    AGENTS_PID=$!
    cd ..
  else
    echo "ℹ️  SKIP_AGENTS is set; not launching agents."
  fi
fi

# Optionally start the UI (local only)
if [ "$ENV_MODE" = "local" ] && [ -z "$SKIP_UI" ]; then
  echo ""
  echo "🖥️  Starting UI (Vite) on :5173..."
  cd ui
  bun install >/dev/null 2>&1 || true
  bun run dev > ../scripts/ui.log 2>&1 &
  UI_PID=$!
  cd ..
  # Wait for UI dev server to be reachable (up to 60s)
  printf "⏳ Waiting for UI on http://localhost:5173"
  for i in {1..120}; do
    if curl -sSf http://localhost:5173 >/dev/null 2>&1; then
      echo "\n✅ UI is running"
      break
    fi
    printf "."
    sleep 0.5
    if [ $i -eq 120 ]; then
      echo "\n⚠️  UI failed to start (check scripts/ui.log)"
    fi
  done
fi

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
echo "  UI:          http://localhost:5173"
echo ""
echo "PIDs: server=$SERVER_PID agents=$AGENTS_PID"
echo "Streaming connections: $CONN"
echo ""
echo "Press Ctrl+C to stop all services"

# Handle shutdown
trap "echo '\n🛑 Shutting down...'; kill $SERVER_PID $AGENTS_PID $UI_PID 2>/dev/null; if [ $FRESH_FLAG -eq 1 ] && [ $ANVIL_WAS_STARTED -eq 1 ]; then kill $ANVIL_PID 2>/dev/null; fi; exit" INT TERM

wait

