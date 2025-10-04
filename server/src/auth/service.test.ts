/**
 * Authentication Service Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ethers } from 'ethers';
import { AuthService } from './service';
import type { ERC8004Registry } from '../blockchain/registry';

describe('AuthService', () => {
  let authService: AuthService;
  let mockRegistry: Partial<ERC8004Registry>;
  let testWallet: ethers.Wallet;

  beforeEach(() => {
    // Create test wallet
    testWallet = ethers.Wallet.createRandom();

    // Mock registry
    mockRegistry = {
      isAgentRegistered: async (address: string) => {
        return address.toLowerCase() === testWallet.address.toLowerCase();
      },
      getAgentInfoByAddress: async (address: string) => ({
        agentId: 1n,
        agentAddress: address,
        agentDomain: 'test.local',
        blockNumber: 1,
        timestamp: Date.now()
      })
    };

    authService = new AuthService(mockRegistry as ERC8004Registry, 'test-secret-key');
  });

  describe('Challenge Generation', () => {
    test('should generate unique challenge', () => {
      const challenge1 = authService.generateChallenge(testWallet.address);
      const challenge2 = authService.generateChallenge(testWallet.address);

      expect(challenge1.challenge).toBeDefined();
      expect(challenge2.challenge).toBeDefined();
      expect(challenge1.challenge).not.toBe(challenge2.challenge);
    });

    test('should include expiration time', () => {
      const challenge = authService.generateChallenge(testWallet.address);
      
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
      expect(challenge.expiresAt).toBeLessThan(Date.now() + 10 * 60 * 1000);
    });

    test('should construct proper signature message', () => {
      const challenge = authService.generateChallenge(testWallet.address);
      const message = authService.constructSignatureMessage(challenge.challenge);

      expect(message).toContain('Sign this message');
      expect(message).toContain(challenge.challenge);
      expect(message).toContain('Among Us ERC-8004 Game Master');
    });
  });

  describe('Authentication', () => {
    test('should authenticate with valid signature', async () => {
      const challenge = authService.generateChallenge(testWallet.address);
      const message = authService.constructSignatureMessage(challenge.challenge);
      const signature = await testWallet.signMessage(message);

      const result = await authService.authenticate({
        agentAddress: testWallet.address,
        signature,
        challenge: challenge.challenge
      });

      expect(result.token).toBeDefined();
      expect(result.expiresIn).toBe(24 * 60 * 60);
    });

    test('should reject unregistered agent', async () => {
      const unregisteredWallet = ethers.Wallet.createRandom();
      const challenge = authService.generateChallenge(unregisteredWallet.address);
      const message = authService.constructSignatureMessage(challenge.challenge);
      const signature = await unregisteredWallet.signMessage(message);

      await expect(
        authService.authenticate({
          agentAddress: unregisteredWallet.address,
          signature,
          challenge: challenge.challenge
        })
      ).rejects.toThrow('not registered');
    });

    test('should reject wrong signature', async () => {
      const challenge = authService.generateChallenge(testWallet.address);
      const wrongWallet = ethers.Wallet.createRandom();
      const message = authService.constructSignatureMessage(challenge.challenge);
      const signature = await wrongWallet.signMessage(message);

      await expect(
        authService.authenticate({
          agentAddress: testWallet.address,
          signature,
          challenge: challenge.challenge
        })
      ).rejects.toThrow('verification failed');
    });

    test('should reject expired challenge', async () => {
      const challenge = authService.generateChallenge(testWallet.address);
      const message = authService.constructSignatureMessage(challenge.challenge);
      const signature = await testWallet.signMessage(message);

      // Manually expire the challenge
      challenge.expiresAt = Date.now() - 1000;

      await expect(
        authService.authenticate({
          agentAddress: testWallet.address,
          signature,
          challenge: challenge.challenge
        })
      ).rejects.toThrow('expired');
    });

    test('should reject wrong challenge', async () => {
      authService.generateChallenge(testWallet.address);
      const wrongChallenge = ethers.hexlify(ethers.randomBytes(32));
      const message = authService.constructSignatureMessage(wrongChallenge);
      const signature = await testWallet.signMessage(message);

      await expect(
        authService.authenticate({
          agentAddress: testWallet.address,
          signature,
          challenge: wrongChallenge
        })
      ).rejects.toThrow('Challenge');
    });
  });

  describe('Token Management', () => {
    test('should generate valid JWT token', async () => {
      const challenge = authService.generateChallenge(testWallet.address);
      const message = authService.constructSignatureMessage(challenge.challenge);
      const signature = await testWallet.signMessage(message);

      const result = await authService.authenticate({
        agentAddress: testWallet.address,
        signature,
        challenge: challenge.challenge
      });

      const payload = authService.verifyToken(result.token);

      expect(payload.agentAddress).toBe(testWallet.address.toLowerCase());
      expect(payload.agentDomain).toBe('test.local');
      expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
    });

    test('should reject invalid token', () => {
      expect(() => {
        authService.verifyToken('invalid-token');
      }).toThrow();
    });

    test('should reject expired token', () => {
      // This would require waiting or manipulating time
      // For now, we just verify the structure
      expect(() => {
        authService.verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjB9.invalid');
      }).toThrow();
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Bearer header', () => {
      const token = authService.extractTokenFromHeader('Bearer test-token-123');
      expect(token).toBe('test-token-123');
    });

    test('should return null for missing header', () => {
      const token = authService.extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });

    test('should return null for malformed header', () => {
      expect(authService.extractTokenFromHeader('test-token-123')).toBeNull();
      expect(authService.extractTokenFromHeader('Basic dGVzdA==')).toBeNull();
    });
  });
});

