import type { IRouter } from 'express';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('Settlement Routes', () => {
  let router: IRouter & { stack: RouteLayer[] };

  beforeAll(() => {
    const mod = require('../settlements');
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

  it('has GET /v1/settlements/:id route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/settlements/:id' && r.methods.includes('get'))).toBeDefined();
  });

  it('has GET /v1/settlements route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/settlements' && r.methods.includes('get'))).toBeDefined();
  });
});