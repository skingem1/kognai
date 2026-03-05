import { Router, Request, Response, NextFunction } from 'express';

describe('Invoice Routes', () => {
  let routeModule: { default: ReturnType<typeof Router> };
  let routes: Array<{ path: string; methods: string[] }>;

  beforeAll(() => {
    routeModule = require('../invoices');
    const router = routeModule.default;
    routes = router.stack
      .filter((layer: { route?: unknown }) => layer.route)
      .map((layer: { route: { path: string; methods: Record<string, boolean> } }) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));
  });

  it('exports an Express Router', () => {
    expect(routeModule.default).toBeDefined();
    expect(routeModule.default).toBeInstanceOf(Function);
    expect(Array.isArray(routeModule.default.stack)).toBe(true);
  });

  it('has POST /v1/invoices route', () => {
    const postRoute = routes.find(
      (r: { path: string; methods: string[] }) => r.path === '/v1/invoices' && r.methods.includes('post')
    );
    expect(postRoute).toBeDefined();
  });

  it('has GET /v1/invoices/:id route', () => {
    const getRoute = routes.find(
      (r: { path: string; methods: string[] }) => r.path === '/v1/invoices/:id' && r.methods.includes('get')
    );
    expect(getRoute).toBeDefined();
  });

  it('has GET /v1/invoices/number/:number route', () => {
    const getRoute = routes.find(
      (r: { path: string; methods: string[] }) => r.path === '/v1/invoices/number/:number' && r.methods.includes('get')
    );
    expect(getRoute).toBeDefined();
  });
});