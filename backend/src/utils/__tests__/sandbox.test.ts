import { isSandboxKey, getSandboxScenario, SANDBOX_BASE_URL, SANDBOX_TEST_KEY } from '../sandbox';

describe('sandbox', () => {
  describe('isSandboxKey', () => {
    it('returns true for test key prefix', () => {
      expect(isSandboxKey('inv_test_abc123')).toBe(true);
    });

    it('returns false for production key', () => {
      expect(isSandboxKey('inv_live_abc123')).toBe(false);
    });
  });

  describe('getSandboxScenario', () => {
    it('returns success for amount 100', () => {
      expect(getSandboxScenario(100)).toBe('success');
    });

    it('returns failure for amount 999', () => {
      expect(getSandboxScenario(999)).toBe('failure');
    });

    it('returns delayed for amount 500', () => {
      expect(getSandboxScenario(500)).toBe('delayed');
    });

    it('returns validation_error for amount <= 0', () => {
      expect(getSandboxScenario(0)).toBe('validation_error');
      expect(getSandboxScenario(-1)).toBe('validation_error');
    });

    it('returns success for other amounts', () => {
      expect(getSandboxScenario(50)).toBe('success');
    });
  });

  describe('constants', () => {
    it('exports correct sandbox URL', () => {
      expect(SANDBOX_BASE_URL).toBe('https://sandbox.invoica.dev/v1');
    });

    it('exports correct test key', () => {
      expect(SANDBOX_TEST_KEY).toBe('inv_test_0000000000000000000000000000dead');
    });
  });
});