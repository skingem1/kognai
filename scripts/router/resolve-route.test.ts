import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRoute } from './resolve-route';

describe('resolveRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VAULT_MODEL', undefined);
    vi.stubEnv('VAULT_OLLAMA_URL', undefined);
  });

  it('should route local to ollama with defaults', () => {
    const route = resolveRoute('local');
    expect(route.provider).toBe('ollama');
    expect(route.model).toBe('qwen3:14b');
    expect(route.endpoint).toBe('http://vault:11434');
  });

  it('should use env overrides for local', () => {
    vi.stubEnv('VAULT_MODEL', 'custom');
    vi.stubEnv('VAULT_OLLAMA_URL', 'http://custom:11434');
    const route = resolveRoute('local');
    expect(route.model).toBe('custom');
    expect(route.endpoint).toBe('http://custom:11434');
  });

  it('should route cloud-code to minimax', () => {
    const route = resolveRoute('cloud-code');
    expect(route.provider).toBe('minimax');
    expect(route.model).toBe('MiniMax-M2.5');
  });

  it('should route cloud-exec to anthropic', () => {
    const route = resolveRoute('cloud-exec');
    expect(route.provider).toBe('anthropic');
    expect(route.model).toBe('claude-sonnet-4-20250514');
  });

  it('should route cloud-post to external', () => {
    const route = resolveRoute('cloud-post');
    expect(route.provider).toBe('external');
    expect(route.model).toBe('n/a');
    expect(route.endpoint).toBe('');
  });

  it('should default unknown to cloud-code', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route = resolveRoute('unknown');
    expect(route.provider).toBe('minimax');
    expect(warnSpy).toHaveBeenCalled();
  });
});