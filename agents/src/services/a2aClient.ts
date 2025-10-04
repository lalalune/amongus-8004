/**
 * A2A Client Service
 * Generic A2A protocol client for connecting to any A2A game server
 */

import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import type { Action, ActionResult, Memory, State, HandlerCallback, Content } from '@elizaos/core';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';

export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: A2ASkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
  messageId: string;
  taskId?: string;
  contextId?: string;
  kind: 'message';
}

export type A2APart = 
  | { kind: 'text'; text: string }
  | { kind: 'data'; data: Record<string, unknown> };

export interface A2ATask {
  id: string;
  contextId: string;
  status: {
    state: string;
    message?: A2AMessage;
  };
  kind: 'task';
}

export class A2AClientService extends Service {
  static serviceType = 'a2a-client';
  capabilityDescription = 'Connects to A2A game servers and executes game skills';

  private serverUrl: string = '';
  private agentCard: A2AAgentCard | null = null;
  private activeTask: A2ATask | null = null;
  private eventSource: EventSource | null = null;
  private messageHandlers: Array<(event: unknown) => void> = [];
  private wallet: ethers.Wallet | null = null;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.serverUrl = runtime.getSetting('GAME_SERVER_URL') || 'http://localhost:3000';
    const privateKey = runtime.getSetting('AGENT_PRIVATE_KEY');
    
    if (!privateKey) {
      throw new Error('AGENT_PRIVATE_KEY not configured for agent');
    }

    this.wallet = new ethers.Wallet(privateKey);
    logger.info(`[A2A] Initializing client for ${this.serverUrl}`);
    logger.info(`[A2A] Agent address: ${this.wallet.address}`);

    // Fetch Agent Card
    await this.fetchAgentCard();
    
    // Dynamically register actions for available skills
    this.registerDynamicActions(runtime);
    
