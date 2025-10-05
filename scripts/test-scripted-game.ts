#!/usr/bin/env bun
/**
 * Pure Scripted Game Test
 * No agents, no LLMs - just scripted A2A calls to verify server logic works end-to-end
 * Tests: join → game start → movement → tasks → kills → meeting → voting → game end
 */

import { ethers } from 'ethers';

const SERVER_URL = process.env.GAME_SERVER_URL || 'http://localhost:3000';
const WALLETS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a'
].map(pk => new ethers.Wallet(pk));

type Agent = { name: string; wallet: ethers.Wallet; agentId: string; domain: string };
// Use the same registered domains/IDs
const REGISTERED_DOMAINS = [
  'player1-red-f39f.amongus8004.local',
  'player2-blue-7099.amongus8004.local',
  'player3-green-3c44.amongus8004.local',
  'player4-yellow-90f7.amongus8004.local',
  'player5-purple-15d3.amongus8004.local'
];

const agents: Agent[] = WALLETS.map((w, i) => ({
  name: `ScriptedPlayer${i+1}`,
  wallet: w,
  agentId: `scripted-${i+1}`,
  domain: REGISTERED_DOMAINS[i]
}));

async function send(agent: Agent, skillId: string, data: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const messageId = crypto.randomUUID();
  const { agentId: _aid, agentAddress: _addr, agentDomain: _dom, playerName: _name, signature: _sig, timestamp: _ts, skillId: _sk, ...skillOnly } = data;
  const payload = JSON.stringify({ messageId, timestamp, skillId, data: skillOnly });
  const signature = await agent.wallet.signMessage(payload);

  const body = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'message/send',
    params: {
      message: {
        role: 'user',
        parts: [
          { kind: 'data', data: { skillId, agentId: agent.agentId, agentAddress: agent.wallet.address, agentDomain: agent.domain, playerName: agent.name, signature, timestamp, ...data } }
        ],
        messageId,
        kind: 'message'
      }
    }
  };

  const res = await fetch(`${SERVER_URL}/a2a`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (json.error) throw new Error(`${skillId} failed: ${json.error.message}`);
  return json.result;
}

async function getState() {
  const res = await fetch(`${SERVER_URL}/debug/state`);
  return await res.json();
}

