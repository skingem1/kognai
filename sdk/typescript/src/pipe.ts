/** Pipe a value through a series of functions (left to right) @param value - Initial value @param fns - Functions to apply @returns Final result */
export function pipe<T>(value: T, ...fns: Array<(v: any) => any>): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}
/** Compose functions (right to left) @param fns - Functions to compose @returns Composed function */
export function compose<T>(...fns: Array<(v: any) => any>): (value: T) => any {
  return (value: T) => fns.reduceRight((acc, fn) => fn(acc), value);
}
/** Create a function that applies a series of transforms to its argument @param fns - Transform functions @returns Pipeline function */
export function pipeline<T>(...fns: Array<(v: any) => any>): (value: T) => any {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value);
}
/** Apply a function if condition is true, otherwise return value unchanged @param condition - Boolean condition @param fn - Function to apply @returns Identity or transformed value */
export function applyIf<T>(condition: boolean, fn: (v: T) => T): (value: T) => T {
  return (value: T) => (condition ? fn(value) : value);
}