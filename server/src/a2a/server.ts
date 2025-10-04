/**
 * A2A JSON-RPC Server
 * Handles all A2A protocol requests and integrates with game engine
 */

import type { GameEvent } from '@elizagames/shared';
import { ethers } from 'ethers';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ERC8004Registry } from '../blockchain/registry.js';
import type { GameEngine } from '../game/engine.js';
import { GameSessionsManager } from '../game/sessions.js';
import { executeSkill, extractSkillId } from './skills.js';
import { StreamingManager, setupSSEResponse } from './streaming.js';
import type {
  JSONRPCRequest,
  Message,
  MessageSendParams,
  TaskIdParams,
  TaskQueryParams
} from './types.js';
import {
  A2A_ERROR_CODES,
  createDataPart,
  createErrorResponse,
  createMessage,
  createStatusUpdateEvent,
  createSuccessResponse,
  createTask,
  createTextPart
} from './types.js';

export class A2AServer {
  private engine: GameEngine;
  private registry: ERC8004Registry;
  private streaming: StreamingManager;
  private activeTasks: Map<string, { agentId: string; contextId: string; gameId?: string }> = new Map();
  private sessions?: GameSessionsManager;
  private agentBindings: Map<string, string> = new Map(); // agentId -> agentAddress
  private seenMessageIds: Map<string, number> = new Map(); // messageId -> timestamp

  constructor(engine: GameEngine, registry: ERC8004Registry, sessions?: GameSessionsManager) {
    this.engine = engine;
    this.registry = registry;
    this.streaming = new StreamingManager();
    this.sessions = sessions;

    // Subscribe to game events for broadcasting
    this.subscribeEngine(this.engine);

    // Subscribe to newly created sessions for event forwarding
    if (this.sessions && 'onNewSession' in this.sessions) {
      (this.sessions as any).onNewSession((engine: GameEngine) => this.subscribeEngine(engine));
    }
  }

  // ============================================================================
  // Main Request Handler
  // ============================================================================