    logger.info(`[A2A] Connected to: ${this.agentCard?.name}`);
    logger.info(`[A2A] Available skills: ${this.agentCard?.skills.length}`);
  }

  private normalizeA2AResponse(result: unknown): { success: boolean; message: string; data?: Record<string, unknown>; error?: string } {
    let response: { success: boolean; message: string; data?: Record<string, unknown>; error?: string } = {
      success: true,
      message: 'OK'
    };
    const r = result as any;
    if (r && typeof r === 'object') {
      if (r.kind === 'task') {
        const parts = r.status?.message?.parts as Array<{ kind?: string; text?: string }> | undefined;
        const textParts = Array.isArray(parts) ? parts.filter((p) => p.kind === 'text').map((p) => p.text).join(' ') : '';
        response = {
          success: true,
          message: textParts || `Task ${r.status?.state || 'working'}`,
          data: r
        };
      } else if (r.role === 'agent' && Array.isArray(r.parts)) {
        const textParts = r.parts.filter((p: any) => p.kind === 'text').map((p: any) => p.text).join(' ');
        response = {
          success: true,
          message: textParts || 'OK',
          data: r
        };
      } else if (typeof r.success === 'boolean' && typeof r.message === 'string') {
        response = r;
      }
    }
    return response;
  }

  private registerDynamicActions(runtime: IAgentRuntime): void {
    const skills = this.getSkills();
    if (!skills || skills.length === 0) return;

    const existingNames = new Set((runtime.actions as unknown as Action[]).map((a: Action) => a.name));

    for (const skill of skills) {
      const actionName = `A2A_${skill.id.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`;
      if (existingNames.has(actionName)) continue;

      const action: Action = {
        name: actionName,
        similes: [skill.name.toUpperCase().replace(/\s+/g, '_'), skill.id.toUpperCase()],
        description: skill.description,
        validate: async (rt: IAgentRuntime, _message: Memory, _state?: State) => {
          try {
            const gameService = rt.getService('game') as any;
            if (!gameService) return false;
            const available = gameService.getAvailableActions();
            return available.includes(skill.id);
          } catch {
            return false;
          }
        },
        handler: async (
          rt: IAgentRuntime,
          message: Memory,
          _state?: State,
          _options?: any,
          callback?: HandlerCallback
        ): Promise<ActionResult> => {
          const gameService = rt.getService('game') as any;
          if (!gameService) {
            return {
              success: false,
              text: 'Game service not available',
              error: new Error('GAME_SERVICE_NOT_FOUND')
            };
          }

          const params: Record<string, unknown> = {};
          const textContent = message.content.text || '';
          const result = await gameService.executeSkill(skill.id, params, textContent);
          const normalized = this.normalizeA2AResponse(result);
          const responseContent: Content = {
            text: normalized.message,
            action: skill.id,
            source: message.content.source
          };
          if (callback) {
            await callback(responseContent);
          }
          return {
            success: normalized.success,
            text: normalized.message,
            data: normalized.data,
            ...(!normalized.success && { error: new Error(normalized.error || 'Skill failed') })
          } as ActionResult;
        },
        examples: []
      };

      try {
        (runtime.actions as unknown as Action[]).push(action);
        logger.info(`[A2A] Registered dynamic action: ${actionName}`);
      } catch (err) {
        logger.warn(`[A2A] Failed to register action ${actionName}: ${String(err)}`);
      }
    }
  }

  // ============================================================================
  // Agent Card Discovery
  // ============================================================================

  async fetchAgentCard(): Promise<A2AAgentCard> {
    const url = `${this.serverUrl}/.well-known/agent-card.json`;
    logger.info(`[A2A] Fetching Agent Card from ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Agent Card: ${response.statusText}`);
    }

    this.agentCard = await response.json() as A2AAgentCard;
    return this.agentCard;
  }

  getAgentCard(): A2AAgentCard | null {
    return this.agentCard;
  }

  getSkills(): A2ASkill[] {
    return this.agentCard?.skills || [];
  }

  getSkill(skillId: string): A2ASkill | undefined {
    return this.agentCard?.skills.find((s) => s.id === skillId);
  }

  // ============================================================================
  // Message Sending (message/send)
  // ============================================================================

  async sendMessage(
    skillId: string,
    data: Record<string, unknown>,
    textContent?: string
  ): Promise<A2ATask | A2AMessage> {
    if (!this.agentCard) {
      throw new Error('Agent Card not loaded');
    }

    const timestamp = Date.now();
    const messageId = uuidv4();
    
    // Create signature payload: messageId + timestamp + skillId + data (skill-only)
    // IMPORTANT: Sign ONLY skill-specific data (exclude auth/metadata fields)
    const { agentId: _aidSend, agentAddress: _addrSend, agentDomain: _domSend, playerName: _nameSend, signature: _sigSend, timestamp: _tsSend, skillId: _skSend, ...skillOnlyDataSend } = data as Record<string, unknown>;
    const signaturePayload = JSON.stringify({
      messageId,
      timestamp,
      skillId,
      data: skillOnlyDataSend
    });
    
    // Sign the payload with agent's private key
    const signature = await this.wallet!.signMessage(signaturePayload);

    const parts: A2APart[] = [];
    
    if (textContent) {
      parts.push({ kind: 'text', text: textContent });
    }
    
    // Include agent address, signature, and timestamp for server verification
    parts.push({
      kind: 'data',
      data: { 
        skillId,
        agentAddress: this.wallet!.address,
        signature,
        timestamp,
        ...data
      }
    });

    const message: A2AMessage = {
      role: 'user',
      parts,
      messageId,
      contextId: this.activeTask?.contextId,
      taskId: this.activeTask?.id,
      kind: 'message'
    };

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'message/send',
      params: { message }
    };

    const url = this.agentCard.url;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`A2A request failed: ${response.statusText}`);
    }

    const result = await response.json() as { result?: A2ATask | A2AMessage; error?: { message: string } };

    if (result.error) {
      throw new Error(`A2A Error: ${result.error.message}`);
    }

    // Update active task if response is a task
    if (result.result?.kind === 'task') {
      this.activeTask = result.result as A2ATask;
    }

    return result.result as A2ATask | A2AMessage;
  }

  // ============================================================================
  // Streaming (message/stream)
  // ============================================================================

  async streamMessage(
    skillId: string,
    data: Record<string, unknown>,
    textContent?: string
  ): Promise<void> {
    if (!this.agentCard) {
      throw new Error('Agent Card not loaded');
    }

    if (!this.agentCard.capabilities.streaming) {
      throw new Error('Server does not support streaming');
    }

    const timestamp = Date.now();
    const messageId = uuidv4();
    
    // Create signature payload: messageId + timestamp + skillId + data (skill-only)
    // IMPORTANT: Sign ONLY skill-specific data (exclude auth/metadata fields)
    const { agentId: _aidStream, agentAddress: _addrStream, agentDomain: _domStream, playerName: _nameStream, signature: _sigStream, timestamp: _tsStream, skillId: _skStream, ...skillOnlyDataStream } = data as Record<string, unknown>;
    const signaturePayload = JSON.stringify({
      messageId,
      timestamp,
      skillId,
      data: skillOnlyDataStream
    });
    
    // Sign the payload with agent's private key
    const signature = await this.wallet!.signMessage(signaturePayload);

    const parts: A2APart[] = [];
    
    if (textContent) {
      parts.push({ kind: 'text', text: textContent });
    }
    
    // Include agent address, signature, and timestamp for server verification
    parts.push({
      kind: 'data',
      data: { 
        skillId,
        agentAddress: this.wallet!.address,
        signature,
        timestamp,
        ...data
      }
    });

    const message: A2AMessage = {
      role: 'user',
      parts,
      messageId,
      contextId: this.activeTask?.contextId,
      taskId: this.activeTask?.id,
      kind: 'message'
    };

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'message/stream',
      params: { message }
    };

    const url = this.agentCard.url;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request)
    });

    // Some servers will return a JSON error instead of an SSE stream. Handle gracefully.
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json() as { result?: unknown; error?: { message: string } };
      if (json.error) {
        throw new Error(`A2A Error: ${json.error.message}`);
      }
      // If no error and no SSE, treat as failure to stream
      throw new Error('A2A Error: Unexpected non-stream JSON response');
    }

    if (!response.ok) {
      throw new Error(`Failed to start stream: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body for stream');
    }

    // Read SSE stream from response body
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();

    // Process stream in background
    this.processSSEStream(reader, decoder);

    logger.info('[A2A] Streaming started');
  }

  private async processSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder
  ): Promise<void> {
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        logger.info('[A2A] Stream ended');
        break;
      }

      // Decode chunk
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonData = line.slice(6); // Remove 'data: ' prefix
          
          const parsed = JSON.parse(jsonData);
          
          // Update active task
          if (parsed.result?.kind === 'task') {
            this.activeTask = parsed.result;
          }

          // Notify handlers
          for (const handler of this.messageHandlers) {
            handler(parsed.result);
          }
        }
      }
    }
  }

  onMessage(handler: (event: unknown) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  // ============================================================================
  // Task Management
  // ============================================================================

  async getTask(taskId: string): Promise<A2ATask> {
    if (!this.agentCard) {
      throw new Error('Agent Card not loaded');
    }

    // Provide a signed proof tied to the task query to prevent hijacking
    const timestamp = Date.now();
    const messageId = uuidv4();
    const skillId = 'tasks/get';
    const data = { taskId } as Record<string, unknown>;

    const signaturePayload = JSON.stringify({
      messageId,
      timestamp,
      skillId,
      data
    });
    const signature = await this.wallet!.signMessage(signaturePayload);

    const proofMessage: A2AMessage = {
      role: 'user',
      parts: [
        { kind: 'data', data: { skillId, agentAddress: this.wallet!.address, signature, timestamp, ...data } }
      ],
      messageId,
      kind: 'message'
    };

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tasks/get',
      params: { id: taskId, message: proofMessage }
    };

    const response = await fetch(this.agentCard.url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`A2A request failed: ${response.statusText}`);
    }

    const result = await response.json() as { result?: A2ATask; error?: { message: string } };

    if (result.error) {
      throw new Error(`A2A Error: ${result.error.message}`);
    }

    return result.result as A2ATask;
  }

  getActiveTask(): A2ATask | null {
    return this.activeTask;
  }

  // Resubscribe to an existing task's SSE stream
  async resubscribeTask(taskId: string): Promise<void> {
    if (!this.agentCard) {
      throw new Error('Agent Card not loaded');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tasks/resubscribe',
      params: { id: taskId }
    };

    const response = await fetch(this.agentCard.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Failed to resubscribe: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body for resubscribe stream');
    }

    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const decoder = new TextDecoder();
    this.processSSEStream(reader, decoder);
    logger.info('[A2A] Resubscribed to task stream');
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async cleanup(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.messageHandlers = [];
  }

  async stop(): Promise<void> {
    await this.cleanup();
  }

  // ElizaOS Service interface
  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new A2AClientService();
    await service.initialize(runtime);
    return service;
  }
}

