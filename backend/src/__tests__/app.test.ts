import { app } from '../app';
import type { Express } from 'express';

interface AppLayer {
  name?: string;
  route?: { path: string; methods: Record<string, boolean> };
  regexp?: RegExp;
}

describe('Express App', () => {
  it('exports an Express application', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
    expect(typeof app.use).toBe('function');
  });

  it('has middleware stack configured', () => {
    const stack = (app as unknown as { _router: { stack: AppLayer[] } })._router.stack;
    expect(Array.isArray(stack)).toBe(true);
    expect(stack.length).toBeGreaterThan(0);
  });

  it('has JSON body parser middleware', () => {
    const stack = (app as unknown as { _router: { stack: AppLayer[] } })._router.stack;
    const jsonParser = stack.find((layer) => layer.name === 'jsonParser');
    expect(jsonParser).toBeDefined();
  });

  it('has CORS middleware', () => {
    const stack = (app as unknown as { _router: { stack: AppLayer[] } })._router.stack;
    const corsMiddleware = stack.find((layer) => layer.name === 'corsMiddleware');
    expect(corsMiddleware).toBeDefined();
  });

  it('has route handlers mounted', () => {
    const stack = (app as unknown as { _router: { stack: AppLayer[] } })._router.stack;
    const routers = stack.filter((layer) => layer.name === 'router');
    expect(routers.length).toBeGreaterThanOrEqual(5);
  });
});