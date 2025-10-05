# Among Us ERC-8004

> Autonomous agents play Among Us via A2A protocol with ERC-8004 on-chain identity

[![Tests](https://img.shields.io/badge/tests-62%2F62%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## Among Us ERC-8004

## Quick Start

```bash
# Option 1: Full stack (server + 5 agents with autoplay + UI)
bun run dev

# Option 2: Manual (for testing/debugging)
# Terminal 1: Anvil
bash scripts/start-anvil.sh

# Terminal 2: Deploy contracts & start server
FRESH=1 bun run scripts/deploy-contracts.ts
bun run scripts/register-agents.ts
cd server && PORT=3000 DISCUSSION_TIME_MS=4000 VOTING_TIME_MS=3000 bun run start

# Terminal 3: Test with pure scripts (no agents/LLMs)
bun run scripts/test-scripted-game.ts

# Terminal 4: UI (optional)
cd ui && bun run dev

# Access points:
# - Server: http://localhost:3000/health
# - Game state: http://localhost:3000/debug/state
# - UI: http://localhost:5173
```

## Human Interface (UI)

The new React/Vite UI at `ui/` lets you:
- Control 5 agents simultaneously with side-by-side panels
- Join matchmaking, receive roles, see available actions
- Execute skills (move, kill, vote, meeting, etc.)
- View real-time SSE event logs per agent
- Test the full A2A + ERC-8004 flow as a human

## Architecture

```
┌─────────────┐
│   UI (Web)  │  ← React dashboard (5 agent panels)
└──────┬──────┘
       │ A2A JSON-RPC + SSE
       │
┌──────▼──────────────────────────────────────┐
│  Game Master Server (Express + A2A)         │
│  - ERC-8004 signature verification          │
│  - Multi-session matchmaking                │
│  - SSE event streaming                      │
└──────┬──────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────┐
│  5 ElizaOS Agents (autoplay enabled)        │
│  - Web3Service: ERC-8004 registration       │
│  - A2AClient: Connect + stream events       │
│  - GameService: State management            │
│  - AutoPlayService: Autonomous gameplay     │
└─────────────────────────────────────────────┘
```

## Packages

- `shared/` - Shared types for game state, actions, events
- `server/` - Game Master (A2A server + game engine)
- `agents/` - ElizaOS plugin for 5 autonomous agents
- `ui/` - React dashboard for human control/monitoring
- `contracts/` - ERC-8004 Solidity contracts (Foundry)

## What's Working ✅

- ✅ ERC-8004 on-chain agent registry
- ✅ A2A protocol with per-message signatures
- ✅ Multi-session game management
- ✅ 5 agents auto-join and stream events
- ✅ Game auto-starts at 5 players
- ✅ Role assignment (crewmate/imposter)
- ✅ Autoplay: movement, tasks, kills, meetings, voting
- ✅ UI dashboard with controls and logs
- ✅ Dev workflow: one command boots everything

## Remaining for 100% Autonomous Gameplay

### Critical
1. **Fix task input mapping** - Autoplay now maps task descriptions to valid inputs (red/blue/yellow wires, reactor codes, etc.)
2. **Body reporting** - Autoplay reports dead bodies when found
3. **Discussion phase** - Auto-wait for transition (no action needed)
4. **Game end handling** - Detect game-ended event, wait, rejoin new session

### Status Response Parsing
- ✅ **FIXED**: Updated autoplay to extract `canDoTasks`, `canKill`, `killTargets` directly from status data
- ✅ **FIXED**: Added task input validation (reactor=1428, wiring=colors, nav=coords, etc.)
- ✅ **FIXED**: Added body reporting priority
- ✅ **FIXED**: Added discussion/ended phase handlers

## Remaining for Production

### Deployment
- [ ] UI deployment config (Railway/Vercel)
- [ ] Production contract addresses (Base mainnet/testnet)
- [ ] Environment variable management (.env.example files)
- [ ] Health checks for all services

### Security
- [ ] UI: Warn about localStorage private keys (dev only)
- [ ] Rate limiting on A2A endpoint
- [ ] Input validation on all UI forms

### UX
- [ ] Loading states for UI actions
- [ ] Visual game phase indicators
- [ ] Ship map visualization
- [ ] Player location tracking
- [ ] Error boundaries in React

### Testing
- [ ] E2E test for UI ↔ server
- [ ] Smoke test including UI
- [ ] UI component tests
- [ ] Performance benchmarks

### Documentation
- [ ] UI README with setup instructions
- [ ] Production deployment guide
- [ ] API documentation
- [ ] Video demo/screenshots

## Testing

```bash
# Run all tests (contracts, server, agents, E2E)
bun run test

# Run smoke test (requires server + agents running)
bun run scripts/smoke-runtime.ts

# Verify setup
cd agents && bun run verify
```

## Current Status

**Agents play autonomously**: ✅ (with latest autoplay fixes)
- Tasks completed with correct inputs
- Imposters kill when possible
- Bodies reported
- Meetings called
- Votes cast (skip to advance)

**Game completes**: ⚠️ Testing in progress
- Need to verify win conditions trigger
- Need to verify game resets/rejoins after end

**UI functional**: ✅
- 5 agent panels
- Real-time logs
- Action controls
- SSE streaming

**Production ready**: 🚧 60% complete
- Core gameplay: ✅
- Deployment: ❌
- Security hardening: ⚠️
- UX polish: ⚠️

# Among Us ERC-8004

Autonomous agents play Among Us via an A2A JSON-RPC server with ERC-8004 on-chain identity/reputation. This README is a developer guide: how to run locally, test, and deploy to testnet/mainnet with CI/CD.

---

### Prerequisites

- Bun >= 1.0 and Node.js >= 20
- Foundry (forge, anvil) for contract deploys and tests
- Optional: Railway CLI for server deployment (`npm i -g @railway/cli`)

---

### Monorepo layout

- `server/` A2A game master HTTP server (Express + ethers)
- `agents/` Five player agents using ElizaOS
- `shared/` Shared types and utilities
- `contracts/` ABIs and address files used by server/agents
- `scripts/` Orchestration and deployment scripts

---

### Install

```bash
bun install
bun run build           # builds shared, server, agents
```

If you prefer explicit workspace installs: `bun run install:all`.

---

### Environment variables

Server (defaults work for local):
- `PORT` default 3000
- `RPC_URL` default http://localhost:8545
- `SERVER_URL` default http://localhost:${PORT}
- `PRIVATE_KEY` required for testnet/mainnet (server wallet)

Agents:
- `GAME_SERVER_URL` default http://localhost:3000
- `RPC_URL` default http://localhost:8545
- `PLAYER{1..5}_PRIVATE_KEY` required (defaults provided for Anvil in scripts)
- `OPENAI_API_KEY` optional but recommended
- `AUTO_SHUTDOWN_MS` default 120000 (set 0 to run indefinitely)

Contracts addresses file used by the server and scripts:
- `contracts/addresses.json` must contain deployed ERC-8004 addresses and `chainId`.

---

### Local development (single command)

```bash
bash scripts/start-all.sh
```

What it does:
1) Starts Anvil on 8545 (if not already running)
2) Builds workspaces
3) Deploys contracts locally and writes `contracts/addresses.json`
4) Registers 5 local agents on the ERC-8004 registry
5) Starts the server on port 3000
6) Starts the 5 agents in a single process

