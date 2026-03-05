export type SdkEnvironment = 'node' | 'browser' | 'edge' | 'unknown';

/**
 * Detects the current runtime environment
 * @returns The detected environment type
 */
export function detectEnvironment(): SdkEnvironment {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (typeof g.process !== 'undefined' && g.process?.versions?.node) {
    return 'node';
  }
  if (typeof g.EdgeRuntime === 'string') {
    return 'edge';
  }
  if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
    return 'browser';
  }
  return 'unknown';
}

/**
 * Returns the default API base URL for the SDK
 * @returns The default base URL
 */
export function getDefaultBaseUrl(): string {
  return 'https://api.invoica.ai/v1';
}

/**
 * Generates a User-Agent string based on the current environment
 * @returns The User-Agent string
 */
export function getUserAgent(): string {
  const env = detectEnvironment();
  return `invoica-sdk/1.0.0 (${env})`;
}

/**
 * Checks if the runtime environment supports the Streams API
 * @returns True if ReadableStream is available
 */
export function supportsStreaming(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof (globalThis as any).ReadableStream !== 'undefined';
}
