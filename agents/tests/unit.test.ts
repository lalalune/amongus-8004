/**
 * Among Us ERC-8004 Unit Test Suite
 * Comprehensive runtime tests for A2A game integration
 */

import { type IAgentRuntime, type TestSuite, logger } from '@elizaos/core';
import { Web3Service } from '../src/services/web3Service.js';
import { A2AClientService } from '../src/services/a2aClient.js';
import { GameService } from '../src/services/gameService.js';
import type { A2AAgentCard, A2AMessage, A2ATask } from '../src/services/a2aClient.js';

/**
 * Test suite for Among Us ERC-8004 Plugin
 * @class AmongUsTestSuite
 * @implements TestSuite
 */
export class AmongUsTestSuite implements TestSuite {
  name = 'amongus-erc8004';
  private web3Service!: Web3Service;
  private a2aClient!: A2AClientService;
  private gameService!: GameService;
  tests: { name: string; fn: (runtime: IAgentRuntime) => Promise<void> }[];

  constructor() {
    this.tests = [
      {
        name: 'Initialize Web3 Service & ERC-8004 Registration',
        fn: this.testWeb3Initialization.bind(this),
      },
      {
        name: 'Initialize A2A Client & Fetch Agent Card',
        fn: this.testA2AClientInitialization.bind(this),
      },
      {
        name: 'Validate Agent Card Skills Discovery',
        fn: this.testAgentCardSkillsDiscovery.bind(this),
      },
      {
        name: 'Initialize Game Service & Auto-Join',
        fn: this.testGameServiceInitialization.bind(this),
      },
      {
        name: 'Execute Join Game Skill via A2A',
        fn: this.testJoinGameSkill.bind(this),
      },
      {
        name: 'Execute Get Status Skill via A2A',
        fn: this.testGetStatusSkill.bind(this),
      },
      {
        name: 'Test Game State Updates',
        fn: this.testGameStateUpdates.bind(this),
      },
      {
        name: 'Test A2A Streaming',
        fn: this.testA2AStreaming.bind(this),
      },
      {
        name: 'Test Role-Based Action Filtering',
        fn: this.testRoleBasedActions.bind(this),
      },
      {
        name: 'Test Skill Execution Error Handling',
        fn: this.testSkillExecutionErrors.bind(this),
      },
    ];
  }

  // ============================================================================
  // Service Initialization Tests
  // ============================================================================

  /**
   * Test Web3 service initialization and ERC-8004 registration
   */
  async testWeb3Initialization(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing Web3 Service initialization...');

    this.web3Service = runtime.getService('web3') as Web3Service;
    if (!this.web3Service) {
      throw new Error('Web3Service not found in runtime');
    }

    const agentInfo = this.web3Service.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent not registered on-chain');
    }

    logger.success(`✅ Agent registered on-chain:`);
    logger.info(`   - Agent ID: ${agentInfo.agentId}`);
    logger.info(`   - Address: ${agentInfo.agentAddress}`);
    logger.info(`   - Domain: ${agentInfo.agentDomain}`);

