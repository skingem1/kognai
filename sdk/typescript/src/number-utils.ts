/**
 * Number Utilities - Barrel Export
 * 
 * This module re-exports all number utility functions providing a single
 * import path for all number-related operations.
 * 
 * @module number-utils
 */

// Re-export from currency-math
export { roundTo, centsToMajor, majorToCents } from './currency-math'

// Re-export from percentage
export { percentage } from './percentage'

// Re-export from comparison
export { clamp, isApproxEqual } from './comparison'