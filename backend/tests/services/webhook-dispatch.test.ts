import { dispatch } from '../../src/services/webhook/dispatch';
import { WebhookEvent, WebhookRegistration, DispatchResult } from '../../src/services/webhook/types';
import { signPayload } from '../../src/services/webhook/signature';

jest.mock('../../src/services/webhook/signature');
const mockSignPayload = signPayload as jest.MockedFunction<typeof signPayload>;

global.fetch = jest.fn() as jest.Mock;

describe('webhook dispatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('dispatches to matching registration and returns success', async () => {
    const event: WebhookEvent = { type: 'invoice.created', payload: { id: '1' } };
    const registration: WebhookRegistration = { eventType: 'invoice.created', secret: 'secret', url: 'https://example.com/webhook' };
    const registrationMap = new Map([['1', registration]]);
    
    mockSignPayload.mockReturnValue('sigsig');
    (fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const results = await dispatch(event, registrationMap);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ success: true, statusCode: 200, url: 'https://example.com/webhook', eventType: 'invoice.created' });
    expect(fetch).toHaveBeenCalledWith('https://example.com/webhook', expect.objectContaining({ method: 'POST' }));
  });

  it('returns failure result on network error', async () => {
    const event: WebhookEvent = { type: 'invoice.created', payload: { id: '1' } };
    const registration: WebhookRegistration = { eventType: 'invoice.created', secret: 'secret', url: 'https://example.com/webhook' };
    const registrationMap = new Map([['1', registration]]);
    
    mockSignPayload.mockReturnValue('sigsig');
    (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const results = await dispatch(event, registrationMap);

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Network error');
  });

  it('skips registrations with non-matching event type', async () => {
    const event: WebhookEvent = { type: 'invoice.created', payload: { id: '1' } };
    const registration: WebhookRegistration = { eventType: 'invoice.paid', secret: 'secret', url: 'https://example.com/webhook' };
    const registrationMap = new Map([['1', registration]]);

    const results = await dispatch(event, registrationMap);

    expect(results).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});