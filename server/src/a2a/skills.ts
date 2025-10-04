/**
 * Skill Handlers
 * Maps A2A skills to game engine actions
 */

import type { GameEngine } from '../game/engine.js';
import type { ERC8004Registry } from '../blockchain/registry.js';
import type { Message, Part, DataPart } from './types.js';
import type { GameActionResult } from '@elizagames/shared';

export type SkillHandler = (
  engine: GameEngine,
  registry: ERC8004Registry,
  agentId: string,
  message: Message
) => Promise<GameActionResult>;

// ============================================================================
// Helper Functions
// ============================================================================

function extractTextFromParts(parts: Part[]): string {
  const textParts = parts.filter((p) => p.kind === 'text');
  return textParts.map((p) => (p as { text: string }).text).join(' ');
}

function extractDataFromParts(parts: Part[]): Record<string, unknown> {
  const dataParts = parts.filter((p) => p.kind === 'data') as DataPart[];
  if (dataParts.length === 0) return {};
  return dataParts[0].data;
}

function parseRoomName(text: string): string | null {
  const lowerText = text.toLowerCase();
  
  const roomMap: Record<string, string> = {
    'cafeteria': 'cafeteria',
    'cafe': 'cafeteria',
    'upper hallway': 'upper-hallway',
    'upper': 'upper-hallway',
    'weapons': 'weapons',
    'weapon': 'weapons',
    'navigation': 'navigation',
    'nav': 'navigation',
    'shields': 'shields',
    'shield': 'shields',
    'storage': 'storage',
    'electrical': 'electrical',
    'electric': 'electrical',
    'lower hallway': 'lower-hallway',
    'lower': 'lower-hallway',
    'security': 'security',
    'reactor': 'reactor',
    'engine': 'engine',
    'engine room': 'engine',
    'medbay': 'medbay',
    'med': 'medbay',
    'medical': 'medbay'
  };

  for (const [key, value] of Object.entries(roomMap)) {
    if (lowerText.includes(key)) {
      return value;
    }
  }

  return null;
}

// ============================================================================
// Skill Handlers
// ============================================================================

