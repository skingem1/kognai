import { describe, it, expect, vi } from 'vitest';
import { getTaskRoute, TaskTarget, TIMEOUT_BUDGETS, resolveRoute } from './task-router';

describe('task-router', () => {
  it('resolves route for simple task', () => {
    const target: TaskTarget = { complexity: 'simple', costTarget: 'low' };
    const route = getTaskRoute(target);
    expect(route).toHaveProperty('model');
    expect(route).toHaveProperty('timeoutBudget');
  });

  it('resolves route for complex task', () => {
    const target: TaskTarget = { complexity: 'complex', costTarget: 'high' };
    const route = getTaskRoute(target);
    expect(route.model).toBeDefined();
    expect(TIMEOUT_BUDGETS).toHaveProperty(target.complexity);
  });

  it('throws on invalid complexity', () => {
    const target = { complexity: 'invalid' as any, costTarget: 'low' };
    expect(() => getTaskRoute(target)).toThrow();
  });

  it('applies valid timeout budget', () => {
    const target: TaskTarget = { complexity: 'simple', costTarget: 'low' };
    const route = getTaskRoute(target);
    expect(route.timeoutBudget).toBeGreaterThan(0);
  });
});