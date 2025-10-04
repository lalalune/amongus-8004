/**
 * SSE Streaming Manager Tests
 * 100% coverage of streaming functionality
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { StreamingManager, setupSSEResponse } from './streaming';
import type { Response } from 'express';
import { createTask, createStatusUpdateEvent } from './types';

describe('StreamingManager', () => {
  let manager: StreamingManager;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    manager = new StreamingManager();
    
    // Create mock response
    const writtenData: string[] = [];
    const callbacks: Record<string, Function> = {};
    
    mockResponse = {
      writableEnded: false,
      destroyed: false,
      write: (data: string) => {
        writtenData.push(data);
        return true;
      },
      end: () => {
        mockResponse.writableEnded = true;
      },
      on: (event: string, callback: Function) => {
        callbacks[event] = callback;
        return mockResponse as Response;
      },
      setHeader: () => mockResponse as Response,
      flushHeaders: () => {}
    };
    (mockResponse as any).writtenData = writtenData;
    (mockResponse as any).callbacks = callbacks;
  });

  describe('Connection Management', () => {
    test('should add connection', () => {
      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      expect(manager.hasConnections('agent-1')).toBe(true);
      expect(manager.getConnections('agent-1').length).toBe(1);
    });

    test('should track multiple connections per agent', () => {
      const mock2: Partial<Response> = { ...mockResponse };

      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-2',
        contextId: 'ctx-1',
        response: mock2 as Response,
        requestId: 2
      });

      expect(manager.getConnections('agent-1').length).toBe(2);
    });

    test('should get all connected agents', () => {
      const mock2: Partial<Response> = {
        ...mockResponse,
        on: () => mockResponse as Response
      };

      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      const agents = manager.getAllConnectedAgents();
      expect(agents.length).toBe(2);
      expect(agents).toContain('agent-1');
      expect(agents).toContain('agent-2');
    });

    test('should return empty for non-existent agent', () => {
      expect(manager.hasConnections('non-existent')).toBe(false);
      expect(manager.getConnections('non-existent').length).toBe(0);
    });
  });

  describe('Event Broadcasting', () => {
    beforeEach(() => {
      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });
    });

    test('should send event to specific agent', () => {
      const event = createTask('task-1', 'ctx-1', 'working');
      manager.sendToAgent('agent-1', event);

      const written = (mockResponse as any).writtenData;
      expect(written.length).toBe(1);
      expect(written[0]).toContain('data: ');
      expect(written[0]).toContain('task-1');
    });

    test('should broadcast to all agents', () => {
      const mock2: Partial<Response> = { 
        ...mockResponse,
        writableEnded: false,
        destroyed: false
      };
      const writtenData2: string[] = [];
      (mock2 as any).writtenData = writtenData2;
      mock2.write = (data: string) => { writtenData2.push(data); return true; };

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      const event = createTask('task-1', 'ctx-1', 'working');
      manager.broadcast(event);

      expect((mockResponse as any).writtenData.length).toBe(1);
      expect(writtenData2.length).toBe(1);
    });

    test('should exclude agents from broadcast', () => {
      const mock2: Partial<Response> = { ...mockResponse };
      const writtenData2: string[] = [];
      (mock2 as any).writtenData = writtenData2;
      mock2.write = (data: string) => { writtenData2.push(data); return true; };

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      const event = createTask('task-1', 'ctx-1', 'working');
      manager.broadcast(event, ['agent-1']); // Exclude agent-1

      expect((mockResponse as any).writtenData.length).toBe(0);
      expect(writtenData2.length).toBe(1);
    });

    test('should send to multiple specific agents', () => {
      const mock2: Partial<Response> = { ...mockResponse };
      const writtenData2: string[] = [];
      (mock2 as any).writtenData = writtenData2;
      mock2.write = (data: string) => { writtenData2.push(data); return true; };

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      const event = createTask('task-1', 'ctx-1', 'working');
      manager.sendToAgents(['agent-1', 'agent-2'], event);

      expect((mockResponse as any).writtenData.length).toBe(1);
      expect(writtenData2.length).toBe(1);
    });

    test('should send to task subscribers', () => {
      const event = createStatusUpdateEvent('task-1', 'ctx-1', 'working', 'Update');
      manager.sendToTask('task-1', event);

      expect((mockResponse as any).writtenData.length).toBe(1);
    });

    test('should handle closed connections gracefully', () => {
      mockResponse.writableEnded = true;
      
      const event = createTask('task-1', 'ctx-1', 'working');
      manager.sendToAgent('agent-1', event); // Should not throw

      expect((mockResponse as any).writtenData.length).toBe(0); // No write to closed connection
    });
  });

  describe('Connection Cleanup', () => {
    test('should close specific connection', () => {
      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      manager.closeConnection('agent-1', 'task-1');
      expect(mockResponse.writableEnded).toBe(true);
      expect(manager.hasConnections('agent-1')).toBe(false);
    });

    test('should close all connections for agent', () => {
      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      manager.closeConnection('agent-1');
      expect(mockResponse.writableEnded).toBe(true);
    });

    test('should close all connections', () => {
      let mock2Ended = false;
      const mock2: Partial<Response> = { 
        writableEnded: false,
        destroyed: false,
        on: () => mock2 as Response,
        write: () => true,
        setHeader: () => mock2 as Response,
        flushHeaders: () => {},
        end: () => {
          mock2Ended = true;
          mock2.writableEnded = true;
        }
      };

      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      manager.closeAllConnections();

      expect(mockResponse.writableEnded).toBe(true);
      expect(mock2Ended).toBe(true);
      expect(manager.getConnectionCount()).toBe(0);
    });

    test('should get connection count', () => {
      expect(manager.getConnectionCount()).toBe(0);

      manager.addConnection({
        agentId: 'agent-1',
        taskId: 'task-1',
        contextId: 'ctx-1',
        response: mockResponse as Response,
        requestId: 1
      });

      expect(manager.getConnectionCount()).toBe(1);

      const mock2: Partial<Response> = {
        ...mockResponse,
        on: () => mock2 as Response
      };

      manager.addConnection({
        agentId: 'agent-2',
        taskId: 'task-2',
        contextId: 'ctx-2',
        response: mock2 as Response,
        requestId: 2
      });

      expect(manager.getConnectionCount()).toBe(2);
    });
  });

  describe('SSE Response Setup', () => {
    test('should setup SSE headers', () => {
      const headers: Record<string, string> = {};
      const mockRes: Partial<Response> = {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
          return mockRes as Response;
        },
        flushHeaders: () => {},
        write: () => true
      };

      setupSSEResponse(mockRes as Response);

      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(headers['Cache-Control']).toBe('no-cache');
      expect(headers['Connection']).toBe('keep-alive');
    });
  });
});