export const skillHandlers: Record<string, SkillHandler> = {
  // Join Game
  'join-game': async (engine, registry, agentId, message) => {
    const data = extractDataFromParts(message.parts);
    const agentAddress = data.agentAddress as string;
    const agentDomain = data.agentDomain as string;
    const playerName = data.playerName as string || `Agent-${agentId}`;

    // Validate ERC-8004 registration
    const isRegistered = await registry.isAgentRegistered(agentAddress);
    if (!isRegistered) {
      return {
        success: false,
        message: 'You must be registered in ERC-8004 IdentityRegistry first',
        error: 'NOT_REGISTERED'
      };
    }

    // Add player to game (handle engine errors gracefully)
    try {
      engine.addPlayer(agentId, agentAddress, agentDomain, playerName);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: msg,
        error: msg.toLowerCase().includes('in progress') ? 'GAME_IN_PROGRESS' : 'JOIN_FAILED'
      };
    }

    const state = engine.getState();
    const canStart = engine.canStartGame();

    return {
      success: true,
      message: canStart.canStart
        ? `Joined lobby! Starting game...`
        : `Joined lobby (${state.players.size}/${5} players)`,
      data: {
        playerId: agentId,
        playersCount: state.players.size,
        playersNeeded: 5,
        inLobby: true
      }
    };
  },

  // Leave Game
  'leave-game': async (engine, registry, agentId, message) => {
    const removed = engine.removePlayer(agentId);

    if (!removed) {
      return {
        success: false,
        message: 'You are not in the game',
        error: 'NOT_IN_GAME'
      };
    }

    return {
      success: true,
      message: 'Left the game'
    };
  },

  // Move to Room
  'move-to-room': async (engine, registry, agentId, message) => {
    const text = extractTextFromParts(message.parts);
    const data = extractDataFromParts(message.parts);

    const targetRoom = (data.targetRoom as string) || parseRoomName(text);

    if (!targetRoom) {
      return {
        success: false,
        message: 'Could not determine target room. Specify a room name.',
        error: 'INVALID_ROOM'
      };
    }

    const result = engine.movePlayer(agentId, targetRoom);

    if (!result.success) {
      return {
        success: false,
        message: result.message,
        error: 'MOVE_FAILED'
      };
    }

    const playerState = engine.getPlayerState(agentId);
    const nearbyPlayers = engine.getPlayersInRoom(targetRoom);
    const player = engine.getPlayer(agentId);

    return {
      success: true,
      message: result.message,
      data: {
        location: targetRoom,
        nearbyPlayers: nearbyPlayers
          .map((p) => p.name)
          .filter((n) => player && n !== player.name),
        canVent: (playerState?.canKill && engine.getState().ship.rooms.get(targetRoom)?.hasVent) || false
      }
    };
  },

  // Complete Task
  'complete-task': async (engine, registry, agentId, message) => {
    const text = extractTextFromParts(message.parts);
    const data = extractDataFromParts(message.parts);

    const taskId = data.taskId as string;
    const taskInput = (data.input as string) || text;

    if (!taskId) {
      return {
        success: false,
        message: 'Task ID required',
        error: 'MISSING_TASK_ID'
      };
    }

    const result = engine.completeTaskStep(agentId, taskId, taskInput);

    return {
      success: result.success,
      message: result.message,
      ...(result.completed && {
        data: {
          taskCompleted: true,
          taskId
        }
      }),
      ...(!result.success && { error: 'TASK_FAILED' })
    };
  },

  // Kill Player
  'kill-player': async (engine, registry, agentId, message) => {
    const text = extractTextFromParts(message.parts);
    const data = extractDataFromParts(message.parts);

    const targetId = data.targetId as string;

    if (!targetId) {
      return {
        success: false,
        message: 'Target player ID required',
        error: 'MISSING_TARGET'
      };
    }

    const result = engine.killPlayer(agentId, targetId);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'KILL_FAILED' })
    };
  },

  // Use Vent
  'use-vent': async (engine, registry, agentId, message) => {
    const data = extractDataFromParts(message.parts);
    const text = extractTextFromParts(message.parts);

    const action = text.includes('exit') ? 'exit' : 'enter';
    const targetRoom = data.targetRoom as string | undefined;

    const result = engine.useVent(agentId, action, targetRoom);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'VENT_FAILED' })
    };
  },

  // Sabotage
  'sabotage': async (engine, registry, agentId, message) => {
    const data = extractDataFromParts(message.parts);
    const text = extractTextFromParts(message.parts);

    let system: 'oxygen' | 'reactor' | 'lights' | 'comms' = 'oxygen';
    
    const dataSystem = data.system as string | undefined;
    if (dataSystem && ['oxygen', 'reactor', 'lights', 'comms'].includes(dataSystem)) {
      system = dataSystem as 'oxygen' | 'reactor' | 'lights' | 'comms';
    } else {
      // Parse from text
      if (text.includes('reactor')) system = 'reactor';
      else if (text.includes('light')) system = 'lights';
      else if (text.includes('comm')) system = 'comms';
      else if (text.includes('oxygen') || text.includes('o2')) system = 'oxygen';
    }

    const result = engine.sabotageSystem(agentId, system);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'SABOTAGE_FAILED' })
    };
  },

  // Call Meeting
  'call-meeting': async (engine, registry, agentId, message) => {
    const result = engine.callEmergencyMeeting(agentId);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'MEETING_FAILED' })
    };
  },

  // Report Body
  'report-body': async (engine, registry, agentId, message) => {
    const data = extractDataFromParts(message.parts);
    const bodyId = data.bodyId as string;

    if (!bodyId) {
      return {
        success: false,
        message: 'Body ID required',
        error: 'MISSING_BODY_ID'
      };
    }

    const result = engine.callEmergencyMeeting(agentId, bodyId);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'REPORT_FAILED' })
    };
  },

  // Send Message
  'send-message': async (engine, registry, agentId, message) => {
    const text = extractTextFromParts(message.parts);
    const data = extractDataFromParts(message.parts);
    
    const chatMessage = (data.message as string) || text;

    const state = engine.getState();
    if (state.phase !== 'discussion') {
      return {
        success: false,
        message: 'Can only send messages during discussion phase',
        error: 'WRONG_PHASE'
      };
    }

    const player = engine.getPlayer(agentId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
        error: 'PLAYER_NOT_FOUND'
      };
    }

    // Broadcast chat message as event (handled by caller)
    return {
      success: true,
      message: 'Message sent',
      data: {
        chatMessage,
        senderId: agentId,
        senderName: player.name
      }
    };
  },

  // Cast Vote
  'vote': async (engine, registry, agentId, message) => {
    const data = extractDataFromParts(message.parts);
    const text = extractTextFromParts(message.parts);
    
    let targetId = data.targetId as string;
    
    // Parse from text if not in data
    if (!targetId) {
      if (text.toLowerCase().includes('skip')) {
        targetId = 'skip';
      } else {
        // Try to extract player ID from text
        const match = text.match(/player[- ]?(\d+)/i) || text.match(/agent[- ]?(\d+)/i);
        if (match) {
          targetId = `agent-${match[1]}`;
        }
      }
    }

    if (!targetId) {
      return {
        success: false,
        message: 'Vote target required (player ID or "skip")',
        error: 'MISSING_TARGET'
      };
    }

    const result = engine.castVote(agentId, targetId);

    return {
      success: result.success,
      message: result.message,
      ...(!result.success && { error: 'VOTE_FAILED' })
    };
  },

  // Get Status
  'get-status': async (engine, registry, agentId, message) => {
    const state = engine.getState();
    const player = engine.getPlayer(agentId);

    if (!player) {
      return {
        success: false,
        message: 'Player not found',
        error: 'PLAYER_NOT_FOUND'
      };
    }

    const playerState = engine.getPlayerState(agentId);
    const room = state.ship.rooms.get(player.location);

    const statusData: Record<string, unknown> = {
      gameId: state.id,
      phase: state.phase,
      round: state.round,
      isAlive: player.isAlive,
      role: player.role,
      location: player.location,
      roomName: room?.name || player.location,
      nearbyPlayers: playerState?.nearbyPlayers || [],
      taskIds: player.taskIds,
      completedTaskIds: player.completedTaskIds,
      playersAlive: Array.from(state.players.values()).filter((p) => p.isAlive).length,
      playersTotal: state.players.size
    };

    // Add optional fields
    if (playerState?.tasksRemaining !== undefined) {
      statusData.tasksRemaining = playerState.tasksRemaining;
    }
    if (playerState?.canKill !== undefined) {
      statusData.canKill = playerState.canKill;
    }
    if (playerState?.killCooldown !== undefined) {
      statusData.killCooldown = playerState.killCooldown;
    }
    if (player.role === 'imposter') {
      statusData.impostersRemaining = Array.from(state.players.values()).filter(
        (p) => p.role === 'imposter' && p.isAlive
      ).length;
    }

    return {
      success: true,
      message: 'Status retrieved',
      data: statusData
    };
  }
};

