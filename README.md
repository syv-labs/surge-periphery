# Surge Periphery

This repository contains the **periphery smart contracts** and utilities for the Surge AMM protocol. These contracts provide user-facing features for interacting with the core protocol, including swapping, liquidity management, quoting, and more.

## Key Contracts

- **SwapRouter**  
  Stateless router for executing token swaps across Surge pools.

- **NonfungiblePositionManager**  
  Manages liquidity positions as ERC721 NFTs, allowing users to mint, adjust, and collect fees from their positions.

- **Quoter / QuoterV2**  
  Off-chain quoting contracts to simulate swaps and estimate output/input amounts without executing on-chain transactions.

- **NonfungibleTokenPositionDescriptor**  
  Generates metadata and SVG images for position NFTs.

- **TickLens**  
  Utility for efficiently fetching tick data from pools.

- **PairFlash (example)**  
  Demonstrates flash swap logic using Surge pools.

## Libraries

Reusable libraries for path encoding, tick math, price math, safe transfers, and more are provided in `contracts/libraries/`.

## Lens Contracts

Contracts in `contracts/lens/` are **not designed to be called on-chain**. They are intended for off-chain data fetching and simulation, such as swap quoting and tick inspection.

## Deployment

Deployment of Surge Periphery contracts can be managed using the **surge-deploy** repository. This repository contains deployment scripts and configuration for deploying Surge contracts and their dependencies in a consistent and automated way.

To deploy, clone the surge-deploy repository and follow its instructions for your target network. Example steps:

```bash
git clone <surge-deploy-repo-url>
cd surge-deploy
# Follow the README for environment setup and deployment commands
```

Refer to the surge-deploy repository documentation for more advanced options and configuration.

## Testing

- Comprehensive tests are provided in the `test/` directory, covering all major contracts and features.
- Utilities for encoding paths, calculating ticks, and simulating swaps are included in `test/shared/`.

To run these tests:

```Bash
npx hardhat test
```

## Fee Tiers & Tick Spacing

The protocol supports multiple fee tiers for different pair types (e.g., 0.01%, 0.05%, 0.3%, 1%), each with its own tick spacing. See `test/shared/constants.ts` for details.

## Usage

- Deploy the periphery contracts alongside the Surge core contracts.
- Use the `SwapRouter` for swaps, `NonfungiblePositionManager` for liquidity, and `QuoterV2` for off-chain quoting.
- Refer to the example and test contracts for integration patterns.

## Development

- Contracts are written in Solidity 0.7.6 and use OpenZeppelin upgradeable patterns.
- Tests are written in TypeScript using Hardhat and Waffle.

---

**For more details, see the inline NatSpec comments in each contract and the tests in the `test/` directory.**
