/**
 * Game Engine
 * Core game loop and state management
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  GameState,
  Player,
  GamePhase,
  GameConfig,
  GameEvent,
  WinnerType,
  PlayerRole
} from '@elizagames/shared';
import { DEFAULT_GAME_CONFIG } from '@elizagames/shared';
import { createShipLayout, areRoomsAdjacent, getPlayersInRoom } from './ship.js';
import { createAllTasks, assignTasksToPlayer, getAllTaskProgress, validateTaskCompletion, canCompleteTask } from './tasks.js';

export class GameEngine {
  private state: GameState;
  private config: GameConfig;
  private eventCallbacks: Array<(event: GameEvent) => void> = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_GAME_CONFIG, ...config };
    
    // Validate task count
    const totalTasks = createAllTasks().size;
    if (this.config.taskCount > totalTasks) {
      throw new Error(`Task count (${this.config.taskCount}) cannot exceed total tasks (${totalTasks})`);
    }
    if (this.config.taskCount < 1) {
      throw new Error('Task count must be at least 1');
    }
    
    this.state = this.createInitialState();
  }

  // ============================================================================
  // State Management
  // ============================================================================

  private createInitialState(): GameState {
    return {
      id: uuidv4(),
      phase: 'lobby',
      round: 0,
      players: new Map(),
      ship: createShipLayout(),
      imposterIds: new Set(),
      tasks: createAllTasks(),
      deadPlayers: new Set(),
      votes: new Map(),
      createdAt: Date.now()
    };
  }

  getState(): GameState {
    // WARNING: Returns direct reference to state for performance
    // DO NOT mutate returned state - use provided methods only
    return this.state;
  }

  getPhase(): GamePhase {
    return this.state.phase;
  }

  // ============================================================================
  // Player Management
  // ============================================================================

  addPlayer(agentId: string, agentAddress: string, agentDomain: string, name: string): Player {
    // Input validation
    if (!agentId || !agentAddress || !agentDomain || !name) {
      throw new Error('Invalid player data: all fields required');
    }

    if (this.state.players.has(agentId)) {
      throw new Error('Player already in game');
    }

    if (this.state.phase !== 'lobby') {
      throw new Error('Cannot join game in progress');
    }

    if (this.state.players.size >= this.config.maxPlayers) {
      throw new Error('Game is full');
    }

    const player: Player = {
      agentId,
      agentAddress,
      agentDomain,
      name,
      location: 'cafeteria',
      role: 'crewmate', // Assigned later
      isAlive: true,
      taskIds: [],
      completedTaskIds: [],
      taskSteps: new Map(),
      emergencyMeetingsUsed: 0,
      contextId: uuidv4(),
      lastActionTime: Date.now()
    };

    this.state.players.set(agentId, player);

    this.emitEvent({
      type: 'player-joined',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        playerId: agentId,
        playerName: name,
        playersCount: this.state.players.size,
        playersNeeded: this.config.minPlayers
      },
      visibility: 'all'
    });

    return player;
  }

  removePlayer(agentId: string): boolean {
    if (!this.state.players.has(agentId)) {
      return false;
    }

    this.state.players.delete(agentId);
    this.state.imposterIds.delete(agentId);
    this.state.deadPlayers.delete(agentId);

    this.emitEvent({
      type: 'player-left',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        playerId: agentId,
        playersCount: this.state.players.size
      },
      visibility: 'all'
    });

    // Check if game should end
    if (this.state.phase === 'playing') {
      this.checkWinConditions();
    }

    return true;
  }

  getPlayer(agentId: string): Player | undefined {
    return this.state.players.get(agentId);
  }

  // ============================================================================
  // Game Flow
  // ============================================================================

  canStartGame(): { canStart: boolean; reason?: string } {
    if (this.state.phase !== 'lobby') {
      return { canStart: false, reason: 'Game already started' };
    }

    if (this.state.players.size < this.config.minPlayers) {
      return {
        canStart: false,
        reason: `Need ${this.config.minPlayers} players (currently ${this.state.players.size})`
      };
    }

    return { canStart: true };
  }

  startGame(): void {
    const check = this.canStartGame();
    if (!check.canStart) {
      throw new Error(check.reason);
    }

    this.state.phase = 'playing';
    this.state.round++;

    // Assign roles
    this.assignRoles();

    // Assign tasks to crewmates
    this.assignTasks();

    // Set all players to cafeteria
    for (const player of this.state.players.values()) {
      player.location = 'cafeteria';
    }

    this.emitEvent({
      type: 'game-started',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        round: this.state.round,
        playersCount: this.state.players.size,
        impostersCount: this.state.imposterIds.size
      },
      visibility: 'all'
    });
  }

  private assignRoles(): void {
    const playerIds = Array.from(this.state.players.keys());
    const imposterCount = Math.max(1, Math.floor(playerIds.length * this.config.imposterRatio));

    // Fisher-Yates shuffle for uniform random distribution
    const shuffled = this.shuffleArray(playerIds);
    const imposterIds = shuffled.slice(0, imposterCount);

    this.state.imposterIds = new Set(imposterIds);

    // Assign roles to players
    for (const [playerId, player] of this.state.players) {
      player.role = this.state.imposterIds.has(playerId) ? 'imposter' : 'crewmate';

      // Emit role assignment (private to each player)
      this.emitEvent({
        type: 'role-assigned',
        gameId: this.state.id,
        timestamp: Date.now(),
        data: {
          playerId,
          role: player.role,
          ...(player.role === 'imposter' && {
            otherImposters: Array.from(this.state.imposterIds).filter((id) => id !== playerId)
          })
        },
        visibility: 'specific',
        specificPlayers: [playerId]
      });
    }
  }

  private assignTasks(): void {
    const allTasks = this.state.tasks;

    for (const player of this.state.players.values()) {
      if (player.role === 'crewmate') {
        player.taskIds = assignTasksToPlayer(allTasks, this.config.taskCount);
        player.completedTaskIds = [];
      }
    }
  }

  // ============================================================================
  // Movement
  // ============================================================================

  movePlayer(agentId: string, targetRoom: string): { success: boolean; message: string } {
    const player = this.state.players.get(agentId);
    if (!player) {
      return { success: false, message: 'Player not found' };
    }

    if (!player.isAlive) {
      return { success: false, message: 'Dead players cannot move' };
    }

    if (this.state.phase !== 'playing') {
      return { success: false, message: 'Can only move during playing phase' };
    }

    const targetRoomObj = this.state.ship.rooms.get(targetRoom);
    if (!targetRoomObj) {
      return { success: false, message: 'Invalid room' };
    }

    // Check adjacency
    if (!areRoomsAdjacent(this.state.ship, player.location, targetRoom)) {
      return { success: false, message: 'Room is not adjacent' };
    }

    const previousLocation = player.location;
    player.location = targetRoom;
    player.lastActionTime = Date.now();

    this.emitEvent({
      type: 'player-moved',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        playerId: agentId,
        from: previousLocation,
        to: targetRoom
      },
      visibility: 'all'
    });

    return { success: true, message: `Moved to ${targetRoomObj.name}` };
  }

  // ============================================================================
  // Actions - Crewmate
  // ============================================================================

  completeTaskStep(agentId: string, taskId: string, input: string): { success: boolean; message: string; completed?: boolean } {
    const player = this.state.players.get(agentId);
    if (!player) {
      return { success: false, message: 'Player not found' };
    }

    if (!player.isAlive) {
      return { success: false, message: 'Dead players cannot complete tasks' };
    }

    if (player.role !== 'crewmate') {
      return { success: false, message: 'Only crewmates can complete tasks' };
    }

    if (!player.taskIds.includes(taskId)) {
      return { success: false, message: 'This is not your assigned task' };
    }

    if (player.completedTaskIds.includes(taskId)) {
      return { success: false, message: 'Task already completed' };
    }

    const task = this.state.tasks.get(taskId);
    if (!task) {
      return { success: false, message: 'Task not found' };
    }

    // Check if task can be completed (room + prerequisites)
    const canComplete = canCompleteTask(task, player.location, player.completedTaskIds);
    if (!canComplete.canComplete) {
      return { success: false, message: canComplete.reason || 'Cannot complete task' };
    }

    // Get current step for this task
    const currentStep = player.taskSteps.get(taskId) || 0;

    // Validate task step
    const validation = validateTaskCompletion(task, input, currentStep);
    if (!validation.success) {
      return { success: false, message: validation.message };
    }

    // Update step progress
    if (validation.completed) {
      // Task fully completed
      player.completedTaskIds.push(taskId);
      task.completedBy.add(agentId);
      player.taskSteps.delete(taskId);
      player.lastActionTime = Date.now();

      this.emitEvent({
        type: 'task-completed',
        gameId: this.state.id,
        timestamp: Date.now(),
        data: {
          playerId: agentId,
          taskId,
          taskDescription: task.description
        },
        visibility: 'all'
      });

      // Check if all tasks are done
      this.checkWinConditions();

      return {
        success: true,
        completed: true,
        message: `✅ Completed: ${task.description}`
      };
    } else {
      // Multi-step task - save progress
      player.taskSteps.set(taskId, validation.nextStep);
      player.lastActionTime = Date.now();

      return {
        success: true,
        completed: false,
        message: validation.message
      };
    }
  }

  // ============================================================================
  // Actions - Imposter
  // ============================================================================

  useVent(agentId: string, action: 'enter' | 'exit', targetRoom?: string): { success: boolean; message: string } {
    const player = this.state.players.get(agentId);
    if (!player) {
      return { success: false, message: 'Player not found' };
    }

    if (player.role !== 'imposter') {
      return { success: false, message: 'Only imposters can use vents' };
    }

    if (!player.isAlive) {
      return { success: false, message: 'Dead players cannot use vents' };
    }

    if (this.state.phase !== 'playing') {
      return { success: false, message: 'Can only use vents during playing phase' };
    }

    const currentRoom = this.state.ship.rooms.get(player.location);
    if (!currentRoom?.hasVent) {
      return { success: false, message: 'No vent in current room' };
    }

    if (action === 'exit') {
      return { success: true, message: 'Exited vent' };
    }

    if (!targetRoom) {
      return { success: false, message: 'Target room required for vent travel' };
    }

    const ventConnections = this.state.ship.vents.get(player.location);
    if (!ventConnections || !ventConnections.includes(targetRoom)) {
      return { success: false, message: 'Cannot vent to that room from here' };
    }

    player.location = targetRoom;
    player.lastActionTime = Date.now();

    this.emitEvent({
      type: 'vent-used',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: { playerId: agentId, from: currentRoom.id, to: targetRoom },
      visibility: 'imposters'
    });

    return { success: true, message: `Vented to ${targetRoom}` };
  }

  sabotageSystem(agentId: string, system: 'oxygen' | 'reactor' | 'lights' | 'comms'): { success: boolean; message: string } {
    const player = this.state.players.get(agentId);
    if (!player) {
      return { success: false, message: 'Player not found' };
    }

    if (player.role !== 'imposter') {
      return { success: false, message: 'Only imposters can sabotage' };
    }

    if (!player.isAlive) {
      return { success: false, message: 'Dead players cannot sabotage' };
    }

    if (this.state.phase !== 'playing') {
      return { success: false, message: 'Can only sabotage during playing phase' };
    }

    player.lastActionTime = Date.now();

    this.emitEvent({
      type: 'sabotage-triggered',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        playerId: agentId,
        system,
        urgent: system === 'oxygen' || system === 'reactor'
      },
      visibility: 'all'
    });

    return { success: true, message: `🚨 Sabotaged ${system}!` };
  }

  killPlayer(killerId: string, targetId: string): { success: boolean; message: string} {
    const killer = this.state.players.get(killerId);
    const target = this.state.players.get(targetId);

    if (!killer || !target) {
      return { success: false, message: 'Player not found' };
    }

    if (killer.role !== 'imposter') {
      return { success: false, message: 'Only imposters can kill' };
    }

    if (!killer.isAlive) {
      return { success: false, message: 'Dead players cannot kill' };
    }

    if (!target.isAlive) {
      return { success: false, message: 'Target is already dead' };
    }

    if (target.role === 'imposter') {
      return { success: false, message: 'Cannot kill fellow imposter' };
    }

    if (killer.location !== target.location) {
      return { success: false, message: 'Target is not in the same room' };
    }

    // Check kill cooldown
    const now = Date.now();
    if (killer.lastKillTime && now - killer.lastKillTime < this.config.killCooldown) {
      const remaining = Math.ceil((this.config.killCooldown - (now - killer.lastKillTime)) / 1000);
      return { success: false, message: `Kill on cooldown (${remaining}s remaining)` };
    }

    // Execute kill
    target.isAlive = false;
    killer.lastKillTime = now;
    killer.lastActionTime = now;
    this.state.deadPlayers.add(targetId);

    this.emitEvent({
      type: 'player-killed',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        victimId: targetId,
        location: killer.location
      },
      visibility: 'all'
    });

    // Check win conditions
    this.checkWinConditions();

    return { success: true, message: `Killed ${target.name}` };
  }

  // ============================================================================
  // Meeting & Voting
  // ============================================================================

  callEmergencyMeeting(callerId: string, bodyId?: string): { success: boolean; message: string } {
    const caller = this.state.players.get(callerId);
    if (!caller) {
      return { success: false, message: 'Player not found' };
    }

    if (!caller.isAlive) {
      return { success: false, message: 'Dead players cannot call meetings' };
    }

    if (this.state.phase !== 'playing') {
      return { success: false, message: 'Can only call meetings during playing phase' };
    }

    // Check emergency meeting limit (only for emergency meetings, not body reports)
    if (!bodyId) {
      if (caller.emergencyMeetingsUsed >= this.config.emergencyMeetings) {
        return { success: false, message: 'No emergency meetings remaining' };
      }
    }

    // Validate body report
    if (bodyId) {
      const body = this.state.players.get(bodyId);
      if (!body) {
        return { success: false, message: 'Body not found' };
      }
      if (body.isAlive) {
        return { success: false, message: 'Player is still alive' };
      }
      if (body.location !== caller.location) {
        return { success: false, message: 'Body not in this room' };
      }
    }

    this.state.phase = 'discussion';
    this.state.discussionStartTime = Date.now();
    this.state.meetingCaller = callerId;
    
    // Increment emergency meetings counter (not for body reports)
    if (!bodyId) {
      caller.emergencyMeetingsUsed++;
    }
    
    if (bodyId) {
      this.state.reportedBody = bodyId;
    }

    const eventType = bodyId ? 'body-reported' : 'emergency-meeting';

    this.emitEvent({
      type: eventType,
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        callerId,
        ...(bodyId && { bodyId }),
        discussionTime: this.config.discussionTime
      },
      visibility: 'all'
    });

    // Auto-transition to voting after discussion time
    const timer = setTimeout(() => {
      if (this.state.phase === 'discussion') {
        this.startVoting();
      }
    }, this.config.discussionTime);
    this.timers.push(timer);

    return { success: true, message: bodyId ? 'Body reported!' : 'Emergency meeting called!' };
  }

  private startVoting(): void {
    this.state.phase = 'voting';
    this.state.votingStartTime = Date.now();
    this.state.votes.clear();

    this.emitEvent({
      type: 'voting-started',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        votingTime: this.config.votingTime
      },
      visibility: 'all'
    });

    // Auto-end voting after voting time
    const timer = setTimeout(() => {
      if (this.state.phase === 'voting') {
        this.endVoting();
      }
    }, this.config.votingTime);
    this.timers.push(timer);
  }

  castVote(voterId: string, targetId: string): { success: boolean; message: string } {
    const voter = this.state.players.get(voterId);
    if (!voter) {
      return { success: false, message: 'Player not found' };
    }

    if (!voter.isAlive) {
      return { success: false, message: 'Dead players cannot vote' };
    }

    if (this.state.phase !== 'voting') {
      return { success: false, message: 'Not in voting phase' };
    }

    if (this.state.votes.has(voterId)) {
      return { success: false, message: 'Already voted' };
    }

    // Validate target (can be 'skip' or valid alive player ID)
    if (targetId !== 'skip') {
      const targetPlayer = this.state.players.get(targetId);
      if (!targetPlayer) {
        return { success: false, message: 'Invalid vote target' };
      }
      if (!targetPlayer.isAlive) {
        return { success: false, message: 'Cannot vote for dead player' };
      }
    }

    this.state.votes.set(voterId, targetId);

    const alivePlayers = Array.from(this.state.players.values()).filter((p) => p.isAlive).length;

    this.emitEvent({
      type: 'vote-cast',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        voterId,
        voteCount: this.state.votes.size,
        totalVoters: alivePlayers
      },
      visibility: 'all'
    });

    // End voting early if all alive players have voted
    if (this.state.votes.size >= alivePlayers) {
      this.endVoting();
    }

    return { success: true, message: 'Vote cast' };
  }

  private endVoting(): void {
    // Count all votes (including skip)
    const voteCounts = new Map<string, number>();
    voteCounts.set('skip', 0); // Initialize skip

    for (const targetId of this.state.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }

    // Find option(s) with most votes
    let maxVotes = 0;
    const winners: string[] = [];

    for (const [targetId, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        winners.length = 0; // Clear previous winners
        winners.push(targetId);
      } else if (count === maxVotes && count > 0) {
        winners.push(targetId);
      }
    }

    // Eject only if single winner that isn't skip
    const ejectedId = (winners.length === 1 && winners[0] !== 'skip') ? winners[0] : null;

    // Eject player if decided
    let ejectedPlayer: Player | undefined;
    if (ejectedId) {
      ejectedPlayer = this.state.players.get(ejectedId);
      if (ejectedPlayer) {
        ejectedPlayer.isAlive = false;
        this.state.deadPlayers.add(ejectedId);
      }
    }

    this.emitEvent({
      type: 'player-ejected',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        playerId: ejectedId || 'none',
        wasImposter: ejectedPlayer?.role === 'imposter',
        votesReceived: maxVotes,
        skipped: !ejectedId
      },
      visibility: 'all'
    });

    // Check win conditions
    const winner = this.checkWinConditions();
    
    if (!winner) {
      // Resume game
      this.state.phase = 'playing';
      this.state.meetingCaller = undefined;
      this.state.reportedBody = undefined;
    }
  }

  // ============================================================================
  // Win Conditions
  // ============================================================================

  private checkWinConditions(): WinnerType | null {
    const alivePlayers = Array.from(this.state.players.values()).filter((p) => p.isAlive);
    const aliveCrewmates = alivePlayers.filter((p) => p.role === 'crewmate').length;
    const aliveImposters = alivePlayers.filter((p) => p.role === 'imposter').length;

    // Imposters win if equal or more than crewmates
    if (aliveImposters >= aliveCrewmates && aliveImposters > 0) {
      this.endGame('imposters');
      return 'imposters';
    }

    // Crewmates win if no imposters left
    if (aliveImposters === 0) {
      this.endGame('crewmates');
      return 'crewmates';
    }

    // Check task completion (crewmates win)
    const taskProgress = getAllTaskProgress(this.state.tasks);
    if (taskProgress.percentage >= 100) {
      this.endGame('crewmates');
      return 'crewmates';
    }

    return null;
  }

  private endGame(winner: WinnerType): void {
    this.clearTimers();
    this.state.phase = 'ended';
    this.state.winner = winner;
    this.state.endedAt = Date.now();

    const duration = Math.round((this.state.endedAt - this.state.createdAt) / 1000);

    this.emitEvent({
      type: 'game-ended',
      gameId: this.state.id,
      timestamp: Date.now(),
      data: {
        winner,
        duration,
        imposters: Array.from(this.state.imposterIds),
        survivors: Array.from(this.state.players.values())
          .filter((p) => p.isAlive)
          .map((p) => p.agentId)
      },
      visibility: 'all'
    });
  }

  // ============================================================================
  // Event System
  // ============================================================================

  onEvent(callback: (event: GameEvent) => void): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index > -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  private emitEvent(event: GameEvent): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getPlayersInRoom(roomId: string): Player[] {
    return Array.from(this.state.players.values()).filter((p) => p.location === roomId && p.isAlive);
  }

  getPlayerState(agentId: string): {
    role?: PlayerRole;
    location: string;
    isAlive: boolean;
    canKill: boolean;
    killCooldown?: number;
    tasksRemaining?: number;
    nearbyPlayers: string[];
  } | null {
    const player = this.state.players.get(agentId);
    if (!player) return null;

    const nearbyPlayers = this.getPlayersInRoom(player.location)
      .filter((p) => p.agentId !== agentId)
      .map((p) => p.name);

    const result: ReturnType<typeof this.getPlayerState> = {
      role: player.role,
      location: player.location,
      isAlive: player.isAlive,
      canKill: false,
      nearbyPlayers
    };

    if (player.role === 'imposter') {
      const now = Date.now();
      const canKill = !player.lastKillTime || now - player.lastKillTime >= this.config.killCooldown;
      result.canKill = canKill && nearbyPlayers.length > 0;
      
      if (!canKill && player.lastKillTime) {
        result.killCooldown = Math.ceil((this.config.killCooldown - (now - player.lastKillTime)) / 1000);
      }
    }

    if (player.role === 'crewmate') {
      result.tasksRemaining = player.taskIds.length - player.completedTaskIds.length;
    }

    return result;
  }

  reset(): void {
    this.clearTimers();
    this.state = this.createInitialState();
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers = [];
  }

  private shuffleArray<T>(array: T[]): T[] {
    // Fisher-Yates shuffle for uniform random distribution
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // ============================================================================
  // Agent Context Helpers
  // ============================================================================

  getAvailableActions(agentId: string): {
    canMove: string[];
    canDoTasks: Array<{ taskId: string; description: string; currentStep: number; totalSteps: number }>;
    canKill: boolean;
    killTargets: string[];
    canVent: boolean;
    ventTargets: string[];
    canCallMeeting: boolean;
    canReportBody: boolean;
    deadBodies: string[];
    canVote: boolean;
  } {
    const player = this.state.players.get(agentId);
    if (!player) {
      return {
        canMove: [],
        canDoTasks: [],
        canKill: false,
        killTargets: [],
        canVent: false,
        ventTargets: [],
        canCallMeeting: false,
        canReportBody: false,
        deadBodies: [],
        canVote: false
      };
    }

    const currentRoom = this.state.ship.rooms.get(player.location);
    const result = {
      canMove: currentRoom?.connectedRooms || [],
      canDoTasks: [] as Array<{ taskId: string; description: string; currentStep: number; totalSteps: number }>,
      canKill: false,
      killTargets: [] as string[],
      canVent: false,
      ventTargets: [] as string[],
      canCallMeeting: this.state.phase === 'playing' && player.isAlive,
      canReportBody: false,
      deadBodies: [] as string[],
      canVote: this.state.phase === 'voting' && player.isAlive && !this.state.votes.has(agentId)
    };

    // Tasks for crewmates
    if (player.role === 'crewmate' && player.isAlive && this.state.phase === 'playing') {
      for (const taskId of player.taskIds) {
        if (!player.completedTaskIds.includes(taskId)) {
          const task = this.state.tasks.get(taskId);
          if (task && task.room === player.location) {
            const currentStep = player.taskSteps.get(taskId) || 0;
            result.canDoTasks.push({
              taskId,
              description: task.description,
              currentStep,
              totalSteps: task.steps.length
            });
          }
        }
      }
    }

    // Kill actions for imposters
    if (player.role === 'imposter' && player.isAlive && this.state.phase === 'playing') {
      const now = Date.now();
      const canKillNow = !player.lastKillTime || now - player.lastKillTime >= this.config.killCooldown;
      
      if (canKillNow) {
        const playersInRoom = this.getPlayersInRoom(player.location);
        result.killTargets = playersInRoom
          .filter((p) => p.agentId !== agentId && p.isAlive)
          .map((p) => p.agentId);
        result.canKill = result.killTargets.length > 0;
      }

      // Vent actions
      if (currentRoom?.hasVent) {
        const ventConnections = this.state.ship.vents.get(player.location);
        result.canVent = true;
        result.ventTargets = ventConnections || [];
      }
    }

    // Dead bodies in current room
    if (player.isAlive && this.state.phase === 'playing') {
      const playersInRoom = Array.from(this.state.players.values()).filter(
        (p) => p.location === player.location && !p.isAlive
      );
      result.deadBodies = playersInRoom.map((p) => p.agentId);
      result.canReportBody = result.deadBodies.length > 0;
    }

    return result;
  }

  getTasksInRoom(roomId: string): Array<{ taskId: string; description: string; type: string }> {
    const tasks: Array<{ taskId: string; description: string; type: string }> = [];
    
    for (const [taskId, task] of this.state.tasks) {
      if (task.room === roomId) {
        tasks.push({
          taskId,
          description: task.description,
          type: task.type
        });
      }
    }
    
    return tasks;
  }

  getRoomInfo(roomId: string): {
    name: string;
    description: string;
    connectedRooms: Array<{ id: string; name: string }>;
    hasVent: boolean;
    ventConnections: string[];
    tasksAvailable: number;
    playersPresent: Array<{ agentId: string; name: string; isAlive: boolean }>;
  } | null {
    const room = this.state.ship.rooms.get(roomId);
    if (!room) return null;

    const playersPresent = Array.from(this.state.players.values())
      .filter((p) => p.location === roomId)
      .map((p) => ({
        agentId: p.agentId,
        name: p.name,
        isAlive: p.isAlive
      }));

    const connectedRooms = room.connectedRooms.map((id) => {
      const connectedRoom = this.state.ship.rooms.get(id);
      return {
        id,
        name: connectedRoom?.name || id
      };
    });

    return {
      name: room.name,
      description: room.description,
      connectedRooms,
      hasVent: room.hasVent,
      ventConnections: this.state.ship.vents.get(roomId) || [],
      tasksAvailable: room.taskIds.length,
      playersPresent
    };
  }

  getGameContext(agentId: string): string {
    const player = this.state.players.get(agentId);
    if (!player) return 'Player not found';

    const actions = this.getAvailableActions(agentId);
    const roomInfo = this.getRoomInfo(player.location);
    
    let context = `=== GAME STATE ===\n`;
    context += `Phase: ${this.state.phase}\n`;
    context += `Your Role: ${player.role}\n`;
    context += `Location: ${roomInfo?.name || player.location}\n`;
    context += `Alive: ${player.isAlive ? 'Yes' : 'No'}\n\n`;

    if (roomInfo) {
      context += `=== CURRENT ROOM ===\n`;
      context += `${roomInfo.description}\n`;
      context += `Players here: ${roomInfo.playersPresent.map((p) => `${p.name}${p.isAlive ? '' : ' (dead)'}`).join(', ') || 'none'}\n`;
      context += `Connected rooms: ${roomInfo.connectedRooms.map((r) => r.name).join(', ')}\n\n`;
    }

    context += `=== AVAILABLE ACTIONS ===\n`;
    
    if (actions.canMove.length > 0) {
      context += `• Move to: ${actions.canMove.map((id) => this.state.ship.rooms.get(id)?.name || id).join(', ')}\n`;
    }

    if (actions.canDoTasks.length > 0) {
      context += `• Tasks available:\n`;
      for (const task of actions.canDoTasks) {
        context += `  - ${task.description} (step ${task.currentStep + 1}/${task.totalSteps})\n`;
      }
    }

    if (actions.canKill) {
      context += `• Kill available (${actions.killTargets.length} targets)\n`;
    }

    if (actions.canVent) {
      context += `• Vent available (${actions.ventTargets.length} connections)\n`;
    }

    if (actions.canCallMeeting) {
      context += `• Can call emergency meeting\n`;
    }

    if (actions.canReportBody) {
      context += `• Can report body (${actions.deadBodies.length} bodies here)\n`;
    }

    if (actions.canVote) {
      context += `• Can vote\n`;
    }

    if (player.role === 'crewmate') {
      const tasksRemaining = player.taskIds.length - player.completedTaskIds.length;
      context += `\nTasks: ${player.completedTaskIds.length}/${player.taskIds.length} completed (${tasksRemaining} remaining)\n`;
    }

    return context;
  }
}

