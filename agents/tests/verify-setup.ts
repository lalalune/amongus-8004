#!/usr/bin/env bun

/**
 * Setup Verification Script
 * Quickly verifies that all prerequisites are met for running tests
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const checks: CheckResult[] = [];

console.log('🔍 Verifying Among Us ERC-8004 Plugin Setup...\n');

// =========================================================================
// 1. Check Environment Variables
// =========================================================================

console.log('📋 Checking environment variables...');

const requiredEnvVars = [
  'GAME_SERVER_URL',
  'RPC_URL',
  'AGENT_PRIVATE_KEY'
];

for (const envVar of requiredEnvVars) {
  const value = process.env[envVar];
  if (value) {
    checks.push({
      name: `Env: ${envVar}`,
      passed: true,
      message: `✓ Set to: ${envVar === 'AGENT_PRIVATE_KEY' ? '0x...' + value.slice(-8) : value}`
    });
  } else {
    checks.push({
      name: `Env: ${envVar}`,
      passed: false,
      message: `✗ Not set - please add to .env file`
    });
  }
}

// =========================================================================
// 2. Check Contract Deployment
// =========================================================================

console.log('\n📝 Checking contract deployment...');

const contractsPath = '../contracts/addresses.json';
const contractsAbiPath = '../contracts/abis/IdentityRegistry.json';

if (existsSync(contractsPath)) {
  const addresses = JSON.parse(readFileSync(contractsPath, 'utf-8'));
  if (addresses.identityRegistry) {
    checks.push({
      name: 'Contracts: Deployed',
      passed: true,
      message: `✓ IdentityRegistry at: ${addresses.identityRegistry}`
    });
  } else {
    checks.push({
      name: 'Contracts: Deployed',
      passed: false,
      message: '✗ Missing identityRegistry address'
    });
  }
} else {
  checks.push({
    name: 'Contracts: Deployed',
    passed: false,
    message: '✗ contracts/addresses.json not found - run deployment script'
  });
}

if (existsSync(contractsAbiPath)) {
  checks.push({
    name: 'Contracts: ABI',
    passed: true,
    message: '✓ IdentityRegistry ABI found'
  });
} else {
  checks.push({
    name: 'Contracts: ABI',
    passed: false,
    message: '✗ IdentityRegistry ABI not found'
  });
}

// =========================================================================
// 3. Check RPC Connection
// =========================================================================

console.log('\n🔗 Checking RPC connection...');

const rpcUrl = process.env.RPC_URL || 'http://localhost:8545';

await fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1
  })
})
  .then(async (res) => {
    if (res.ok) {
      const data = await res.json();
      checks.push({
        name: 'RPC: Connection',
        passed: true,
        message: `✓ Connected - Block: ${parseInt(data.result, 16)}`
      });
    } else {
      checks.push({
        name: 'RPC: Connection',
        passed: false,
        message: `✗ HTTP ${res.status} - ${res.statusText}`
      });
    }
  })
  .catch((err) => {
    checks.push({
      name: 'RPC: Connection',
      passed: false,
      message: `✗ Failed to connect - ${err.message}`
    });
  });

// =========================================================================
// 4. Check Game Server
// =========================================================================

console.log('\n🎮 Checking game server...');

const gameServerUrl = process.env.GAME_SERVER_URL || 'http://localhost:3000';

// Check server health
await fetch(`${gameServerUrl}/health`)
  .then((res) => {
    if (res.ok) {
      checks.push({
        name: 'Server: Health',
        passed: true,
        message: '✓ Server is running'
      });
    } else {
      checks.push({
        name: 'Server: Health',
        passed: false,
        message: `✗ Server returned ${res.status}`
      });
    }
  })
  .catch((err) => {
    checks.push({
      name: 'Server: Health',
      passed: false,
      message: `✗ Failed to connect - ${err.message}`
    });
  });

// Check Agent Card
await fetch(`${gameServerUrl}/.well-known/agent-card.json`)
  .then(async (res) => {
    if (res.ok) {
      const card = await res.json();
      if (card.skills && card.skills.length > 0) {
        checks.push({
          name: 'Server: Agent Card',
          passed: true,
          message: `✓ Agent Card valid - ${card.skills.length} skills`
        });
      } else {
        checks.push({
          name: 'Server: Agent Card',
          passed: false,
          message: '✗ Agent Card has no skills'
        });
      }
    } else {
      checks.push({
        name: 'Server: Agent Card',
        passed: false,
        message: `✗ Failed to fetch Agent Card - HTTP ${res.status}`
      });
    }
  })
  .catch((err) => {
    checks.push({
      name: 'Server: Agent Card',
      passed: false,
      message: `✗ Failed to connect - ${err.message}`
    });
  });

// =========================================================================
// 5. Check Dependencies
// =========================================================================

console.log('\n📦 Checking dependencies...');

const packageJsonPath = './package.json';
if (existsSync(packageJsonPath)) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const requiredDeps = ['@elizaos/core', 'ethers', 'uuid', 'zod'];
  
  let allDepsPresent = true;
  for (const dep of requiredDeps) {
    if (!pkg.dependencies[dep]) {
      allDepsPresent = false;
      break;
    }
  }
  
  if (allDepsPresent) {
    checks.push({
      name: 'Dependencies: Installed',
      passed: true,
      message: '✓ All required dependencies present'
    });
  } else {
    checks.push({
      name: 'Dependencies: Installed',
      passed: false,
      message: '✗ Missing required dependencies - run bun install'
    });
  }
} else {
  checks.push({
    name: 'Dependencies: Installed',
    passed: false,
    message: '✗ package.json not found'
  });
}

// =========================================================================
// Print Results
// =========================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 VERIFICATION RESULTS');
console.log('='.repeat(60) + '\n');

let passCount = 0;
let failCount = 0;

for (const check of checks) {
  console.log(`${check.name.padEnd(30)} ${check.message}`);
  if (check.passed) {
    passCount++;
  } else {
    failCount++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`✅ Passed: ${passCount}`);
console.log(`❌ Failed: ${failCount}`);
console.log('='.repeat(60) + '\n');

if (failCount === 0) {
  console.log('🎉 All checks passed! You can now run tests:');
  console.log('   bun run test\n');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed. Please fix the issues above before running tests.\n');
  console.log('Quick fixes:');
  console.log('1. Start Anvil: cd contracts && anvil');
  console.log('2. Deploy contracts: cd contracts && forge script script/Deploy.s.sol --broadcast');
  console.log('3. Start server: cd ../server && bun run dev');
  console.log('4. Set env vars: copy .env.example to .env and fill in values\n');
  process.exit(1);
}


