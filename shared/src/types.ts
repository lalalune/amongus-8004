/**
 * Shared types for Among Us ERC-8004 game
 * Used by both Game Master server and Player agents
 */

// ============================================================================
// Game State Types
// ============================================================================

export type GamePhase = 'lobby' | 'playing' | 'discussion' | 'voting' | 'ended';

export type PlayerRole = 'crewmate' | 'imposter';

export type WinnerType = 'crewmates' | 'imposters' | 'none';

export interface GameState {
  id: string;
  phase: GamePhase;
  round: number;
  players: Map<string, Player>;
  ship: ShipLayout;
  imposterIds: Set<string>;
  tasks: Map<string, GameTask>;
  deadPlayers: Set<string>;
  votes: Map<string, string>;
  discussionStartTime?: number;
  votingStartTime?: number;
  createdAt: number;
  endedAt?: number;
  winner?: WinnerType;
  meetingCaller?: string;
  reportedBody?: string;
}

export interface Player {
  agentId: string;
  agentAddress: string;
  agentDomain: string;
  name: string;
  location: string;
  role: PlayerRole;
  isAlive: boolean;
  taskIds: string[];
  completedTaskIds: string[];
  taskSteps: Map<string, number>; // Tracks current step for each multi-step task
  lastKillTime?: number;
  emergencyMeetingsUsed: number; // Track emergency meetings called (not body reports)
  contextId: string;
  taskId?: string;
  lastActionTime: number;
}

// ============================================================================
// Ship Layout Types
// ============================================================================

export interface ShipLayout {
  rooms: Map<string, Room>;
  vents: Map<string, string[]>;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  taskIds: string[];
  connectedRooms: string[];
  hasVent: boolean;
}

// ============================================================================
// Task Types
// ============================================================================

export type TaskType =
  | 'wiring'
  | 'fuel-download'
  | 'fuel-upload'
  | 'scan'
  | 'reactor'
  | 'navigation'
  | 'weapons'
  | 'trash-empty'
  | 'shields-prime';

export interface GameTask {
  id: string;
  type: TaskType;
  room: string;
  description: string;
  steps: TaskStep[];
  completedBy: Set<string>;
  isMultiPart: boolean;
  linkedTaskId?: string;
}

export interface TaskStep {
  description: string;
  expectedInput?: string;
  validation: (input: string) => boolean;
}

// ============================================================================
// Game Action Types
// ============================================================================

export interface GameAction {
  type: string;
  playerId: string;
  timestamp: number;
  data: Record<string, string | number | boolean>;
}

export interface MoveAction extends GameAction {
  type: 'move';
  targetRoom: string;
}

export interface TaskAction extends GameAction {
  type: 'task';
  taskId: string;
  input?: string;
}

export interface KillAction extends GameAction {
  type: 'kill';
  targetId: string;
}

export interface VentAction extends GameAction {
  type: 'vent';
  action: 'enter' | 'exit';
  targetRoom?: string;
}

export interface SabotageAction extends GameAction {
  type: 'sabotage';
  system: 'oxygen' | 'reactor' | 'lights' | 'comms';
}

export interface MeetingAction extends GameAction {
  type: 'meeting';
  reason: 'emergency' | 'body';
  bodyId?: string;
}

export interface VoteAction extends GameAction {
  type: 'vote';
  targetId: string | 'skip';
}

export interface ChatAction extends GameAction {
  type: 'chat';
  message: string;
}

// ============================================================================
// Game Event Types
// ============================================================================

export type GameEventType =
  | 'player-joined'
  | 'player-left'
  | 'game-started'
  | 'role-assigned'
  | 'player-moved'
  | 'task-completed'
  | 'player-killed'
  | 'body-reported'
  | 'meeting-called'
  | 'discussion-started'
  | 'voting-started'
  | 'vote-cast'
  | 'player-ejected'
  | 'game-ended'
  | 'chat-message'
  | 'sabotage-triggered'
  | 'sabotage-fixed'
  | 'vent-used'
  | 'emergency-meeting';

export interface GameEvent {
  type: GameEventType;
  gameId: string;
  timestamp: number;
  data: Record<string, string | number | boolean | string[]>;
  visibility: 'all' | 'imposters' | 'specific';
  specificPlayers?: string[];
}

// ============================================================================
// ERC-8004 Types
// ============================================================================

export interface AgentRegistration {
  agentId: bigint;
  agentDomain: string;
  agentAddress: string;
  blockNumber: number;
  timestamp: number;
}

export interface ReputationFeedback {
  agentClientId: bigint;
  agentServerId: bigint;
  feedbackAuthId: string;
  gameId: string;
  won: boolean;
  role: PlayerRole;
  tasksCompleted: number;
  kills: number;
  survived: boolean;
  blockNumber: number;
  timestamp: number;
}

// ============================================================================
// A2A Protocol Types (extends A2A spec)
// ============================================================================

export interface GameSkillParams {
  skillId: string;
  agentId: string;
  agentAddress: string;
  data?: Record<string, string | number | boolean>;
}

export interface GameActionResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface GameStateSnapshot {
  phase: GamePhase;
  playersAlive: number;
  playersTotal: number;
  tasksCompleted: number;
  tasksTotal: number;
  yourLocation: string;
  yourRole?: PlayerRole;
  yourTasksRemaining?: number;
  nearbyPlayers: string[];
  canKill?: boolean;
  canVent?: boolean;
  discussionTimeRemaining?: number;
  votingTimeRemaining?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface GameConfig {
  minPlayers: number;
  maxPlayers: number;
  imposterRatio: number;
  taskCount: number;
  killCooldown: number;
  discussionTime: number;
  votingTime: number;
  emergencyMeetings: number;
}

export interface ContractAddresses {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry: string;
  chainId: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface SerializableGameState {
  id: string;
  phase: GamePhase;
  round: number;
  players: Array<[string, Player]>;
  imposterIds: string[];
  tasks: Array<[string, GameTask]>;
  deadPlayers: string[];
  votes: Array<[string, string]>;
  createdAt: number;
  endedAt?: number;
  winner?: WinnerType;
}

// ============================================================================
// Helper Functions
// ============================================================================

// Note: Serialization functions removed for v1
// Game state will be kept in memory only
// Can be added later if persistence is needed

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_GAME_CONFIG: GameConfig = {
  minPlayers: 5,
  maxPlayers: 10,
  imposterRatio: 0.2,
  taskCount: 5, // Each crewmate gets 5 random tasks (13 total tasks available)
  killCooldown: 30000, // 30 seconds
  discussionTime: 60000, // 60 seconds
  votingTime: 30000, // 30 seconds
  emergencyMeetings: 1
};

export const ROOM_NAMES = [
  'Cafeteria',
  'Engine Room',
  'Electrical',
  'MedBay',
  'Security',
  'Reactor',
  'Navigation',
  'Weapons',
  'Storage',
  'Upper Hallway',
  'Lower Hallway'
] as const;

export type RoomName = typeof ROOM_NAMES[number];

