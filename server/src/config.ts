/**
 * Environment-based Configuration Loader
 * Loads correct settings based on NODE_ENV (local/testnet/production)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  env: 'local' | 'testnet' | 'production';
  port: number;
  publicUrl: string;
  rpcUrl: string;
  chainId: number;
  contracts: {
    identityRegistry: string;
    reputationRegistry: string;
    validationRegistry: string;
  };
  privateKey: string;
  game: {
    minPlayers: number;
    maxPlayers: number;
    imposterRatio: number;
  };
}

function loadContractAddresses(env: string): ServerConfig['contracts'] {
  const fileName = env === 'local' ? 'addresses.json' : `addresses.${env}.json`;
  const addressesPath = join(__dirname, '../../contracts', fileName);
  
  const addresses = JSON.parse(readFileSync(addressesPath, 'utf-8'));
  
  return {
    identityRegistry: addresses.identityRegistry,
    reputationRegistry: addresses.reputationRegistry,
    validationRegistry: addresses.validationRegistry,
  };
}

export function loadConfig(): ServerConfig {
  const env = (process.env.NODE_ENV || 'local') as 'local' | 'testnet' | 'production';
  
  // Railway automatically sets PORT and provides RAILWAY_PUBLIC_DOMAIN
  const port = parseInt(process.env.PORT || '3000', 10);
  
  // Determine public URL
  let publicUrl = process.env.PUBLIC_URL;
  
  if (!publicUrl && process.env.RAILWAY_PUBLIC_DOMAIN) {
    // Railway deployment
    publicUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  } else if (!publicUrl) {
    // Default to localhost
    publicUrl = `http://localhost:${port}`;
  }
  
  // Load contract addresses based on environment
  const contracts = loadContractAddresses(env);
  
  // Network configuration
  let rpcUrl: string;
  let chainId: number;
  
  switch (env) {
    case 'testnet':
      rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';
      chainId = 84532;
      break;
    case 'production':
      rpcUrl = process.env.RPC_URL || 'https://mainnet.base.org';
      chainId = 8453;
      break;
    default: // local
      rpcUrl = process.env.RPC_URL || 'http://localhost:8545';
      chainId = 31337;
  }
  
  // Private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable not set');
  }
  
  return {
    env,
    port,
    publicUrl,
    rpcUrl,
    chainId,
    contracts,
    privateKey,
    game: {
      minPlayers: parseInt(process.env.MIN_PLAYERS || '5', 10),
      maxPlayers: parseInt(process.env.MAX_PLAYERS || '10', 10),
      imposterRatio: parseFloat(process.env.IMPOSTER_RATIO || '0.2'),
    },
  };
}

// Validation
export function validateConfig(config: ServerConfig): void {
  // Check contracts are set
  if (!config.contracts.identityRegistry || config.contracts.identityRegistry.includes('DEPLOY')) {
    throw new Error(`Contracts not deployed for ${config.env} environment. Run deployment script first.`);
  }
  
  // Check RPC is accessible (for non-local)
  if (config.env !== 'local' && !config.rpcUrl.startsWith('https://')) {
    throw new Error(`RPC URL must be HTTPS for ${config.env} environment`);
  }
  
  // Check public URL
  if (config.env !== 'local' && config.publicUrl.includes('localhost')) {
    throw new Error(`PUBLIC_URL must be publicly accessible for ${config.env} environment`);
  }
  
  console.log(`✅ Configuration validated for ${config.env} environment`);
}

