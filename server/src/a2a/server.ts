/**
 * A2A JSON-RPC Server
 * Handles all A2A protocol requests and integrates with game engine
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import type { GameEngine } from '../game/engine.js';
import type { ERC8004Registry } from '../blockchain/registry.js';
import { StreamingManager, setupSSEResponse } from './streaming.js';
import { executeSkill, extractSkillId } from './skills.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MessageSendParams,
  TaskQueryParams,
  TaskIdParams,
  Task,
  Message
} from './types.js';
import {
  createSuccessResponse,
  createErrorResponse,
  createMessage,
  createTask,
  createTextPart,
  createDataPart,
  createStatusUpdateEvent,
  createArtifactUpdateEvent,
  A2A_ERROR_CODES
} from './types.js';
import type { GameEvent } from '@elizagames/shared';

export class A2AServer {
  private engine: GameEngine;
  private registry: ERC8004Registry;
  private streaming: StreamingManager;
  private activeTasks: Map<string, { agentId: string; contextId: string }> = new Map();

  constructor(engine: GameEngine, registry: ERC8004Registry) {
    this.engine = engine;
    this.registry = registry;
    this.streaming = new StreamingManager();

    // Subscribe to game events for broadcasting
    this.engine.onEvent((event) => this.handleGameEvent(event));
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

    // Execute skill
    const result = await executeSkill(skillId, this.engine, this.registry, agentId, message);

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

    this.activeTasks.set(taskId, { agentId, contextId });

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

      // If join-game, check auto-start
      if (skillId === 'join-game') {
        const canStart = this.engine.canStartGame();
        if (canStart.canStart) {
          setTimeout(() => this.engine.startGame(), 2000);
        }
      }
    } else {
      // Non-streaming response
      const responseMessage = createMessage(
        'agent',
        [createTextPart(result.message), ...(result.data ? [createDataPart(result.data)] : [])],
        uuidv4(),
        contextId,
        taskId
      );

      res.json(createSuccessResponse(request.id ?? null, responseMessage));

      // For non-streaming join, also auto-start if ready
      if (skillId === 'join-game') {
        const canStart = this.engine.canStartGame();
        if (canStart.canStart) {
          setTimeout(() => this.engine.startGame(), 2000);
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

    // Optional: verify signed message proves ownership if provided
    if (params.message) {
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
    }

    // Get current game state for this task
    const state = this.engine.getState();
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

    // Optional: verify signed message proves ownership if provided
    if (params.message) {
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
    }

    // Remove player from game (leave-game)
    const removed = this.engine.removePlayer(taskInfo.agentId);

    if (removed) {
      this.streaming.closeConnection(taskInfo.agentId, params.id);
      this.activeTasks.delete(params.id);

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
    const state = this.engine.getState();
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
    const players = this.engine.getState().players;

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
        const statusUpdate = createStatusUpdateEvent(
          conn.taskId,
          conn.contextId,
          'working',
          this.formatGameEventMessage(event),
          false
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
        return `Player moved: ${event.data.from} → ${event.data.to}`;
      case 'task-completed':
        return `✅ Task completed: ${event.data.taskDescription}`;
      case 'player-killed':
        return `💀 A player was killed in ${event.data.location}`;
      case 'meeting-called':
        return `🚨 Emergency meeting called!`;
      case 'body-reported':
        return `🚨 Dead body reported!`;
      case 'voting-started':
        return `🗳️ Voting phase started`;
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
  private async verifyMessageSignature(message: Message): Promise<{ valid: boolean; error?: string }> {
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

    return { valid: true };
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

