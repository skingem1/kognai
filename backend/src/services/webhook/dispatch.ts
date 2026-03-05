import { WebhookEvent, DispatchResult, WebhookRegistration, WebhookRepository } from './types';
import { signPayload } from './signature';

/**
 * Dispatch a webhook event to all matching active registrations.
 * Uses Prisma-backed WebhookRepository instead of in-memory Map.
 */
export async function dispatch(
  event: WebhookEvent,
  repo: WebhookRepository
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  const payload = JSON.stringify(event);
  const timestamp = Date.now();

  const registrations = await repo.findActive();

  for (const registration of registrations) {
    if (!registration.events.includes(event.type)) continue;

    const signature = signPayload(payload, registration.secret);

    try {
      const response = await fetch(registration.url, {
        method: 'POST',
        headers: {
          'X-Invoica-Signature': signature,
          'X-Invoica-Event': event.type,
          'X-Invoica-Timestamp': String(timestamp),
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      results.push({
        success: response.ok,
        statusCode: response.status,
        retryable: response.status >= 500,
      });
    } catch (error) {
      results.push({
        success: false,
        statusCode: 0,
        retryable: true,
      });
    }
  }

  return results;
}

/**
 * Legacy dispatch function for backward compatibility.
 * Accepts a Map<string, WebhookRegistration> (used during migration period).
 */
export async function dispatchFromMap(
  event: WebhookEvent,
  registrationMap: Map<string, WebhookRegistration>
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  const payload = JSON.stringify(event);
  const timestamp = Date.now();

  for (const [, registration] of registrationMap) {
    if (!registration.events.includes(event.type)) continue;

    const signature = signPayload(payload, registration.secret);

    try {
      const response = await fetch(registration.url, {
        method: 'POST',
        headers: {
          'X-Invoica-Signature': signature,
          'X-Invoica-Event': event.type,
          'X-Invoica-Timestamp': String(timestamp),
          'Content-Type': 'application/json',
        },
        body: payload,
      });

      results.push({
        success: response.ok,
        statusCode: response.status,
        retryable: response.status >= 500,
      });
    } catch (error) {
      results.push({
        success: false,
        statusCode: 0,
        retryable: true,
      });
    }
  }

  return results;
}
