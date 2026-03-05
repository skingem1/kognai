import { getLedgerConfig, setLedgerConfig, resetLedgerConfig, initLedgerConfigFromEnv } from '../config';

describe('ledger/config', () => {
  beforeEach(() => {
    resetLedgerConfig();
  });

  it('returns default values', () => {
    const config = getLedgerConfig();
    expect(config.reservationExpirySeconds).toBe(60);
    expect(config.maxRetryAttempts).toBe(3);
    expect(config.retryDelayMs).toBe(100);
  });

  it('setLedgerConfig updates partial values', () => {
    setLedgerConfig({ retryDelayMs: 200 });
    const config = getLedgerConfig();
    expect(config.retryDelayMs).toBe(200);
    expect(config.reservationExpirySeconds).toBe(60);
    expect(config.maxRetryAttempts).toBe(3);
  });

  it('resetLedgerConfig restores defaults after modification', () => {
    setLedgerConfig({ retryDelayMs: 200 });
    resetLedgerConfig();
    expect(getLedgerConfig().retryDelayMs).toBe(100);
  });

  it('getLedgerConfig returns a copy', () => {
    const config = getLedgerConfig();
    config.retryDelayMs = 999;
    expect(getLedgerConfig().retryDelayMs).toBe(100);
  });

  it('initLedgerConfigFromEnv reads env vars', () => {
    process.env.LEDGER_MAX_RETRY_ATTEMPTS = '5';
    initLedgerConfigFromEnv();
    expect(getLedgerConfig().maxRetryAttempts).toBe(5);
    delete process.env.LEDGER_MAX_RETRY_ATTEMPTS;
  });
});