/**
 * SSE Streaming Manager
 * Manages Server-Sent Events connections for real-time game updates
 */

import type { Response } from 'express';
import type { StreamEvent, JSONRPCResponse } from './types.js';
import { createSuccessResponse } from './types.js';

export interface StreamConnection {
  agentId: string;
  taskId: string;
  contextId: string;
  response: Response;
  requestId: string | number;
}

export class StreamingManager {
  private connections: Map<string, StreamConnection[]> = new Map();

  // ============================================================================
  // Connection Management
  // ============================================================================

  addConnection(connection: StreamConnection): void {
    const existing = this.connections.get(connection.agentId) || [];
    existing.push(connection);
    this.connections.set(connection.agentId, existing);

    // Setup connection cleanup
    connection.response.on('close', () => {
      this.removeConnection(connection.agentId, connection);
    });

    connection.response.on('error', () => {
      this.removeConnection(connection.agentId, connection);
    });

    console.log(`[SSE] Agent ${connection.agentId} connected (${existing.length} connections)`);
  }

  removeConnection(agentId: string, connection: StreamConnection): void {
    const connections = this.connections.get(agentId);
    if (!connections) return;

    const filtered = connections.filter((c) => c !== connection);
    
    if (filtered.length === 0) {
      this.connections.delete(agentId);
    } else {
      this.connections.set(agentId, filtered);
    }

    console.log(`[SSE] Agent ${agentId} disconnected (${filtered.length} remaining)`);
  }

  getConnections(agentId: string): StreamConnection[] {
    return this.connections.get(agentId) || [];
  }

  hasConnections(agentId: string): boolean {
    return (this.connections.get(agentId)?.length || 0) > 0;
  }

  getAllConnectedAgents(): string[] {
    return Array.from(this.connections.keys());
  }

  // ============================================================================
  // Event Broadcasting
  // ============================================================================

  broadcast(event: StreamEvent, excludeAgents: string[] = []): void {
    for (const [agentId, connections] of this.connections) {
      if (!excludeAgents.includes(agentId)) {
        this.sendToAgent(agentId, event);
      }
    }
  }

  sendToAgent(agentId: string, event: StreamEvent): void {
    const connections = this.connections.get(agentId);
    if (!connections || connections.length === 0) return;

    const sseData = this.formatSSEEvent(event, connections[0].requestId);
    
    for (const connection of connections) {
      this.writeSSE(connection.response, sseData);
    }
  }

  sendToAgents(agentIds: string[], event: StreamEvent): void {
    for (const agentId of agentIds) {
      this.sendToAgent(agentId, event);
    }
  }

  sendToTask(taskId: string, event: StreamEvent): void {
    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        if (connection.taskId === taskId) {
          const sseData = this.formatSSEEvent(event, connection.requestId);
          this.writeSSE(connection.response, sseData);
        }
      }
    }
  }

  // ============================================================================
  // SSE Formatting
  // ============================================================================

  private formatSSEEvent(event: StreamEvent, requestId: string | number): string {
    const response: JSONRPCResponse = createSuccessResponse(requestId, event);
    return `data: ${JSON.stringify(response)}\n\n`;
  }

  private writeSSE(response: Response, data: string): void {
    if (response.writableEnded || response.destroyed) {
      return; // Connection already closed
    }

    response.write(data);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  closeConnection(agentId: string, taskId?: string): void {
    const connections = this.connections.get(agentId);
    if (!connections) return;

    const toClose = taskId
      ? connections.filter((c) => c.taskId === taskId)
      : connections;

    for (const connection of toClose) {
      if (!connection.response.writableEnded) {
        connection.response.end();
      }
      this.removeConnection(agentId, connection);
    }
  }

  closeAllConnections(): void {
    for (const agentId of this.connections.keys()) {
      this.closeConnection(agentId);
    }
  }

  getConnectionCount(): number {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.length;
    }
    return total;
  }
}

// ============================================================================
// SSE Response Setup Helper
// ============================================================================

export function setupSSEResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial comment to establish connection
  res.write(': connected\n\n');
}

