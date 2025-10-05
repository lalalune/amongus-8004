/**
 * Among Us ERC-8004 Agent Entry Point
 * Manually creates and runs AgentRuntime instances for each character
 */

import { AgentRuntime, type Character, type Plugin } from '@elizaos/core';
import amongUsPlugin from './plugin.js';

// Import all character configurations
import bootstrapPlugin from '@elizaos/plugin-bootstrap';
import openaiPlugin from '@elizaos/plugin-openai';
import sqlPlugin from '@elizaos/plugin-sql';
import player1 from '../characters/player1.json';
import player2 from '../characters/player2.json';
import player3 from '../characters/player3.json';
import player4 from '../characters/player4.json';
import player5 from '../characters/player5.json';

// Store active runtimes
const activeRuntimes: Map<string, AgentRuntime> = new Map();

// Helper to create and initialize an AgentRuntime
const createAgentRuntime = async (
  character: Character,
  privateKeyEnvVar: string
): Promise<AgentRuntime> => {
  const privateKey = process.env[privateKeyEnvVar];
  if (!privateKey) {
    throw new Error(`Missing environment variable: ${privateKeyEnvVar}`);
  }

  // Build character with settings
  const characterWithSettings: Character = {
    ...character,
    settings: {
      secrets: {
        GAME_SERVER_URL: process.env.GAME_SERVER_URL || 'http://localhost:3000',
        RPC_URL: process.env.RPC_URL || 'http://localhost:8545',
        AGENT_PRIVATE_KEY: privateKey,
      },
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      AGENT_AUTOPLAY: process.env.AGENT_AUTOPLAY || '0',
      ...character.settings,
    },
  };

  console.log(`\n🚀 Creating runtime for ${character.name}...`);
  console.log(`   Wallet: ${privateKey.substring(0, 10)}...`);

  // Create the runtime with plugins (SQL plugin MUST be first for database adapter)
  const runtime = new AgentRuntime({
    character: characterWithSettings,
    plugins: [sqlPlugin as Plugin, bootstrapPlugin as Plugin, openaiPlugin as Plugin, amongUsPlugin],
  });

  // Initialize the runtime
  await runtime.initialize();

  console.log(`✅ ${character.name} runtime initialized successfully`);

  return runtime;
};

// Main function to start all agents
async function startAgents(): Promise<void> {
  console.log('🎮 Starting Among Us ERC-8004 Agents...\n');

  const characters = [
    { character: player1 as unknown as Character, envVar: 'PLAYER1_PRIVATE_KEY' },
    { character: player2 as unknown as Character, envVar: 'PLAYER2_PRIVATE_KEY' },
    { character: player3 as unknown as Character, envVar: 'PLAYER3_PRIVATE_KEY' },
    { character: player4 as unknown as Character, envVar: 'PLAYER4_PRIVATE_KEY' },
    { character: player5 as unknown as Character, envVar: 'PLAYER5_PRIVATE_KEY' },
  ];

  // Initialize all runtimes
  for (const { character, envVar } of characters) {
    const runtime = await createAgentRuntime(character, envVar);
    activeRuntimes.set(character.name, runtime);
  }

  console.log('\n✨ All agents are now running!');
  console.log(`📊 Active runtimes: ${activeRuntimes.size}`);
  console.log('\nAgents:');
  for (const [name, runtime] of activeRuntimes) {
    console.log(`  - ${name} (ID: ${runtime.agentId})`);
  }

  // Auto-shutdown timer (configurable via env var, default 2 minutes)
  const autoShutdownMs = parseInt(process.env.AUTO_SHUTDOWN_MS || '120000'); // 2 minutes default
  if (autoShutdownMs > 0) {
    const shutdownMinutes = (autoShutdownMs / 60000).toFixed(1);
    console.log(`\n⏱️  Auto-shutdown enabled: will stop in ${shutdownMinutes} minutes`);
    console.log('   Set AUTO_SHUTDOWN_MS=0 to disable auto-shutdown\n');
    
    setTimeout(() => {
      console.log('\n\n⏰ Auto-shutdown timer reached. Stopping agents...');
      for (const [name, runtime] of activeRuntimes) {
        console.log(`   Stopping ${name}...`);
      }
      activeRuntimes.clear();
      console.log('✅ All agents stopped. Goodbye!\n');
      process.exit(0);
    }, autoShutdownMs);
  } else {
    console.log('\n⏳ Agents are active. Press Ctrl+C to stop.\n');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down agents...');
  
  for (const [name, runtime] of activeRuntimes) {
    console.log(`   Stopping ${name}...`);
    // Perform any cleanup needed
  }
  
  activeRuntimes.clear();
  console.log('✅ All agents stopped. Goodbye!\n');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n🛑 Received SIGTERM. Shutting down...');
  activeRuntimes.clear();
  process.exit(0);
});

// Start the agents if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startAgents().catch((error) => {
    console.error('❌ Failed to start agents:', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { activeRuntimes, createAgentRuntime, startAgents };

// Export plugin for use in other projects
  export { amongUsPlugin };

// Export services for advanced usage
  export { A2AClientService } from './services/a2aClient.js';
  export { GameService } from './services/gameService.js';
  export { Web3Service } from './services/web3Service.js';

// Export performance monitoring
export { PerformanceMonitor, performanceMonitor } from './performance.js';
export type { PerformanceMetric, PerformanceStats } from './performance.js';

// Export types
export type { A2AAgentCard, A2AMessage, A2ASkill, A2ATask } from './services/a2aClient.js';
export type { GameState } from './services/gameService.js';
export type { AgentInfo } from './services/web3Service.js';

// Export error types
export {
  A2AProtocolError,
  AgentCardError, AmongUsPluginError, ConfigurationError, GameStateError, NetworkError, RegistrationError, ServiceNotAvailableError, SkillExecutionError, StreamingError, Web3Error
} from './errors.js';
