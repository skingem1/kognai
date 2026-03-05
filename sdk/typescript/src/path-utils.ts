/**
 * Returns the last segment of a file path.
 * @param path - The file path to extract the basename from
 * @returns The last segment of the path (filename)
 */
export function basename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

/**
 * Returns the directory portion of a file path.
 * @param path - The file path to extract the directory from
 * @returns The directory portion of the path
 */
export function dirname(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (lastSlash === -1) return '.';
  if (lastSlash === 0) return '/';
  return path.slice(0, lastSlash);
}

/**
 * Returns the file extension including the dot.
 * @param path - The file path to extract the extension from
 * @returns The file extension (including dot) or empty string
 */
export function extname(path: string): string {
  const base = basename(path);
  const lastDot = base.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return base.slice(lastDot);
}

/**
 * Joins path segments with '/' and normalizes duplicate slashes.
 * @param segments - The path segments to join
 * @returns The joined and normalized path
 */
export function join(...segments: string[]): string {
  const filtered = segments.filter(Boolean);
  return filtered.join('/').replace(/\/+/g, '/');
}