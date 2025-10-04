#!/usr/bin/env bun
/**
 * Deploy ERC-8004 contracts to local Anvil or testnet
 */

import { ethers } from 'ethers';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const CONTRACTS_DIR = join(__dirname, '../contracts');

interface DeploymentResult {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry: string;
  chainId: number;
  deployer: string;
  blockNumber: number;
  timestamp: number;
}

console.log('🚀 Starting contract deployment script...\n');

async function main() {
  console.log('📝 Deploying ERC-8004 contracts...\n');

  // Connect to local Anvil or specified RPC
  const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
  console.log(`🔌 Connecting to RPC: ${rpcUrl}`);
  
  // Fresh flag (env or CLI)
  const args = process.argv.slice(2);
  const isFresh = args.includes('--fresh') || args.includes('fresh') || process.env.FRESH === '1' || process.env.FRESH === 'true';
  
  // Check if it's local Anvil
  if (rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1')) {
    console.log(`\n⚠️  NOTE: If this hangs, make sure Anvil is running:`);
    console.log(`   Terminal 1: bun run start:anvil`);
    console.log(`   Terminal 2: bun run deploy:contracts\n`);
  }
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Test connection first
  console.log(`⏳ Testing connection...`);
  const blockNumber = await provider.getBlockNumber();
  console.log(`✅ RPC connection successful (block: ${blockNumber})`);

  // Get deployer wallet
  const privateKey =
    process.env.PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil default key

  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log(`👤 Deployer address: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    throw new Error('Deployer has no ETH! Cannot deploy contracts.');
  }
  
  const network = await provider.getNetwork();
  console.log(`📡 Network: ${network.name} (chainId: ${network.chainId})\n`);

  // Attempt to reuse an existing deployment if present and valid
  try {
    const addressesPath = join(CONTRACTS_DIR, 'addresses.json');
    if (!isFresh && existsSync(addressesPath)) {
      const cached = JSON.parse(readFileSync(addressesPath, 'utf-8')) as DeploymentResult;
      if (Number(cached.chainId) === Number(network.chainId)) {
        const [idCode, repCode, valCode] = await Promise.all([
          provider.getCode(cached.identityRegistry),
          provider.getCode(cached.reputationRegistry),
          provider.getCode(cached.validationRegistry)
        ]);
        const hasAll = idCode !== '0x' && repCode !== '0x' && valCode !== '0x';
        if (hasAll) {
          console.log('🧠 Found existing deployment on this chain. Skipping deploy.');
          console.log('Contract Addresses:');
          console.log(`  IdentityRegistry:   ${cached.identityRegistry}`);
          console.log(`  ReputationRegistry: ${cached.reputationRegistry}`);
          console.log(`  ValidationRegistry: ${cached.validationRegistry}`);
          process.exit(0);
        } else {
          console.log('⚠️  addresses.json exists but on-chain bytecode was not found for one or more contracts. Proceeding with fresh deploy...');
        }
      } else {
        console.log('ℹ️  Cached deployment found but chainId differs. Proceeding with deploy...');
      }
    }
  } catch (e) {
    console.log('ℹ️  Unable to use cached deployment, continuing with deploy...');
  }

  // Load contract ABIs and bytecode from compiled contracts
  console.log(`📂 Loading contract ABIs from: ${join(CONTRACTS_DIR, 'abis')}`);
  
  const identityPath = join(CONTRACTS_DIR, 'abis/IdentityRegistry.json');
  const reputationPath = join(CONTRACTS_DIR, 'abis/ReputationRegistry.json');
  const validationPath = join(CONTRACTS_DIR, 'abis/ValidationRegistry.json');
  
  console.log(`   Reading IdentityRegistry from: ${identityPath}`);
  const identityAbi = JSON.parse(readFileSync(identityPath, 'utf-8'));
  
  console.log(`   Reading ReputationRegistry...`);
  const reputationAbi = JSON.parse(readFileSync(reputationPath, 'utf-8'));
  
  console.log(`   Reading ValidationRegistry...`);
  const validationAbi = JSON.parse(readFileSync(validationPath, 'utf-8'));
  
  console.log(`✅ ABIs loaded successfully\n`);

  // Deploy IdentityRegistry
  console.log('📝 Deploying IdentityRegistry...');
  const IdentityRegistry = new ethers.ContractFactory(
    identityAbi.abi,
    identityAbi.bytecode.object,
    wallet
  );
  const identityRegistry = await IdentityRegistry.deploy();
  const identityTx = identityRegistry.deploymentTransaction();
  if (identityTx) {
    console.log(`   TX hash: ${identityTx.hash}`);
    await identityTx.wait();
  }
  const identityAddress = await identityRegistry.getAddress();
  console.log(`✅ IdentityRegistry deployed at: ${identityAddress}\n`);

  // Deploy ReputationRegistry
  console.log('📝 Deploying ReputationRegistry...');
  const ReputationRegistry = new ethers.ContractFactory(
    reputationAbi.abi,
    reputationAbi.bytecode.object,
    wallet
  );
  
  const reputationRegistry = await ReputationRegistry.deploy(identityAddress);
  const reputationTx = reputationRegistry.deploymentTransaction();
  if (reputationTx) {
    console.log(`   TX hash: ${reputationTx.hash}`);
    await reputationTx.wait();
  }
  const reputationAddress = await reputationRegistry.getAddress();
  console.log(`✅ ReputationRegistry deployed at: ${reputationAddress}\n`);

  // Deploy ValidationRegistry
  console.log('📝 Deploying ValidationRegistry...');
  const ValidationRegistry = new ethers.ContractFactory(
    validationAbi.abi,
    validationAbi.bytecode.object,
    wallet
  );
  const validationRegistry = await ValidationRegistry.deploy(
    identityAddress,
    86400 // 24 hours TTL
  );
  const validationTx = validationRegistry.deploymentTransaction();
  if (validationTx) {
    console.log(`   TX hash: ${validationTx.hash}`);
    await validationTx.wait();
  }
  const validationAddress = await validationRegistry.getAddress();
  console.log(`✅ ValidationRegistry deployed at: ${validationAddress}\n`);

  // Save addresses
  const deployment: DeploymentResult = {
    identityRegistry: identityAddress,
    reputationRegistry: reputationAddress,
    validationRegistry: validationAddress,
    chainId: Number(network.chainId),
    deployer: wallet.address,
    blockNumber: await provider.getBlockNumber(),
    timestamp: Date.now()
  };

  const contractsDir = CONTRACTS_DIR;
  mkdirSync(contractsDir, { recursive: true });

  // Save generic addresses.json (used by server registry client)
  writeFileSync(join(contractsDir, 'addresses.json'), JSON.stringify(deployment, null, 2));
  console.log('💾 Saved deployment to contracts/addresses.json');

  // Save environment-specific file when known
  const chainIdNum = Number(network.chainId);
  if (chainIdNum === 84532) {
    writeFileSync(join(contractsDir, 'addresses.testnet.json'), JSON.stringify(deployment, null, 2));
    console.log('💾 Saved deployment to contracts/addresses.testnet.json');
  } else if (chainIdNum === 8453) {
    writeFileSync(join(contractsDir, 'addresses.production.json'), JSON.stringify(deployment, null, 2));
    console.log('💾 Saved deployment to contracts/addresses.production.json');
  }

  console.log('✨ Deployment complete!\n');
  console.log('Contract Addresses:');
  console.log(`  IdentityRegistry:   ${identityAddress}`);
  console.log(`  ReputationRegistry: ${reputationAddress}`);
  console.log(`  ValidationRegistry: ${validationAddress}`);
  
  process.exit(0);
}

// Run main with error handling
main().catch((error) => {
  console.error('\n❌ Deployment failed:', error.message);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
});

