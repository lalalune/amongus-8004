/**
 * Game Sessions Manager
 * Manages multiple concurrent game sessions and simple matchmaking
 */

import { GameEngine } from './engine.js';
import type { GameConfig, GamePhase } from '@elizagames/shared';

export interface GameSummary {
  id: string;
  phase: GamePhase;
  round: number;
  players: number;
}

export class GameSessionsManager {
  private sessions: Map<string, GameEngine> = new Map();
  private agentToGame: Map<string, string> = new Map();
  private listeners: Array<(engine: GameEngine) => void> = [];
  private configTemplate?: Partial<GameConfig>;

  constructor(options: { onSessionCreated?: (engine: GameEngine) => void; configTemplate?: Partial<GameConfig> } = {}) {
    if (options.onSessionCreated) this.listeners.push(options.onSessionCreated);
    this.configTemplate = options.configTemplate;
  }

  adoptSession(engine: GameEngine): string {
    const id = engine.getState().id;
    this.sessions.set(id, engine);
    for (const cb of this.listeners) cb(engine);
    return id;
  }

  createSession(): GameEngine {
    const engine = new GameEngine(this.configTemplate || {});
    this.sessions.set(engine.getState().id, engine);
    for (const cb of this.listeners) cb(engine);
    return engine;
  }

  /**
   * Find a lobby with room or create a new session.
   * Does not modify player mappings; just returns target engine.
   */
  assignLobby(agentId: string): GameEngine {
    // If already mapped and session exists, reuse
    const existing = this.getEngineForAgent(agentId);
    if (existing) return existing;

    // Find an open lobby (phase lobby and not at capacity by heuristic)
    let best: { engine: GameEngine; players: number } | null = null;
    for (const engine of this.sessions.values()) {
      const state = engine.getState();
      if (state.phase === 'lobby') {
        const players = state.players.size;
        // Prefer smallest lobby to fill sequentially
        if (!best || players < best.players) {
          best = { engine, players };
        }
      }
    }

    if (best) return best.engine;

    // No lobby found, create new session
    return this.createSession();
  }

  setAgentGame(agentId: string, gameId: string): void {
    this.agentToGame.set(agentId, gameId);
  }

  removeAgent(agentId: string): void {
    this.agentToGame.delete(agentId);
  }

  getEngineForAgent(agentId: string): GameEngine | null {
    const gameId = this.agentToGame.get(agentId);
    if (!gameId) return null;
    return this.sessions.get(gameId) || null;
  }

  /**
   * Find an engine that already contains the given agentId.
   * Useful to heal mapping races where the player joined before mapping was recorded.
   */
  getEngineContainingAgent(agentId: string): GameEngine | null {
    for (const engine of this.sessions.values()) {
      if (engine.getState().players.has(agentId)) return engine;
    }
    return null;
  }

  getEngineById(gameId: string): GameEngine | null {
    return this.sessions.get(gameId) || null;
  }

  /**
   * Returns summaries of all known sessions.
   */
  getAllSessionsSummary(): GameSummary[] {
    const summaries: GameSummary[] = [];
    for (const engine of this.sessions.values()) {
      const state = engine.getState();
      summaries.push({
        id: state.id,
        phase: state.phase,
        round: state.round,
        players: state.players.size
      });
    }
    // Sort by most recent creation order (not tracked) -> fallback sort by phase/players
    return summaries.sort((a, b) => {
      if (a.phase === b.phase) return b.players - a.players;
      // Lobby first, then playing, then others
      const order: Record<GamePhase, number> = { lobby: 0, playing: 1, discussion: 2, voting: 3, ended: 4 };
      return order[a.phase] - order[b.phase];
    });
  }

  /**
   * Cleanup agent mappings when a game ends.
   */
  cleanupAfterGameEnd(gameId: string): void {
    const engine = this.sessions.get(gameId);
    if (!engine) return;
    const players = Array.from(engine.getState().players.keys());
    for (const agentId of players) {
      this.agentToGame.delete(agentId);
    }
  }
}

export type { GameEngine };

// Allow external registration for new-session listeners after construction
export interface GameSessionsEvents {
  onNewSession(callback: (engine: GameEngine) => void): void;
}

// Mixin minimal event API to avoid breaking constructor options
Object.assign(GameSessionsManager.prototype, {
  onNewSession(this: GameSessionsManager, callback: (engine: GameEngine) => void) {
    (this as any).listeners.push(callback);
  }
});


