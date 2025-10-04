# Among Us ERC-8004 Test Suite

Professional test suite for the Among Us ERC-8004 agents plugin.

## Test Structure

```
tests/
├── unit.test.ts         # Runtime unit coverage using real services
├── integration.test.ts  # Multi-agent runtime integration tests
├── e2e.test.ts          # Full end-to-end runtime tests (server + agents + SSE)
├── runner.ts            # Test suite runner
└── README.md           # This file
```

## Running Tests

### Unit & Integration Tests

Run the comprehensive test suite with all unit and integration tests:

```bash
# From agents directory
bun run tests/runner.ts

# Or from root
bun run test:unit
```

**Coverage:**
- Web3Service initialization & ERC-8004 registration
- A2A Client initialization & agent card fetching
- GameService auto-join functionality
- A2A protocol skill execution
- Game state management
- Real-time streaming
- Role-based action filtering
- Multi-agent scenarios

### End-to-End Tests

Run the full game flow test against a live server:

```bash
# From root directory
bun run test:e2e

# Or directly
bun run agents/tests/e2e.test.ts
```

**Coverage:**
- Server health checks + agent-card validation
- Multiple agents joining game (signed A2A)
- Player count tracking and phase transitions
- Agent status retrieval
- SSE streaming via message/stream
- Leave game functionality

### All Tests

Run all tests including contracts and server:

```bash
# From root directory
bun run test:all
```

## Test Files

### `unit.test.ts`

**Class:** `AmongUsTestSuite`

Comprehensive unit tests for all plugin services:

- ✅ Web3 Service & ERC-8004 Registration
- ✅ A2A Client & Agent Card Fetching
- ✅ Agent Card Skills Discovery
- ✅ Game Service Auto-Join
- ✅ Join Game Skill Execution
- ✅ Get Status Skill Execution
- ✅ Game State Updates
- ✅ A2A Streaming
- ✅ Role-Based Action Filtering
- ✅ Skill Execution Error Handling

### `integration.test.ts`

**Class:** `IntegrationTestSuite`

Multi-agent integration tests:

- ✅ Multiple Agents Connect Simultaneously
- ✅ Agents Have Unique On-Chain Identities
- ✅ Agents Can See Each Other In Game
- ✅ Role Assignment Works Across Multiple Agents
- ✅ Agents Can Complete Tasks Independently
- ✅ Meeting System Works With Multiple Agents
- ✅ Voting System Handles Multiple Votes
- ✅ Imposter Actions Visible To Other Agents
- ✅ Game State Consistent Across All Agents
- ✅ Agents Handle Concurrent Actions

### `e2e.test.ts`

End-to-end game flow test with 5 agents:

- ✅ Server Health Check
- ✅ 5 Agents Join Game
- ✅ Game State After Join
- ✅ Agent Status Retrieval
- ✅ Leave Game Flow

### `runner.ts`

Test suite runner that:

1. Initializes all services (Web3, A2A, Game)
2. Runs unit test suite
3. Runs integration test suite
4. Reports comprehensive results

## Prerequisites

Before running tests, ensure:

1. **Anvil is running** (Ethereum node)
   ```bash
   anvil
   ```

2. **ERC-8004 contracts deployed**
   ```bash
   cd ../contracts
   forge script script/Deploy.s.sol --broadcast --rpc-url http://localhost:8545
   ```

3. **Game server is running**
   ```bash
   cd ../server
   bun run dev
   ```

4. **Environment configured**
   ```bash
   # .env file
   GAME_SERVER_URL=http://localhost:3000
   RPC_URL=http://localhost:8545
   AGENT_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

5. **Verify setup**
   ```bash
   bun run verify
   ```

## Expected Output

### Unit Tests

```
╔═══════════════════════════════════════════════════════════════════╗
║         🧪 Among Us ERC-8004 Test Suite Runner 🧪                ║
╚═══════════════════════════════════════════════════════════════════╝

📦 Initializing services...
  ✓ Web3Service initialized
  ✓ A2AClientService initialized
  ✓ GameService initialized

═══════════════════════════════════════════════════════════════════
🧪 Running Test Suite: amongus-erc8004
═══════════════════════════════════════════════════════════════════

🧪 Running Test: Initialize Web3 Service & ERC-8004 Registration
✅ PASSED (1.2s)

... (more tests)

═══════════════════════════════════════════════════════════════════
📊 FINAL TEST RESULTS
═══════════════════════════════════════════════════════════════════

  Unit Tests:        10 passed, 0 failed
  Integration Tests: 10 passed, 0 failed

  Total:             20 passed, 0 failed
  Duration:          12.5s
═══════════════════════════════════════════════════════════════════

🎉 All tests passed!
```

### E2E Tests

```
╔═══════════════════════════════════════════════════════════════════╗
║              🎮 END-TO-END GAME INTEGRATION TEST 🎮              ║
╚═══════════════════════════════════════════════════════════════════╝

🔍 TEST 1: Server Health Check
   ✅ Server running (uptime: 45.2s)
   Phase: lobby, Players: 0

👥 TEST 2: Join Game Flow (5 agents)
   RedAgent joining...
   ✅ SUCCESS
   BlueAgent joining...
   ✅ SUCCESS
   ... (3 more agents)
   Result: 5/5 agents joined

... (more tests)

╔═══════════════════════════════════════════════════════════════════╗
║                  ✅ END-TO-END TEST: SUCCESS! ✅                  ║
║           All agents can join, play, and leave via A2A!           ║
╚═══════════════════════════════════════════════════════════════════╝
```

## Test Development

### Adding New Unit Tests

1. Add test method to `AmongUsTestSuite` class
2. Register in constructor's `tests` array
3. Follow existing naming: `testFeatureName`

### Adding Integration Tests

1. Add test method to `IntegrationTestSuite` class
2. Register in constructor's `tests` array
3. Test cross-agent interactions

### Adding E2E Scenarios

1. Add test phase to `e2e.test.ts`
2. Use `a2a()` helper for agent actions
3. Verify game state with `getHealth()`

## Debugging

Enable debug output:

```bash
# All debug logs
DEBUG=* bun run tests/runner.ts

# Specific service
DEBUG=game:* bun run tests/runner.ts
DEBUG=a2a:* bun run tests/runner.ts
DEBUG=web3:* bun run tests/runner.ts
```

## Continuous Integration

Tests are designed to run in CI/CD:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: |
    bun run test:unit
    bun run test:e2e
```

## Performance

- **Unit Tests**: ~10-12s
- **Integration Tests**: ~8-10s
- **E2E Tests**: ~15-20s
- **Total**: ~30-40s

## License

See [LICENSE](../../LICENSE) file.

