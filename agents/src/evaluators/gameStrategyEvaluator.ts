/**
 * Game Strategy Evaluator
 * Helps agent make strategic decisions during gameplay
 */

import type { Evaluator, IAgentRuntime, Memory, State } from '@elizaos/core';
import type { GameService } from '../services/gameService.js';

export const gameStrategyEvaluator: Evaluator = {
  name: 'GAME_STRATEGY',
  similes: ['STRATEGY', 'DECISION', 'NEXT_MOVE'],
  description: 'Evaluates the best action to take based on current game state and role',

  validate: async (runtime: IAgentRuntime, message: Memory, _state?: State): Promise<boolean> => {
    // Only evaluate during active gameplay
    const gameService = runtime.getService<GameService>('game');
    if (!gameService) return false;

    const gameState = gameService.getGameState();
    return gameState.connected && gameState.phase !== 'disconnected';
  },

  handler: async (runtime: IAgentRuntime, message: Memory) => {
    const gameService = runtime.getService<GameService>('game');
    if (!gameService) {
      return {
        success: false,
        value: null
      };
    }

    const gameState = gameService.getGameState();
    const role = gameService.getRole();
    const availableActions = gameService.getAvailableActions();

    // Build strategy prompt
    let strategyPrompt = `
You are playing Among Us. Current situation:
- Phase: ${gameState.phase}
- Role: ${role}
- Location: ${gameState.location || 'unknown'}
- Available actions: ${availableActions.join(', ')}

`;

    if (role === 'imposter') {
      strategyPrompt += `
As an IMPOSTER:
- Your goal is to eliminate crewmates without being caught
- You can kill when alone with a crewmate
- Use vents to move quickly
- Sabotage to create chaos
- Blend in during discussions
- Vote strategically to deflect suspicion
`;
    } else if (role === 'crewmate') {
      strategyPrompt += `
As a CREWMATE:
- Your goal is to complete all tasks
- Watch for suspicious behavior
- Report any dead bodies you find
- Share information in discussions
- Vote out suspected imposters
`;
    }

    strategyPrompt += `
What should you do next? Choose ONE action from your available actions.
`;

    return {
      success: true,
      value: {
        strategyPrompt,
        role,
        phase: gameState.phase,
        availableActions
      }
    };
  },

  examples: []
};

