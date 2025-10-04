## Among Us ERC-8004

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

