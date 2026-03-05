import {createMoney, addMoney, subtractMoney, multiplyMoney, formatMoney, isZero, isPositive, isNegative, compareMoney} from '../money';

describe('money', () => {
  it('creates money with valid input', () => { const m = createMoney(1000,'USD'); expect(m.amount).toBe(1000); expect(m.currency).toBe('USD'); });
  it('throws for non-integer', () => { expect(() => createMoney(10.5,'USD')).toThrow(); });
  it('throws for invalid currency', () => { expect(() => createMoney(100,'us')).toThrow(); });
  it('allows zero', () => { expect(createMoney(0,'USD').amount).toBe(0); });
  it('allows negative', () => { expect(createMoney(-500,'USD').amount).toBe(-500); });
  it('adds same currency', () => { expect(addMoney(createMoney(100,'USD'),createMoney(200,'USD')).amount).toBe(300); });
  it('throws different currency', () => { expect(() => addMoney(createMoney(100,'USD'),createMoney(200,'EUR'))).toThrow(); });
  it('subtracts', () => { expect(subtractMoney(createMoney(500,'USD'),createMoney(200,'USD')).amount).toBe(300); });
  it('allows negative result', () => { expect(subtractMoney(createMoney(100,'USD'),createMoney(500,'USD')).amount).toBe(-400); });
  it('multiplies', () => { expect(multiplyMoney(createMoney(100,'USD'),3).amount).toBe(300); });
  it('rounds', () => { expect(multiplyMoney(createMoney(100,'USD'),0.333).amount).toBe(33); });
  it('formats USD', () => { expect(formatMoney(createMoney(1050,'USD'))).toContain('10.50'); });
  it('formats zero', () => { expect(formatMoney(createMoney(0,'USD'))).toContain('0'); });
  it('isZero true', () => { expect(isZero(createMoney(0,'USD'))).toBe(true); });
  it('isZero false', () => { expect(isZero(createMoney(1,'USD'))).toBe(false); });
  it('isPositive', () => { expect(isPositive(createMoney(100,'USD'))).toBe(true); });
  it('isNegative', () => { expect(isNegative(createMoney(-100,'USD'))).toBe(true); });
  it('compare less', () => { expect(compareMoney(createMoney(100,'USD'),createMoney(200,'USD'))).toBe(-1); });
  it('compare equal', () => { expect(compareMoney(createMoney(100,'USD'),createMoney(100,'USD'))).toBe(0); });
  it('compare greater', () => { expect(compareMoney(createMoney(200,'USD'),createMoney(100,'USD'))).toBe(1); });
});