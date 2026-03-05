import { describe, it, expect } from '@jest/globals';
import * as sdk from '../src/index-v2';
import { CountableClient, parseResponse, isApiError, HttpTransport } from '../src/index-v2';

describe('index-v2', () => {
  it('exports CountableClient as a function', () => {
    expect(typeof sdk.CountableClient).toBe('function');
  });

  it('exports parseResponse as a function', () => {
    expect(typeof sdk.parseResponse).toBe('function');
  });

  it('exports isApiError as a function', () => {
    expect(typeof sdk.isApiError).toBe('function');
  });

  it('exports HttpTransport as a function', () => {
    expect(typeof sdk.HttpTransport).toBe('function');
  });

  it('exports at least 15 named exports', () => {
    expect(Object.keys(sdk).length).toBeGreaterThanOrEqual(15);
  });
});