import express from 'express';
import router from '../recent-activity';

describe('recent-activity router', () => {
  const mockRes = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis()
  };

  const getHandler = () => {
    const layer = router.stack.find((l: any) => l.route?.path === '/');
    return layer.route.stack[0].handle;
  };

  it('returns array of 5 activity items', () => {
    const handler = getHandler();
    handler({} as express.Request, mockRes as express.Response);
    const activities = mockRes.json.mock.calls[0][0];
    expect(activities).toHaveLength(5);
  });

  it('each item has id, title, description, status, timestamp', () => {
    const handler = getHandler();
    handler({} as express.Request, mockRes as express.Response);
    const activities = mockRes.json.mock.calls[0][0];
    activities.forEach((item: any) => {
      expect(item).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        status: expect.any(String),
        timestamp: expect.any(String)
      });
    });
  });

  it('first item has id act_1 and status success', () => {
    const handler = getHandler();
    handler({} as express.Request, mockRes as express.Response);
    const activities = mockRes.json.mock.calls[0][0];
    expect(activities[0]).toMatchObject({ id: 'act_1', status: 'success' });
  });

  it('contains pending and failed status items', () => {
    const handler = getHandler();
    handler({} as express.Request, mockRes as express.Response);
    const activities = mockRes.json.mock.calls[0][0];
    const statuses = activities.map((a: any) => a.status);
    expect(statuses).toContain('pending');
    expect(statuses).toContain('failed');
  });

  it('last item has id act_5', () => {
    const handler = getHandler();
    handler({} as express.Request, mockRes as express.Response);
    const activities = mockRes.json.mock.calls[0][0];
    expect(activities[4].id).toBe('act_5');
  });

  it('router is an Express Router with stack', () => {
    expect(router).toHaveProperty('stack');
    expect(Array.isArray(router.stack)).toBe(true);
  });
});