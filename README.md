# Crowdfunding

End-to-end crowdfunding dapp for CKB. It ships three on-chain scripts (Project, Contribution, Claim), shared utilities, Jest-based simulation tests, and a Next.js front-end for interacting with deployed contracts.

## Overview

Contracts are written in TypeScript for the CKB JavaScript VM (ckb-js-vm) and compiled to bytecode with esbuild. The protocol flow:

- Project (type script): stores creator lock hash, goal amount, deadline, and script hashes for Contribution/Claim.
- Contribution (lock script): holds each backer’s funds; multiple cells can be merged before settlement.
- Claim (lock script): voucher a backer receives when donating; used to refund after deadline if the goal is missed.

Flows covered by tests:
- Launch: creator creates the Project cell.
- Contribute/merge: backers lock CKB, creator can merge Contribution cells to keep the final tx small.
- Settle success: before the deadline and goal met, all Contribution inputs pay out to the creator.
- Refund failure: after the deadline, backers unlock via Claim and pull capacity from Contribution cells.

## Project Structure

```
crowdfunding/
├── app/                        # Next.js frontend dapp
├── artifacts/
│   ├── dist/                   # Compiled contracts (.js/.bc)
│   └── deployment/             # Generated deployment metadata
├── contracts/                  # Smart contract sources
│   ├── claim/src/index.ts
│   ├── contribution/src/index.ts
│   ├── project/src/index.ts
│   └── libs/utils/             # Shared on-chain helpers
├── examples/                   # Off-chain integration examples
├── scripts/                    # Build/deploy utilities
├── shared/                     # Shared TypeScript utilities for tests/app
├── tests/                      # Contract tests and fixtures
├── docs/                       # Design notes
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json               # TypeScript configuration
├── tsconfig.base.json          # Base TypeScript settings
└── jest.config.cjs             # Jest testing configuration
```

## Quickstart

#### Prerequisites

- Node.js (v20 or later)
- pnpm package manager
- ckb-debugger

#### Installation

Install dependencies:
```bash
pnpm install
```

#### Build Contracts

Build all contracts:
```bash
pnpm run build
```

Build a specific contract:
```bash
pnpm run build:contract project
```

### Run dApp
[See as](app/README.md)

### Run Tests (simulated chain)

Run all tests:
```bash
pnpm test
```

Run tests for a specific contract:
```bash
pnpm test -- project
```

## Development

### Build Output

All contracts are built to `artifacts/dist/`:
- `artifacts/dist/{contract-name}.js` - Bundled JavaScript code
- `artifacts/dist/{contract-name}.bc` - Compiled bytecode for CKB execution

### Testing

Tests use the `ckb-testtool` framework to simulate CKB blockchain execution. Each test:
1. Sets up a mock CKB environment
2. Deploys the contract bytecode
3. Executes transactions
4. Verifies results

## Available Scripts

- `build` - Build all contracts
- `build:contract <name>` - Build a specific contract
- `test` - Run all tests
- `add-contract <name>` - Add a new contract
- `deploy` - Deploy contracts to CKB network
- `clean` - Remove all build outputs
- `format` - Format code with Prettier
- `example` - Build shared utils then run the integration samples in `examples/`
- `app:dev|app:build|app:start` - Work with the Next.js front-end in `app/`

## Deployment

Deploy your contracts to CKB networks using the built-in deploy script:

### Basic Usage

```bash
# Deploy to devnet (default)
pnpm run deploy

# Deploy to testnet
pnpm run deploy -- --network testnet

# Deploy to mainnet
pnpm run deploy -- --network mainnet
```

### Advanced Options

```bash
# Deploy with upgradable type ID
pnpm run deploy -- --network testnet --type-id

# Deploy with custom private key
pnpm run deploy -- --network testnet --privkey 0x...

# Combine multiple options
pnpm run deploy -- --network testnet --type-id --privkey 0x...
```

### Available Options

- `--network <network>` - Target network: `devnet`, `testnet`, or `mainnet` (default: `devnet`)
- `--privkey <privkey>` - Private key for deployment (default: uses offckb's deployer account)
- `--type-id` - Enable upgradable type ID for contract updates

### Deployment Artifacts

After successful deployment, artifacts are saved to `artifacts/deployment/`:
- `artifacts/deployment/scripts.json` - Contract script information
- `artifacts/deployment/<network>/<contract>/deployment.toml` - Deployment configuration
- `artifacts/deployment/<network>/<contract>/migrations/` - Migration history

## Front-end Dapp

The `app/` directory contains a Next.js interface that talks to deployed contracts. Typical loop:
```bash
pnpm app:dev     # start dev server
pnpm app:build   # production build
pnpm app:start   # serve production build
```

## Dependencies

### Core Dependencies
- `@ckb-js-std/bindings` - CKB JavaScript VM bindings
- `@ckb-js-std/core` - Core CKB JavaScript utilities

### Development Dependencies
- `ckb-testtool` - Testing framework for CKB contracts
- `esbuild` - Fast JavaScript bundler
- `jest` - JavaScript testing framework
- `typescript` - TypeScript compiler
- `ts-jest` - TypeScript support for Jest
- `prettier` - Code formatter

## Resources

- [CKB JavaScript VM Documentation](https://github.com/nervosnetwork/ckb-js-vm)
- [CKB Developer Documentation](https://docs.nervos.org/docs/script/js/js-quick-start)
- [The Little Book of ckb-js-vm ](https://nervosnetwork.github.io/ckb-js-vm/)

## License

MIT
