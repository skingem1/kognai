export function validateParams(params: Record<string, unknown>, required: string[]): void {
  for (const key of required) {
    if (params[key] === null || params[key] === undefined) {
      throw new Error(`Missing required parameter: ${key}`);
    }
  }
}