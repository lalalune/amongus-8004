/**
 * Game State Provider
 * Provides current game state to LLM context for decision-making
 */

import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import type { GameService } from '../services/gameService.js';

export const gameStateProvider: Provider = {
  name: 'GAME_STATE',
  description: 'Provides current game state and available actions',

  get: async (runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    const gameService = runtime.getService<GameService>('game');
    
    if (!gameService) {
      return {
        text: 'Game not connected',
        data: {},
        values: {}
      };
    }

    const gameState = gameService.getGameState();
    const role = gameService.getRole();
    const availableActions = gameService.getAvailableActions();

    const stateDescription = `
Current Game State:
- Phase: ${gameState.phase}
- Role: ${role || 'unknown'}
- Location: ${gameState.location || 'unknown'}
- Available Actions: ${availableActions.join(', ')}
- Connected: ${gameState.connected ? 'Yes' : 'No'}

You can use any of the available actions by saying them naturally.
`;

    return {
      text: stateDescription,
      data: {
        phase: gameState.phase,
        role,
        location: gameState.location,
        availableActions,
        connected: gameState.connected
      },
      values: {
        isImposter: role === 'imposter',
        isCrewmate: role === 'crewmate',
        inGame: gameState.connected,
        canAct: availableActions.length > 0
      }
    };
  }
};

