#!/bin/bash
# Verify deployment is working

ENV=${1:-testnet}
URL=${2:-}

if [ -z "$URL" ]; then
    echo "Usage: ./verify-deployment.sh [testnet|production] <url>"
    echo "Example: ./verify-deployment.sh testnet https://amongus.railway.app"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Verifying Deployment: $ENV"
echo "🌐 URL: $URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PASSED=0
FAILED=0

# Test 1: Health check
echo "TEST 1: Health Check"
if curl -s -f "$URL/health" > /dev/null 2>&1; then
    HEALTH=$(curl -s "$URL/health")
    echo "   ✅ Server is responding"
    echo "   Status: $(echo $HEALTH | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
    PASSED=$((PASSED + 1))
else
    echo "   ❌ Server not responding"
    FAILED=$((FAILED + 1))
fi

echo ""

# Test 2: Agent Card
echo "TEST 2: Agent Card"
if curl -s -f "$URL/.well-known/agent-card.json" > /dev/null 2>&1; then
    CARD=$(curl -s "$URL/.well-known/agent-card.json")
    SKILLS=$(echo $CARD | grep -o '"skills":\[[^]]*\]' | grep -o '"id"' | wc -l)
    echo "   ✅ Agent Card accessible"
    echo "   Skills: $SKILLS"
    PASSED=$((PASSED + 1))
else
    echo "   ❌ Agent Card not accessible"
    FAILED=$((FAILED + 1))
fi

echo ""

# Test 3: A2A Endpoint (expect METHOD_NOT_FOUND for unknown method)
echo "TEST 3: A2A Endpoint"
A2A_TEST=$(curl -s -X POST "$URL/a2a" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' 2>&1)

if echo "$A2A_TEST" | grep -q "jsonrpc"; then
    echo "   ✅ A2A endpoint responding"
    PASSED=$((PASSED + 1))
else
    echo "   ❌ A2A endpoint not responding"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Verification Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "✅ Deployment verified successfully!"
    echo ""
    echo "Server is ready to accept agents!"
    exit 0
else
    echo "❌ Deployment verification failed"
    echo "   Check server logs on Railway"
    exit 1
fi

