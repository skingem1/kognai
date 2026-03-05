/**
 * Memoize a single-argument function
 * @param fn - Function to memoize
 * @returns Memoized function
 */
export function memoize<A, R>(fn: (arg: A) => R): (arg: A) => R {
  const cache = new Map<A, R>();
  return (arg: A) => {
    if (cache.has(arg)) return cache.get(arg)!;
    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}

/**
 * Memoize with custom key generator
 * @param fn - Function to memoize
 * @param keyFn - Key generator
 * @returns Memoized function
 */
export function memoizeWith<Args extends unknown[], R>(fn: (...args: Args) => R, keyFn: (...args: Args) => string): (...args: Args) => R {
  const cache = new Map<string, R>();
  return (...args: Args) => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoize only the last call result
 * @param fn - Function to memoize
 * @returns Memoized function
 */
export function memoizeLast<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  let lastArgs: Args | undefined;
  let lastResult: R;
  return (...args: Args) => {
    if (lastArgs && args.length === lastArgs.length && args.every((a, i) => a === lastArgs![i])) return lastResult;
    lastArgs = args;
    lastResult = fn(...args);
    return lastResult;
  };
}