// ============================================================================
// Skill Routing
// ============================================================================

export async function executeSkill(
  skillId: string,
  engine: GameEngine,
  registry: ERC8004Registry,
  agentId: string,
  message: Message
): Promise<GameActionResult> {
  const handler = skillHandlers[skillId];

  if (!handler) {
    return {
      success: false,
      message: `Unknown skill: ${skillId}`,
      error: 'UNKNOWN_SKILL'
    };
  }

  return await handler(engine, registry, agentId, message);
}

// Get skill ID from message
export function extractSkillId(message: Message): string | null {
  // Check data parts first
  const dataPart = message.parts.find((p) => p.kind === 'data') as DataPart | undefined;
  if (dataPart?.data.skillId) {
    return dataPart.data.skillId as string;
  }

  // Try to infer from text
  const text = extractTextFromParts(message.parts).toLowerCase();

  // Simple keyword matching (can be enhanced with LLM)
  if (text.includes('join') || text.includes('register')) return 'join-game';
  if (text.includes('leave') || text.includes('quit') || text.includes('exit')) return 'leave-game';
  if (text.includes('move') || text.includes('go to') || text.includes('walk')) return 'move-to-room';
  if (text.includes('task') || text.includes('fix') || text.includes('repair')) return 'complete-task';
  if (text.includes('kill') || text.includes('eliminate')) return 'kill-player';
  if (text.includes('vent')) return 'use-vent';
  if (text.includes('sabotage')) return 'sabotage';
  if (text.includes('meeting') && text.includes('call')) return 'call-meeting';
  if (text.includes('report') && text.includes('body')) return 'report-body';
  if (text.includes('vote')) return 'vote';
  if (text.includes('status') || text.includes('where am i') || text.includes('what can i')) {
    return 'get-status';
  }
  
  // Default to status for unknown queries
  return 'get-status';
}

