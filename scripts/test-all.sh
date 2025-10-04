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

echo "📋 Phase 2: Game Logic Tests"
echo "─────────────────────────────────────────────────"

cd server
if bun test src/game/; then
    echo "✅ Game logic tests passed"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "❌ Game logic tests failed"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

cd ..
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

