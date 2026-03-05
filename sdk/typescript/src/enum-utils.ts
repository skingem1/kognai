/**
 * Utilities for working with TypeScript enums and string unions.
 * @packageDocumentation
 */

/**
 * Extract values from a TypeScript enum object.
 * Filters out reverse mappings for numeric enums.
 * @param enumObj - The enum object
 * @returns Array of enum values
 */
export function enumValues<T extends Record<string, string | number>>(
  enumObj: T
): T[keyof T][] {
  return Object.values(enumObj).filter(
    (value): value is T[keyof T] =>
      !(typeof value === 'number' && value in enumObj)
  ) as T[keyof T][];
}

/**
 * Extract keys from a TypeScript enum object.
 * For numeric enums, filters out reverse-mapped number keys.
 * Returns only string keys.
 * @param enumObj - The enum object
 * @returns Array of string keys
 */
export function enumKeys<T extends Record<string, string | number>>(
  enumObj: T
): (keyof T)[] {
  return (Object.keys(enumObj) as (keyof T)[]).filter((key) => {
    const keyStr = key as string;
    const isNumericKey = /^\d+$/.test(keyStr);
    const value = enumObj[key as keyof T];
    const isReverseMapping = isNumericKey && typeof value === 'string';
    return !isReverseMapping;
  });
}

/**
 * Type guard to check if a value is a valid member of the enum.
 * @param enumObj - The enum object
 * @param value - The value to check
 * @returns True if value is a valid enum member
 */
export function isEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  const values = enumValues(enumObj);
  return values.includes(value as T[keyof T]);
}

/**
 * Convert enum to array of {label, value} for dropdown/select UIs.
 * @param enumObj - The enum object
 * @returns Array of {label, value} objects
 */
export function enumToOptions<T extends Record<string, string | number>>(
  enumObj: T
): Array<{ label: string; value: T[keyof T] }> {
  const keys = enumKeys(enumObj);
  return keys.map((key) => ({
    label: key as string,
    value: enumObj[key as keyof T],
  }));
}

/**
 * Assert that a value is a valid enum member.
 * Throws Error if value is not in the enum.
 * @param enumObj - The enum object
 * @param value - The value to assert
 * @param name - Optional name for error message
 * @throws Error if value is not a valid enum member
 */
export function assertEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown,
  name?: string
): asserts value is T[keyof T] {
  if (isEnumValue(enumObj, value)) return;
  const values = enumValues(enumObj);
  const displayName = name ?? 'value';
  const message = `Invalid ${displayName}: ${value}. Expected one of: ${values.join(', ')}`;
  throw new Error(message);
}