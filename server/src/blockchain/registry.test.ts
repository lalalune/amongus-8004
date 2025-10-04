/**
 * ERC-8004 Registry Integration Tests
 * These tests require Anvil to be running and contracts to be deployed
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { createRegistry, ERC8004Registry } from './registry';
import { ethers } from 'ethers';

describe('ERC8004Registry Integration Tests', () => {
  let registry: ERC8004Registry;
  let testWallet: ethers.Wallet;
  let testWallet2: ethers.Wallet;

  beforeAll(async () => {
    // Create registry with default Anvil account
    registry = await createRegistry();

    // Create test wallets (Anvil accounts 1 and 2)
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    testWallet = new ethers.Wallet(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Anvil account 1
      provider
    );
    testWallet2 = new ethers.Wallet(
      '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Anvil account 2
      provider
    );
  });

  describe('Identity Registry', () => {
    test('should check if agent is registered (not registered initially)', async () => {
      const isRegistered = await registry.isAgentRegistered(testWallet.address);
      expect(isRegistered).toBe(false);
    });

    test('should register new agent', async () => {
      // Create registry with test wallet
      const testRegistry = await createRegistry(
        'http://localhost:8545',
        testWallet.privateKey
      );

      const agentId = await testRegistry.registerAgent(
        'player1.amongus8004.local',
        testWallet.address
      );

      expect(agentId).toBeGreaterThan(0n);
    });

    test('should check if agent is registered (after registration)', async () => {
      const isRegistered = await registry.isAgentRegistered(testWallet.address);
      expect(isRegistered).toBe(true);
    });

    test('should get agent ID by address', async () => {
      const agentId = await registry.getAgentIdByAddress(testWallet.address);
      expect(agentId).toBeGreaterThan(0n);
    });

    test('should get agent ID by domain', async () => {
      const agentId = await registry.getAgentIdByDomain('player1.amongus8004.local');
      expect(agentId).toBeGreaterThan(0n);
    });

    test('should get agent info', async () => {
      const agentId = await registry.getAgentIdByAddress(testWallet.address);
      const info = await registry.getAgentInfo(agentId);

      expect(info.agentId).toEqual(agentId);
      expect(info.agentDomain).toBe('player1.amongus8004.local');
      expect(info.agentAddress.toLowerCase()).toBe(testWallet.address.toLowerCase());
    });

    test('should register second agent', async () => {
      const testRegistry2 = await createRegistry(
        'http://localhost:8545',
        testWallet2.privateKey
      );

      const agentId = await testRegistry2.registerAgent(
        'player2.amongus8004.local',
        testWallet2.address
      );

      expect(agentId).toBeGreaterThan(0n);
    });

    test('should prevent duplicate domain registration', async () => {
      const testRegistry2 = await createRegistry(
        'http://localhost:8545',
        testWallet2.privateKey
      );

      expect(async () => {
        await testRegistry2.registerAgent(
          'player1.amongus8004.local', // Same domain as first agent
          testWallet2.address
        );
      }).toThrow();
    });

    test('should prevent duplicate address registration', async () => {
      const testRegistry = await createRegistry(
        'http://localhost:8545',
        testWallet.privateKey
      );

      expect(async () => {
        await testRegistry.registerAgent(
          'player1b.amongus8004.local',
          testWallet.address // Same address
        );
      }).toThrow();
    });
  });

  describe('Reputation Registry', () => {
    test('should authorize feedback between agents', async () => {
      const agent1Id = await registry.getAgentIdByAddress(testWallet.address);
      const agent2Id = await registry.getAgentIdByAddress(testWallet2.address);

      // Agent 2 authorizes feedback from Agent 1
      const registry2 = await createRegistry(
        'http://localhost:8545',
        testWallet2.privateKey
      );

      const feedbackId = await registry2.authorizeFeedback(agent1Id, agent2Id);
      expect(feedbackId).toBeDefined();
      expect(feedbackId.length).toBeGreaterThan(0);
    });

    test('should submit game feedback for winner', async () => {
      const winnerId = await registry.getAgentIdByAddress(testWallet.address);
      const gameMasterId = await registry.getAgentIdByAddress(registry.getWalletAddress());

      // Register game master if not already
      const isRegistered = await registry.isAgentRegistered(registry.getWalletAddress());
      if (!isRegistered) {
        await registry.registerAgent(
          'gamemaster.amongus8004.local',
          registry.getWalletAddress()
        );
      }

      const gameMasterIdFinal = await registry.getAgentIdByAddress(registry.getWalletAddress());
      const feedbackId = await registry.submitGameFeedback(winnerId, gameMasterIdFinal);
      
      expect(feedbackId).toBeDefined();
    });
  });

  describe('Validation Registry', () => {
    test('should request validation', async () => {
      const validatorId = await registry.getAgentIdByAddress(testWallet.address);
      const serverId = await registry.getAgentIdByAddress(testWallet2.address);
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes('test-game-data'));

      const registry2 = await createRegistry(
        'http://localhost:8545',
        testWallet2.privateKey
      );

      await registry2.requestValidation(validatorId, serverId, dataHash);
      
      // No return value, just shouldn't throw
      expect(true).toBe(true);
    });

    test('should submit validation response', async () => {
      const validatorId = await registry.getAgentIdByAddress(testWallet.address);
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes('test-validation-data'));

      // First request validation (as server)
      const registry2 = await createRegistry(
        'http://localhost:8545',
        testWallet2.privateKey
      );
      const serverId = await registry.getAgentIdByAddress(testWallet2.address);
      await registry2.requestValidation(validatorId, serverId, dataHash);

      // Then respond (as validator)
      const registryValidator = await createRegistry(
        'http://localhost:8545',
        testWallet.privateKey
      );
      await registryValidator.submitValidation(dataHash, 100);

      expect(true).toBe(true);
    });
  });

  describe('Event Listening', () => {
    test.skip('should listen to agent registration events', (done) => {
      const listener = (agentId: bigint, domain: string, address: string) => {
        expect(agentId).toBeGreaterThan(0n);
        expect(domain).toBeDefined();
        expect(address).toBeDefined();
        registry.removeAllListeners();
        done();
      };

      registry.onAgentRegistered(listener);

      // Trigger event by registering a new agent
      const provider = new ethers.JsonRpcProvider('http://localhost:8545');
      const newWallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
      
      createRegistry('http://localhost:8545', newWallet.privateKey).then(async (newRegistry) => {
        // Fund the wallet first
        const funder = registry.getWalletAddress();
        const tx = await provider.getSigner(funder).sendTransaction({
          to: newWallet.address,
          value: ethers.parseEther('1.0')
        });
        await tx.wait();

        // Register
        await newRegistry.registerAgent(`test-${Date.now()}.local`, newWallet.address);
      });
    }, 10000);
  });
});

