/**
 * A2A Types Helper Functions Tests - 100% Coverage
 */

import { describe, test, expect } from 'bun:test';
import {
  createTextPart,
  createDataPart,
  createMessage,
  createTask,
  createSuccessResponse,
  createErrorResponse,
  createStatusUpdateEvent,
  createArtifactUpdateEvent,
  A2A_ERROR_CODES
} from './types';

describe('A2A Type Helpers', () => {
  describe('Part Creation', () => {
    test('should create text part', () => {
      const part = createTextPart('Hello world');
      expect(part.kind).toBe('text');
      expect(part.text).toBe('Hello world');
      expect(part.metadata).toBeUndefined();
    });

    test('should create text part with metadata', () => {
      const part = createTextPart('Hello', { custom: 'data' });
      expect(part.kind).toBe('text');
      expect(part.metadata).toEqual({ custom: 'data' });
    });

    test('should create data part', () => {
      const part = createDataPart({ key: 'value' });
      expect(part.kind).toBe('data');
      expect(part.data).toEqual({ key: 'value' });
    });

    test('should create data part with metadata', () => {
      const part = createDataPart({ key: 'value' }, { meta: 'info' });
      expect(part.metadata).toEqual({ meta: 'info' });
    });
  });

  describe('Message Creation', () => {
    test('should create basic message', () => {
      const msg = createMessage(
        'user',
        [createTextPart('test')],
        'msg-123'
      );

      expect(msg.role).toBe('user');
      expect(msg.messageId).toBe('msg-123');
      expect(msg.kind).toBe('message');
      expect(msg.parts.length).toBe(1);
    });

    test('should create message with context', () => {
      const msg = createMessage(
        'agent',
        [createTextPart('response')],
        'msg-456',
        'ctx-789'
      );

      expect(msg.contextId).toBe('ctx-789');
    });

    test('should create message with task', () => {
      const msg = createMessage(
        'user',
        [createTextPart('action')],
        'msg-1',
        'ctx-1',
        'task-1'
      );

      expect(msg.taskId).toBe('task-1');
      expect(msg.contextId).toBe('ctx-1');
    });
  });

  describe('Task Creation', () => {
    test('should create task without message', () => {
      const task = createTask('task-1', 'ctx-1', 'working');

      expect(task.id).toBe('task-1');
      expect(task.contextId).toBe('ctx-1');
      expect(task.status.state).toBe('working');
      expect(task.kind).toBe('task');
      expect(task.status.timestamp).toBeDefined();
    });

    test('should create task with status message', () => {
      const task = createTask('task-1', 'ctx-1', 'working', 'Processing...');

      expect(task.status.message).toBeDefined();
      expect(task.status.message?.parts[0]).toHaveProperty('text', 'Processing...');
    });

    test('should create task in all valid states', () => {
      const states: Array<'submitted' | 'working' | 'completed' | 'failed'> = [
        'submitted',
        'working',
        'completed',
        'failed'
      ];

      for (const state of states) {
        const task = createTask('task-1', 'ctx-1', state);
        expect(task.status.state).toBe(state);
      }
    });
  });

  describe('Response Creation', () => {
    test('should create success response', () => {
      const response = createSuccessResponse(1, { result: 'data' });

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toEqual({ result: 'data' });
      expect(response.error).toBeUndefined();
    });

    test('should create success response with null id', () => {
      const response = createSuccessResponse(null, {});
      expect(response.id).toBeNull();
    });

    test('should create error response', () => {
      const response = createErrorResponse(
        1,
        A2A_ERROR_CODES.METHOD_NOT_FOUND,
        'Method not found'
      );

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.error?.code).toBe(-32601);
      expect(response.error?.message).toBe('Method not found');
      expect(response.result).toBeUndefined();
    });

    test('should create error response with data', () => {
      const response = createErrorResponse(
        2,
        A2A_ERROR_CODES.INVALID_PARAMS,
        'Invalid params',
        { details: 'missing field' }
      );

      expect(response.error?.data).toEqual({ details: 'missing field' });
    });
  });

  describe('Event Creation', () => {
    test('should create status update event', () => {
      const event = createStatusUpdateEvent(
        'task-1',
        'ctx-1',
        'working',
        'Still working...',
        false
      );

      expect(event.kind).toBe('status-update');
      expect(event.taskId).toBe('task-1');
      expect(event.contextId).toBe('ctx-1');
      expect(event.status.state).toBe('working');
      expect(event.final).toBe(false);
    });

    test('should create final status update', () => {
      const event = createStatusUpdateEvent(
        'task-1',
        'ctx-1',
        'completed',
        'Done!',
        true
      );

      expect(event.final).toBe(true);
    });

    test('should create status update without message', () => {
      const event = createStatusUpdateEvent('task-1', 'ctx-1', 'working');
      expect(event.status.message).toBeUndefined();
    });

    test('should create artifact update event', () => {
      const event = createArtifactUpdateEvent(
        'task-1',
        'ctx-1',
        'artifact-1',
        [createTextPart('result')]
      );

      expect(event.kind).toBe('artifact-update');
      expect(event.taskId).toBe('task-1');
      expect(event.artifact.artifactId).toBe('artifact-1');
    });

    test('should create artifact with append option', () => {
      const event = createArtifactUpdateEvent(
        'task-1',
        'ctx-1',
        'artifact-1',
        [createTextPart('more data')],
        { append: true }
      );

      expect(event.append).toBe(true);
    });

    test('should create artifact with lastChunk', () => {
      const event = createArtifactUpdateEvent(
        'task-1',
        'ctx-1',
        'artifact-1',
        [createTextPart('final data')],
        { lastChunk: true }
      );

      expect(event.lastChunk).toBe(true);
    });

    test('should create artifact with name', () => {
      const event = createArtifactUpdateEvent(
        'task-1',
        'ctx-1',
        'artifact-1',
        [createTextPart('data')],
        { name: 'results.json' }
      );

      expect(event.artifact.name).toBe('results.json');
    });
  });

  describe('Error Codes', () => {
    test('should have all standard JSON-RPC error codes', () => {
      expect(A2A_ERROR_CODES.PARSE_ERROR).toBe(-32700);
      expect(A2A_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
      expect(A2A_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
      expect(A2A_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
      expect(A2A_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    });

    test('should have all A2A-specific error codes', () => {
      expect(A2A_ERROR_CODES.TASK_NOT_FOUND).toBe(-32001);
      expect(A2A_ERROR_CODES.TASK_NOT_CANCELABLE).toBe(-32002);
      expect(A2A_ERROR_CODES.PUSH_NOT_SUPPORTED).toBe(-32003);
      expect(A2A_ERROR_CODES.UNSUPPORTED_OPERATION).toBe(-32004);
      expect(A2A_ERROR_CODES.CONTENT_TYPE_NOT_SUPPORTED).toBe(-32005);
      expect(A2A_ERROR_CODES.INVALID_AGENT_RESPONSE).toBe(-32006);
    });
  });
});

