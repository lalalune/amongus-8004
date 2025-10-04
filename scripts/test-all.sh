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

# Spin server without agents and without internal smoke (fast timers)
NODE_ENV=local ENV_MODE=local SKIP_AGENTS=1 SKIP_INTERNAL_SMOKE=1 DISCUSSION_TIME_MS=4000 VOTING_TIME_MS=3000 KILL_COOLDOWN_MS=1000 \
  bash "$PROJECT_ROOT/scripts/start-all.sh" > "$LOG_FILE" 2>&1 &
STARTALL_PID=$!

# Wait for health then run smoke separately to assert
for i in {1..60}; do
  if curl -sSf http://localhost:3000/health >/dev/null; then
    if bun run "$PROJECT_ROOT/scripts/smoke-runtime.ts"; then
      echo "✅ Runtime E2E passed"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo "❌ Runtime E2E failed"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    break
  fi
  sleep 0.5
  if [ $i -eq 60 ]; then
    echo "❌ Server did not become healthy in time"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
done

kill "$STARTALL_PID" 2>/dev/null || true
STARTALL_PID=""
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

