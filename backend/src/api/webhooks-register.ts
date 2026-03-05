import { Request, Response } from 'express';
import { z } from 'zod';
import { register } from '../services/webhook/types';

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(16),
});

export async function registerWebhook(req: Request, res: Response): Promise<void> {
  const parseResult = webhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.flatten() });
    return;
  }
  const { url, events, secret } = parseResult.data;
  const registration = await register(url, events, secret);
  res.status(201).json(registration);
}