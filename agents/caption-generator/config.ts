// Phase 1 — TikTok Content Agent | Caption Generator Config

export const CAPTION_CONFIG = {
  minScore: 60,        // minimum VisionScorer score to generate caption
  defaultCount: 5,     // default number of items to caption per run
  maxHashtags: 5,      // hashtags to include per caption
  ollamaBase: process.env.OLLAMA_HOST || 'http://localhost:11434',
  model: 'qwen3:14b',
};
