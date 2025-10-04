# ERC-8004: Trustless Agents (Reference Implementation)

This is a reference implementation for [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004) - a trust layer that allows participants to discover, choose, and interact with agents across organizational boundaries without pre‑existing trust.

## Overview
This repository provides a reference implementation for all three registries as defined in the ERC-8004 specification.

The three implemented registries are:
- **Identity Registry**: Central identity management registry
- **Reputation Registry**: Feedback authorization registry
- **Validation Registry**: Work validation with time bounds

## Project Structure
```ml
src
├─ interfaces
├  ├─ IIdentityRegistry.sol
├  ├─ IReputationRegistry.sol
├  ├─ IValidationRegistry.sol
├─ libraries
├  ├─ Constants.sol
├─ IdentityRegistry.sol
├─ ReputationRegistry.sol
├─ ValidationRegistry.sol
test
├─ IdentityRegistry.t.sol
├─ ReputationRegistry.t.sol
├─ ValidationRegistry.t.sol
```
## Quick Start
### Prerequisites
[Foundry](https://getfoundry.sh/) installed

### Installation
```bash
git clone https://github.com/aadeexyz/erc-8004.git
cd erc-8004
forge install
```

### Build and Test
```bash
# Build contracts
forge build

# Test contracts
forge test
```

## Safety
This software is experimental and unaudited, and is provided on an 'as is' and 'as available' basis. We do not give any warranties and will not be liable for any loss incurred through any use of this codebase.

## License
This project is licensed under MIT license.