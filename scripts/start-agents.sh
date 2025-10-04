#!/bin/bash
# Start all 5 player agents with manual runtime management

echo "🤖 Starting Among Us Agent Project (5 agents)..."
echo ""

cd agents

# Create logs directory if it doesn't exist
mkdir -p logs

# Anvil test accounts (matching the default accounts)
export PLAYER1_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export PLAYER2_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
export PLAYER3_PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
export PLAYER4_PRIVATE_KEY="0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
export PLAYER5_PRIVATE_KEY="0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"

export GAME_SERVER_URL="http://localhost:3000"
export RPC_URL="http://localhost:8545"

# Auto-shutdown timer (2 minutes default for testing, set to 0 to disable)
export AUTO_SHUTDOWN_MS="${AUTO_SHUTDOWN_MS:-120000}"

# OpenAI API key (required for agent intelligence)
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY not set. Agents may not function properly."
    echo "   Set it in your environment or .env file"
fi

echo "🚀 Starting all 5 agents with manual runtimes..."
echo ""
echo "   • RedAgent    (Player 1)"
echo "   • BlueAgent   (Player 2)"
echo "   • GreenAgent  (Player 3)"
echo "   • YellowAgent (Player 4)"
echo "   • PurpleAgent (Player 5)"
echo ""
echo "   Game Server: $GAME_SERVER_URL"
echo "   RPC:         $RPC_URL"
echo ""

# Start all agents using manual runtime (no CLI)
bun run dev > logs/agents.log 2>&1 &
AGENTS_PID=$!

echo "✅ Agent runtimes started (PID: $AGENTS_PID)"
echo "   All 5 agents running with manual AgentRuntime instances"
echo "   Logs: agents/logs/agents.log"
echo ""
echo "   View logs: tail -f agents/logs/agents.log"
echo ""