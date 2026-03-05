import {
  GetSettlementParams,
  SettlementStatus,
  WebhookEventType,
  Invoice,
  ApiResponse,
  CreateInvoiceParams,
} from '../src/types';

describe('SDK Types', () => {
  it('CreateInvoiceParams accepts valid params', () => {
    const params: CreateInvoiceParams = {
      amount: 1000,
      currency: 'USD',
      description: 'Test invoice',
      metadata: { orderId: '123' },
    };
    expect(params.amount).toBe(1000);
    expect(params.currency).toBe('USD');
  });

  it('CreateInvoiceParams allows optional fields', () => {
    const params: CreateInvoiceParams = { amount: 500, currency: 'EUR' };
    expect(params.description).toBeUndefined();
    expect(params.metadata).toBeUndefined();
  });

  it('GetSettlementParams requires invoiceId', () => {
    const params: GetSettlementParams = { invoiceId: 'inv_123' };
    expect(params.invoiceId).toBe('inv_123');
  });

  it('SettlementStatus contains all required fields', () => {
    const settlement: SettlementStatus = {
      invoiceId: 'inv_123',
      status: 'confirmed',
      txHash: '0xabc',
      chain: 'ethereum',
      confirmedAt: new Date(),
      amount: 100,
      currency: 'USDC',
    };
    expect(settlement.status).toBe('confirmed');
  });

  it('ApiResponse handles success and error cases', () => {
    const successResp: ApiResponse<Invoice> = {
      data: { id: '1', number: 'INV-001', amount: 100, currency: 'USD', status: 'pending', createdAt: new Date(), updatedAt: new Date() },
      success: true,
    };
    const errorResp: ApiResponse<Invoice> = {
      data: {} as Invoice,
      success: false,
      error: 'Not found',
    };
    expect(successResp.success).toBe(true);
    expect(errorResp.error).toBe('Not found');
  });

  it('WebhookEventType has all 6 event types', () => {
    const events: WebhookEventType[] = [
      'invoice.created',
      'invoice.settled',
      'invoice.processing',
      'invoice.completed',
      'invoice.failed',
      'settlement.created',
    ];
    expect(events).toHaveLength(6);
  });
});