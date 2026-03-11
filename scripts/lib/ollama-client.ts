/**
 * ollama-client.ts — TypeScript client for local Ollama inference
 *
 * Calls local models on the Mac Mini vault via the Ollama REST API.
 * Ollama is always available at localhost:11434 when running.
 * No API key needed — pure local, $0 cost.
 */

import http from 'http';

const OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_TIMEOUT_MS = 600_000; // 10 min — local models can be slow

export interface OllamaOptions {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface OllamaResult {
  content: string;
  model: string;
  totalDuration: number;   // nanoseconds
  evalCount: number;       // output tokens
  promptEvalCount: number; // input tokens
}

function httpPost(path: string, body: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(OLLAMA_BASE);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || '11434', 10),
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(OLLAMA_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Ollama timeout after ${OLLAMA_TIMEOUT_MS / 1000}s — model: ${body.slice(0, 60)}`));
    });
    req.write(body);
    req.end();
  });
}

function httpGet(path: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(OLLAMA_BASE);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parseInt(parsed.port || '11434', 10),
        path,
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, data }));
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, data: '' }); });
    req.end();
  });
}

/**
 * Call a local model via Ollama. Returns the response content.
 */
export async function callOllama(opts: OllamaOptions): Promise<OllamaResult> {
  const { model, prompt, systemPrompt, maxTokens = 4096, temperature = 0.1 } = opts;

  const requestBody = JSON.stringify({
    model,
    prompt,
    system: systemPrompt,
    stream: false,
    options: {
      num_predict: maxTokens,
      temperature,
    },
  });

  const response = await httpPost('/api/generate', requestBody);

  if (response.status !== 200) {
    throw new Error(`Ollama returned ${response.status}: ${response.data.slice(0, 300)}`);
  }

  const json = JSON.parse(response.data);

  return {
    content: json.response || '',
    model: json.model || model,
    totalDuration: json.total_duration || 0,
    evalCount: json.eval_count || 0,
    promptEvalCount: json.prompt_eval_count || 0,
  };
}

/**
 * Check if Ollama is running and accessible.
 */
export async function ollamaIsAvailable(): Promise<boolean> {
  const res = await httpGet('/api/tags').catch(() => ({ status: 0, data: '' }));
  return res.status === 200;
}

/**
 * Check if a specific model is currently loaded in Ollama memory.
 */
export async function ollamaModelLoaded(model: string): Promise<boolean> {
  const res = await httpGet('/api/ps').catch(() => ({ status: 0, data: '' }));
  if (res.status !== 200) return false;
  try {
    const json = JSON.parse(res.data);
    return (json.models || []).some((m: any) => m.name === model || m.model === model);
  } catch {
    return false;
  }
}

/**
 * List all models available in Ollama.
 */
export async function ollamaListModels(): Promise<string[]> {
  const res = await httpGet('/api/tags').catch(() => ({ status: 0, data: '' }));
  if (res.status !== 200) return [];
  try {
    const json = JSON.parse(res.data);
    return (json.models || []).map((m: any) => m.name || m.model);
  } catch {
    return [];
  }
}
