import { Request, Response } from 'express';
import { getDashboardStats } from '../dashboard-stats';
import { getDashboardActivity } from '../dashboard-activity';

describe('Dashboard Handlers', () => {
  let mockRes: Partial<Response>;
  let mockReq: Partial<Request>;

  beforeEach(() => {
    mockRes = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    mockReq = {};
  });

  describe('getDashboardStats', () => {
    it('returns stats with correct values', async () => {
      await getDashboardStats(mockReq as Request, mockRes as Response);
      expect(mockRes.json).toHaveBeenCalledTimes(1);
      const stats = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(stats.totalInvoices).toBe(156);
      expect(stats.pending).toBe(23);
      expect(stats.settled).toBe(128);
      expect(stats.revenue).toBe(45250.00);
      expect(stats.failedSettlements).toBe(5);
      expect(typeof stats.totalInvoices).toBe('number');
    });
  });

  describe('getDashboardActivity', () => {
    it('returns array of 4 activity items with valid structure', async () => {
      await getDashboardActivity(mockReq as Request, mockRes as Response);
      expect(mockRes.json).toHaveBeenCalledTimes(1);
      const activities = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(activities).toHaveLength(4);
      activities.forEach((item: any) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('title');
        expect(item).toHaveProperty('description');
        expect(item).toHaveProperty('status');
        expect(['success', 'pending', 'failed']).toContain(item.status);
        expect(new Date(item.timestamp).toISOString()).toBe(item.timestamp);
      });
      expect(activities[0].status).toBe('success');
      expect(activities[3].status).toBe('failed');
    });
  });
});