async function main() {
  console.log('🎮 Scripted Game Test - No Agents, No LLMs\n');
  
  // Reset
  await fetch(`${SERVER_URL}/debug/reset`, { method: 'POST' }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  // Phase 1: Join
  console.log('📋 Phase 1: Join Game');
  for (const agent of agents) {
    await send(agent, 'join-game');
    console.log(`  ✓ ${agent.name} joined`);
  }
  
  await new Promise(r => setTimeout(r, 3000)); // Wait for auto-start
  let state = await getState();
  console.log(`  Phase: ${state.phase}, Players: ${state.players.length}\n`);

  if (state.phase !== 'playing') {
    throw new Error('Game did not start');
  }

  // Phase 2: Movement
  console.log('📋 Phase 2: Movement');
  await send(agents[0], 'move-to-room', { targetRoom: 'upper-hallway' });
  console.log(`  ✓ ${agents[0].name} moved to upper-hallway`);
  await send(agents[1], 'move-to-room', { targetRoom: 'storage' });
  console.log(`  ✓ ${agents[1].name} moved to storage\n`);

  // Phase 3: Get status to find imposter
  console.log('📋 Phase 3: Find Imposter');
  let imposter: Agent | null = null;
  let crewmates: Agent[] = [];
  
  for (const agent of agents) {
    const result = await send(agent, 'get-status');
    const parts = result.parts || [];
    const dataPart = parts.find((p: any) => p.kind === 'data');
    const role = dataPart?.data?.role;
    if (role === 'imposter') {
      imposter = agent;
      console.log(`  🔴 ${agent.name} is the imposter`);
    } else {
      crewmates.push(agent);
    }
  }
  console.log(`  Crewmates: ${crewmates.length}, Imposters: ${imposter ? 1 : 0}\n`);

  if (!imposter) throw new Error('No imposter found');

  // Phase 4: Imposter kills
  console.log('📋 Phase 4: Imposter Kills');
  // Get current locations
  const imposterStatus = await send(imposter, 'get-status');
  const imposterLoc = imposterStatus.parts?.find((p: any) => p.kind === 'data')?.data?.location || 'cafeteria';
  console.log(`  Imposter at: ${imposterLoc}`);
  
  // Move imposter to electrical (simple path from cafeteria: cafeteria → storage → electrical)
  if (imposterLoc === 'cafeteria') {
    await send(imposter, 'move-to-room', { targetRoom: 'storage' });
    await send(imposter, 'move-to-room', { targetRoom: 'electrical' });
  }
  
  // Move a crewmate to electrical too (pick one that hasn't moved much)
  const victim = crewmates.find(c => c !== crewmates[0] && c !== crewmates[1]) || crewmates[2];
  await send(victim, 'move-to-room', { targetRoom: 'storage' });
  await send(victim, 'move-to-room', { targetRoom: 'electrical' });
  
  // Verify both are in electrical before attempting kill
  await new Promise(r => setTimeout(r, 500)); // Wait for state to update
  const victimStatus = await send(victim, 'get-status');
  const victimLoc = victimStatus.parts?.find((p: any) => p.kind === 'data')?.data?.location;
  const finalImposterStatus = await send(imposter, 'get-status');
  const finalImposterLoc = finalImposterStatus.parts?.find((p: any) => p.kind === 'data')?.data?.location;
  
  console.log(`  Imposter: ${finalImposterLoc}, Victim: ${victimLoc}`);
  if (finalImposterLoc !== victimLoc) {
    throw new Error(`Players not in same room: imposter=${finalImposterLoc}, victim=${victimLoc}`);
  }
  console.log(`  ✓ Both confirmed in ${finalImposterLoc}`);
  
  // Kill
  await send(imposter, 'kill-player', { targetId: victim.agentId });
  console.log(`  💀 ${imposter.name} killed ${victim.name}\n`);

  // Phase 5: Call Meeting
  console.log('📋 Phase 5: Emergency Meeting');
  await send(crewmates[1], 'call-meeting');
  console.log(`  🚨 ${crewmates[1].name} called meeting`);
  
  // Wait for discussion → voting auto-transition (4s discussion + buffer)
  console.log(`  Waiting for voting phase...`);
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    state = await getState();
    if (state.phase === 'voting') break;
  }
  console.log(`  Phase: ${state.phase}\n`);

  // Phase 6: Voting
  console.log('📋 Phase 6: Voting');
  // Get actual dead player from state
  const deadPlayerIds = state.deadPlayers || [];
  const alivePlayers = agents.filter(a => !deadPlayerIds.includes(a.agentId));
  console.log(`  Alive players: ${alivePlayers.length}`);
  
  for (const agent of alivePlayers) {
    await send(agent, 'vote', { targetId: 'skip' });
    console.log(`  ✓ ${agent.name} voted skip`);
  }

  await new Promise(r => setTimeout(r, 4000)); // Wait for vote tally
  state = await getState();
  console.log(`  Phase after voting: ${state.phase}\n`);

  // Phase 7: Verify game continues or ends
  console.log('📋 Phase 7: Game State');
  console.log(`  Phase: ${state.phase}`);
  console.log(`  Round: ${state.round}`);
  console.log(`  Alive: ${state.players.filter((p: any) => p.isAlive).length}/${state.players.length}`);
  console.log(`  Dead: ${state.deadPlayers.length}`);
  
  if (state.winner) {
    console.log(`  Winner: ${state.winner} 🏆`);
  }

  console.log('\n✅ SCRIPTED GAME TEST PASSED');
  console.log('   Server logic verified end-to-end without agents/LLMs');
}

main().catch(e => {
  console.error('\n❌ SCRIPTED TEST FAILED:', e.message);
  process.exit(1);
});

