#!/bin/bash
# Comprehensive test suite - runs all tests in sequence

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 Among Us ERC-8004 - Complete Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Track results
TESTS_PASSED=0
TESTS_FAILED=0

# Store current directory and important paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/test-run.log"

# Fresh log
rm -f "$LOG_FILE" 2>/dev/null || true
touch "$LOG_FILE"

# Ensure cleanup of background processes on exit
STARTALL_PID=""
cleanup() {
  if [ -n "$STARTALL_PID" ]; then
    kill "$STARTALL_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ============================================================================
# Phase 1: Contract Tests
# ============================================================================

echo "📋 Phase 1: ERC-8004 Contract Tests"
echo "─────────────────────────────────────────────────"

if command -v forge >/dev/null 2>&1; then
  (cd "$PROJECT_ROOT/contracts" && forge test) && {
    echo "✅ Contract tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  } || {
    echo "❌ Contract tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  }
else
  echo "⚠️  forge not installed; skipping contract tests"
fi

echo ""

# ============================================================================
# Phase 2: Game Logic Tests  
# ============================================================================

echo "📋 Phase 2: Game Runtime E2E"
echo "─────────────────────────────────────────────────"

# Start server directly in background (simpler than start-all.sh)
echo "Starting test server..."
cd "$PROJECT_ROOT/server"
DISCUSSION_TIME_MS=4000 VOTING_TIME_MS=3000 PORT=3000 bun dist/index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
cd "$PROJECT_ROOT"

# Wait for health
echo "Waiting for server..."
for i in {1..60}; do
  if curl -sSf http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ Server ready"
    break
  fi
  sleep 0.5
  if [ $i -eq 60 ]; then
    echo "❌ Server failed to start"
    kill $SERVER_PID 2>/dev/null || true
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Test Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Phases Passed: $TESTS_PASSED"
    echo "Phases Failed: $TESTS_FAILED"
    echo ""
    exit 1
  fi
done

# Run scripted test
if bun run "$PROJECT_ROOT/scripts/test-scripted-game.ts"; then
  echo "✅ Scripted game test passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
else
  echo "❌ Scripted game test failed"
  TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# Cleanup server
kill $SERVER_PID 2>/dev/null || true
echo ""

# ============================================================================
# Phase 3: A2A Protocol Tests
# ============================================================================

echo "📋 Phase 3: A2A Protocol Tests"
echo "─────────────────────────────────────────────────"

(
  cd "$PROJECT_ROOT/server"
  bun test src/a2a/agentCard.test.ts
) && {
  echo "✅ A2A protocol tests passed"
  TESTS_PASSED=$((TESTS_PASSED + 1))
} || {
  echo "❌ A2A protocol tests failed"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

echo ""

# ============================================================================
# Summary
# ============================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Test Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phases Passed: $TESTS_PASSED"
echo "Phases Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ ALL TESTS PASSED"
  echo ""
  exit 0
else
  echo "❌ SOME TESTS FAILED"
  echo ""
  exit 1
fi

