// Phase 1 — TikTok Content Agent | Step 3: Caption Generator
// Section 05 Task #6 — Uses qwen3:14b to generate TikTok captions for top-scored archive items

import { CAPTION_CONFIG } from './config';

interface ScoredMediaItem {
  id: string;
  url: string;
  confidence: number;
  score: number;
  status: 'success' | 'error';
}

export interface CaptionedItem extends ScoredMediaItem {
  caption: string;
  hashtags: string[];
}

export class CaptionGenerator {
  private ollamaBase = CAPTION_CONFIG.ollamaBase;
  private model = CAPTION_CONFIG.model;

  async generateCaptions(items: ScoredMediaItem[], count?: number): Promise<CaptionedItem[]> {
    const eligible = items
      .filter(i => i.status === 'success' && i.score >= CAPTION_CONFIG.minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, count ?? CAPTION_CONFIG.defaultCount);

    const results: CaptionedItem[] = [];
    for (const item of eligible) {
      results.push(await this.captionOne(item));
    }
    return results;
  }

  private async captionOne(item: ScoredMediaItem): Promise<CaptionedItem> {
    try {
      const prompt = `You are a TikTok content strategist for viral archive media.
Generate a TikTok caption for this archive media item (visual appeal score: ${item.score}/100).
URL: ${item.url}
Reply ONLY with a JSON object:
{"caption": "<hook line, max 150 chars>", "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]}
Rules:
- Start caption with a hook (question, bold statement, or nostalgia trigger)
- Keep caption under 150 characters
- Include exactly 5 hashtags without # prefix
- Mix trending tags (fyp, viral) with niche archive tags`;

      const res = await fetch(`${this.ollamaBase}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: { num_predict: 200, temperature: 0.7 },
        }),
      });

      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const json = await res.json() as { response: string };
      const match = json.response.match(/\{[\s\S]*?\}/);
      if (!match) throw new Error('No JSON in response');
      const parsed = JSON.parse(match[0]) as { caption?: string; hashtags?: string[] };

      return {
        ...item,
        caption: parsed.caption ?? 'Archive gem from another era 🎞️',
        hashtags: parsed.hashtags ?? ['fyp', 'viral', 'archive', 'nostalgia', 'throwback'],
      };
    } catch (error) {
      console.error(`[CaptionGenerator] Failed for ${item.url}:`, (error as Error).message);
      return {
        ...item,
        caption: 'Archive gem discovered 🎞️',
        hashtags: ['fyp', 'viral', 'archive', 'throwback', 'nostalgia'],
      };
    }
  }
}

if (require.main === module) {
  (async () => {
    const gen = new CaptionGenerator();
    const items = [{ id: '1', url: 'http://example.com/test.jpg', confidence: 0.8, score: 75, status: 'success' as const }];
    const captions = await gen.generateCaptions(items);
    console.log(JSON.stringify(captions, null, 2));
  })();
}
