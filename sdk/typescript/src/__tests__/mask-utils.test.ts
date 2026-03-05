import { maskEmail, maskPhone, maskCard, maskString } from '../mask-utils';

describe('mask-utils', () => {
  it('maskEmail masks middle characters', () => {
    expect(maskEmail('john.doe@gmail.com')).toBe('jo***@gmail.com');
  });

  it('maskEmail handles short local part', () => {
    expect(maskEmail('a@test.com')).toBe('a***@test.com');
  });

  it('maskPhone shows last 4 digits', () => {
    expect(maskPhone('+1234567890')).toBe('******7890');
    expect(maskPhone('5551234')).toBe('***1234');
  });

  it('maskCard shows last 4 digits', () => {
    expect(maskCard('4111111111111111')).toBe('************1111');
    expect(maskCard('1234')).toBe('1234');
  });

  it('maskString with defaults masks center', () => {
    expect(maskString('secretkey123')).toBe('se********23');
  });

  it('maskString with custom prefix/suffix', () => {
    expect(maskString('secretkey123', 2, 3)).toBe('se*******123');
    expect(maskString('ab', 3, 3)).toBe('**');
    expect(maskString('hello', 0, 0)).toBe('*****');
  });
});