import { createHmac } from 'crypto';
import { constructEvent, WebhookVerificationError, WebhookEvent } from '../src/webhook-verify';

describe('webhook-verify', () => {
  const secret = 'test-webhook-secret';
  const validPayload = JSON.stringify({
    id: 'evt_123456',
    type: 'invoice.paid',
    data: { invoiceId: 'inv_789', amount: 1000 },
    timestamp: '2024-01-15T10:30:00Z',
    signature: '',
  });

  const generateSignature = (payload: string): string => {
    return createHmac('sha256', secret).update(payload).digest('hex');
  };

  describe('constructEvent', () => {
    it('should return valid WebhookEvent for correct signature', () => {
      const payloadWithEmptySig = JSON.stringify({
        id: 'evt_123456',
        type: 'invoice.paid',
        data: { invoiceId: 'inv_789', amount: 1000 },
        timestamp: '2024-01-15T10:30:00Z',
        signature: '',
      });
      const signature = generateSignature(payloadWithEmptySig);

      const result = constructEvent(payloadWithEmptySig, signature, secret);

      expect(result).toEqual({
        id: 'evt_123456',
        type: 'invoice.paid',
        data: { invoiceId: 'inv_789', amount: 1000 },
        timestamp: '2024-01-15T10:30:00Z',
        signature: '',
      });
    });

    it('should throw WebhookVerificationError for invalid signature', () => {
      const invalidSignature = 'invalid-signature-1234567890abcdef';

      expect(() => constructEvent(validPayload, invalidSignature, secret)).toThrow(
        WebhookVerificationError
      );
    });

    it('should throw WebhookVerificationError for tampered payload', () => {
      const originalPayload = JSON.stringify({
        id: 'evt_123456',
        type: 'invoice.paid',
        data: { invoiceId: 'inv_789', amount: 1000 },
        timestamp: '2024-01-15T10:30:00Z',
        signature: '',
      });
      const signature = generateSignature(originalPayload);

      const tamperedPayload = JSON.stringify({
        id: 'evt_123456',
        type: 'invoice.paid',
        data: { invoiceId: 'inv_789', amount: 999999 },
        timestamp: '2024-01-15T10:30:00Z',
        signature: '',
      });

      expect(() => constructEvent(tamperedPayload, signature, secret)).toThrow(
        WebhookVerificationError
      );
    });

    it('should throw WebhookVerificationError for wrong secret', () => {
      const signature = generateSignature(validPayload);
      const wrongSecret = 'wrong-secret';

      expect(() => constructEvent(validPayload, signature, wrongSecret)).toThrow(
        WebhookVerificationError
      );
    });

    it('should throw WebhookVerificationError for malformed JSON payload', () => {
      const malformedPayload = 'not-valid-json';
      const signature = generateSignature(malformedPayload);

      expect(() => constructEvent(malformedPayload, signature, secret)).toThrow();
    });

    it('should handle all valid event types', () => {
      const eventTypes = [
        'invoice.created',
        'invoice.paid',
        'settlement.completed',
        'settlement.failed',
        'apikey.revoked',
      ] as const;

      for (const type of eventTypes) {
        const payload = JSON.stringify({
          id: `evt_${type}`,
          type,
          data: {},
          timestamp: '2024-01-15T10:30:00Z',
          signature: '',
        });
        const signature = generateSignature(payload);

        const result = constructEvent(payload, signature, secret);
        expect(result.type).toBe(type);
      }
    });

    it('should handle payload with complex nested data', () => {
      const complexPayload = JSON.stringify({
        id: 'evt_complex',
        type: 'invoice.created',
        data: {
          customer: { name: 'Test User', email: 'test@example.com' },
          items: [
            { name: 'Item 1', price: 100, quantity: 2 },
            { name: 'Item 2', price: 50, quantity: 1 },
          ],
          metadata: { source: 'api', version: '1.0' },
        },
        timestamp: '2024-01-15T10:30:00Z',
        signature: '',
      });
      const signature = generateSignature(complexPayload);

      const result = constructEvent(complexPayload, signature, secret);

      expect(result.data).toEqual({
        customer: { name: 'Test User', email: 'test@example.com' },
        items: [
          { name: 'Item 1', price: 100, quantity: 2 },
          { name: 'Item 2', price: 50, quantity: 1 },
        ],
        metadata: { source: 'api', version: '1.0' },
      });
    });
  });

  describe('WebhookVerificationError', () => {
    it('should have correct name property', () => {
      const error = new WebhookVerificationError('Test error');
      expect(error.name).toBe('WebhookVerificationError');
    });

    it('should be instanceof Error', () => {
      const error = new WebhookVerificationError('Test error');
      expect(error).toBeInstanceOf(Error);
    });

    it('should preserve error message', () => {
      const message = 'Invalid webhook signature';
      const error = new WebhookVerificationError(message);
      expect(error.message).toBe(message);
    });
  });

  describe('WebhookEvent interface', () => {
    it('should accept valid WebhookEvent structure', () => {
      const event: WebhookEvent = {
        id: 'evt_test',
        type: 'invoice.created',
        data: { key: 'value' },
        timestamp: '2024-01-15T10:30:00Z',
        signature: 'abc123',
      };

      expect(event.id).toBe('evt_test');
      expect(event.type).toBe('invoice.created');
    });
  });
});
