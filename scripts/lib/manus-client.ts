/**
 * Manus AI API Client
 *
 * Async task-based agent API for the CMO agent.
 * Unlike MiniMax/Anthropic (synchronous chat completions),
 * Manus uses: POST task -> poll status -> get result.
 */

import * as https from 'https';

// ===== Types =====

export interface ManusConfig {
  apiKey: string;
  baseUrl: string;
  agentProfile: string;
  pollingIntervalMs: number;
  maxPollingAttempts: number;
}

export interface ManusTaskRequest {
  prompt: string;
  agentProfile?: string;
}

export interface ManusTaskResponse {
  task_id: string;
  task_title?: string;
  task_url?: string;
}

export interface ManusMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ManusOutputItem {
  id: string;
  status: string;
  role: 'user' | 'assistant';
  type: string;
  content: Array<{ type: string; text: string }>;
}

export interface ManusTaskStatus {
  id: string;
  status: 'running' | 'pending' | 'completed' | 'error';
  output?: ManusOutputItem[];      // New API format (2026+)
  messages?: ManusMessage[];       // Legacy format (kept for compat)
  error?: string;
  credit_usage?: number;
}

export interface ManusTaskResult {
  taskId: string;
  status: 'completed' | 'error' | 'timeout';
  output: string;
  durationMs: number;
  pollAttempts: number;
}

// ===== Errors =====

export class ManusApiError extends Error {
  constructor(public statusCode: number, message: string) {
    super('Manus API error (' + statusCode + '): ' + message);
    this.name = 'ManusApiError';
  }
}

export class ManusTimeoutError extends Error {
  constructor(public taskId: string, public attempts: number) {
    super('Manus task ' + taskId + ' timed out after ' + attempts + ' polling attempts');
    this.name = 'ManusTimeoutError';
  }
}

// ===== Client =====

export class ManusClient {
  private config: ManusConfig;

  constructor(config: Partial<ManusConfig>) {
    this.config = {
      apiKey: config.apiKey || process.env.MANUS_API_KEY || '',
      baseUrl: config.baseUrl || process.env.MANUS_BASE_URL || 'https://api.manus.ai/v1',
      agentProfile: config.agentProfile || process.env.MANUS_AGENT_PROFILE || 'manus-1.6',
      pollingIntervalMs: config.pollingIntervalMs || parseInt(process.env.MANUS_POLLING_INTERVAL_MS || '5000'),
      maxPollingAttempts: config.maxPollingAttempts || parseInt(process.env.MANUS_MAX_POLLING_ATTEMPTS || '120'),
    };
    if (!this.config.apiKey) {
      throw new Error('MANUS_API_KEY not set');
    }
  }

  /**
   * Create a new Manus task.
   * POST /v1/tasks
   */
  async createTask(request: ManusTaskRequest): Promise<ManusTaskResponse> {
    const body = JSON.stringify({
      prompt: request.prompt,
      agent_profile: request.agentProfile || this.config.agentProfile,
    });

    const result = await this.httpRequest('POST', '/tasks', body);
    return result as ManusTaskResponse;
  }

  /**
   * Get status and messages of a task.
   * GET /v1/tasks/{taskId}
   */
  async getTaskStatus(taskId: string): Promise<ManusTaskStatus> {
    const result = await this.httpRequest('GET', '/tasks/' + taskId);
    return result as ManusTaskStatus;
  }

  /**
   * Poll until task completes, errors, or times out.
   */
  async pollUntilComplete(taskId: string): Promise<ManusTaskResult> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.maxPollingAttempts) {
      attempts++;
      await this.sleep(this.config.pollingIntervalMs);

      try {
        const status = await this.getTaskStatus(taskId);

        if (status.status === 'completed') {
          // Support both new format (output[]) and legacy format (messages[])
          const output = status.output
            ? this.extractFromOutput(status.output)
            : this.extractOutput(status.messages || []);
          return {
            taskId,
            status: 'completed',
            output,
            durationMs: Date.now() - startTime,
            pollAttempts: attempts,
          };
        }

        if (status.status === 'error') {
          return {
            taskId,
            status: 'error',
            output: status.error || 'Task failed with no error message',
            durationMs: Date.now() - startTime,
            pollAttempts: attempts,
          };
        }

        // Still running or pending — log progress every 10 polls
        if (attempts % 10 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          console.log('  [manus] Task ' + taskId + ' still ' + status.status + ' (' + elapsed + 's, poll #' + attempts + ')');
        }
      } catch (error: any) {
        // Transient errors — retry unless it is auth
        if (error instanceof ManusApiError && error.statusCode === 401) {
          throw error;
        }
        console.log('  [manus] Poll error (attempt ' + attempts + '): ' + error.message);
      }
    }

    throw new ManusTimeoutError(taskId, attempts);
  }

  /**
   * Convenience: create task + poll until complete.
   */
  async executeTask(request: ManusTaskRequest): Promise<ManusTaskResult> {
    const task = await this.createTask(request);
    console.log('  [manus] Task created: ' + task.task_id + (task.task_url ? ' (' + task.task_url + ')' : ''));
    return this.pollUntilComplete(task.task_id);
  }

  /**
   * Extract the final assistant output from messages array.
   */
  private extractOutput(messages: ManusMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content.trim()) {
        return messages[i].content;
      }
    }
    return messages.length > 0
      ? (messages[messages.length - 1]?.content || '')
      : 'No output from Manus task';
  }

  private extractFromOutput(output: ManusOutputItem[]): string {
    // New Manus API format: output[].content[0].text
    // Strategy: concatenate ALL text from ALL output items (Manus may spread response across messages)
    const allText = output
      .flatMap(item => item.content || [])
      .filter(c => c.type === 'output_text' && c.text?.trim())
      .map(c => c.text)
      .join('\n');
    
    if (allText.trim()) return allText;
    
    // Fallback: last non-empty assistant message
    for (let i = output.length - 1; i >= 0; i--) {
      if (output[i].role === 'assistant') {
        const text = output[i].content
          ?.filter(c => c.type === 'output_text')
          ?.map(c => c.text)
          ?.join('')
          ?.trim();
        if (text) return text;
      }
    }
    return 'No output from Manus task';
  }

  /**
   * HTTP request helper for Manus API.
   * Auth: API_KEY header (Manus-specific, not Bearer).
   */
  private httpRequest(method: string, path: string, body?: string): Promise<any> {
    const url = new URL(this.config.baseUrl + path);

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'API_KEY': this.config.apiKey,
      };
      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body).toString();
      }

      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers,
      }, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new ManusApiError(
                res.statusCode,
                result.error?.message || result.message || JSON.stringify(result),
              ));
              return;
            }
            resolve(result);
          } catch {
            reject(new Error('Failed to parse Manus response: ' + data.substring(0, 500)));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Manus API request timeout (30s)'));
      });

      if (body) req.write(body);
      req.end();
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