Useful endpoints:
- Health: `GET http://localhost:3000/health`
- Agent Card: `GET http://localhost:3000/.well-known/agent-card.json`
- JSON-RPC: `POST http://localhost:3000/a2a`

Manual workflow (if you want to run pieces):
```bash
# 1) Start Anvil
bun run start:anvil

# 2) Deploy contracts to Anvil (writes contracts/addresses.json)
bun run deploy:contracts

# 3) Start the server
cd server && bun run dev

# 4) Start agents (in another terminal)
bash scripts/start-agents.sh
```

---

### Testing

Run the full suite:
```bash
bash scripts/test-all.sh
```

Individually:
```bash
# Server tests
cd server && bun test

# Game logic only
cd server && bun test src/game/

# A2A protocol tests
cd server && bun test src/a2a/

# Contracts (requires the ERC-8004 contracts repo; see note below)
forge test
```

Note on contracts repo: deployment/test scripts expect a sibling repo named `erc-8004` next to this project (e.g., `../erc-8004`). If you don't have that layout, either clone it in that location or adjust paths and run Foundry commands directly in your contracts project; then copy resulting addresses into `contracts/addresses.json` here.

---

### Deploying contracts

You can use the provided scripts (assumes a sibling repo `../erc-8004` with Foundry setup), or deploy your own contracts and paste addresses into `contracts/addresses.json`.

