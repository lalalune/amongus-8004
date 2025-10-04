#!/usr/bin/env bun
/**
 * Runtime smoke test against a live server on port 3000
 * - Joins the game with Player1 (Anvil default key)
 * - Retrieves status
 * - Prints debug state
 */

import { ethers } from 'ethers';

const SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';

// Player1 - Anvil default
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(PRIVATE_KEY);

async function sendSigned(skillId: string, data: Record<string, unknown> = {}, agentId = 'agent-1') {
  const timestamp = Date.now();
  const messageId = crypto.randomUUID();

  // Sign ONLY skill data
  const payload = JSON.stringify({ messageId, timestamp, skillId, data });
  const signature = await wallet.signMessage(payload);

  const message = {
    role: 'user',
    parts: [
      { kind: 'text', text: `Execute ${skillId}` },
      {
        kind: 'data',
        data: {
          skillId,
          agentId,
          agentAddress: wallet.address,
          agentDomain: 'player1.amongus8004.local',
          playerName: 'Player1-Red',
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

  // Join game
  const join = await sendSigned('join-game');
  if (join.error) {
    console.error('❌ Join failed:', join.error);
    process.exit(1);
  }
  console.log('✅ Joined game');

  // Status
  const status = await sendSigned('get-status');
  if (status.error) {
    console.error('❌ get-status failed:', status.error);
    process.exit(1);
  }
  console.log('✅ get-status ok');

  // Debug state
  const state = await fetch(`${SERVER_URL}/debug/state`).then((r) => r.json());
  console.log('🧭 State:', { phase: state.phase, round: state.round, players: state.players?.length });
}

main().catch((e) => {
  console.error('❌ Smoke test error:', e);
  process.exit(1);
});


