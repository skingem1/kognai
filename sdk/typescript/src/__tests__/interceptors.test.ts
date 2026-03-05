import { createInterceptorManager } from '../interceptors';

describe('InterceptorManager', () => {
  it('returns object with empty request and response arrays', () => {
    const manager = createInterceptorManager();
    expect(manager.request).toEqual([]);
    expect(manager.response).toEqual([]);
  });

  it('addRequest adds interceptor and returns 0-based index', () => {
    const manager = createInterceptorManager();
    const interceptor = jest.fn((req) => req);
    const index = manager.addRequest(interceptor);
    expect(index).toBe(0);
    expect(manager.request).toHaveLength(1);
    expect(manager.request[0]).toBe(interceptor);
  });

  it('addResponse adds interceptor and returns 0-based index', () => {
    const manager = createInterceptorManager();
    const interceptor = jest.fn((res) => res);
    const index = manager.addResponse(interceptor);
    expect(index).toBe(0);
    expect(manager.response).toHaveLength(1);
    expect(manager.response[0]).toBe(interceptor);
  });

  it('multiple adds return incrementing indices', () => {
    const manager = createInterceptorManager();
    const req1 = jest.fn((req) => req);
    const req2 = jest.fn((req) => req);
    expect(manager.addRequest(req1)).toBe(0);
    expect(manager.addRequest(req2)).toBe(1);
    expect(manager.addResponse(jest.fn())).toBe(0);
    expect(manager.addResponse(jest.fn())).toBe(1);
  });

  it('removeRequest removes interceptor at index', () => {
    const manager = createInterceptorManager();
    const req1 = jest.fn((req) => req);
    manager.addRequest(req1);
    manager.addRequest(jest.fn((req) => req));
    manager.removeRequest(0);
    expect(manager.request).toHaveLength(1);
    expect(manager.request[0]).not.toBe(req1);
  });

  it('removeResponse removes interceptor at index', () => {
    const manager = createInterceptorManager();
    const res1 = jest.fn((res) => res);
    manager.addResponse(res1);
    manager.addResponse(jest.fn((res) => res));
    manager.removeResponse(0);
    expect(manager.response).toHaveLength(1);
    expect(manager.response[0]).not.toBe(res1);
  });

  it('interceptors are callable functions', () => {
    const manager = createInterceptorManager();
    const reqInterceptor = jest.fn((req) => ({ ...req, headers: { ...req.headers, 'x-modified': 'true' } }));
    const resInterceptor = jest.fn((res) => ({ ...res, data: { ...res.data, modified: true } }));
    manager.addRequest(reqInterceptor);
    manager.addResponse(resInterceptor);
    const reqResult = manager.request[0]({ method: 'GET', url: '/test', headers: {} });
    const resResult = manager.response[0]({ status: 200, headers: {}, data: {} });
    expect(reqResult.headers['x-modified']).toBe('true');
    expect(resResult.data.modified).toBe(true);
  });
});