/**
 * A2A Server Integration Tests
 * Tests end-to-end signature verification
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ethers } from 'ethers';
import { A2AServer } from './server';
import { GameEngine } from '../game/engine';
import type { ERC8004Registry } from '../blockchain/registry';
import type { Request, Response } from 'express';

describe('A2A Server - Signature Verification Integration', () => {
  let server: A2AServer;
  let engine: GameEngine;
  let mockRegistry: Partial<ERC8004Registry>;
  let testWallet: ethers.Wallet;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseData: unknown;

  beforeEach(() => {
    engine = new GameEngine();
    testWallet = ethers.Wallet.createRandom();
    
    mockRegistry = {
      isAgentRegistered: async (address: string) => {
        return address.toLowerCase() === testWallet.address.toLowerCase();
      },
      getAgentInfo: async () => ({
        agentId: 1n,
        agentAddress: testWallet.address,
        agentDomain: 'test.local',
        blockNumber: 1,
        timestamp: Date.now()
      })
    };

    server = new A2AServer(engine, mockRegistry as ERC8004Registry);

    responseData = null;
    mockResponse = {
      json: (data: unknown) => {
        responseData = data;
      },
      setHeader: () => mockResponse as Response,
      flushHeaders: () => {},
      write: () => true,
      end: () => {},
      on: () => mockResponse as Response,
      writableEnded: false,
      destroyed: false
    };

    mockRequest = {
      body: {}
    };
  });

  async function createSignedMessage(
    skillId: string,
    data: Record<string, unknown>,
    agentId: string = 'test-agent'
  ) {
    const timestamp = Date.now();
    const messageId = `msg-${Date.now()}`;
    
    // IMPORTANT: Sign ONLY the original data passed to the skill
    // This matches how the client signs in a2aClient.ts
    const signaturePayload = JSON.stringify({
      messageId,
      timestamp,
      skillId,
      data // Original skill data only - NO agentId, agentAddress, agentDomain, signature, timestamp
    });
    
    const signature = await testWallet.signMessage(signaturePayload);

    return {
      role: 'user' as const,
      parts: [
        { kind: 'text' as const, text: `Execute ${skillId}` },
        {
          kind: 'data' as const,
          data: {
            // Authentication/metadata fields - NOT included in signature
            skillId,
            agentId,
            agentAddress: testWallet.address,
            agentDomain: 'test.local',
            playerName: `Player-${agentId}`,
            signature,
            timestamp,
            ...data // Original skill-specific data spread here
          }
        }
      ],
      messageId,
      kind: 'message' as const
    };
  }

  describe('Valid Signed Messages', () => {
    test('should accept properly signed message', async () => {
      // Add player to game first
      engine.addPlayer('test-agent', testWallet.address, 'test.local', 'Test');

      // Sign ONLY skill data (empty for get-status)
      const message = await createSignedMessage('get-status', {}, 'test-agent');

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { result?: unknown; error?: { message: string } };
      
      if (response.error) {
        console.log('Unexpected error:', response.error);
      }
      
      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    test('should accept join-game with valid signature', async () => {
      // Sign ONLY skill data (empty for join-game, playerName/agentDomain added after)
      const message = await createSignedMessage('join-game', {}, 'test-agent');

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { result?: unknown; error?: unknown };
      
      if (response.error) {
        console.log('Join error:', response.error);
      }
      
      expect(response.result).toBeDefined();
      expect(engine.getState().players.size).toBe(1);
    });
  });

  describe('Signature Validation - Reject Invalid', () => {
    test('should reject message without signature', async () => {
      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            parts: [
              { 
                kind: 'data', 
                data: { 
                  skillId: 'get-status', 
                  agentId: 'test',
                  agentAddress: testWallet.address,
                  timestamp: Date.now()
                  // Missing signature!
                } 
              }
            ],
            messageId: 'msg-1',
            kind: 'message'
          }
        }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { error: { message: string } };
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('signature');
    });

    test('should reject message with invalid signature', async () => {
      const wrongWallet = ethers.Wallet.createRandom();
      const timestamp = Date.now();
      const messageId = 'msg-test';
      const skillId = 'get-status';
      const data = {};

      // Sign with WRONG wallet
      const signaturePayload = JSON.stringify({
        messageId,
        timestamp,
        skillId,
        data
      });
      const signature = await wrongWallet.signMessage(signaturePayload);

      const message = {
        role: 'user' as const,
        parts: [
          {
            kind: 'data' as const,
            data: {
              skillId,
              agentId: 'test',
              agentAddress: testWallet.address, // Claiming to be testWallet
              signature, // But signed with wrongWallet
              timestamp
            }
          }
        ],
        messageId,
        kind: 'message' as const
      };

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { error: { message: string } };
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('Signature verification failed');
    });

    test('should reject old message (replay attack)', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      const messageId = 'msg-old';
      const skillId = 'get-status';
      const data = {};

      const signaturePayload = JSON.stringify({
        messageId,
        timestamp: oldTimestamp,
        skillId,
        data
      });
      const signature = await testWallet.signMessage(signaturePayload);

      const message = {
        role: 'user' as const,
        parts: [
          {
            kind: 'data' as const,
            data: {
              skillId,
              agentId: 'test',
              agentAddress: testWallet.address,
              signature,
              timestamp: oldTimestamp
            }
          }
        ],
        messageId,
        kind: 'message' as const
      };

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { error: { message: string } };
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('too old');
    });

    test('should reject unregistered agent', async () => {
      const unregisteredWallet = ethers.Wallet.createRandom();
      const timestamp = Date.now();
      const messageId = 'msg-unreg';
      const skillId = 'get-status';
      const skillData = {}; // Skill-specific data only

      const signaturePayload = JSON.stringify({
        messageId,
        timestamp,
        skillId,
        data: skillData
      });
      const signature = await unregisteredWallet.signMessage(signaturePayload);

      const message = {
        role: 'user' as const,
        parts: [
          {
            kind: 'data' as const,
            data: {
              skillId,
              agentId: 'unregistered',
              agentAddress: unregisteredWallet.address,
              signature,
              timestamp,
              ...skillData
            }
          }
        ],
        messageId,
        kind: 'message' as const
      };

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { error: { message: string } };
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('not registered');
    });
  });

  describe('Impersonation Prevention', () => {
    test('should prevent Agent A from pretending to be Agent B', async () => {
      // Agent A's wallet
      const agentA = ethers.Wallet.createRandom();
      
      // Agent B's address (victim)
      const agentB = ethers.Wallet.createRandom();

      const timestamp = Date.now();
      const messageId = 'msg-impersonate';
      const skillId = 'get-status';
      const data = {};

      // Agent A signs the message
      const signaturePayload = JSON.stringify({
        messageId,
        timestamp,
        skillId,
        data
      });
      const signature = await agentA.signMessage(signaturePayload);

      // But tries to claim it's from Agent B
      const message = {
        role: 'user' as const,
        parts: [
          {
            kind: 'data' as const,
            data: {
              skillId,
              agentId: 'agent-b',
              agentAddress: agentB.address, // Claiming to be B
              signature, // But signed by A
              timestamp
            }
          }
        ],
        messageId,
        kind: 'message' as const
      };

      mockRequest.body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'message/send',
        params: { message }
      };

      await server.handleRequest(mockRequest as Request, mockResponse as Response);

      const response = responseData as { error: { message: string } };
      expect(response.error).toBeDefined();
      expect(response.error.message).toContain('signature is from');
      expect(response.error.message).toContain('but claiming to be');
    });
  });
});

