export type SemVer = { major: number; minor: number; patch: number };

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * Parse a semantic version string into a SemVer object.
 * @param version - Version string in 'X.Y.Z' or 'vX.Y.Z' format
 * @returns SemVer object or null if invalid
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(SEMVER_REGEX);
  if (!match) return null;
  return { major: +match[1], minor: +match[2], patch: +match[3] };
}

/**
 * Compare two semantic versions.
 * @param a - First version string
 * @param b - Second version string
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareSemVer(a: string, b: string): number {
  const av = parseSemVer(a), bv = parseSemVer(b);
  if (!av || !bv) return 0;
  if (av.major !== bv.major) return av.major < bv.major ? -1 : 1;
  if (av.minor !== bv.minor) return av.minor < bv.minor ? -1 : 1;
  if (av.patch !== bv.patch) return av.patch < bv.patch ? -1 : 1;
  return 0;
}

/**
 * Check if version satisfies the minimum requirement.
 * @param version - Version to check
 * @param minimum - Minimum required version
 * @returns true if version >= minimum
 */
export function satisfiesMinimum(version: string, minimum: string): boolean {
  return compareSemVer(version, minimum) >= 0;
}

/**
 * Format a SemVer object back to string 'X.Y.Z'.
 * @param ver - SemVer object
 * @returns Formatted version string
 */
export function formatSemVer(ver: SemVer): string {
  return `${ver.major}.${ver.minor}.${ver.patch}`;
}