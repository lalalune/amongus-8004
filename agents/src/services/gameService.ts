/**
 * Game Service
 * Manages game state and coordinates with A2A server
 * Generic - works with any A2A game server
 */

import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { A2AClientService } from './a2aClient.js';
import { Web3Service } from './web3Service.js';

export interface GameState {
  connected: boolean;
  phase: string;
  role?: string;
  location?: string;
  availableActions: string[];
  lastUpdate: number;
}

export class GameService extends Service {
  static serviceType = 'game';
  capabilityDescription = 'Coordinates game state and A2A server communication';

  private a2aClient: A2AClientService | null = null;
  private web3: Web3Service | null = null;
  private gameState: GameState = {
    connected: false,
    phase: 'disconnected',
    availableActions: [],
    lastUpdate: Date.now()
  };

  async initialize(runtime: IAgentRuntime): Promise<void> {
    logger.info('[Game] Initializing game service');

    // Wait for dependencies to be available (services initialize asynchronously)
    const maxRetries = 10;
    const retryDelay = 500; // ms
    
    for (let i = 0; i < maxRetries; i++) {
      this.a2aClient = runtime.getService('a2a-client') as A2AClientService;
      this.web3 = runtime.getService('web3') as Web3Service;
      
      if (this.a2aClient && this.web3) {
        break;
      }
      
      if (i < maxRetries - 1) {
        logger.info(`[Game] Waiting for services... (attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    if (!this.a2aClient || !this.web3) {
      throw new Error('Required services not available after retries');
    }

    logger.info('[Game] ✅ Dependencies loaded');

    // Setup event listener for game updates
    this.a2aClient.onMessage((event) => this.handleGameEvent(event));

    // Auto-join game
    await this.autoJoinGame();
    
    logger.info('[Game] ✅ Game service initialized and joined game');
  }

  // ============================================================================
  // Game Connection
  // ============================================================================

  private async autoJoinGame(): Promise<void> {
    const agentInfo = this.web3!.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent not registered on-chain');
    }

    logger.info('[Game] Auto-joining game...');

    // Start streaming game events immediately on join so we receive updates
    await this.a2aClient!.streamMessage(
      'join-game',
      {
        agentId: agentInfo.agentId.toString(),
        agentAddress: agentInfo.agentAddress,
        agentDomain: agentInfo.agentDomain,
        playerName: this.web3!.getAgentInfo()?.agentDomain.split('.')[0] || 'Player'
      },
      'join the game'
    );

    this.gameState.connected = true;
    this.gameState.phase = 'lobby';
    this.gameState.lastUpdate = Date.now();

    logger.info('[Game] ✅ Connected to game and streaming events');
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private handleGameEvent(event: unknown): void {
    // Update game state based on received events
    const evt = event as { kind?: string; status?: { state?: string; message?: { parts?: unknown[] } }; metadata?: Record<string, unknown> };

    if (evt.kind === 'status-update' && evt.status) {
      const message = this.extractTextFromEvent(evt);
      logger.info(`[Game] Event: ${message}`);

      // Map server game events to local phase when available
      if (evt.metadata && typeof evt.metadata === 'object' && 'gameEvent' in evt.metadata) {
        const gameEvent = evt.metadata.gameEvent as string | undefined;
        if (gameEvent) {
          const mapped = this.mapGameEventToPhase(gameEvent);
          if (mapped) this.gameState.phase = mapped;
        }
      }

      // Update role if present
      if (evt.metadata?.role) {
        this.gameState.role = evt.metadata.role as string;
        logger.info(`[Game] 🎭 Role assigned: ${this.gameState.role}`);
        
        // Update available actions based on role
        this.updateAvailableActions();
      }

      // Update location if present
      if (evt.metadata?.location) {
        this.gameState.location = evt.metadata.location as string;
      }

      this.gameState.lastUpdate = Date.now();
    }
  }

  private extractTextFromEvent(event: { status?: { message?: { parts?: unknown[] } } }): string {
    const parts = event.status?.message?.parts as Array<{ kind?: string; text?: string }> | undefined;
    if (!parts) return '';
    
    const textParts = parts.filter((p) => p.kind === 'text');
    return textParts.map((p) => p.text).join(' ');
  }

  private mapGameEventToPhase(gameEvent: string): string | null {
    switch (gameEvent) {
      case 'game-started':
        return 'playing';
      case 'meeting-called':
      case 'body-reported':
        return 'discussion';
      case 'voting-started':
        return 'voting';
      case 'game-ended':
        return 'ended';
      default:
        return null;
    }
  }

  // ============================================================================
  // Action Management
  // ============================================================================

  private updateAvailableActions(): void {
    const skills = this.a2aClient!.getSkills();
    const role = this.gameState.role;

    // Filter skills based on role
    this.gameState.availableActions = skills
      .filter((skill) => {
        // All players can use these
        if (['join-game', 'leave-game', 'move-to-room', 'get-status', 'call-meeting', 'report-body', 'send-message', 'vote'].includes(skill.id)) {
          return true;
        }

        // Crewmate-only
        if (skill.id === 'complete-task') {
          return role === 'crewmate';
        }

        // Imposter-only
        if (['kill-player', 'use-vent', 'sabotage'].includes(skill.id)) {
          return role === 'imposter';
        }

        return true;
      })
      .map((s) => s.id);

    logger.info(`[Game] Available actions updated: ${this.gameState.availableActions.length} actions`);
  }

  // ============================================================================
  // Skill Execution
  // ============================================================================

  async executeSkill(skillId: string, params: Record<string, unknown>, text?: string): Promise<unknown> {
    const agentInfo = this.web3!.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent info not available');
    }

    // Add agent identifiers to params
    const fullParams = {
      ...params,
      agentId: agentInfo.agentId.toString(),
      agentAddress: agentInfo.agentAddress,
      agentDomain: agentInfo.agentDomain
    };

    // Send via A2A
    return await this.a2aClient!.sendMessage(skillId, fullParams, text);
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getGameState(): GameState {
    return { ...this.gameState };
  }

  getPhase(): string {
    return this.gameState.phase;
  }

  getRole(): string | undefined {
    return this.gameState.role;
  }

  getAvailableActions(): string[] {
    return [...this.gameState.availableActions];
  }

  isConnected(): boolean {
    return this.gameState.connected;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new GameService(runtime);
    await service.initialize(runtime);
    return service;
  }

  async stop(): Promise<void> {
    logger.info('[Game] Shutting down');
    this.gameState.connected = false;
    if (this.a2aClient) {
      await this.a2aClient.cleanup();
    }
  }
}

