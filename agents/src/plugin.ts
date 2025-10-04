/**
 * Among Us ERC-8004 Plugin for ElizaOS
 * 
 * GENERIC GAME PLUGIN:
 * - Discovers game server via A2A Agent Card
 * - Dynamically generates actions from server's skills
 * - Handles ERC-8004 registration automatically
 * - Works with any A2A-compliant game server
 */

import type { Plugin } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { A2AClientService } from './services/a2aClient.js';
import { Web3Service } from './services/web3Service.js';
import { GameService } from './services/gameService.js';
import { AutoPlayService } from './services/autoPlayService.js';
import { allGameActions } from './actions/gameActions.js';
import { gameStateProvider } from './providers/gameStateProvider.js';
import { gameStrategyEvaluator } from './evaluators/gameStrategyEvaluator.js';
import { z } from 'zod';

// ============================================================================
// Configuration Schema
// ============================================================================

const configSchema = z.object({
  GAME_SERVER_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .describe('URL of the A2A game server'),
  
  RPC_URL: z
    .string()
    .url()
    .default('http://localhost:8545')
    .describe('Ethereum RPC URL for ERC-8004 contracts'),
  
  AGENT_PRIVATE_KEY: z
    .string()
    .min(64)
    .optional()
    .describe('Private key for agent wallet (ERC-8004 registration) - can be set per-agent via runtime settings')
});

// ============================================================================
// Plugin Definition
// ============================================================================

const amongUsPlugin: Plugin = {
  name: 'amongus-erc8004',
  description: 'Generic A2A game plugin with ERC-8004 trustless agent registry integration',
  
  async init(config: Record<string, string>) {
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🎮 Among Us ERC-8004 Plugin Initializing');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Merge config with environment variables (env vars take precedence)
    const mergedConfig = {
      GAME_SERVER_URL: process.env.GAME_SERVER_URL || config.GAME_SERVER_URL,
      RPC_URL: process.env.RPC_URL || config.RPC_URL,
      AGENT_PRIVATE_KEY: process.env.AGENT_PRIVATE_KEY || config.AGENT_PRIVATE_KEY,
    };

    // Validate configuration
    const validatedConfig = await configSchema.parseAsync(mergedConfig);

    // Set environment variables for services to use
    for (const [key, value] of Object.entries(validatedConfig)) {
      if (!value) continue;
      // Do not set AGENT_PRIVATE_KEY globally; each runtime supplies its own
      if (key === 'AGENT_PRIVATE_KEY') continue;
      process.env[key] = value;
    }

    logger.info(`✅ Game Server: ${validatedConfig.GAME_SERVER_URL}`);
    logger.info(`✅ RPC URL: ${validatedConfig.RPC_URL}`);
    logger.info(`✅ Agent Wallets: Set per-agent via runtime settings`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  },

  // Services initialize in order
  services: [
    Web3Service,        // 1. Setup wallet & register on-chain
    A2AClientService,   // 2. Connect to game server & fetch Agent Card
    GameService,        // 3. Auto-join game & manage game state
    AutoPlayService     // 4. Optional scripted autoplay (enabled via AGENT_AUTOPLAY)
  ],

  // All game actions (11 working + 1 placeholder in Agent Card)
  actions: allGameActions,
  
  // Providers give game context to LLM
  providers: [gameStateProvider],

  // Evaluators help agent make decisions
  evaluators: [gameStrategyEvaluator]
};

export default amongUsPlugin;

