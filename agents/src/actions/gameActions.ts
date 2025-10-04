/**
 * Game Actions - Static ElizaOS Actions for All Game Skills
 * These wrap the dynamic skill execution
 */

import type {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
  Content
} from '@elizaos/core';
import type { GameService } from '../services/gameService.js';

// Helper to execute any skill through game service
async function executeGameSkill(
  skillId: string,
  runtime: IAgentRuntime,
  message: Memory,
  callback?: HandlerCallback
): Promise<ActionResult> {
  const gameService = runtime.getService<GameService>('game');
  
  if (!gameService) {
    return {
      success: false,
      text: 'Game service not available',
      error: new Error('GAME_SERVICE_NOT_FOUND')
    };
  }

  // Extract parameters from message
  const params: Record<string, unknown> = {};
  const text = message.content.text || '';

  // Execute skill
  const result = await gameService.executeSkill(skillId, params, text);
  const response = result as { success: boolean; message: string; data?: Record<string, unknown>; error?: string };

  // Send response
  const responseContent: Content = {
    text: response.message,
    action: skillId,
    source: message.content.source
  };

  if (callback) {
    await callback(responseContent);
  }

  return {
    success: response.success,
    text: response.message,
    data: response.data,
    ...(!response.success && { error: new Error(response.error || 'Skill failed') })
  };
}

// ============================================================================
// Static Actions for All 12 Skills
// ============================================================================

export const joinGameAction: Action = {
  name: 'JOIN_GAME',
  similes: ['REGISTER', 'ENTER_LOBBY', 'PLAY'],
  description: 'Join the game lobby',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('join') || text.includes('register') || text.includes('play');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('join-game', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'I want to join the game' } },
    { name: 'Agent', content: { text: 'Joining game lobby...' } }
  ]]
};

export const leaveGameAction: Action = {
  name: 'LEAVE_GAME',
  similes: ['EXIT', 'QUIT'],
  description: 'Leave the current game',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('leave') || text.includes('exit') || text.includes('quit');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('leave-game', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'I want to leave' } },
    { name: 'Agent', content: { text: 'Leaving game...' } }
  ]]
};

export const moveToRoomAction: Action = {
  name: 'MOVE_TO_ROOM',
  similes: ['NAVIGATE', 'GO_TO', 'WALK'],
  description: 'Move to a different room',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('move') || text.includes('go to') || text.includes('walk');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('move-to-room', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Move to Electrical' } },
    { name: 'Agent', content: { text: 'Moving to Electrical...' } }
  ]]
};

export const completeTaskAction: Action = {
  name: 'COMPLETE_TASK',
  similes: ['FIX', 'REPAIR', 'DO_TASK'],
  description: 'Complete an assigned task',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('task') || text.includes('fix') || text.includes('repair');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('complete-task', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Complete wiring task' } },
    { name: 'Agent', content: { text: 'Completing task...' } }
  ]]
};

export const killPlayerAction: Action = {
  name: 'KILL_PLAYER',
  similes: ['ELIMINATE', 'ATTACK'],
  description: 'Kill a player (imposters only)',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('kill') || text.includes('eliminate');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('kill-player', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Kill nearby player' } },
    { name: 'Agent', content: { text: 'Eliminating target...' } }
  ]]
};

export const useVentAction: Action = {
  name: 'USE_VENT',
  similes: ['VENT'],
  description: 'Use vent to move quickly (imposters only)',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('vent');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('use-vent', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Use vent' } },
    { name: 'Agent', content: { text: 'Using vent...' } }
  ]]
};

export const sabotageAction: Action = {
  name: 'SABOTAGE',
  similes: ['SABOTAGE_SYSTEM', 'TRIGGER_EMERGENCY'],
  description: 'Sabotage a critical system (imposters only)',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('sabotage');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('sabotage', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Sabotage oxygen' } },
    { name: 'Agent', content: { text: 'Sabotaging system...' } }
  ]]
};

export const callMeetingAction: Action = {
  name: 'CALL_MEETING',
  similes: ['EMERGENCY', 'MEETING'],
  description: 'Call an emergency meeting',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('meeting') || text.includes('emergency');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('call-meeting', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Call emergency meeting' } },
    { name: 'Agent', content: { text: 'Calling meeting...' } }
  ]]
};

export const reportBodyAction: Action = {
  name: 'REPORT_BODY',
  similes: ['REPORT'],
  description: 'Report a dead body',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('report') && text.includes('body');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('report-body', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Report dead body' } },
    { name: 'Agent', content: { text: 'Reporting body...' } }
  ]]
};

export const sendMessageAction: Action = {
  name: 'SEND_CHAT_MESSAGE',
  similes: ['CHAT', 'SAY', 'SPEAK'],
  description: 'Send a chat message during discussion',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('say') || text.includes('chat') || text.includes('message');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('send-message', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Say I saw red in electrical' } },
    { name: 'Agent', content: { text: 'Sending message...' } }
  ]]
};

export const voteAction: Action = {
  name: 'VOTE',
  similes: ['VOTE_PLAYER', 'EJECT'],
  description: 'Vote to eject a player',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('vote');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('vote', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: 'Vote for Player 3' } },
    { name: 'Agent', content: { text: 'Casting vote...' } }
  ]]
};

export const getStatusAction: Action = {
  name: 'GET_STATUS',
  similes: ['STATUS', 'INFO', 'WHERE'],
  description: 'Get current game status',
  validate: async (_runtime, message) => {
    const text = (message.content.text || '').toLowerCase();
    return text.includes('status') || text.includes('where am i') || text.includes('what can');
  },
  handler: async (runtime, message, _state, _options, callback) => {
    return await executeGameSkill('get-status', runtime, message, callback);
  },
  examples: [[
    { name: 'User', content: { text: "What's my status?" } },
    { name: 'Agent', content: { text: 'Checking status...' } }
  ]]
};

// Export all actions as array
export const allGameActions: Action[] = [
  joinGameAction,
  leaveGameAction,
  moveToRoomAction,
  completeTaskAction,
  killPlayerAction,
  useVentAction,
  sabotageAction,
  callMeetingAction,
  reportBodyAction,
  sendMessageAction,
  voteAction,
  getStatusAction
];

