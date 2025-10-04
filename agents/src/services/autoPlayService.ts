import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import type { GameService } from './gameService.js';

export class AutoPlayService extends Service {
  static serviceType = 'autoplay';
  capabilityDescription = 'Simulates basic gameplay actions for scripted runs';

  private game: GameService | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private lastMeetingAt = 0;

  async initialize(runtime: IAgentRuntime): Promise<void> {
    const enabled = (runtime.getSetting('AGENT_AUTOPLAY') || process.env.AGENT_AUTOPLAY || '').toString();
    if (!enabled || enabled === '0' || enabled.toLowerCase() === 'false') {
      logger.info('[AutoPlay] Disabled');
      return;
    }

    // Wait for Game service
    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
      this.game = runtime.getService('game') as GameService;
      if (this.game) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!this.game) {
      logger.warn('[AutoPlay] Game service not available');
      return;
    }

    logger.info('[AutoPlay] Enabled - starting action loop');
    this.startLoop();
  }

  private startLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(async () => {
      try {
        if (!this.game) return;
        const phase = this.game.getPhase();
        const available = this.game.getAvailableActions();

        if (phase === 'playing') {
          // Occasionally call a meeting to push the round forward
          const now = Date.now();
          if (available.includes('call-meeting') && now - this.lastMeetingAt > 2000) {
            await this.game.executeSkill('call-meeting', {}, 'call meeting');
            this.lastMeetingAt = now;
            return;
          }
        }

        if (phase === 'voting') {
          // Always vote skip to advance state reliably
          if (available.includes('vote')) {
            await this.game.executeSkill('vote', { targetId: 'skip' }, 'vote skip');
            return;
          }
        }
      } catch (err) {
        logger.warn(`[AutoPlay] Tick error: ${String(err)}`);
      }
    }, 300);
  }

  async stop(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const svc = new AutoPlayService(runtime);
    await svc.initialize(runtime);
    return svc;
  }
}

export default AutoPlayService;


