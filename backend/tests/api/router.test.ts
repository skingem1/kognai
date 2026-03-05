import { Router, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import express from 'express';
import { router } from '../../src/api/router';

// Mock the settlements controller
jest.mock('../../src/api/settlements', () => ({
  getSettlement: jest.fn(async (req: Request, res: Response) => {
    if (!req.params.invoiceId) {
      return res.status(400).json({ error: 'invoiceId required' });
    }
    res.json({ id: req.params.invoiceId, status: 'settled' });
  }),
  getSettlements: jest.fn(async (_req: Request, res: Response) => {
    res.json([{ id: '1' }, { id: '2' }]);
  }),
}));

describe('Router: Settlement Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(router);
  });

  it('GET /v1/settlements/:invoiceId returns settlement by invoiceId', async () => {
    const res = await request(app).get('/v1/settlements/inv-123');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('inv-123');
    expect(res.body.status).toBe('settled');
  });

  it('GET /v1/settlements returns list of settlements', async () => {
    const res = await request(app).get('/v1/settlements');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});