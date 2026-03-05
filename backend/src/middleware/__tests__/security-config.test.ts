import { securityConfigSchema, validateSecurityConfig } from '../security';
import { ZodError } from 'zod';

describe('security/config', () => {
  it('accepts valid full config', () => {
    const config = {
      corsOrigins: ['https://example.com'],
      rateLimitWindowMs: 60000,
      rateLimitMax: 100,
      helmetEnabled: true,
    };
    expect(securityConfigSchema.parse(config)).toEqual(config);
  });

  it('accepts empty object (all optional)', () => {
    expect(securityConfigSchema.parse({})).toEqual({});
  });

  it('rejects rateLimitWindowMs below 1000', () => {
    expect(() => securityConfigSchema.parse({ rateLimitWindowMs: 500 })).toThrow(ZodError);
  });

  it('validateSecurityConfig returns parsed config for valid input', () => {
    const input = { rateLimitMax: 50 };
    expect(validateSecurityConfig(input)).toEqual(input);
  });

  it('validateSecurityConfig throws for rateLimitMax above 10000', () => {
    expect(() => validateSecurityConfig({ rateLimitMax: 50000 })).toThrow(ZodError);
  });

  it('does not export CORS_ORIGINS (module-private const)', () => {
    const module = require('../security');
    expect(module.CORS_ORIGINS).toBeUndefined();
  });
});