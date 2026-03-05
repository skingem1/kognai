import { jest } from '@jest/globals';

interface WebhookEvent {
  type: string;
  payload: object;
}

interface WebhookRegistration {
  url: string;
  events: string[];
}

interface WebhookRepository {
  findActive: jest.Mock<Promise<WebhookRegistration[]>, [eventType: string]>;
}

jest.mock('./signature', () => ({
  signPayload: jest.fn().mockReturnValue('mock-sig'),
}));

describe('dispatch', () => {
  let dispatch: (event: WebhookEvent, repo: WebhookRepository) => Promise<void>;
  let mockFetch: jest.Mock<typeof fetch>;

  beforeAll(async () => {
    mockFetch = jest.fn() as jest.Mock<typeof fetch>;
    (globalThis as { fetch: typeof fetch }).fetch = mockFetch;
    const module = await import('../dispatch');
    dispatch = module.dispatch;
  });

  afterAll(() => {
    jest.resetModules();
  });

  it('calls repo.findActive() with event type to get registrations', async () => {
    const mockRepo: WebhookRepository = {
      findActive: jest.fn().mockResolvedValue([]),
    };
    const event: WebhookEvent = { type: 'order.created', payload: {} };

    await dispatch(event, mockRepo);

    expect(mockRepo.findActive).toHaveBeenCalledWith('order.created');
  });

  it('sends POST to matching registration URL', async () => {
    const mockRepo: WebhookRepository = {
      findActive: jest.fn().mockResolvedValue([
        { url: 'https://example.com/webhook', events: ['order.created'] },
      ]),
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    const event: WebhookEvent = { type: 'order.created', payload: { id: '123' } };

    await dispatch(event, mockRepo);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'mock-sig',
        }),
        body: JSON.stringify(event),
      })
    );
  });
});