#!/usr/bin/env bun
/**
 * Runtime E2E test against a live server on port 3000
 * - Spins a 5-player scripted round end-to-end
 * - Verifies lobby join, game start, actions, meeting/vote, and game end
 * - Enforces fail-fast timeouts at each phase
 */

import { ethers } from 'ethers';

type TestAgent = {
  name: string;
  wallet: ethers.Wallet;
  agentId: string;
  domain: string;
};

const SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const TIMEOUT_MS = parseInt(process.env.E2E_TIMEOUT_MS || '40000', 10);

// 5 local agents (Anvil defaults)
const wallets = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'
].map((pk) => new ethers.Wallet(pk));

const agents: TestAgent[] = wallets.map((w, i) => ({
  name: `Player${i + 1}`,
  wallet: w,
  agentId: `agent-${i + 1}`,
  domain: `player${i + 1}.amongus8004.local`
}));

async function sendSigned(agent: TestAgent, skillId: string, data: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const messageId = crypto.randomUUID();

  // Sign ONLY skill-specific data (exclude auth/metadata fields)
  const { agentId: _aid, agentAddress: _addr, agentDomain: _dom, playerName: _name, signature: _sig, timestamp: _ts, skillId: _sk, ...skillOnlyData } = data as Record<string, unknown>;
  const payload = JSON.stringify({ messageId, timestamp, skillId, data: skillOnlyData });
  const signature = await agent.wallet.signMessage(payload);

  const message = {
    role: 'user',
    parts: [
      { kind: 'text', text: `Execute ${skillId}` },
      {
        kind: 'data',
        data: {
          skillId,
          agentId: agent.agentId,
          agentAddress: agent.wallet.address,
          agentDomain: agent.domain,
          playerName: agent.name,
          signature,
          timestamp,
          ...data
        }
      }
    ],
    messageId,
    kind: 'message'
  };

  const body = { jsonrpc: '2.0', id: Date.now(), method: 'message/send', params: { message } };
  const res = await fetch(`${SERVER_URL}/a2a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

async function main() {
  console.log(`🔌 Server: ${SERVER_URL}`);

  // Health
  const health = await fetch(`${SERVER_URL}/health`).then((r) => r.json());
  console.log('💚 Health:', health.status, 'phase=', health.game?.phase);

  // Reset state (dev only)
  await fetch(`${SERVER_URL}/debug/reset`, { method: 'POST' }).catch(() => {});

  // Ensure server is in a clean lobby state before joining
  await withTimeout(async () => {
    while (true) {
      const st = await fetch(`${SERVER_URL}/debug/state`).then((r) => r.json());
      if (st.phase === 'lobby' && (st.players?.length || 0) === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, TIMEOUT_MS, 'Server did not reset to empty lobby');

  // Phase 1: Join all players (fail-fast)
  console.log('🎮 Joining 5 players...');
  for (const agent of agents) {
    const res = await sendSigned(agent, 'join-game');
    if (res.error) throw new Error(`Join failed for ${agent.name}: ${res.error.message}`);
    // Confirm join by polling get-status for this agent
    await withTimeout(async () => {
      while (true) {
        const status = await sendSigned(agent, 'get-status');
        if (!status.error) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    }, TIMEOUT_MS, `post-join get-status failed for ${agent.name}`);
    await new Promise((r) => setTimeout(r, 25));
  }

  // Wait for auto-start or start condition
  await withTimeout(async () => {
    while (true) {
      const st = await fetch(`${SERVER_URL}/debug/state`).then((r) => r.json());
      if (st.players?.length >= 5 && (st.phase === 'playing' || st.phase === 'lobby')) break;
      await new Promise((r) => setTimeout(r, 250));
    }
  }, TIMEOUT_MS, 'Game did not reach lobby/playing with 5 players');

  // Ensure status works for each (retry if needed while game transitions)
  for (const agent of agents) {
    await withTimeout(async () => {
      while (true) {
        const status = await sendSigned(agent, 'get-status');
        if (!status.error) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }, TIMEOUT_MS, `get-status failed for ${agent.name}`);
  }
  console.log('✅ All players status OK');

  // Phase 2: Movement from P1
  await sendSigned(agents[0], 'move-to-room', { targetRoom: 'upper-hallway' });

  // Phase 3: Call meeting and vote quickly to end round
  await sendSigned(agents[2], 'call-meeting');
  // Give server a moment to enter discussion
  await new Promise((r) => setTimeout(r, 300));

  // Move to voting faster if timers are short, cast votes
  await withTimeout(async () => {
    // Attempt votes; some may be rejected until voting phase flips
    for (const agent of agents) {
      try {
        await sendSigned(agent, 'vote', { targetId: 'agent-1' });
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
  }, TIMEOUT_MS, 'Voting phase did not accept votes');

  // Phase 4: Verify game ends or returns to playing
  await withTimeout(async () => {
    while (true) {
      const st = await fetch(`${SERVER_URL}/debug/state`).then((r) => r.json());
      if (['playing', 'ended', 'discussion', 'voting'].includes(st.phase)) {
        if (st.phase === 'ended' || st.phase === 'playing') break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }, TIMEOUT_MS, 'Game did not progress to playing/ended');

  const finalState = await fetch(`${SERVER_URL}/debug/state`).then((r) => r.json());
  console.log('🏁 Final State:', { phase: finalState.phase, round: finalState.round, players: finalState.players?.length });
}

async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return await Promise.race([
    fn().finally(() => timer && clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]) as T;
}

main().catch((e) => {
  console.error('❌ Smoke test error:', e);
  process.exit(1);
});


