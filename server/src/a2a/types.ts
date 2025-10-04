/**
 * A2A Protocol Type Definitions
 * Based on A2A specification v0.3.0
 */

// ============================================================================
// JSON-RPC 2.0 Base Types
// ============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================================================
// A2A Message Types
// ============================================================================

export type MessageRole = 'user' | 'agent';
export type PartKind = 'text' | 'file' | 'data';

export interface Message {
  role: MessageRole;
  parts: Part[];
  metadata?: Record<string, unknown>;
  messageId: string;
  taskId?: string;
  contextId?: string;
  kind: 'message';
}

export type Part = TextPart | FilePart | DataPart;

export interface TextPart {
  kind: 'text';
  text: string;
  metadata?: Record<string, unknown>;
}

export interface FilePart {
  kind: 'file';
  file: {
    name?: string;
    mimeType?: string;
    bytes?: string; // base64
    uri?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface DataPart {
  kind: 'data';
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// A2A Task Types
// ============================================================================

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'rejected'
  | 'auth-required'
  | 'unknown';

export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  history?: Message[];
  artifacts?: Artifact[];
  metadata?: Record<string, unknown>;
  kind: 'task';
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
  timestamp?: string;
}

export interface Artifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// A2A Streaming Types
// ============================================================================

export type StreamEventKind = 'status-update' | 'artifact-update';

export interface TaskStatusUpdateEvent {
  kind: 'status-update';
  taskId: string;
  contextId: string;
  status: TaskStatus;
  final: boolean;
  metadata?: Record<string, unknown>;
}

export interface TaskArtifactUpdateEvent {
  kind: 'artifact-update';
  taskId: string;
  contextId: string;
  artifact: Artifact;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, unknown>;
}

export type StreamEvent = Task | Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent;

// ============================================================================
// A2A Method Types
// ============================================================================

export interface MessageSendParams {
  message: Message;
  configuration?: {
    acceptedOutputModes?: string[];
    historyLength?: number;
    pushNotificationConfig?: unknown;
    blocking?: boolean;
  };
  metadata?: Record<string, unknown>;
}

export interface TaskQueryParams {
  id: string;
  // Optional signed message used for authentication of task access
  // When provided, the server will verify signature and ensure task ownership
  message?: Message;
  historyLength?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskIdParams {
  id: string;
  // Optional signed message used for authentication of task cancellation/resubscribe
  message?: Message;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// A2A Error Codes
// ============================================================================

export const A2A_ERROR_CODES = {
  // Standard JSON-RPC errors
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // A2A-specific errors
  TASK_NOT_FOUND: -32001,
  TASK_NOT_CANCELABLE: -32002,
  PUSH_NOT_SUPPORTED: -32003,
  UNSUPPORTED_OPERATION: -32004,
  CONTENT_TYPE_NOT_SUPPORTED: -32005,
  INVALID_AGENT_RESPONSE: -32006
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

export function createTextPart(text: string, metadata?: Record<string, unknown>): TextPart {
  const part: TextPart = {
    kind: 'text',
    text
  };
  if (metadata) {
    part.metadata = metadata;
  }
  return part;
}

export function createDataPart(data: Record<string, unknown>, metadata?: Record<string, unknown>): DataPart {
  const part: DataPart = {
    kind: 'data',
    data
  };
  if (metadata) {
    part.metadata = metadata;
  }
  return part;
}

export function createMessage(
  role: MessageRole,
  parts: Part[],
  messageId: string,
  contextId?: string,
  taskId?: string
): Message {
  const msg: Message = {
    role,
    parts,
    messageId,
    kind: 'message'
  };
  if (contextId) msg.contextId = contextId;
  if (taskId) msg.taskId = taskId;
  return msg;
}

export function createTask(
  id: string,
  contextId: string,
  state: TaskState,
  statusMessage?: string
): Task {
  const task: Task = {
    id,
    contextId,
    status: {
      state,
      timestamp: new Date().toISOString()
    },
    kind: 'task'
  };

  if (statusMessage) {
    task.status.message = createMessage(
      'agent',
      [createTextPart(statusMessage)],
      `msg-${Date.now()}`,
      contextId,
      id
    );
  }

  return task;
}

export function createSuccessResponse(id: string | number | null, result: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JSONRPCResponse {
  const error: JSONRPCError = {
    code,
    message
  };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: '2.0',
    id,
    error
  };
}

export function createStatusUpdateEvent(
  taskId: string,
  contextId: string,
  state: TaskState,
  message?: string,
  final: boolean = false
): TaskStatusUpdateEvent {
  const status: TaskStatus = {
    state,
    timestamp: new Date().toISOString()
  };

  if (message) {
    status.message = createMessage(
      'agent',
      [createTextPart(message)],
      `msg-${Date.now()}`,
      contextId,
      taskId
    );
  }

  return {
    kind: 'status-update',
    taskId,
    contextId,
    status,
    final
  };
}

export function createArtifactUpdateEvent(
  taskId: string,
  contextId: string,
  artifactId: string,
  parts: Part[],
  options: { append?: boolean; lastChunk?: boolean; name?: string } = {}
): TaskArtifactUpdateEvent {
  const artifact: Artifact = {
    artifactId,
    parts
  };
  if (options.name) {
    artifact.name = options.name;
  }

  const event: TaskArtifactUpdateEvent = {
    kind: 'artifact-update',
    taskId,
    contextId,
    artifact
  };
  
  if (options.append !== undefined) {
    event.append = options.append;
  }
  if (options.lastChunk !== undefined) {
    event.lastChunk = options.lastChunk;
  }
  
  return event;
}

