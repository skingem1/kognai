import type { IRouter } from 'express';

interface RouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('API Key Routes', () => {
  let router: IRouter & { stack: RouteLayer[] };

  beforeAll(() => {
    const mod = require('../api-keys');
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

  it('has POST /v1/api-keys route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/api-keys' && r.methods.includes('post'))).toBeDefined();
  });

  it('has GET /v1/api-keys route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/api-keys' && r.methods.includes('get'))).toBeDefined();
  });

  it('has POST /v1/api-keys/:id/revoke route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/api-keys/:id/revoke' && r.methods.includes('post'))).toBeDefined();
  });

  it('has POST /v1/api-keys/:id/rotate route', () => {
    expect(getRoutes().find((r) => r.path === '/v1/api-keys/:id/rotate' && r.methods.includes('post'))).toBeDefined();
  });
});
