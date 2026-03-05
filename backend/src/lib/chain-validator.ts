import { getSupportedChains, getChain } from './chain-registry';

/**
 * Result type for chain compatibility validation
 */
export interface ChainCompatibilityResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates that a chain ID is supported and the address format is valid.
 * @param chainId - The chain identifier (e.g., 'eth-mainnet', 'solana')
 * @param address - The wallet/contract address to validate
 * @returns Result object with valid flag and optional error message
 */
export function validateChainCompatibility(
  chainId: string,
  address: string
): ChainCompatibilityResult {
  // Validate chain ID is provided
  if (!chainId || typeof chainId !== 'string') {
    return { valid: false, error: 'Chain ID is required' };
  }

  // Validate address is provided
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address is required' };
  }

  // Trim inputs
  const trimmedChainId = chainId.trim();
  const trimmedAddress = address.trim();

  // Check if chain is supported
  const supportedChains = getSupportedChains();
  if (!supportedChains.includes(trimmedChainId)) {
    return {
      valid: false,
      error: `Unsupported chain: ${trimmedChainId}. Supported: ${supportedChains.join(', ')}`
    };
  }

  // Get chain configuration
  let chainConfig;
  try {
    chainConfig = getChain(trimmedChainId);
  } catch (err) {
    // Re-throw unexpected errors rather than swallowing them
    throw new Error(`Failed to retrieve chain config for ${trimmedChainId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  if (!chainConfig) {
    return { valid: false, error: `Chain configuration not found for: ${trimmedChainId}` };
  }

  // Validate address format using chain's address pattern
  const addressPattern = chainConfig.addressPattern;
  if (addressPattern) {
    const regex = new RegExp(addressPattern);
    if (!regex.test(trimmedAddress)) {
      return {
        valid: false,
        error: `Invalid address format for chain ${trimmedChainId}. Expected pattern: ${addressPattern}`
      };
    }
  }

  return { valid: true };
}

export { getSupportedChains, getChain };