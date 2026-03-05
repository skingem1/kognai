import { AccountType, EntryDirection, BudgetLevel, DEFAULT_LEDGER_CONFIG } from '../types';

describe('ledger/types', () => {
  it('AccountType has 5 values', () => {
    expect(Object.values(AccountType)).toEqual(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);
  });

  it('EntryDirection has DEBIT and CREDIT values', () => {
    expect(EntryDirection.DEBIT).toBe('DEBIT');
    expect(EntryDirection.CREDIT).toBe('CREDIT');
  });

  it('BudgetLevel has AGENT, TEAM, DEPARTMENT values', () => {
    expect(Object.values(BudgetLevel)).toEqual(['AGENT', 'TEAM', 'DEPARTMENT']);
  });

  it('DEFAULT_LEDGER_CONFIG.reservationExpirySeconds equals 60', () => {
    expect(DEFAULT_LEDGER_CONFIG.reservationExpirySeconds).toBe(60);
  });

  it('DEFAULT_LEDGER_CONFIG has exactly 3 keys', () => {
    expect(Object.keys(DEFAULT_LEDGER_CONFIG)).toHaveLength(3);
  });
});