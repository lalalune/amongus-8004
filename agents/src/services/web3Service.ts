/**
 * Web3 Service
 * Manages wallet and ERC-8004 on-chain registration
 * 
 * @module Web3Service
 * @description Handles blockchain interactions including wallet management,
 * ERC-8004 agent registration, and contract communication
 */

import { Service, type IAgentRuntime, logger } from '@elizaos/core';
import { ethers, Wallet, Contract, JsonRpcProvider } from 'ethers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Web3Error, RegistrationError, ConfigurationError } from '../errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Information about a registered agent on-chain
 * @interface AgentInfo
 */
export interface AgentInfo {
  /** Unique agent ID from ERC-8004 registry */
  agentId: bigint;
  /** Ethereum address of the agent wallet */
  agentAddress: string;
  /** Human-readable domain for the agent */
  agentDomain: string;
  /** Whether the agent is registered on-chain */
  isRegistered: boolean;
}

/**
 * Service for managing Web3 wallet and ERC-8004 registration
 * @class Web3Service
 * @extends Service
 */
export class Web3Service extends Service {
  static serviceType = 'web3';
  capabilityDescription = 'Manages wallet and ERC-8004 on-chain agent registration';

  private wallet: Wallet | null = null;
  private provider: JsonRpcProvider | null = null;
  private identityContract: Contract | null = null;
  private agentInfo: AgentInfo | null = null;

  /**
   * Initialize the Web3 service
   * Sets up wallet, loads contracts, and ensures agent is registered on-chain
   * 
   * @param {IAgentRuntime} runtime - The agent runtime instance
   * @throws {ConfigurationError} If required configuration is missing
   * @throws {Web3Error} If blockchain connection fails
   * @throws {RegistrationError} If agent registration fails
   * @returns {Promise<void>}
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    const rpcUrl = runtime.getSetting('RPC_URL') || 'http://localhost:8545';
    const privateKey = runtime.getSetting('AGENT_PRIVATE_KEY');

    if (!privateKey) {
      throw new ConfigurationError('AGENT_PRIVATE_KEY not configured', 'AGENT_PRIVATE_KEY');
    }

    // Setup provider and wallet
    this.provider = new JsonRpcProvider(rpcUrl);
    this.wallet = new Wallet(privateKey, this.provider);

    logger.info(`[Web3] Wallet: ${this.wallet.address}`);

    // Load Identity Registry contract
    // Path works for both src/ and dist/ directories
    const addressesPath = join(__dirname, '../../../contracts/addresses.json');
    const addresses = JSON.parse(readFileSync(addressesPath, 'utf-8'));

    const abiPath = join(__dirname, '../../../contracts/abis/IdentityRegistry.json');
    const abi = JSON.parse(readFileSync(abiPath, 'utf-8')).abi;

    this.identityContract = new Contract(addresses.identityRegistry, abi, this.wallet);

    // Check/register agent
    await this.ensureRegistered(runtime);
  }

  // ============================================================================
  // Registration Management
  // ============================================================================

  /**
   * Ensure agent is registered on-chain via ERC-8004
   * Checks existing registration or creates new one if needed
   * 
   * @private
   * @param {IAgentRuntime} runtime - The agent runtime instance
   * @throws {RegistrationError} If registration process fails
   * @throws {Web3Error} If blockchain interaction fails
   * @returns {Promise<void>}
   */
  private async ensureRegistered(runtime: IAgentRuntime): Promise<void> {
    const domain = this.generateAgentDomain(runtime);
    
    logger.info(`[Web3] Checking registration for ${domain}`);

    // Check if already registered
    const result = await this.identityContract!.resolveAgentByAddress(this.wallet!.address);

    if (result.agentId_ !== 0n) {
      // Already registered
      this.agentInfo = {
        agentId: result.agentId_,
        agentAddress: this.wallet!.address,
        agentDomain: result.agentDomain_,
        isRegistered: true
      };

      logger.info(`[Web3] ✅ Already registered`);
      logger.info(`[Web3]    Agent ID: ${this.agentInfo.agentId}`);
      logger.info(`[Web3]    Domain: ${this.agentInfo.agentDomain}`);
    } else {
      // Need to register
      logger.info(`[Web3] Not registered, registering now...`);

      const tx = await this.identityContract!.newAgent(domain, this.wallet!.address);
      const receipt = await tx.wait();

      // Parse AgentRegistered event
      const event = receipt.logs
        .map((log: ethers.Log) => {
          return this.identityContract!.interface.parseLog({
            topics: log.topics as string[],
            data: log.data
          });
        })
        .find((e: ethers.LogDescription | null) => e?.name === 'AgentRegistered');

      if (!event) {
        throw new RegistrationError(
          'Registration failed - no event emitted',
          this.wallet!.address
        );
      }

      this.agentInfo = {
        agentId: event.args.agentId,
        agentAddress: this.wallet!.address,
        agentDomain: domain,
        isRegistered: true
      };

      logger.info(`[Web3] ✅ Registered successfully`);
      logger.info(`[Web3]    Agent ID: ${this.agentInfo.agentId}`);
      logger.info(`[Web3]    Domain: ${this.agentInfo.agentDomain}`);
      logger.info(`[Web3]    TX: ${receipt.hash}`);
    }
  }

  /**
   * Generate a unique agent domain for registration
   * Creates a domain in format: {character-name}-{random}.amongus8004.local
   * 
   * @private
   * @param {IAgentRuntime} runtime - The agent runtime instance
   * @returns {string} The generated agent domain
   */
  private generateAgentDomain(runtime: IAgentRuntime): string {
    const characterName = runtime.character.name.toLowerCase().replace(/\s+/g, '-');
    const randomSuffix = Math.random().toString(36).substring(7);
    return `${characterName}-${randomSuffix}.amongus8004.local`;
  }

  // ============================================================================
  // Getters
  // ============================================================================

  /**
   * Get agent information including on-chain ID and domain
   * @returns {AgentInfo | null} Agent info or null if not registered
   */
  getAgentInfo(): AgentInfo | null {
    return this.agentInfo;
  }

  /**
   * Get the wallet address
   * @returns {string} The Ethereum address of the wallet
   */
  getWalletAddress(): string {
    return this.wallet?.address || '';
  }

  /**
   * Get the agent ID as a string
   * @returns {string} The agent ID from ERC-8004 registry
   */
  getAgentId(): string {
    return this.agentInfo?.agentId.toString() || '';
  }

  /**
   * Get the agent domain
   * @returns {string} The registered agent domain
   */
  getAgentDomain(): string {
    return this.agentInfo?.agentDomain || '';
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  static async start(runtime: IAgentRuntime): Promise<Service> {
    const service = new Web3Service(runtime);
    await service.initialize(runtime);
    return service;
  }

  async stop(): Promise<void> {
    logger.info('[Web3] Shutting down');
    this.wallet = null;
    this.provider = null;
  }
}

