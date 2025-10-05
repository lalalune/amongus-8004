/**
 * ERC-8004 Registry Client
 * Handles interaction with IdentityRegistry, ReputationRegistry, and ValidationRegistry contracts
 */

import { ethers, Contract, Wallet, Provider } from 'ethers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ContractAddresses, AgentRegistration, ReputationFeedback } from '@elizagames/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class ERC8004Registry {
  private provider: Provider;
  private wallet: Wallet;
  private identityContract: Contract;
  private reputationContract: Contract;
  private validationContract: Contract;
  private addresses: ContractAddresses;

  constructor(provider: Provider, wallet: Wallet, addresses: ContractAddresses) {
    this.provider = provider;
    this.wallet = wallet;
    this.addresses = addresses;

    // Load ABIs
    const abisPath = join(__dirname, '../../../contracts/abis');
    const identityAbi = JSON.parse(readFileSync(join(abisPath, 'IdentityRegistry.json'), 'utf-8')).abi;
    const reputationAbi = JSON.parse(readFileSync(join(abisPath, 'ReputationRegistry.json'), 'utf-8')).abi;
    const validationAbi = JSON.parse(readFileSync(join(abisPath, 'ValidationRegistry.json'), 'utf-8')).abi;

    // Initialize contracts
    this.identityContract = new Contract(addresses.identityRegistry, identityAbi, wallet);
    this.reputationContract = new Contract(addresses.reputationRegistry, reputationAbi, wallet);
    this.validationContract = new Contract(addresses.validationRegistry, validationAbi, wallet);
  }

  // ============================================================================
  // Identity Registry Methods
  // ============================================================================

  async isAgentRegistered(address: string): Promise<boolean> {
    try {
      const result = await this.identityContract.resolveAgentByAddress(address);
      return result && result.agentId_ !== undefined && result.agentId_ !== 0n;
    } catch {
      return false;
    }
  }

  async getAgentIdByAddress(address: string): Promise<bigint> {
    try {
      const result = await this.identityContract.resolveAgentByAddress(address);
      return result.agentId_ || 0n;
    } catch {
      return 0n;
    }
  }

  async getAgentIdByDomain(domain: string): Promise<bigint> {
    const result = await this.identityContract.resolveAgentByDomain(domain);
    return result.agentId_;
  }

  async getAgentInfo(agentId: bigint): Promise<AgentRegistration> {
    const result = await this.identityContract.getAgent(agentId);
    const block = await this.provider.getBlockNumber();
    
    return {
      agentId: result.agentId_,
      agentDomain: result.agentDomain_,
      agentAddress: result.agentAddress_,
      blockNumber: block,
      timestamp: Date.now()
    };
  }

  async getAgentInfoByAddress(address: string): Promise<AgentRegistration> {
    const result = await this.identityContract.resolveAgentByAddress(address);
    const block = await this.provider.getBlockNumber();
    
    return {
      agentId: result.agentId_,
      agentDomain: result.agentDomain_,
      agentAddress: result.agentAddress_,
      blockNumber: block,
      timestamp: Date.now()
    };
  }

  async registerAgent(domain: string, address: string): Promise<bigint> {
    // Call static first to get the return value
    const agentId = await this.identityContract.newAgent.staticCall(domain, address);
    
    // Now execute the transaction
    const tx = await this.identityContract.newAgent(domain, address);
    await tx.wait();
    
    return agentId;
  }

  async updateAgent(agentId: bigint, newDomain?: string, newAddress?: string): Promise<boolean> {
    const tx = await this.identityContract.updateAgent(
      agentId,
      newDomain || '',
      newAddress || ethers.ZeroAddress
    );
    const receipt = await tx.wait();
    return receipt.status === 1;
  }

  // ============================================================================
  // Reputation Registry Methods
  // ============================================================================

  async authorizeFeedback(clientId: bigint, serverId: bigint): Promise<string> {
    const tx = await this.reputationContract.acceptFeedback(clientId, serverId);
    const receipt = await tx.wait();
    
    // Parse AuthFeedback event
    const event = receipt.logs
      .map((log: ethers.Log) => {
        return this.reputationContract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data
        });
      })
      .find((e: ethers.LogDescription | null) => e?.name === 'AuthFeedback');

    if (!event) {
      throw new Error('AuthFeedback event not found in transaction receipt');
    }

    return event.args.feedbackAuthId;
  }

  async submitGameFeedback(winnerId: bigint, gameMasterId: bigint): Promise<string> {
    return await this.authorizeFeedback(winnerId, gameMasterId);
  }

  // ============================================================================
  // Validation Registry Methods (Optional for v1)
  // ============================================================================

  async requestValidation(
    validatorId: bigint,
    serverId: bigint,
    dataHash: string
  ): Promise<void> {
    const tx = await this.validationContract.validationRequest(validatorId, serverId, dataHash);
    await tx.wait();
  }

  async submitValidation(dataHash: string, response: number): Promise<void> {
    if (response < 0 || response > 100) {
      throw new Error('Response must be between 0 and 100');
    }
    const tx = await this.validationContract.validationResponse(dataHash, response);
    await tx.wait();
  }

  // ============================================================================
  // Event Listening
  // ============================================================================

  onAgentRegistered(callback: (agentId: bigint, domain: string, address: string) => void) {
    this.identityContract.on('AgentRegistered', callback);
  }

  onFeedbackAuthorized(callback: (clientId: bigint, serverId: bigint, feedbackId: string) => void) {
    this.reputationContract.on('AuthFeedback', callback);
  }

  removeAllListeners() {
    this.identityContract.removeAllListeners();
    this.reputationContract.removeAllListeners();
    this.validationContract.removeAllListeners();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getContractAddresses(): ContractAddresses {
    return this.addresses;
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export async function createRegistry(
  rpcUrl: string = 'http://localhost:8545',
  privateKey?: string
): Promise<ERC8004Registry> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const pk =
    privateKey ||
    process.env.PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil default

  const wallet = new ethers.Wallet(pk, provider);

  // Load addresses
  const addressesPath = join(__dirname, '../../../contracts/addresses.json');
  const addresses: ContractAddresses = JSON.parse(readFileSync(addressesPath, 'utf-8'));

  return new ERC8004Registry(provider, wallet, addresses);
}

