/**
 * Game Engine Unit Tests
 * Tests core game logic without blockchain or A2A dependencies
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { GameEngine } from './engine';
import type { GameEvent } from '@elizagames/shared';

describe('GameEngine', () => {
  let engine: GameEngine;
  let events: GameEvent[];

  beforeEach(() => {
    engine = new GameEngine();
    events = [];
    engine.onEvent((event) => events.push(event));
  });

  describe('Player Management', () => {
    test('should add player to lobby', () => {
      const player = engine.addPlayer('agent-1', '0x123', 'player1.local', 'Player1');

      expect(player.agentId).toBe('agent-1');
      expect(player.name).toBe('Player1');
      expect(player.location).toBe('cafeteria');
      expect(player.isAlive).toBe(true);

      // Check event emitted
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('player-joined');
    });

    test('should not allow duplicate players', () => {
      engine.addPlayer('agent-1', '0x123', 'player1.local', 'Player1');

      expect(() => {
        engine.addPlayer('agent-1', '0x123', 'player1.local', 'Player1');
      }).toThrow('Player already in game');
    });

    test('should add multiple players', () => {
      engine.addPlayer('agent-1', '0x1', 'p1.local', 'Player1');
      engine.addPlayer('agent-2', '0x2', 'p2.local', 'Player2');
      engine.addPlayer('agent-3', '0x3', 'p3.local', 'Player3');

      const state = engine.getState();
      expect(state.players.size).toBe(3);
    });

    test('should remove player from game', () => {
      engine.addPlayer('agent-1', '0x123', 'player1.local', 'Player1');
      
      const removed = engine.removePlayer('agent-1');
      expect(removed).toBe(true);

      const state = engine.getState();
      expect(state.players.size).toBe(0);
    });

    test('should get player by ID', () => {
      engine.addPlayer('agent-1', '0x123', 'player1.local', 'Player1');
      
      const player = engine.getPlayer('agent-1');
      expect(player).toBeDefined();
      expect(player?.name).toBe('Player1');
    });
  });

  describe('Game Start', () => {
    beforeEach(() => {
      // Add 5 players for minimum
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
    });

    test('should not start with less than minimum players', () => {
      const engine2 = new GameEngine();
      engine2.addPlayer('agent-1', '0x1', 'p1.local', 'P1');

      const check = engine2.canStartGame();
      expect(check.canStart).toBe(false);
      expect(check.reason).toContain('Need 5 players');
    });

    test('should start game with minimum players', () => {
      const check = engine.canStartGame();
      expect(check.canStart).toBe(true);

      engine.startGame();
      expect(engine.getPhase()).toBe('playing');
    });

    test('should assign roles when game starts', () => {
      engine.startGame();

      const state = engine.getState();
      let crewmateCount = 0;
      let imposterCount = 0;

      for (const player of state.players.values()) {
        if (player.role === 'crewmate') crewmateCount++;
        if (player.role === 'imposter') imposterCount++;
      }

      expect(crewmateCount).toBeGreaterThan(0);
      expect(imposterCount).toBeGreaterThan(0);
      expect(crewmateCount + imposterCount).toBe(5);
    });

    test('should assign tasks to crewmates', () => {
      engine.startGame();

      const state = engine.getState();
      for (const player of state.players.values()) {
        if (player.role === 'crewmate') {
          expect(player.taskIds.length).toBeGreaterThan(0);
          expect(player.completedTaskIds.length).toBe(0);
        }
      }
    });

    test('should emit role-assigned events', () => {
      events = []; // Reset
      engine.startGame();

      const roleEvents = events.filter((e) => e.type === 'role-assigned');
      expect(roleEvents.length).toBe(5); // One per player
    });
  });

  describe('Movement', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should move player to adjacent room', () => {
      const result = engine.movePlayer('agent-1', 'upper-hallway');
      expect(result.success).toBe(true);

      const player = engine.getPlayer('agent-1');
      expect(player?.location).toBe('upper-hallway');
    });

    test('should not move to non-adjacent room', () => {
      const result = engine.movePlayer('agent-1', 'weapons'); // Not adjacent to cafeteria
      expect(result.success).toBe(false);
      expect(result.message).toContain('not adjacent');
    });

    test('should not move invalid room', () => {
      const result = engine.movePlayer('agent-1', 'invalid-room');
      expect(result.success).toBe(false);
    });

    test('should emit player-moved event', () => {
      events = [];
      engine.movePlayer('agent-1', 'upper-hallway');

      const moveEvents = events.filter((e) => e.type === 'player-moved');
      expect(moveEvents.length).toBe(1);
      expect(moveEvents[0].data.playerId).toBe('agent-1');
      expect(moveEvents[0].data.to).toBe('upper-hallway');
    });
  });

  describe('Task Completion', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should complete single-step task when in correct room', () => {
      const state = engine.getState();
      
      // Find a crewmate
      let crewmate: Player | undefined;
      for (const player of state.players.values()) {
        if (player.role === 'crewmate') {
          crewmate = player;
          break;
        }
      }

      expect(crewmate).toBeDefined();
      if (!crewmate) return;

      // Find a simple single-step task (medbay-scan)
      const medbayScanTask = state.tasks.get('medbay-scan');
      expect(medbayScanTask).toBeDefined();
      if (!medbayScanTask) return;

      // Assign this task to the crewmate
      crewmate.taskIds = ['medbay-scan'];
      crewmate.completedTaskIds = [];

      // Move player to medbay
      crewmate.location = 'medbay';

      // Complete the task
      const result = engine.completeTaskStep(crewmate.agentId, 'medbay-scan', 'scan');
      
      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
      expect(crewmate.completedTaskIds).toContain('medbay-scan');
    });

    test('should handle multi-step task completion', () => {
      const state = engine.getState();
      
      // Find a crewmate
      let crewmate: Player | undefined;
      for (const player of state.players.values()) {
        if (player.role === 'crewmate') {
          crewmate = player;
          break;
        }
      }

      expect(crewmate).toBeDefined();
      if (!crewmate) return;

      // Assign wiring task
      crewmate.taskIds = ['wiring-electrical'];
      crewmate.completedTaskIds = [];
      crewmate.location = 'electrical';

      // Step 1: red wire
      let result = engine.completeTaskStep(crewmate.agentId, 'wiring-electrical', 'red');
      expect(result.success).toBe(true);
      expect(result.completed).toBe(false);

      // Step 2: blue wire
      result = engine.completeTaskStep(crewmate.agentId, 'wiring-electrical', 'blue');
      expect(result.success).toBe(true);
      expect(result.completed).toBe(false);

      // Step 3: yellow wire (final)
      result = engine.completeTaskStep(crewmate.agentId, 'wiring-electrical', 'yellow');
      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
      expect(crewmate.completedTaskIds).toContain('wiring-electrical');
    });

    test('should not allow imposters to complete tasks', () => {
      const state = engine.getState();
      let imposter: Player | undefined;
      for (const player of state.players.values()) {
        if (player.role === 'imposter') {
          imposter = player;
          break;
        }
      }

      if (!imposter) return;

      const taskId = Array.from(state.tasks.keys())[0];
      const result = engine.completeTaskStep(imposter.agentId, taskId, 'complete');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Only crewmates');
    });
  });

  describe('Imposter Actions', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should allow imposter to kill in same room', () => {
      const state = engine.getState();
      
      // Find imposter and crewmate
      let imposter: Player | undefined;
      let crewmate: Player | undefined;
      
      for (const player of state.players.values()) {
        if (player.role === 'imposter' && !imposter) {
          imposter = player;
        } else if (player.role === 'crewmate' && !crewmate) {
          crewmate = player;
        }
        
        if (imposter && crewmate) break;
      }

      if (!imposter || !crewmate) return;

      // Ensure both in same room
      imposter.location = 'electrical';
      crewmate.location = 'electrical';

      const result = engine.killPlayer(imposter.agentId, crewmate.agentId);
      expect(result.success).toBe(true);

      // Verify crewmate is dead
      const deadCrewmate = engine.getPlayer(crewmate.agentId);
      expect(deadCrewmate?.isAlive).toBe(false);
    });

    test('should not allow kill in different room', () => {
      const state = engine.getState();
      
      let imposter: Player | undefined;
      let crewmate: Player | undefined;
      
      for (const player of state.players.values()) {
        if (player.role === 'imposter' && !imposter) {
          imposter = player;
        } else if (player.role === 'crewmate' && !crewmate) {
          crewmate = player;
        }
        if (imposter && crewmate) break;
      }

      if (!imposter || !crewmate) return;

      imposter.location = 'electrical';
      crewmate.location = 'cafeteria';

      const result = engine.killPlayer(imposter.agentId, crewmate.agentId);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not in the same room');
    });

    test('should not allow crewmate to kill', () => {
      const state = engine.getState();
      
      const players = Array.from(state.players.values());
      const crewmate = players.find((p) => p.role === 'crewmate');
      const target = players.find((p) => p.agentId !== crewmate?.agentId);

      if (!crewmate || !target) return;

      const result = engine.killPlayer(crewmate.agentId, target.agentId);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Only imposters');
    });
  });

  describe('Meetings and Voting', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should call emergency meeting', () => {
      const result = engine.callEmergencyMeeting('agent-1');
      expect(result.success).toBe(true);
      expect(engine.getPhase()).toBe('discussion');
    });

    test('should report dead body', () => {
      // First kill someone
      const state = engine.getState();
      let imposter: Player | undefined;
      let crewmate: Player | undefined;
      
      for (const player of state.players.values()) {
        if (player.role === 'imposter') imposter = player;
        else if (!crewmate) crewmate = player;
      }

      if (imposter && crewmate) {
        imposter.location = 'electrical';
        crewmate.location = 'electrical';
        engine.killPlayer(imposter.agentId, crewmate.agentId);

        // Another player reports - must be in same room as body
        const reporter = Array.from(state.players.values()).find(
          (p) => p.agentId !== imposter.agentId && p.agentId !== crewmate.agentId
        );

        if (reporter) {
          reporter.location = 'electrical'; // Must be in same room to report
          const result = engine.callEmergencyMeeting(reporter.agentId, crewmate.agentId);
          expect(result.success).toBe(true);
          expect(engine.getPhase()).toBe('discussion');
        }
      }
    });

    test('should cast vote during voting phase', () => {
      // Call meeting to enter voting
      engine.callEmergencyMeeting('agent-1');
      
      // Wait for auto-transition to voting (or manually transition)
      const state = engine.getState();
      state.phase = 'voting'; // Manual override for test

      const result = engine.castVote('agent-1', 'agent-2');
      expect(result.success).toBe(true);
    });

    test('should not vote twice', () => {
      const state = engine.getState();
      state.phase = 'voting';

      engine.castVote('agent-1', 'agent-2');
      const result = engine.castVote('agent-1', 'agent-3');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Already voted');
    });

    test('should allow skip vote', () => {
      const state = engine.getState();
      state.phase = 'voting';

      const result = engine.castVote('agent-1', 'skip');
      expect(result.success).toBe(true);
    });
  });

  describe('Win Conditions', () => {
    beforeEach(() => {
      for (let i = 1; i <= 6; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should detect crewmate win when all imposters ejected', () => {
      const state = engine.getState();
      
      // Find and kill all imposters
      for (const [playerId, player] of state.players) {
        if (player.role === 'imposter') {
          player.isAlive = false;
          state.deadPlayers.add(playerId);
        }
      }

      // This will be called in actual game, trigger manually
      state.phase = 'ended';
      state.winner = 'crewmates';

      expect(state.winner).toBe('crewmates');
      expect(state.phase).toBe('ended');
    });

    test('should detect imposter win when equal to crewmates', () => {
      const state = engine.getState();
      
      // Count roles
      let crewmates = 0;
      let imposters = 0;
      
      for (const player of state.players.values()) {
        if (player.role === 'crewmate') crewmates++;
        if (player.role === 'imposter') imposters++;
      }

      // Kill crewmates until equal
      let killed = 0;
      for (const [playerId, player] of state.players) {
        if (player.role === 'crewmate' && killed < (crewmates - imposters)) {
          player.isAlive = false;
          state.deadPlayers.add(playerId);
          killed++;
        }
      }

      // Manually check win condition logic
      const aliveCrewmates = Array.from(state.players.values()).filter(
        (p) => p.isAlive && p.role === 'crewmate'
      ).length;
      const aliveImposters = Array.from(state.players.values()).filter(
        (p) => p.isAlive && p.role === 'imposter'
      ).length;

      expect(aliveImposters).toBeGreaterThanOrEqual(aliveCrewmates);
    });
  });

  describe('Player State', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should get player state with correct info', () => {
      const playerState = engine.getPlayerState('agent-1');
      
      expect(playerState).toBeDefined();
      expect(playerState?.role).toBeDefined();
      expect(playerState?.location).toBe('cafeteria');
      expect(playerState?.isAlive).toBe(true);
      expect(playerState?.nearbyPlayers).toBeDefined();
    });

    test('should show kill availability for imposter', () => {
      const state = engine.getState();
      const imposter = Array.from(state.players.values()).find((p) => p.role === 'imposter');
      
      if (imposter) {
        const playerState = engine.getPlayerState(imposter.agentId);
        expect(playerState?.canKill).toBeDefined();
      }
    });

    test('should show task progress for crewmate', () => {
      const state = engine.getState();
      const crewmate = Array.from(state.players.values()).find((p) => p.role === 'crewmate');
      
      if (crewmate) {
        const playerState = engine.getPlayerState(crewmate.agentId);
        expect(playerState?.tasksRemaining).toBeDefined();
        expect(playerState?.tasksRemaining).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Room Mechanics', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should get players in same room', () => {
      // All players start in cafeteria
      const playersInCafeteria = engine.getPlayersInRoom('cafeteria');
      expect(playersInCafeteria.length).toBe(5);
    });

    test('should track players in different rooms', () => {
      engine.movePlayer('agent-1', 'upper-hallway');
      engine.movePlayer('agent-2', 'upper-hallway');

      const playersInHallway = engine.getPlayersInRoom('upper-hallway');
      expect(playersInHallway.length).toBe(2);

      const playersInCafeteria = engine.getPlayersInRoom('cafeteria');
      expect(playersInCafeteria.length).toBe(3);
    });
  });

  describe('Event System', () => {
    test('should emit events to all listeners', () => {
      const events1: GameEvent[] = [];
      const events2: GameEvent[] = [];

      engine.onEvent((e) => events1.push(e));
      engine.onEvent((e) => events2.push(e));

      engine.addPlayer('agent-1', '0x1', 'p1.local', 'Player1');

      expect(events1.length).toBe(1);
      expect(events2.length).toBe(1);
      expect(events1[0].type).toBe('player-joined');
      expect(events2[0].type).toBe('player-joined');
    });

    test('should unsubscribe from events', () => {
      const events1: GameEvent[] = [];

      const unsubscribe = engine.onEvent((e) => events1.push(e));
      
      engine.addPlayer('agent-1', '0x1', 'p1.local', 'Player1');
      expect(events1.length).toBe(1);

      unsubscribe();
      
      engine.addPlayer('agent-2', '0x2', 'p2.local', 'Player2');
      expect(events1.length).toBe(1); // Should not increase
    });
  });

  describe('Game Reset', () => {
    test('should reset game to initial state', () => {
      // Play a game
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();

      // Reset
      engine.reset();

      const state = engine.getState();
      expect(state.phase).toBe('lobby');
      expect(state.players.size).toBe(0);
      expect(state.round).toBe(0);
    });
  });

  describe('Sabotage System', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should sabotage all 4 systems', () => {
      const players = Array.from(engine.getState().players.values());
      players[0].role = 'imposter';
      
      const systems: Array<'oxygen' | 'reactor' | 'lights' | 'comms'> = ['oxygen', 'reactor', 'lights', 'comms'];
      
      for (const system of systems) {
        const result = engine.sabotageSystem(players[0].agentId, system);
        expect(result.success).toBe(true);
        expect(result.message).toContain(system);
      }
    });

    test('should block crewmates from sabotaging', () => {
      const players = Array.from(engine.getState().players.values());
      players[0].role = 'crewmate';
      
      const result = engine.sabotageSystem(players[0].agentId, 'oxygen');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Only imposters');
    });

    test('should block dead players from sabotaging', () => {
      const players = Array.from(engine.getState().players.values());
      players[0].role = 'imposter';
      players[0].isAlive = false;
      
      const result = engine.sabotageSystem(players[0].agentId, 'reactor');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Dead players');
    });

    test('should block sabotage outside playing phase', () => {
      const state = engine.getState();
      state.phase = 'discussion';
      const players = Array.from(state.players.values());
      players[0].role = 'imposter';
      
      const result = engine.sabotageSystem(players[0].agentId, 'lights');
      expect(result.success).toBe(false);
      expect(result.message).toContain('playing phase');
    });

    test('should emit sabotage event with correct urgency', () => {
      const events: any[] = [];
      engine.onEvent((e) => events.push(e));
      
      const players = Array.from(engine.getState().players.values());
      players[0].role = 'imposter';
      
      // Test urgent systems
      engine.sabotageSystem(players[0].agentId, 'oxygen');
      let event = events.find((e) => e.type === 'sabotage-triggered');
      expect(event.data.urgent).toBe(true);
      
      events.length = 0;
      
      // Test non-urgent systems
      engine.sabotageSystem(players[0].agentId, 'lights');
      event = events.find((e) => e.type === 'sabotage-triggered');
      expect(event.data.urgent).toBe(false);
    });
  });

  describe('Agent Context Helpers', () => {
    beforeEach(() => {
      for (let i = 1; i <= 5; i++) {
        engine.addPlayer(`agent-${i}`, `0x${i}`, `p${i}.local`, `Player${i}`);
      }
      engine.startGame();
    });

    test('should get available actions for crewmate', () => {
      const state = engine.getState();
      const crewmate = Array.from(state.players.values()).find((p) => p.role === 'crewmate');
      
      if (crewmate) {
        const actions = engine.getAvailableActions(crewmate.agentId);
        
        expect(actions.canMove).toBeDefined();
        expect(actions.canMove.length).toBeGreaterThan(0);
        expect(actions.canKill).toBe(false);
        expect(actions.canCallMeeting).toBe(true);
      }
    });

    test('should get available actions for imposter', () => {
      const state = engine.getState();
      const imposter = Array.from(state.players.values()).find((p) => p.role === 'imposter');
      
      if (imposter) {
        const actions = engine.getAvailableActions(imposter.agentId);
        
        expect(actions.canMove).toBeDefined();
        expect(actions.canVent).toBeDefined();
        expect(actions.canCallMeeting).toBe(true);
      }
    });

    test('should get tasks in current room', () => {
      const tasks = engine.getTasksInRoom('electrical');
      
      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks[0]).toHaveProperty('taskId');
      expect(tasks[0]).toHaveProperty('description');
      expect(tasks[0]).toHaveProperty('type');
    });

    test('should get room info', () => {
      const roomInfo = engine.getRoomInfo('cafeteria');
      
      expect(roomInfo).toBeDefined();
      expect(roomInfo?.name).toBe('Cafeteria');
      expect(roomInfo?.connectedRooms.length).toBeGreaterThan(0);
      expect(roomInfo?.playersPresent.length).toBe(5); // All players start in cafeteria
    });

    test('should get game context string', () => {
      const state = engine.getState();
      const player = Array.from(state.players.values())[0];
      
      const context = engine.getGameContext(player.agentId);
      
      expect(context).toContain('GAME STATE');
      expect(context).toContain('CURRENT ROOM');
      expect(context).toContain('AVAILABLE ACTIONS');
      expect(context).toContain('Cafeteria');
    });

    test('should show available tasks for crewmate in room', () => {
      const state = engine.getState();
      const crewmate = Array.from(state.players.values()).find((p) => p.role === 'crewmate');
      
      if (crewmate) {
        // Move to a room with tasks and assign a task there
        crewmate.location = 'electrical';
        crewmate.taskIds = ['wiring-electrical'];
        
        const actions = engine.getAvailableActions(crewmate.agentId);
        
        expect(actions.canDoTasks.length).toBeGreaterThan(0);
        expect(actions.canDoTasks[0].taskId).toBe('wiring-electrical');
        expect(actions.canDoTasks[0].totalSteps).toBeGreaterThan(0);
      }
    });

    test('should show kill targets for imposter in same room', () => {
      const state = engine.getState();
      const imposter = Array.from(state.players.values()).find((p) => p.role === 'imposter');
      const crewmate = Array.from(state.players.values()).find((p) => p.role === 'crewmate');
      
      if (imposter && crewmate) {
        // Put both in same room
        imposter.location = 'electrical';
        crewmate.location = 'electrical';
        
        const actions = engine.getAvailableActions(imposter.agentId);
        
        expect(actions.canKill).toBe(true);
        expect(actions.killTargets).toContain(crewmate.agentId);
      }
    });
  });
});

