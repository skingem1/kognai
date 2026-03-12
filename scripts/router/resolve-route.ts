import { TaskTarget, TaskRoute, TIMEOUT_BUDGETS } from '../types';

export function resolveRoute(target: TaskTarget): TaskRoute {
  switch (target) {
    case 'local': {
      return {
        provider: 'ollama',
        model: process.env.VAULT_MODEL ?? 'qwen3:14b',
        endpoint: process.env.VAULT_OLLAMA_URL ?? 'http://vault:11434',
        timeoutMs: TIMEOUT_BUDGETS.local,
        target: 'local' as TaskTarget,
      };
    }
    case 'cloud-code': {
      return {
        provider: 'minimax',
        model: 'MiniMax-M2.5',
        endpoint: 'https://api.minimax.io/v1/chat/completions',
        timeoutMs: TIMEOUT_BUDGETS['cloud-code'],
        target: 'cloud-code' as TaskTarget,
      };
    }
    case 'cloud-exec': {
      return {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        endpoint: 'https://api.anthropic.com/v1/messages',
        timeoutMs: TIMEOUT_BUDGETS['cloud-exec'],
        target: 'cloud-exec' as TaskTarget,
      };
    }
    case 'cloud-post': {
      return {
        provider: 'external',
        model: 'n/a',
        endpoint: '',
        timeoutMs: TIMEOUT_BUDGETS['cloud-post'],
        target: 'cloud-post' as TaskTarget,
      };
    }
    default: {
      const exhaustiveCheck: never = target;
      console.warn(`[resolveRoute] Unhandled target type: ${exhaustiveCheck}, defaulting to cloud-code`);
      return resolveRoute('cloud-code');
    }
  }
}