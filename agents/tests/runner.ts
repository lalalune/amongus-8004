#!/usr/bin/env bun

/**
 * Test Runner for Among Us ERC-8004 Plugin
 * Runs unit and integration tests without requiring full ElizaOS CLI
 */

import { AmongUsTestSuite } from './unit.test.ts';
import { IntegrationTestSuite } from './integration.test.ts';
import { Web3Service } from '../src/services/web3Service.js';
import { A2AClientService } from '../src/services/a2aClient.js';
import { GameService } from '../src/services/gameService.js';
import type { IAgentRuntime, Service } from '@elizaos/core';

// Service registry
const services = new Map<string, Service>();

// Mock runtime with required methods
const mockRuntime = {
  agentId: 'test-agent',
  getSetting: (key: string) => {
    const settings: Record<string, string> = {
      'GAME_SERVER_URL': process.env.GAME_SERVER_URL || 'http://localhost:3000',
      'RPC_URL': process.env.RPC_URL || 'http://localhost:8545',
      'AGENT_PRIVATE_KEY': process.env.AGENT_PRIVATE_KEY || ''
    };
    return settings[key];
  },
  character: {
    name: 'TestAgent',
    bio: ['Test agent for Among Us'],
    lore: [],
    messageExamples: [],
    postExamples: [],
    topics: [],
    adjectives: [],
    knowledge: [],
    style: {
      all: [],
      chat: [],
      post: []
    }
  },
  getService: <T extends Service>(serviceType: string): T | null => {
    return services.get(serviceType) as T || null;
  }
} as unknown as IAgentRuntime;

async function initializeServices() {
  console.log('\n📦 Initializing services...');
  
  // Initialize Web3Service
  const web3Service = new Web3Service(mockRuntime);
  await web3Service.initialize(mockRuntime);
  services.set('web3', web3Service);
  console.log('  ✓ Web3Service initialized');
  
  // Initialize A2AClientService
  const a2aClient = new A2AClientService(mockRuntime);
  await a2aClient.initialize(mockRuntime);
  services.set('a2a-client', a2aClient);
  console.log('  ✓ A2AClientService initialized');
  
  // Initialize GameService
  const gameService = new GameService(mockRuntime);
  await gameService.initialize(mockRuntime);
  services.set('game', gameService);
  console.log('  ✓ GameService initialized');
  
  // Wait for auto-join and streaming to fully complete
  console.log('  ⏳ Waiting for auto-join to complete...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Verify player joined
  const gameServiceInstance = services.get('game') as GameService;
  const gameState = gameServiceInstance?.getGameState();
  console.log(`  ℹ️  Game state: phase=${gameState?.phase}, connected=${gameState?.connected}`);
}

async function runTestSuite(suite: { name: string; tests: Array<{ name: string; fn: (runtime: IAgentRuntime) => Promise<void> }> }) {
  let passed = 0;
  let failed = 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Running Test Suite: ${suite.name}`);
  console.log('='.repeat(70));

  for (const test of suite.tests) {
    console.log(`\n🧪 Running Test: ${test.name}`);
    console.log('─'.repeat(60));
    
    const startTime = Date.now();
    const result: { success: true } | { success: false; error: unknown } = await test
      .fn(mockRuntime)
      .then(() => ({ success: true as const }))
      .catch((error: unknown) => ({ success: false as const, error }));
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log(`✅ PASSED (${duration}s)`);
      passed++;
    } else {
      const err = result.error as unknown;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`❌ FAILED (${duration}s): ${message}`);
      if (err instanceof Error && err.stack) console.log(err.stack);
      failed++;
    }
  }

  return { passed, failed };
}

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║                                                                   ║');
console.log('║         🧪 Among Us ERC-8004 Test Suite Runner 🧪                ║');
console.log('║                                                                   ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝');

console.log('\n📋 Configuration:');
console.log(`  GAME_SERVER_URL: ${process.env.GAME_SERVER_URL || 'http://localhost:3000'}`);
console.log(`  RPC_URL: ${process.env.RPC_URL || 'http://localhost:8545'}`);
console.log(`  AGENT_PRIVATE_KEY: ${process.env.AGENT_PRIVATE_KEY ? '0x...'+process.env.AGENT_PRIVATE_KEY.slice(-8) : 'NOT SET'}`);

// Initialize services first
await initializeServices();

const totalStartTime = Date.now();

// Run unit tests
const unitResults = await runTestSuite(new AmongUsTestSuite());

// Run integration tests
const integrationResults = await runTestSuite(new IntegrationTestSuite());

const totalDuration = ((Date.now() - totalStartTime) / 1000).toFixed(2);
const totalPassed = unitResults.passed + integrationResults.passed;
const totalFailed = unitResults.failed + integrationResults.failed;

// Final summary
console.log('\n' + '═'.repeat(70));
console.log('📊 FINAL TEST RESULTS');
console.log('═'.repeat(70));
console.log(`\n  Unit Tests:        ${unitResults.passed} passed, ${unitResults.failed} failed`);
console.log(`  Integration Tests: ${integrationResults.passed} passed, ${integrationResults.failed} failed`);
console.log(`\n  Total:             ${totalPassed} passed, ${totalFailed} failed`);
console.log(`  Duration:          ${totalDuration}s`);
console.log('═'.repeat(70));

if (totalFailed > 0) {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}

