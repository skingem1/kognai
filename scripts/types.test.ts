import { TaskTarget, TIMEOUT_BUDGETS, TaskRoute, RoutingLogEntry, ModelProvider } from './types';

describe('Task Router Types', () => {
  describe('TaskTarget', () => {
    it('should accept all valid target values', () => {
      const targets: TaskTarget[] = ['local', 'cloud-code', 'cloud-exec', 'cloud-post'];
      expect(targets).toHaveLength(4);
    });

    it('should reject invalid target values', () => {
      const invalid = 'invalid' as TaskTarget;
      expect(TIMEOUT_BUDGETS[invalid]).toBeUndefined();
    });
  });

  describe('TIMEOUT_BUDGETS', () => {
    it('should have correct timeout for local', () => {
      expect(TIMEOUT_BUDGETS.local).toBe(600000);
    });

    it('should have correct timeout for cloud-post', () => {
      expect(TIMEOUT_BUDGETS['cloud-post']).toBe(30000);
    });
  });

  describe('TaskRoute', () => {
    it('should create valid task route', () => {
      const route: TaskRoute = {
        provider: 'ollama',
        model: 'qwen3:8b',
        endpoint: 'http://localhost:11434',
        timeoutMs: 600000,
        target: 'local',
      };
      expect(route.provider).toBe('ollama');
      expect(route.target).toBe('local');
    });
  });

  describe('RoutingLogEntry', () => {
    it('should create minimal log entry', () => {
      const entry: RoutingLogEntry = {
        execution_id: 'exec-1',
        sprint_id: 'sprint-1',
        task_id: 'task-1',
        task_target: 'local',
        provider: 'ollama',
        model: 'qwen3:8b',
        queued_at: '2024-01-01T00:00:00Z',
        execution_source: 'router',
      };
      expect(entry.execution_id).toBeDefined();
    });

    it('should handle optional error field', () => {
      const entry: RoutingLogEntry = {
        execution_id: 'exec-2',
        sprint_id: 'sprint-1',
        task_id: 'task-2',
        task_target: 'cloud-code',
        provider: 'minimax',
        model: 'abab6.5s',
        queued_at: '2024-01-01T00:00:00Z',
        execution_source: 'router',
        error: 'timeout',
      };
      expect(entry.error).toBe('timeout');
    });
  });
});