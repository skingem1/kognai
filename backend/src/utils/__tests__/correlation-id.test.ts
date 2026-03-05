import { CORRELATION_HEADER, generateCorrelationId, extractCorrelationId, createContext } from '../correlation-id';

describe('correlation-id utilities', () => {
  it('should export CORRELATION_HEADER constant as x-correlation-id', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
  });

  it('should generate correlation ID matching expected format', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^cid_[a-z0-9]+_[a-f0-9]{6}$/);
  });

  it('should generate unique correlation IDs across 100 iterations', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateCorrelationId());
    }
    expect(ids.size).toBe(100);
  });

  it('should extract correlation ID from headers when present', () => {
    const existingId = 'cid_test123_abc123';
    const headers = { [CORRELATION_HEADER]: existingId };
    expect(extractCorrelationId(headers)).toBe(existingId);
  });

  it('should extract correlation ID from headers with null/undefined/non-string values', () => {
    expect(extractCorrelationId(null)).toMatch(/^cid_/);
    expect(extractCorrelationId(undefined)).toMatch(/^cid_/);
    expect(extractCorrelationId({})).toMatch(/^cid_/);
    expect(extractCorrelationId({ [CORRELATION_HEADER]: null })).toMatch(/^cid_/);
  });

  it('should create context with spanId format and uniqueness', () => {
    const ctx = createContext('cid_test_123456');
    expect(ctx.correlationId).toBe('cid_test_123456');
    expect(ctx.parentId).toBeNull();
    expect(ctx.spanId).toMatch(/^span_[a-z0-9]+_[a-f0-9]{4}$/);

    const spanIds = new Set<string>();
    for (let i = 0; i < 100; i++) {
      spanIds.add(createContext('cid_test').spanId);
    }
    expect(spanIds.size).toBe(100);
  });

  it('should create context with parentId when provided', () => {
    const ctx = createContext('cid_test_123456', 'parent_span_abc');
    expect(ctx.parentId).toBe('parent_span_abc');
  });
});