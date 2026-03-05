export function isSandboxKey(apiKey: string): boolean {
  return apiKey.startsWith('inv_test_');
}

export function getSandboxScenario(
  amount: number
): 'success' | 'failure' | 'delayed' | 'validation_error' {
  if (amount === 100) return 'success';
  if (amount === 999) return 'failure';
  if (amount === 500) return 'delayed';
  if (amount <= 0) return 'validation_error';
  return 'success';
}

export const SANDBOX_BASE_URL = 'https://sandbox.invoica.dev/v1';
export const SANDBOX_TEST_KEY = 'inv_test_0000000000000000000000000000dead';