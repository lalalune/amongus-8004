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

# ============================================================================
# Phase 1: Contract Tests
# ============================================================================

echo "📋 Phase 1: ERC-8004 Contract Tests"
echo "─────────────────────────────────────────────────"

# Store current directory to return to it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT/contracts"
if forge test; then
    echo "✅ Contract tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ Contract tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

cd "$PROJECT_ROOT"
echo ""

# ============================================================================
# Phase 2: Game Logic Tests
# ============================================================================

echo "📋 Phase 2: Game Runtime E2E"
echo "─────────────────────────────────────────────────"

# Spin server and run runtime E2E smoke (fast timers)
ENV_MODE=local DISCUSSION_TIME_MS=4000 VOTING_TIME_MS=3000 KILL_COOLDOWN_MS=1000 bash scripts/start-all.sh &
STARTALL_PID=$!

# Wait for health then run smoke separately to assert
for i in {1..60}; do
  if curl -sSf http://localhost:3000/health >/dev/null; then
    if bun run scripts/smoke-runtime.ts; then
      echo "✅ Runtime E2E passed"
      TESTS_PASSED=$((TESTS_PASSED + 1))
    else
      echo "❌ Runtime E2E failed"
      TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    break
  fi
  sleep 0.5
done

kill $STARTALL_PID 2>/dev/null || true
echo ""

# ============================================================================
# Phase 3: A2A Protocol Tests
# ============================================================================

echo "📋 Phase 3: A2A Protocol Tests"
echo "─────────────────────────────────────────────────"

cd server
if bun test src/a2a/agentCard.test.ts; then
    echo "✅ A2A protocol tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ A2A protocol tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

cd ..
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

