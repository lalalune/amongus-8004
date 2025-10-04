#!/usr/bin/env bun
/**
 * Register All Agents on ERC-8004 IdentityRegistry
 * Uses the shared ERC8004Registry service from server
 */

import { createRegistry } from '../server/src/blockchain/registry.js';
import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

// Stable domain derivation to keep registration idempotent and readable
const deriveStableDomain = (displayName: string, address: string): string => {
  const normalized = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const tag = address.slice(2, 6).toLowerCase();
  const base = process.env.AGENT_DOMAIN_BASE || 'amongus8004.local';
  return `${normalized}-${tag}.${base}`;
};

// Anvil's pre-funded accounts - allow override via env PLAYER{N}_PRIVATE_KEY
const AGENTS = [
  {
    name: 'Player1-Red',
    envVar: 'PLAYER1_PRIVATE_KEY',
    fallback: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  {
    name: 'Player2-Blue',
    envVar: 'PLAYER2_PRIVATE_KEY',
    fallback: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
  {
    name: 'Player3-Green',
    envVar: 'PLAYER3_PRIVATE_KEY',
    fallback: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  },
  {
    name: 'Player4-Yellow',
    envVar: 'PLAYER4_PRIVATE_KEY',
    fallback: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  {
    name: 'Player5-Purple',
    envVar: 'PLAYER5_PRIVATE_KEY',
    fallback: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
];

async function main() {
  console.log('🔐 Registering All Agents on ERC-8004 IdentityRegistry\n');
  console.log(`RPC URL: ${RPC_URL}\n`);

  for (const agent of AGENTS) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${agent.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const privateKey = process.env[agent.envVar] || agent.fallback;
    const registry = await createRegistry(RPC_URL, privateKey);
    const wallet = new ethers.Wallet(privateKey);

    console.log(`Address:  ${wallet.address}`);
    const desiredDomain = deriveStableDomain(agent.name, wallet.address);
    console.log(`Domain:   ${desiredDomain}`);

    // Check if already registered
    const isRegistered = await registry.isAgentRegistered(wallet.address);

    if (isRegistered) {
      console.log(`Status:   ✅ Already registered`);
      
      // Get existing registration details
      const agentInfo = await registry.getAgentInfoByAddress(wallet.address);
      console.log(`Agent ID: ${agentInfo.agentId}`);
      console.log(`Domain:   ${agentInfo.agentDomain}`);
    } else {
      console.log(`Status:   📝 Not registered, registering now...`);

      // Register the agent
      const agentId = await registry.registerAgent(desiredDomain, wallet.address);
      
      console.log(`Status:   ✅ Registered successfully!`);
      console.log(`Agent ID: ${agentId}`);
    }

    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All agents processed!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verify all are registered
  console.log('🔍 Verification:\n');
  
  const verifyRegistry = await createRegistry(RPC_URL);
  
  for (const agent of AGENTS) {
    const privateKey = process.env[agent.envVar] || agent.fallback;
    const wallet = new ethers.Wallet(privateKey);
    const isRegistered = await verifyRegistry.isAgentRegistered(wallet.address);
    const status = isRegistered ? '✅' : '❌';
    console.log(`${status} ${agent.name.padEnd(20)} ${wallet.address}`);
  }

  console.log('\n✨ Registration complete! Agents are ready to play.\n');
}

main().catch((error) => {
  console.error('❌ Registration failed:', error);
  process.exit(1);
});

