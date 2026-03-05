/** Check if a value is not null or undefined @param value - Value to check @returns True if value is defined */
export function isDefined<T>(value: T | null | undefined): value is T { return value != null }
/** Check if a string is not empty (after trimming) @param value - String to check @returns True if string has content */
export function isNonEmpty(value: string): boolean { return value.trim().length > 0 }
/** Check if an array is not empty @param arr - Array to check @returns True if array has elements */
export function isNonEmptyArray<T>(arr: T[]): arr is [T, ...T[]] { return arr.length > 0 }
/** Negate a predicate function @param fn - Predicate to negate @returns Negated predicate */
export function not<T>(fn: (value: T) => boolean): (value: T) => boolean { return (value: T) => !fn(value) }
/** Combine predicates with AND logic @param fns - Predicates to combine @returns Combined predicate */
export function allOf<T>(...fns: Array<(value: T) => boolean>): (value: T) => boolean { return (value: T) => fns.every(fn => fn(value)) }
/** Combine predicates with OR logic @param fns - Predicates to combine @returns Combined predicate */
export function anyOf<T>(...fns: Array<(value: T) => boolean>): (value: T) => boolean { return (value: T) => fns.some(fn => fn(value)) }