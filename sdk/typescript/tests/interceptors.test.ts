import { createInterceptorManager } from '../src/interceptors';

describe('createInterceptorManager', () => {
  it('creates manager with empty arrays', () => {
    const manager = createInterceptorManager();
    expect(manager.request).toEqual([]);
    expect(manager.response).toEqual([]);
  });

  it('adds request interceptor and returns index', () => {
    const manager = createInterceptorManager();
    const fn = (config: any) => config;
    const index = manager.addRequest(fn);
    expect(index).toBe(0);
    expect(manager.request.length).toBe(1);
  });

  it('adds response interceptor and returns index', () => {
    const manager = createInterceptorManager();
    const fn = (res: any) => res;
    const index = manager.addResponse(fn);
    expect(index).toBe(0);
    expect(manager.response.length).toBe(1);
  });

  it('removes interceptor by index', () => {
    const manager = createInterceptorManager();
    manager.addRequest((config: any) => config);
    manager.removeRequest(0);
    expect(manager.request.length).toBe(0);
  });
});