export const version: string = '1.0.0';

export const sdkUserAgent: string = 'countable-sdk-typescript/1.0.0';

export function isCompatibleApiVersion(serverVersion: string): boolean {
  const majorVersion = parseInt(serverVersion.split('.')[0], 10);
  return majorVersion === 1;
}