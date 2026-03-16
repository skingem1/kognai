// Achiri — Phase 2A Conversation Handler (voice-before-memory)
// Loads personality from kognai-agents/achiri/prompt.md
// Loads config from kognai-agents/achiri/config.json
// Tier-based model selection. Sprint 113: wired to Ollama (free) + Anthropic SDK (paid).

import { readFileSync } from 'fs';
import { join } from 'path';
import { AchiriMemoryStore } from './memory-store';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export interface AchiriConfig {
  name: string;
  voice_before_memory: boolean;
  memory_enabled: boolean;
  languages: {
    primary: string;
    secondary: string;
    fallback: string;
    code_switching: { enabled: boolean; rules: string[] };
  };
  cultural_markers: {
    tunisian_context: string[];
    avoid: string[];
  };
  personality: { tone: string; humor: string; validation_criteria: string[] };
  tiers: Record<string, { model: string; messages_per_day: number; features: string[] }>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelConfig {
  provider: string;
  model: string;
  tier: string;
}

const AGENT_DIR = join(__dirname, '..', '..', 'kognai-agents', 'achiri');

export class AchiriConversationHandler {
  private config: AchiriConfig;
  private systemPromptRaw: string;
  private tier: string;
  private userId: string;
  private memory: AchiriMemoryStore | null;

  constructor(tier: 'free' | 'tnd_basic' | 'tnd_premium' = 'free', userId: string = 'anonymous') {
    this.tier = tier;
    this.userId = userId;
    this.config = JSON.parse(readFileSync(join(AGENT_DIR, 'config.json'), 'utf8'));
    this.systemPromptRaw = readFileSync(join(AGENT_DIR, 'prompt.md'), 'utf8');
    this.memory = this.config.memory_enabled ? new AchiriMemoryStore() : null;
    console.log('[Achiri] Loaded — model: ' + this.getModelConfig().model + ', tier: ' + tier + ', memory: ' + (this.memory ? 'on' : 'off') + ', prompt: ' + this.systemPromptRaw.length + ' chars');
  }

  getModelConfig(): ModelConfig {
    const tierConfig = this.config.tiers[this.tier] ?? this.config.tiers['free'];
    const modelStr = tierConfig.model;
    const slashIdx = modelStr.indexOf('/');
    if (slashIdx === -1) return { provider: 'unknown', model: modelStr, tier: this.tier };
    return {
      provider: modelStr.slice(0, slashIdx),
      model:    modelStr.slice(slashIdx + 1),
      tier:     this.tier,
    };
  }

  buildSystemPrompt(): string {
    const ctx = this.config.cultural_markers.tunisian_context;
    const switchRules = this.config.languages.code_switching.rules;

    const header = [
      '## Cultural Context (Tunisia-specific)',
      ctx.map(c => '- ' + c).join('\n'),
      '',
      '## Code-Switching Rules',
      switchRules.map((r, i) => (i + 1) + '. ' + r).join('\n'),
      '',
      '---',
      '',
    ].join('\n');

    return header + this.systemPromptRaw;
  }

  buildMessages(userMessage: string, history: ConversationTurn[] = []): ConversationTurn[] {
    return [
      { role: 'system', content: this.buildSystemPrompt() },
      ...history,
      { role: 'user', content: userMessage },
    ];
  }

  clearMemory(userId?: string): void {
    this.memory?.clearHistory(userId ?? this.userId);
  }

  async chat(userMessage: string, history?: ConversationTurn[]): Promise<string> {
    // Load history from memory store if enabled and no override provided
    const resolvedHistory: ConversationTurn[] = history ?? (this.memory ? this.memory.loadHistory(this.userId) : []);
    const messages = this.buildMessages(userMessage, resolvedHistory);
    const model = this.getModelConfig();
    console.log('[Achiri] chat() model=' + model.model + ' tier=' + model.tier + ' msg_len=' + userMessage.length + ' history=' + resolvedHistory.length);

    // Dry-run mode for CI/tests
    if (process.env.ACHIRI_DRY_RUN === '1') {
      return JSON.stringify({ status: 'dry_run', model: model.model, provider: model.provider, tier: model.tier, message_count: messages.length, system_prompt_len: messages[0].content.length });
    }

    const systemPrompt = messages[0].content;
    const chatMessages = messages.slice(1).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let reply: string;
    try {
      if (model.provider === 'local') {
        // Ollama chat API
        const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
        const res = await fetch(ollamaUrl + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model.model, messages: [{ role: 'system', content: systemPrompt }, ...chatMessages], stream: false }),
        });
        if (!res.ok) throw new Error('Ollama error: ' + res.status);
        const data = await res.json() as { message: { content: string } };
        reply = data.message.content;
      } else if (model.provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
        const res = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: model.model, max_tokens: 1024, system: systemPrompt, messages: chatMessages }),
        });
        if (!res.ok) throw new Error('Anthropic API ' + res.status + ': ' + (await res.text()).substring(0, 80));
        const data = await res.json() as { content: Array<{ type: string; text: string }> };
        reply = data.content[0].text;
      } else {
        throw new Error('Unknown provider: ' + model.provider);
      }
    } catch (err) {
      console.error('[Achiri] chat() error:', err);
      return 'Mrigoul, ma njemtch nchouf — 3awedha marra oukhra.';
    }

    // Persist turns to memory store if enabled
    if (this.memory && !history) {
      this.memory.appendTurn(this.userId, { role: 'user', content: userMessage });
      this.memory.appendTurn(this.userId, { role: 'assistant', content: reply });
    }

    return reply;
  }
}

if (require.main === module) {
  (async () => {
    const tier = (process.env.ACHIRI_TIER ?? 'free') as 'free' | 'tnd_basic' | 'tnd_premium';
    const msg = process.argv[2] ?? 'Aslema! Chnahwelek?';
    const handler = new AchiriConversationHandler(tier);
    const response = await handler.chat(msg);
    console.log('[Achiri] Response:\n' + response);
  })().catch(err => { console.error(err); process.exit(1); });
}
