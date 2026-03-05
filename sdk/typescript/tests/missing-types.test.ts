import type { InvoiceUpdateInput, DeleteResponse, PaginationParams, ListResponse, ErrorResponse, WebhookEvent } from '../src/missing-types';

describe('missing-types', () => {
  it('InvoiceUpdateInput accepts partial fields', () => {
    const input: InvoiceUpdateInput = { description: 'test' };
    expect(input.description).toBe('test');
    expect(input.status).toBeUndefined();
  });

  it('DeleteResponse has required fields', () => {
    const res: DeleteResponse = { success: true, id: '123', deletedAt: '2026-01-01' };
    expect(res.success).toBe(true);
    expect(res.id).toBe('123');
  });

  it('ListResponse with PaginationParams', () => {
    const params: PaginationParams = { limit: 10, offset: 5 };
    const list: ListResponse<string> = { data: ['a'], total: 1, limit: 10, offset: 0, hasMore: false };
    expect(params.limit).toBe(10);
    expect(list.data).toEqual(['a']);
    expect(list.hasMore).toBe(false);
  });

  it('ErrorResponse and WebhookEvent', () => {
    const err: ErrorResponse = { success: false, error: { code: 'ERR', message: 'fail' } };
    expect(err.success).toBe(false);
    const event: WebhookEvent = { type: 'invoice.created', data: {}, timestamp: '2026-01-01' };
    expect(event.type).toBe('invoice.created');
  });
});