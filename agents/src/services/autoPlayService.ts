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
    
    const extractA2AData = (result: unknown): Record<string, unknown> | null => {
      const r: any = result;
      try {
        if (r && Array.isArray(r.parts)) {
          const dataPart = r.parts.find((p: any) => p.kind === 'data');
          return dataPart?.data || null;
        }
        if (r?.kind === 'task' && Array.isArray(r?.status?.message?.parts)) {
          const dataPart = r.status.message.parts.find((p: any) => p.kind === 'data');
          return dataPart?.data || null;
        }
      } catch {}
      return null;
    };

    const getTaskInput = (desc: string): string => {
      const lower = desc.toLowerCase();
      if (lower.includes('red wire')) return 'red';
      if (lower.includes('blue wire')) return 'blue';
      if (lower.includes('yellow wire')) return 'yellow';
      if (lower.includes('green wire')) return 'green';
      if (lower.includes('pink wire')) return 'pink';
      if (lower.includes('download')) return 'download';
      if (lower.includes('upload')) return 'upload';
      if (lower.includes('scan') || lower.includes('stand')) return 'scan';
      if (lower.includes('code') || lower.includes('1-4-2-8')) return '1428';
      if (lower.includes('coordinates') || lower.includes('x=45')) return 'X=45, Y=72';
      if (lower.includes('asteroid') || lower.includes('destroy')) return 'destroy';
      if (lower.includes('trash') || lower.includes('pull')) return 'pull';
      if (lower.includes('hexagon') || lower.includes('tap')) return 'tap';
      if (lower.includes('align')) return 'align';
      return 'complete';
    };

    this.tickTimer = setInterval(async () => {
      try {
        if (!this.game) return;
        const available = this.game.getAvailableActions();

        const statusResult = await this.game.executeSkill('get-status', {}, 'status');
        const statusData = extractA2AData(statusResult);
        if (!statusData) return;

        // Use authoritative phase from server status
        const phase = (statusData.phase as string) || 'unknown';

        // CRITICAL: Dead agents do nothing
        if (statusData.isAlive === false) {
          return;
        }

        // Voting phase: always vote skip
        if (phase === 'voting') {
          if (available.includes('vote')) {
            await this.game.executeSkill('vote', { targetId: 'skip' }, 'vote skip');
          }
          return;
        }

        // Discussion phase: wait for auto-transition
        if (phase === 'discussion') {
          return;
        }

        // Game ended: wait for rejoin
        if (phase === 'ended') {
          return;
        }

        // Playing phase - priority actions
        if (phase === 'playing') {
          // Priority 1: Complete tasks (crewmates)
          let canDoTasks = (statusData.canDoTasks || []) as Array<{ taskId: string; nextStepDescription?: string; description?: string }>;
          
          // Filter out tasks with unmet prerequisites
          const completedIds = (statusData.completedTaskIds || []) as string[];
          canDoTasks = canDoTasks.filter(t => {
            if (t.taskId.includes('fuel-upload')) {
              return completedIds.includes('fuel-download');
            }
            return true;
          });

          if (canDoTasks.length > 0 && available.includes('complete-task')) {
            const task = canDoTasks[0];
            const input = task.nextStepDescription ? getTaskInput(task.nextStepDescription) : 'complete';
            await this.game.executeSkill('complete-task', { taskId: task.taskId, input }, input);
            return;
          }

          // Priority 2: Kill (imposters) - BEFORE venting
          if (statusData.canKill && Array.isArray(statusData.killTargets) && statusData.killTargets.length > 0 && available.includes('kill-player')) {
            const targetId = statusData.killTargets[0];
            await this.game.executeSkill('kill-player', { targetId }, `kill ${targetId}`);
            return;
          }

          // Priority 3: Report bodies
          if (statusData.canReportBody && Array.isArray(statusData.deadBodies) && statusData.deadBodies.length > 0 && available.includes('report-body')) {
            const bodyId = statusData.deadBodies[0];
            await this.game.executeSkill('report-body', { bodyId }, `report ${bodyId}`);
            return;
          }

          // Priority 4: Move to explore (higher priority than venting)
          if (Array.isArray(statusData.canMove) && statusData.canMove.length > 0 && available.includes('move-to-room')) {
            const targetRoom = statusData.canMove[Math.floor(Math.random() * statusData.canMove.length)];
            await this.game.executeSkill('move-to-room', { targetRoom }, `move to ${targetRoom}`);
            return;
          }

          // Priority 5: Vent occasionally (imposter, only if no better option)
          if (statusData.canVent && Array.isArray(statusData.ventTargets) && statusData.ventTargets.length > 0 && available.includes('use-vent') && Math.random() < 0.2) {
            const targetRoom = statusData.ventTargets[Math.floor(Math.random() * statusData.ventTargets.length)];
            await this.game.executeSkill('use-vent', { targetRoom }, `vent to ${targetRoom}`);
            return;
          }

          // Priority 6: Force meeting every 60s to advance game (if available)
          // CRITICAL: Check canCallMeeting from actions to respect emergency meeting limits
          const now = Date.now();
          const actions = statusData.actions as any;
          if (now - this.lastMeetingAt > 60000 && actions?.canCallMeeting === true && available.includes('call-meeting')) {
            // Double-check phase hasn't changed since status fetch
            const currentPhase = this.game.getPhase();
            if (currentPhase === 'playing') {
              try {
                await this.game.executeSkill('call-meeting', {}, 'emergency meeting');
                this.lastMeetingAt = now;
              } catch (err) {
                // Phase may have changed, ignore error
              }
            }
            return;
          }
        }
      } catch (err) {
        logger.warn(`[AutoPlay] Tick error: ${String(err)}`);
      }
    }, 400);
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


