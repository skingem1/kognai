import { generateExecutionId } from './generate-execution-id';

describe('generateExecutionId', () => {
  it('generates a 64-character hex hash from sprint and task IDs', () => {
    const result = generateExecutionId('sprint-1', 'task-1');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces deterministic output for same inputs', () => {
    const result1 = generateExecutionId('sprint-1', 'task-1');
    const result2 = generateExecutionId('sprint-1', 'task-1');
    expect(result1).toBe(result2);
  });

  it('produces different output for different inputs', () => {
    const result1 = generateExecutionId('sprint-1', 'task-1');
    const result2 = generateExecutionId('sprint-1', 'task-2');
    expect(result1).not.toBe(result2);
  });

  it('throws error for empty sprintId', () => {
    expect(() => generateExecutionId('', 'task-1')).toThrow('sprintId must be a non-empty string');
  });

  it('throws error for empty taskId', () => {
    expect(() => generateExecutionId('sprint-1', '')).toThrow('taskId must be a non-empty string');
  });

  it('handles special characters in IDs', () => {
    const result = generateExecutionId('sprint@#$', 'task%^&');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});