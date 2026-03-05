import { TaxJurisdiction, TransactionType, VatValidationStatus, INVOICE_NOTES } from '../types';

describe('tax/types', () => {
  it('TaxJurisdiction has EU, US, NONE values', () => {
    expect(TaxJurisdiction.EU).toBe('EU');
    expect(TaxJurisdiction.US).toBe('US');
    expect(TaxJurisdiction.NONE).toBe('NONE');
  });

  it('TransactionType has B2B and B2C values', () => {
    expect(TransactionType.B2B).toBe('B2B');
    expect(TransactionType.B2C).toBe('B2C');
  });

  it('VatValidationStatus has 4 values', () => {
    expect(VatValidationStatus.VALID).toBe('VALID');
    expect(VatValidationStatus.INVALID).toBe('INVALID');
    expect(VatValidationStatus.ERROR).toBe('ERROR');
    expect(VatValidationStatus.UNKNOWN).toBe('UNKNOWN');
  });

  it('INVOICE_NOTES.REVERSE_CHARGE contains Art. 196', () => {
    expect(INVOICE_NOTES.REVERSE_CHARGE).toContain('Art. 196');
  });

  it('INVOICE_NOTES has exactly 4 keys', () => {
    expect(Object.keys(INVOICE_NOTES).length).toBe(4);
  });
});