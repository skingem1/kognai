import { config } from './config';

interface MediaItem {
  id: string;
  url: string;
}

interface ScoredMediaItem extends MediaItem {
  confidence: number;
  score: number;
  status: 'success' | 'error';
}

export class VisionScorer {
  private readonly ollamaBase = process.env.OLLAMA_HOST || 'http://localhost:11434';

  async scoreThumbnails(mediaItems: MediaItem[]): Promise<ScoredMediaItem[]> {
    const results: ScoredMediaItem[] = [];
    for (const item of mediaItems) {
      results.push(await this.scoreOne(item));
    }
    return results;
  }

  private async scoreOne(item: MediaItem): Promise<ScoredMediaItem> {
    try {
      // Attempt image fetch + qwen2-vl vision scoring
      let imageBase64: string | null = null;
      try {
        const imgRes = await fetch(item.url);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          imageBase64 = Buffer.from(buf).toString('base64'); // Node.js Buffer, not FileReader
        }
      } catch { /* image fetch failed — fall through to text scoring */ }

      const score = imageBase64
        ? await this.scoreWithVision(imageBase64)
        : await this.scoreWithText(item.url);

      return { ...item, confidence: config.confidenceThreshold, score, status: 'success' as const };
    } catch (error) {
      console.error(`[VisionScorer] Failed for ${item.url}:`, (error as Error).message);
      return { ...item, confidence: 0, score: 0, status: 'error' as const };
    }
  }

  private async scoreWithVision(imageBase64: string): Promise<number> {
    const body = {
      model: 'qwen2-vl',
      prompt: 'Rate this image for TikTok visual appeal on a scale 0-100. Reply ONLY with a JSON object: {"score": <number>, "reason": "<short reason>"}',
      images: [imageBase64], // Ollama /api/generate vision format
      stream: false,
      options: { num_predict: 64, temperature: 0.1 },
    };
    return this.callOllamaAndParseScore(body);
  }

  private async scoreWithText(url: string): Promise<number> {
    const body = {
      model: 'qwen3:14b',
      prompt: `Rate the likely TikTok visual appeal of an archive media item at this URL: ${url}\nReply ONLY with a JSON object: {"score": <number 0-100>, "reason": "<short reason>"}`,
      stream: false,
      options: { num_predict: 64, temperature: 0.1 },
    };
    return this.callOllamaAndParseScore(body);
  }

  private async callOllamaAndParseScore(body: object): Promise<number> {
    const res = await fetch(`${this.ollamaBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const json = await res.json() as { response: string };
    // Extract JSON from model response (may include reasoning text)
    const match = json.response.match(/\{[\s\S]*?\}/);
    if (!match) return 50; // neutral default if no JSON found
    const parsed = JSON.parse(match[0]) as { score?: number };
    const score = typeof parsed.score === 'number' ? parsed.score : 50;
    return Math.min(100, Math.max(0, score)); // clamp to [0, 100]
  }
}

if (require.main === module) {
  (async () => {
    try {
      const scorer = new VisionScorer();
      const mediaItems = [
        { id: '1', url: 'http://example.com/1.jpg' },
        { id: '2', url: 'http://example.com/2.jpg' }
      ];
      const results = await scorer.scoreThumbnails(mediaItems);
      console.log('Scoring results:', results);
    } catch (error) {
      console.error('Main execution error:', (error as Error).message);
    }
  })();
}