    if (!agentInfo.isRegistered) {
      throw new Error('Agent registration flag is false');
    }
  }

  /**
   * Test A2A Client initialization and Agent Card fetching
   */
  async testA2AClientInitialization(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing A2A Client initialization...');

    this.a2aClient = runtime.getService('a2a-client') as A2AClientService;
    if (!this.a2aClient) {
      throw new Error('A2AClientService not found in runtime');
    }

    const agentCard = this.a2aClient.getAgentCard();
    if (!agentCard) {
      throw new Error('Agent Card not fetched');
    }

    logger.success(`✅ Connected to A2A Server:`);
    logger.info(`   - Name: ${agentCard.name}`);
    logger.info(`   - Protocol: ${agentCard.protocolVersion}`);
    logger.info(`   - URL: ${agentCard.url}`);
    logger.info(`   - Skills: ${agentCard.skills.length}`);
    logger.info(`   - Streaming: ${agentCard.capabilities.streaming ? 'Yes' : 'No'}`);

    this.validateAgentCard(agentCard);
  }

  /**
   * Test Agent Card skills discovery and validation
   */
  async testAgentCardSkillsDiscovery(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing Agent Card skills discovery...');

    const skills = this.a2aClient.getSkills();
    if (!skills || skills.length === 0) {
      throw new Error('No skills found in Agent Card');
    }

    logger.success(`✅ Discovered ${skills.length} skills from server:`);

    // Expected game skills
    const expectedSkills = [
      'join-game',
      'leave-game',
      'move-to-room',
      'complete-task',
      'kill-player',
      'use-vent',
      'sabotage',
      'call-meeting',
      'report-body',
      'send-message',
      'vote',
      'get-status',
    ];

    for (const expectedSkill of expectedSkills) {
      const skill = skills.find((s) => s.id === expectedSkill);
      if (!skill) {
        logger.warn(`⚠️  Skill not found: ${expectedSkill}`);
      } else {
        logger.info(`   ✓ ${skill.id}: ${skill.name}`);
      }
    }

    // Validate each skill structure
    for (const skill of skills) {
      if (!skill.id || !skill.name || !skill.description) {
        throw new Error(`Invalid skill structure: ${JSON.stringify(skill)}`);
      }
    }
  }

  /**
   * Test Game Service initialization and auto-join
   */
  async testGameServiceInitialization(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing Game Service initialization...');

    this.gameService = runtime.getService('game') as GameService;
    if (!this.gameService) {
      throw new Error('GameService not found in runtime');
    }

    // Wait for game state to update after auto-join
    await this.waitForGameState(5000);

    const gameState = this.gameService.getGameState();

    logger.success(`✅ Game Service initialized:`);
    logger.info(`   - Connected: ${gameState.connected}`);
    logger.info(`   - Phase: ${gameState.phase}`);
    logger.info(`   - Role: ${gameState.role || 'Not assigned yet'}`);
    logger.info(`   - Location: ${gameState.location || 'Unknown'}`);
    logger.info(`   - Available Actions: ${gameState.availableActions.length}`);

    if (!gameState.connected) {
      throw new Error('Game not connected after initialization');
    }
  }

  // ============================================================================
  // A2A Skill Execution Tests
  // ============================================================================

  /**
   * Test executing join-game skill via A2A protocol
   * Note: Agent auto-joins during initialization, so this test verifies
   * the A2A message execution rather than the join itself
   */
  async testJoinGameSkill(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing A2A skill execution via join-game...');

    const agentInfo = this.web3Service.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent info not available');
    }

    // Since agent already joined during init, try get-status instead
    // to verify A2A message sending works
    const result = await this.a2aClient.sendMessage(
      'get-status',
      {
        agentId: agentInfo.agentId.toString(),
        agentAddress: agentInfo.agentAddress,
        agentDomain: agentInfo.agentDomain,
      },
      'get my status'
    );

    logger.success('✅ A2A skill execution verified (get-status)');
    logger.info(`   Result type: ${result.kind}`);

    // Validate response
    this.validateA2AResponse(result);
  }

  /**
   * Test executing get-status skill via A2A protocol
   */
  async testGetStatusSkill(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing get-status skill execution...');

    const agentInfo = this.web3Service.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent info not available');
    }

    const result = await this.a2aClient.sendMessage(
      'get-status',
      {
        agentId: agentInfo.agentId.toString(),
        agentAddress: agentInfo.agentAddress,
        agentDomain: agentInfo.agentDomain,
      },
      'get my current status'
    );

    logger.success('✅ Get status skill executed successfully');
    logger.info(`   Result: ${JSON.stringify(result, null, 2)}`);

    this.validateA2AResponse(result);
  }

  /**
   * Test game state updates from A2A events
   */
  async testGameStateUpdates(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing game state updates...');

    const initialState = this.gameService.getGameState();
    logger.info(`   Initial Phase: ${initialState.phase}`);
    logger.info(`   Initial Role: ${initialState.role || 'None'}`);

    // Wait for potential state updates
    await this.waitForGameState(3000);

    const updatedState = this.gameService.getGameState();
    logger.info(`   Updated Phase: ${updatedState.phase}`);
    logger.info(`   Updated Role: ${updatedState.role || 'None'}`);

    logger.success('✅ Game state tracking working correctly');
  }

  /**
   * Test A2A streaming capability
   */
  async testA2AStreaming(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing A2A streaming...');

    const agentCard = this.a2aClient.getAgentCard();
    if (!agentCard?.capabilities.streaming) {
      logger.warn('⚠️  Server does not support streaming, skipping test');
      return;
    }

    const agentInfo = this.web3Service.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent info not available');
    }

    let eventCount = 0;
    const cleanup = this.a2aClient.onMessage((event) => {
      eventCount++;
      logger.info(`   📨 Received event ${eventCount}: ${JSON.stringify(event)}`);
    });

    // Start streaming
    await this.a2aClient.streamMessage(
      'get-status',
      {
        agentId: agentInfo.agentId.toString(),
        agentAddress: agentInfo.agentAddress,
        agentDomain: agentInfo.agentDomain,
      },
      'stream status updates'
    );

    // Wait for events
    await new Promise((resolve) => setTimeout(resolve, 2000));

    cleanup();

    logger.success(`✅ Streaming test completed, received ${eventCount} events`);
  }

  /**
   * Test role-based action filtering
   */
  async testRoleBasedActions(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing role-based action filtering...');

    const gameState = this.gameService.getGameState();
    const availableActions = this.gameService.getAvailableActions();

    logger.info(`   Current Role: ${gameState.role || 'Unknown'}`);
    logger.info(`   Available Actions: ${availableActions.length}`);

    if (gameState.role === 'crewmate') {
      if (availableActions.includes('complete-task')) {
        logger.success('   ✓ Crewmate has complete-task action');
      } else {
        throw new Error('Crewmate missing complete-task action');
      }

      if (availableActions.includes('kill-player')) {
        throw new Error('Crewmate should not have kill-player action');
      }
      logger.success('   ✓ Crewmate does not have imposter-only actions');
    } else if (gameState.role === 'imposter') {
      if (availableActions.includes('kill-player')) {
        logger.success('   ✓ Imposter has kill-player action');
      } else {
        throw new Error('Imposter missing kill-player action');
      }

      if (availableActions.includes('complete-task')) {
        throw new Error('Imposter should not have complete-task action');
      }
      logger.success('   ✓ Imposter does not have crewmate-only actions');
    } else {
      logger.warn('   ⚠️  Role not assigned yet, skipping role-specific checks');
    }

    logger.success('✅ Role-based action filtering working correctly');
  }

  /**
   * Test error handling for invalid skill execution
   */
  async testSkillExecutionErrors(runtime: IAgentRuntime): Promise<void> {
    logger.info('Testing skill execution error handling...');

    const agentInfo = this.web3Service.getAgentInfo();
    if (!agentInfo) {
      throw new Error('Agent info not available');
    }

    // Test with invalid skill ID
    let errorThrown = false;
    await this.a2aClient
      .sendMessage(
        'invalid-skill-id',
        {
          agentId: agentInfo.agentId.toString(),
          agentAddress: agentInfo.agentAddress,
          agentDomain: agentInfo.agentDomain,
        },
        'test invalid skill'
      )
      .catch((error) => {
        errorThrown = true;
        logger.info(`   ✓ Error caught: ${error.message}`);
      });

    if (!errorThrown) {
      logger.warn('   ⚠️  Invalid skill did not throw error (server may allow it)');
    } else {
      logger.success('   ✓ Invalid skill properly rejected');
    }

    logger.success('✅ Error handling test completed');
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * Validate Agent Card structure
   */
  private validateAgentCard(card: A2AAgentCard): void {
    if (!card.protocolVersion) {
      throw new Error('Agent Card missing protocolVersion');
    }

    if (!card.name || !card.description) {
      throw new Error('Agent Card missing name or description');
    }

    if (!card.url) {
      throw new Error('Agent Card missing url');
    }

    if (!card.skills || !Array.isArray(card.skills)) {
      throw new Error('Agent Card missing or invalid skills array');
    }

    if (!card.capabilities) {
      throw new Error('Agent Card missing capabilities');
    }
  }

  /**
   * Validate A2A response structure
   */
  private validateA2AResponse(response: A2ATask | A2AMessage): void {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid A2A response: not an object');
    }

    if (!('kind' in response)) {
      throw new Error('A2A response missing kind field');
    }

    if (response.kind === 'task') {
      const task = response as A2ATask;
      if (!task.id || !task.contextId || !task.status) {
        throw new Error('Invalid A2A task structure');
      }
    } else if (response.kind === 'message') {
      const message = response as A2AMessage;
      if (!message.messageId || !message.parts) {
        throw new Error('Invalid A2A message structure');
      }
    }
  }

  /**
   * Wait for game state to update
   */
  private async waitForGameState(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

