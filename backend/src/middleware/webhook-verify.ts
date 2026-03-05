import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Creates an HMAC-SHA256 signature for a given payload.
 * @param payload - The string payload to sign
 * @param secret - The secret key used for signing
 * @returns The hexadecimal representation of the HMAC-SHA256 signature
 */
export function signPayload(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  return hmac.update(payload, 'utf8').digest('hex');
}

/**
 * Express middleware to verify webhook signatures using HMAC-SHA256.
 * @param secret - The secret key used for signature verification
 * @returns Express middleware function
 */
export function verifyWebhookSignature(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signatureHeader = req.headers['x-countable-signature'];

    if (!signatureHeader || Array.isArray(signatureHeader)) {
      res.status(401).json({ error: 'Invalid or missing signature header' });
      return;
    }

    const rawBody = req.body;

    if (!rawBody) {
      res.status(401).json({ error: 'Missing request body' });
      return;
    }

    // Handle both Buffer (from express.raw()) and string bodies
    const bodyString: string = Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf8')
      : typeof rawBody === 'string'
        ? rawBody
        : JSON.stringify(rawBody);

    const expectedSignature = signPayload(bodyString, secret);

    // Convert signatures to buffers for timing-safe comparison
    const signatureBuffer = Buffer.from(signatureHeader, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    // Reject if signature format is invalid (wrong length)
    if (signatureBuffer.length !== expectedBuffer.length) {
      res.status(401).json({ error: 'Invalid signature format' });
      return;
    }

    // Use timingSafeEqual to prevent timing attacks
    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  };
}