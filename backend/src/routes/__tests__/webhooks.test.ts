import type { IRouter } from 'express';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('Webhook Routes', () => {
  let router: IRouter & { stack: RouteLayer[] };

  beforeAll(() => {
    const mod = require('../webhooks');
    router = mod.default;
  });

  const getRoutes = () =>
    router.stack
      .filter((l): l is RouteLayer & { route: NonNullable<RouteLayer['route']> } => !!l.route)
      .map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods) }));

  it('exports an Express Router', () => {
    expect(router).toBeDefined();
    expect(router.stack).toBeDefined();
  });

  it('has POST /v1/webhooks route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/webhooks' && r.methods.includes('post'))).toBeDefined();
  });

  it('has GET /v1/webhooks route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/webhooks' && r.methods.includes('get'))).toBeDefined();
  });

  it('has DELETE /v1/webhooks/:id route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/webhooks/:id' && r.methods.includes('delete'))).toBeDefined();
  });
});