Testnet (Base Sepolia):
```bash
export DEPLOYER_PRIVATE_KEY=0x...
export BASESCAN_API_KEY=...
bash scripts/deploy-contracts-testnet.sh

# After deploy, update contracts/addresses.json with the emitted addresses
```

Mainnet (Base):
```bash
export DEPLOYER_PRIVATE_KEY=0x...
export BASESCAN_API_KEY=...
bash scripts/deploy-contracts-prod.sh

# After deploy, set contracts/addresses.json to the mainnet addresses
```

Local (Anvil) is handled automatically by `scripts/start-all.sh` via `scripts/deploy-contracts.ts`.

---

### Deploying the server

The server runs anywhere Bun is available. Railway configuration is included (`server/railway.json`, `server/Procfile`).

Required for testnet/mainnet:
- `contracts/addresses.json` committed with target network addresses
- `RPC_URL` (e.g., `https://sepolia.base.org` or `https://mainnet.base.org`)
- `PRIVATE_KEY` (server wallet that signs on-chain interactions)
- Optionally set `SERVER_URL` if behind a custom domain

Deploy to Railway via CLI:
```bash
cd server
railway login
railway init      # or railway link if project already exists

# Set environment variables (repeat per key)
railway variables set RPC_URL=https://sepolia.base.org
railway variables set PRIVATE_KEY=0x...

# Build & deploy
railway up
```

After deploy, get the public URL (`railway status`) and point agents at it:
```bash
export GAME_SERVER_URL=https://<your-railway-url>
```

Alternatively, use helper scripts from the repo root:
```bash
bun run deploy:server:testnet     # or :prod
```

---

### Running agents against a remote server

```bash
cd agents
export GAME_SERVER_URL=https://<your-railway-url>
export RPC_URL=https://sepolia.base.org
export PLAYER1_PRIVATE_KEY=0x...
export PLAYER2_PRIVATE_KEY=0x...
export PLAYER3_PRIVATE_KEY=0x...
export PLAYER4_PRIVATE_KEY=0x...
export PLAYER5_PRIVATE_KEY=0x...
export OPENAI_API_KEY=sk-...
bun run start
```

Tip: The included `scripts/register-agents.ts` is for local Anvil (uses default Anvil keys/domains). For testnet/mainnet, register real agents using your contracts UI or bespoke scripts.

---

### CI/CD (example GitHub Actions)

Add a CI workflow that lints and tests on every PR, and deploys on merge. Example:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bun run lint
      - run: cd server && bun test

  deploy-testnet:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install && bun run build
      - run: npm i -g @railway/cli
      - run: cd server && railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
          RPC_URL: https://sepolia.base.org
          PRIVATE_KEY: ${{ secrets.SERVER_PRIVATE_KEY }}
```

For production, mirror the job with mainnet values (and appropriate approvals/branch protections). Ensure `contracts/addresses.json` is set to the correct network in the commit being deployed.

---

### Troubleshooting

- Server fails to start on testnet/mainnet: ensure `contracts/addresses.json`, `RPC_URL`, and `PRIVATE_KEY` are set.
- Local deploy script cannot find contracts: clone your ERC-8004 contracts repo as a sibling at `../erc-8004` or adjust script paths and copy ABIs/addresses into `contracts/`.
- Agents exit immediately: set `AUTO_SHUTDOWN_MS=0` to keep them running.
- 404s on endpoints: verify server health at `/health` and that `GAME_SERVER_URL` points to the correct host.

---

### Useful commands

```bash
# Build all workspaces
bun run build

# Typecheck all workspaces
bun run lint

# Start everything locally
bash scripts/start-all.sh

# Check server health
curl http://localhost:3000/health

# Smoke test against a running server
bun run scripts/smoke-runtime.ts
```

