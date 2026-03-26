// BrainX local embedding adapter — AMD-02 Addendum (P0-MEM1)
// Replaces OpenAI text-embedding-3-small (1536 dims) with nomic-embed-text via Ollama (768 dims)
// All embeddings are generated locally on Mac Mini M4 — zero cost, no data leaves the vault.

import * as https from 'https';
import * as http from 'http';

const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://127.0.0.1:11434'; // SEC1: loopback-only default
const EMBED_MODEL = 'nomic-embed-text';
const EMBED_DIMS  = 768;

// ── Core embedding ──────────────────────────────────────────────────────────

export async function embed(text: string): Promise<number[]> {
  const body = JSON.stringify({ model: EMBED_MODEL, input: text });

  return new Promise((resolve, reject) => {
    const url  = new URL(`${OLLAMA_BASE}/api/embed`);
    const mod  = url.protocol === 'https:' ? https : http;

    const req = (mod as typeof http).request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout:  10000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { embeddings?: number[][] };
            const vec  = json.embeddings?.[0];
            if (!vec || vec.length !== EMBED_DIMS) {
              reject(new Error(`embed: expected ${EMBED_DIMS}-dim vector, got ${vec?.length ?? 'none'}`));
            } else {
              resolve(vec);
            }
          } catch (e) {
            reject(new Error(`embed: JSON parse error — ${(e as Error).message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('embed: Ollama timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Math helpers ────────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('cosineSimilarity: dimension mismatch');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Retrieval ───────────────────────────────────────────────────────────────

export interface EmbeddedItem {
  id:        string;
  embedding: number[];
}

export interface RankedItem extends EmbeddedItem {
  similarity: number;
}

/**
 * Given a query string, rank a list of pre-embedded items by cosine similarity.
 * Returns items sorted descending, optionally limited to topK.
 */
export async function rankBySimilarity(
  query: string,
  items: EmbeddedItem[],
  topK = 5
): Promise<RankedItem[]> {
  const queryVec = await embed(query);
  return items
    .map(item => ({ ...item, similarity: cosineSimilarity(queryVec, item.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// ── Smoke test ──────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    console.log(`\n🧠 BrainX Embed Smoke Test`);
    console.log(`   Model: ${EMBED_MODEL} (${EMBED_DIMS} dims)`);
    console.log(`   Ollama: ${OLLAMA_BASE}\n`);

    try {
      const t0  = Date.now();
      const vec = await embed('The five principles bind every agent in the Kognai swarm.');
      console.log(`✅ embed() — ${vec.length} dims in ${Date.now() - t0}ms`);
      console.log(`   First 5 values: [${vec.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]\n`);

      const items: EmbeddedItem[] = [
        { id: 'a', embedding: await embed('Seek knowledge before acting') },
        { id: 'b', embedding: await embed('Protect user data and dignity') },
        { id: 'c', embedding: await embed('Benefit others through your output') },
      ];
      const ranked = await rankBySimilarity('what does it mean to act ethically?', items, 3);
      console.log('✅ rankBySimilarity() results:');
      for (const r of ranked) {
        console.log(`   [${r.id}] similarity=${r.similarity.toFixed(4)}`);
      }
      console.log('\n✅ PASS — nomic-embed-text local adapter working\n');
    } catch (err) {
      console.error('❌ FAIL:', (err as Error).message);
      console.error('   Is Ollama running? Is nomic-embed-text pulled?');
      console.error('   Run: ollama pull nomic-embed-text');
      process.exit(1);
    }
  })();
}
