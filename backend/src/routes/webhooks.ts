import { Router, Request, Response, NextFunction } from 'express';

const router = Router();

// POST /v1/webhooks — register a new webhook endpoint
router.post('/v1/webhooks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, events, secret } = req.body;
    if (!url || !events || !Array.isArray(events)) {
      res.status(400).json({ success: false, error: { message: 'url and events[] are required', code: 'VALIDATION_ERROR' } });
      return;
    }
    const id = `wh_${Date.now().toString(36)}`;
    const webhook = { id, url, events, secret: secret || null, active: true, createdAt: new Date().toISOString() };
    res.status(201).json({ success: true, data: webhook });
  } catch (err) { next(err); }
});

// GET /v1/webhooks — list registered webhooks
router.get('/v1/webhooks', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: [], meta: { total: 0 } });
  } catch (err) { next(err); }
});

// DELETE /v1/webhooks/:id — remove a webhook
router.delete('/v1/webhooks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { id: req.params.id as string, deleted: true } });
  } catch (err) { next(err); }
});

export default router;
