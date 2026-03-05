import { detectEnvironment, getDefaultBaseUrl, getUserAgent, supportsStreaming, SdkEnvironment } from '../environment';

describe('environment', () => {
  const originalProcess = globalThis.process;
  const originalEdgeRuntime = (globalThis as any).EdgeRuntime;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    // Restore all originals, handling undefined values properly
    if (originalProcess === undefined) {
      delete (globalThis as any).process;
    } else {
      globalThis.process = originalProcess;
    }
    if (originalEdgeRuntime === undefined) {
      delete (globalThis as any).EdgeRuntime;
    } else {
      (globalThis as any).EdgeRuntime = originalEdgeRuntime;
    }
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as any).document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  it('detects node environment by default', () => {
    expect(detectEnvironment()).toBe('node');
  });

  it('returns correct default base URL', () => {
    expect(getDefaultBaseUrl()).toBe('https://api.invoica.ai/v1');
  });

  it('returns user agent with SDK version and environment', () => {
    const env = detectEnvironment();
    const userAgent = getUserAgent();
    expect(userAgent).toContain('invoica-sdk/1.0.0');
    expect(userAgent).toContain(`(${env})`);
  });

  it('returns boolean for supportsStreaming', () => {
    expect(typeof supportsStreaming()).toBe('boolean');
  });

  it('detects edge environment when EdgeRuntime is present', () => {
    delete (globalThis as any).process;
    (globalThis as any).EdgeRuntime = 'edge';
    expect(detectEnvironment()).toBe('edge');
  });

  it('detects browser when window and document exist', () => {
    delete (globalThis as any).process;
    delete (globalThis as any).EdgeRuntime;
    (globalThis as any).window = {};
    (globalThis as any).document = {};
    expect(detectEnvironment()).toBe('browser');
  });

  it('detects unknown when all globals are absent', () => {
    delete (globalThis as any).process;
    delete (globalThis as any).EdgeRuntime;
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    expect(detectEnvironment()).toBe('unknown');
  });
});