  async handleRequest(req: Request, res: Response): Promise<void> {
    const request = req.body as JSONRPCRequest;

    // Validate JSON-RPC structure
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC version'
        )
      );
      return;
    }

    if (!request.method) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Missing method'
        )
      );
      return;
    }

    // Route to appropriate handler
    switch (request.method) {
      case 'message/send':
        await this.handleMessageSend(request, res, false, req);
        break;

      case 'message/stream':
        await this.handleMessageSend(request, res, true, req);
        break;

      case 'tasks/get':
        await this.handleTasksGet(request, res);
        break;

      case 'tasks/cancel':
        await this.handleTasksCancel(request, res);
        break;

      case 'tasks/resubscribe':
        await this.handleTasksResubscribe(request, res);
        break;

      default:
        res.json(
          createErrorResponse(
            request.id ?? null,
            A2A_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${request.method}`
          )
        );
    }
  }

  // ============================================================================
  // message/send and message/stream
  // ============================================================================

  private async handleMessageSend(
    request: JSONRPCRequest,
    res: Response,
    streaming: boolean,
    req?: Request
  ): Promise<void> {
    const params = request.params as unknown as MessageSendParams;

    if (!params || !params.message) {
      res.json(
        createErrorResponse(request.id ?? null, A2A_ERROR_CODES.INVALID_PARAMS, 'Missing message')
      );
      return;
    }

    const message = params.message;
    const agentId = this.extractAgentId(message);

    if (!agentId) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Could not determine agent ID'
        )
      );
      return;
    }

    // CRITICAL: Verify message signature to prevent impersonation
    const signatureValidation = await this.verifyMessageSignature(message);
    
    if (!signatureValidation.valid) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          signatureValidation.error || 'Signature verification failed'
        )
      );
      return;
    }

    // Prevent duplicate message IDs (basic replay protection even within allowed window)
    if (this.seenMessageIds.has(message.messageId)) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Duplicate messageId detected'
        )
      );
      return;
    }
    this.seenMessageIds.set(message.messageId, Date.now());
    // Opportunistic cleanup of old entries (>10 minutes)
    if (this.seenMessageIds.size > 1000) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [mid, ts] of this.seenMessageIds.entries()) {
        if (ts < cutoff) this.seenMessageIds.delete(mid);
      }
    }

    // Enforce agentId<->address binding
    const boundAddress = this.agentBindings.get(agentId);
    if (boundAddress && boundAddress.toLowerCase() !== signatureValidation.address!.toLowerCase()) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          `Agent ID is already bound to a different address`
        )
      );
      return;
    }

    // Determine skill
    const skillId = extractSkillId(message);
    
    if (!skillId) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Could not determine skill'
        )
      );
      return;
    }

    // Resolve engine (single-session fallback if sessions not provided)
    let targetEngine: GameEngine | null = null;
    if (this.sessions) {
      if (skillId === 'join-game') {
        // Join uses lobby assignment, but prefer existing mapping (or existing presence)
        targetEngine =
          this.sessions.getEngineForAgent(agentId) ||
          this.sessions.getEngineContainingAgent(agentId) ||
          this.sessions.assignLobby(agentId);
      } else {
        // Resolve by mapping; as a fallback heal races by scanning sessions for existing presence
        targetEngine = this.sessions.getEngineForAgent(agentId) || this.sessions.getEngineContainingAgent(agentId);
        if (!targetEngine) {
          res.json(
            createErrorResponse(
              request.id ?? null,
              A2A_ERROR_CODES.INVALID_PARAMS,
              'Agent is not in a game. Use join-game first.'
            )
          );
          return;
        }
      }
    } else {
      targetEngine = this.engine;
    }

    // For join-game, ensure registry info and bind mapping
    if (skillId === 'join-game') {
      // Bind mapping now that address is validated
      if (!boundAddress) {
        this.agentBindings.set(agentId, signatureValidation.address!);
      }
    }

    // Execute skill on target engine
    const result = await executeSkill(skillId, targetEngine, this.registry, agentId, message);

    // Record API message in game history
    try {
      targetEngine.recordApiMessage(
        agentId,
        skillId,
        message.messageId,
        { message },
        { result },
        !!result.success
      );
    } catch {}

    if (!result.success) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INTERNAL_ERROR,
          result.message,
          result.data
        )
      );
      return;
    }

    // Create or get task
    const taskId = message.taskId || uuidv4();
    const contextId = message.contextId || uuidv4();

    const gameId = targetEngine.getState().id;
    this.activeTasks.set(taskId, { agentId, contextId, gameId });

    // Setup streaming if requested
    if (streaming) {
      setupSSEResponse(res);

      this.streaming.addConnection({
        agentId,
        taskId,
        contextId,
        response: res,
        requestId: request.id ?? uuidv4()
      });

      // Send initial task state
      const task = createTask(taskId, contextId, 'working', result.message);
      const responseEvent = createSuccessResponse(request.id ?? null, task);
      res.write(`data: ${JSON.stringify(responseEvent)}\n\n`);

      // If join-game, check auto-start and record session mapping
      if (skillId === 'join-game') {
        if (this.sessions) {
          this.sessions.setAgentGame(agentId, gameId);
        }
        const canStart = targetEngine.canStartGame();
        if (canStart.canStart) {
          setTimeout(() => targetEngine.startGame(), 2000);
        }
      } else if (skillId === 'leave-game') {
        if (this.sessions) {
          this.sessions.removeAgent(agentId);
        }
      }
    } else {
      // Non-streaming response
      // For non-streaming join, record mapping BEFORE responding to avoid race with immediate follow-up calls
      if (skillId === 'join-game') {
        if (this.sessions) {
          this.sessions.setAgentGame(agentId, gameId);
        }
      }

      const responseMessage = createMessage(
        'agent',
        [createTextPart(result.message), ...(result.data ? [createDataPart(result.data)] : [])],
        uuidv4(),
        contextId,
        taskId
      );

      res.json(createSuccessResponse(request.id ?? null, responseMessage));

      // Auto-start and cleanup mapping for leave after responding
      if (skillId === 'join-game') {
        const canStart = targetEngine.canStartGame();
        if (canStart.canStart) {
          setTimeout(() => targetEngine.startGame(), 2000);
        }
      } else if (skillId === 'leave-game') {
        if (this.sessions) {
          this.sessions.removeAgent(agentId);
        }
      }
    }
  }

  // ============================================================================
  // tasks/get
  // ============================================================================

  private async handleTasksGet(request: JSONRPCRequest, res: Response): Promise<void> {
    const params = request.params as unknown as TaskQueryParams;

    if (!params || !params.id) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing task ID'
        )
      );
      return;
    }

    const taskInfo = this.activeTasks.get(params.id);

    if (!taskInfo) {
      res.json(
        createErrorResponse(request.id ?? null, A2A_ERROR_CODES.TASK_NOT_FOUND, 'Task not found')
      );
      return;
    }

    // Require signed message to verify ownership
    if (!params.message) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing signed message'
        )
      );
      return;
    }

    const validation = await this.verifyMessageSignature(params.message);
    if (!validation.valid) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          validation.error || 'Signature verification failed'
        )
      );
      return;
    }

    const messageAgentId = this.extractAgentId(params.message);
    if (!messageAgentId || messageAgentId !== taskInfo.agentId) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Task does not belong to this agent'
        )
      );
      return;
    }

    const bound = this.agentBindings.get(taskInfo.agentId);
    if (bound && bound.toLowerCase() !== validation.address!.toLowerCase()) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Address does not match task owner'
        )
      );
      return;
    }

    // Get current game state for this task
    let engine = this.sessions && taskInfo.gameId ? this.sessions.getEngineById(taskInfo.gameId) : this.engine;
    if (!engine) engine = this.engine;
    const state = engine.getState();
    const task = createTask(params.id, taskInfo.contextId, this.mapGamePhaseToTaskState(state.phase));

    res.json(createSuccessResponse(request.id ?? null, task));
  }

  // ============================================================================
  // tasks/cancel
  // ============================================================================

  private async handleTasksCancel(request: JSONRPCRequest, res: Response): Promise<void> {
    const params = request.params as unknown as TaskIdParams;

    if (!params || !params.id) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing task ID'
        )
      );
      return;
    }

    const taskInfo = this.activeTasks.get(params.id);

    if (!taskInfo) {
      res.json(
        createErrorResponse(request.id ?? null, A2A_ERROR_CODES.TASK_NOT_FOUND, 'Task not found')
      );
      return;
    }

    // Require signed message to verify ownership
    if (!params.message) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing signed message'
        )
      );
      return;
    }

    const validation = await this.verifyMessageSignature(params.message);
    if (!validation.valid) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          validation.error || 'Signature verification failed'
        )
      );
      return;
    }

    const messageAgentId = this.extractAgentId(params.message);
    if (!messageAgentId || messageAgentId !== taskInfo.agentId) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Task does not belong to this agent'
        )
      );
      return;
    }

    const bound = this.agentBindings.get(taskInfo.agentId);
    if (bound && bound.toLowerCase() !== validation.address!.toLowerCase()) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Address does not match task owner'
        )
      );
      return;
    }

    // Remove player from game (leave-game)
    let engine = this.sessions && taskInfo.gameId ? this.sessions.getEngineById(taskInfo.gameId) : this.engine;
    if (!engine) engine = this.engine;
    const removed = engine.removePlayer(taskInfo.agentId);

    if (removed) {
      this.streaming.closeConnection(taskInfo.agentId, params.id);
      this.activeTasks.delete(params.id);
      if (this.sessions) {
        this.sessions.removeAgent(taskInfo.agentId);
      }

      const task = createTask(params.id, taskInfo.contextId, 'canceled', 'Left the game');
      res.json(createSuccessResponse(request.id ?? null, task));
    } else {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.TASK_NOT_CANCELABLE,
          'Task cannot be canceled'
        )
      );
    }
  }

  // ============================================================================
  // tasks/resubscribe
  // ============================================================================

  private async handleTasksResubscribe(request: JSONRPCRequest, res: Response): Promise<void> {
    const params = request.params as unknown as TaskIdParams;

    if (!params || !params.id) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing task ID'
        )
      );
      return;
    }

    const taskInfo = this.activeTasks.get(params.id);

    if (!taskInfo) {
      res.json(
        createErrorResponse(request.id ?? null, A2A_ERROR_CODES.TASK_NOT_FOUND, 'Task not found')
      );
      return;
    }

    // Require signed message to verify ownership
    if (!params.message) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Missing signed message'
        )
      );
      return;
    }

    const validation = await this.verifyMessageSignature(params.message);
    if (!validation.valid) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          validation.error || 'Signature verification failed'
        )
      );
      return;
    }

    const messageAgentId = this.extractAgentId(params.message);
    if (!messageAgentId || messageAgentId !== taskInfo.agentId) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Task does not belong to this agent'
        )
      );
      return;
    }

    const bound = this.agentBindings.get(taskInfo.agentId);
    if (bound && bound.toLowerCase() !== validation.address!.toLowerCase()) {
      res.json(
        createErrorResponse(
          request.id ?? null,
          A2A_ERROR_CODES.INVALID_PARAMS,
          'Address does not match task owner'
        )
      );
      return;
    }

    // Setup SSE and re-add connection
    setupSSEResponse(res);

    this.streaming.addConnection({
      agentId: taskInfo.agentId,
      taskId: params.id,
      contextId: taskInfo.contextId,
      response: res,
      requestId: request.id ?? uuidv4()
    });

    // Send current game state
    let engine = this.sessions && taskInfo.gameId ? this.sessions.getEngineById(taskInfo.gameId) : this.engine;
    if (!engine) engine = this.engine;
    const state = engine.getState();
    const currentStateEvent = createStatusUpdateEvent(
      params.id,
      taskInfo.contextId,
      this.mapGamePhaseToTaskState(state.phase),
      `Reconnected to game (phase: ${state.phase})`,
      false
    );

    res.write(`data: ${JSON.stringify(createSuccessResponse(request.id ?? null, currentStateEvent))}\n\n`);
  }

  // ============================================================================
  // Game Event Broadcasting
  // ============================================================================

  private handleGameEvent(event: GameEvent): void {
    // Convert game event to A2A stream event
    const engine = this.sessions ? this.sessions.getEngineById(event.gameId) || this.engine : this.engine;
    const players = engine.getState().players;

    // Determine recipients based on visibility
    let recipients: string[];
    if (event.visibility === 'all') {
      recipients = Array.from(players.keys());
    } else if (event.visibility === 'imposters') {
      recipients = Array.from(players.values())
        .filter((p) => p.role === 'imposter')
        .map((p) => p.agentId);
    } else if (event.visibility === 'specific' && event.specificPlayers) {
      recipients = event.specificPlayers;
    } else {
      return;
    }

    // Create A2A event
    for (const agentId of recipients) {
      const connections = this.streaming.getConnections(agentId);
      
      for (const conn of connections) {
        const isFinal = event.type === 'game-ended';
        const statusUpdate = createStatusUpdateEvent(
          conn.taskId,
          conn.contextId,
          'working',
          this.formatGameEventMessage(event),
          isFinal
        );

        // Add game event data to metadata
        statusUpdate.metadata = {
          gameEvent: event.type,
          ...event.data
        };

        const sseResponse = createSuccessResponse(conn.requestId, statusUpdate);
        conn.response.write(`data: ${JSON.stringify(sseResponse)}\n\n`);
      }
    }

    // Cleanup agent mappings on game end
    if (event.type === 'game-ended' && this.sessions) {
      this.sessions.cleanupAfterGameEnd(event.gameId);
    }
  }

  private formatGameEventMessage(event: GameEvent): string {
    switch (event.type) {
      case 'player-joined':
        return `Player ${event.data.playerName} joined (${event.data.playersCount}/${event.data.playersNeeded})`;
      case 'player-left':
        return `Player left. ${event.data.playersCount} players remaining`;
      case 'game-started':
        return `🎮 Game started! Round ${event.data.round}`;
      case 'role-assigned':
        return `You are a ${event.data.role}${event.data.role === 'imposter' ? ' 🔴' : ' 🔵'}`;
      case 'player-moved':
        return event.data.from && event.data.to ? `Player moved: ${event.data.from} → ${event.data.to}` : 'You moved';
      case 'task-completed':
        return event.data.taskDescription ? `✅ Task completed: ${event.data.taskDescription}` : '✅ Task completed';
      case 'player-killed':
        return event.data.location ? `💀 A player was killed in ${event.data.location}` : '💀 A player was killed';
      case 'emergency-meeting':
        return `🚨 Emergency meeting called!`;
      case 'body-reported':
        return `🚨 Dead body reported!`;
      case 'voting-started':
        return `🗳️ Voting phase started`;
      case 'vote-cast':
        return `🗳️ Vote cast (${event.data.voteCount}/${event.data.totalVoters})`;
      case 'sabotage-triggered':
        return `🚨 Sabotage: ${event.data.system}${event.data.urgent ? ' (urgent)' : ''}`;
      case 'vent-used':
        return event.data.from && event.data.to ? `Vent used: ${event.data.from} → ${event.data.to}` : 'Vent used';
      case 'player-ejected':
        return event.data.skipped
          ? '⏭️ No one was ejected (tie/skip)'
          : `🚀 Player ejected. ${event.data.wasImposter ? 'Was imposter!' : 'Was not imposter.'}`;
      case 'game-ended':
        return `🏁 Game ended! ${event.data.winner} win!`;
      default:
        return `Game event: ${event.type}`;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private subscribeEngine(engine: GameEngine): void {
    engine.onEvent((event) => this.handleGameEvent(event));
  }

  private extractAgentId(message: Message): string | null {
    // Try to get from data part
    const dataPart = message.parts.find((p) => p.kind === 'data');
    if (dataPart && 'data' in dataPart) {
      const agentId = dataPart.data.agentId as string;
      if (agentId) return agentId;
    }

    // Try to get from metadata
    if (message.metadata?.agentId) {
      return message.metadata.agentId as string;
    }

    return null;
  }

  private extractAgentAddress(message: Message): string | null {
    // Try to get from data part
    const dataPart = message.parts.find((p) => p.kind === 'data');
    if (dataPart && 'data' in dataPart) {
      const agentAddress = dataPart.data.agentAddress as string;
      if (agentAddress) return agentAddress;
    }

    // Try to get from metadata
    if (message.metadata?.agentAddress) {
      return message.metadata.agentAddress as string;
    }

    return null;
  }

  /**
   * Verify message signature to prevent impersonation
   * Returns validation result with error message if invalid
   */
  private async verifyMessageSignature(message: Message): Promise<{ valid: boolean; error?: string; address?: string }> {
    // Extract signature data from message
    const dataPart = message.parts.find((p) => p.kind === 'data');
    if (!dataPart || !('data' in dataPart)) {
      return { valid: false, error: 'No data part found in message' };
    }

    const data = dataPart.data;
    const agentAddress = data.agentAddress as string;
    const signature = data.signature as string;
    const timestamp = data.timestamp as number;
    const skillId = data.skillId as string;

    // Validate required fields
    if (!agentAddress) {
      return { valid: false, error: 'Missing agent address in message' };
    }

    if (!signature) {
      return { valid: false, error: 'Missing signature in message' };
    }

    if (!timestamp) {
      return { valid: false, error: 'Missing timestamp in message' };
    }

    // Check timestamp is recent (prevent replay attacks)
    const now = Date.now();
    const age = now - timestamp;
    const MAX_MESSAGE_AGE = 5 * 60 * 1000; // 5 minutes

    if (age > MAX_MESSAGE_AGE) {
      return { valid: false, error: `Message too old (${Math.floor(age / 1000)}s > ${MAX_MESSAGE_AGE / 1000}s)` };
    }

    if (timestamp > now + 60000) {
      return { valid: false, error: 'Message timestamp is in the future' };
    }

    // Reconstruct the signature payload that was signed by the client
    // Client signs: { messageId, timestamp, skillId, data }
    // where data is ONLY skill-specific fields, excluding authentication/metadata fields
    const { 
      signature: _, 
      agentAddress: __, 
      timestamp: ___, 
      skillId: ____, 
      agentId: _____,
      agentDomain: ______,
      playerName: _______,
      ...otherData 
    } = data;
    
    const signaturePayload = JSON.stringify({
      messageId: message.messageId,
      timestamp,
      skillId,
      data: otherData
    });

    // Verify signature
    const recoveredAddress = ethers.verifyMessage(signaturePayload, signature);

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== agentAddress.toLowerCase()) {
      return { 
        valid: false, 
        error: `Signature verification failed: signature is from ${recoveredAddress} but claiming to be ${agentAddress}` 
      };
    }

    // Verify agent is registered in ERC-8004
    const isRegistered = await this.registry.isAgentRegistered(agentAddress);
    if (!isRegistered) {
      return { 
        valid: false, 
        error: `Agent ${agentAddress} is not registered in ERC-8004 registry` 
      };
    }

    return { valid: true, address: recoveredAddress };
  }

  private mapGamePhaseToTaskState(phase: string): 'submitted' | 'working' | 'completed' | 'failed' {
    switch (phase) {
      case 'lobby':
        return 'submitted';
      case 'playing':
      case 'discussion':
      case 'voting':
        return 'working';
      case 'ended':
        return 'completed';
      default:
        return 'working';
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getStreamingManager(): StreamingManager {
    return this.streaming;
  }

  getEngine(): GameEngine {
    return this.engine;
  }

  getRegistry(): ERC8004Registry {
    return this.registry;
  }
}

