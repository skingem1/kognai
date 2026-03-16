// Achiri — Phase 2A Conversation Handler (voice-before-memory)
// Loads personality from kognai-agents/achiri/prompt.md
// Loads config from kognai-agents/achiri/config.json
// Tier-based model selection. No LLM API calls yet (placeholder).
// Sprint 113+ will wire to actual model routing.

import { readFileSync } from 'fs';
import { join } from 'path';

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

  constructor(tier: 'free' | 'tnd_basic' | 'tnd_premium' = 'free') {
    this.tier = tier;
    this.config = JSON.parse(readFileSync(join(AGENT_DIR, 'config.json'), 'utf8'));
    this.systemPromptRaw = readFileSync(join(AGENT_DIR, 'prompt.md'), 'utf8');
    console.log('[Achiri] Loaded — model: ' + this.getModelConfig().model + ', tier: ' + tier + ', prompt: ' + this.systemPromptRaw.length + ' chars');
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

  async chat(userMessage: string, history: ConversationTurn[] = []): Promise<string> {
    // Placeholder — Sprint 113+ will route to actual LLM API
    const messages = this.buildMessages(userMessage, history);
    const model = this.getModelConfig();
    const result = {
      status:             'placeholder',
      model:              model.model,
      provider:           model.provider,
      tier:               model.tier,
      message_count:      messages.length,
      system_prompt_len:  messages[0].content.length,
      user_message:       userMessage,
      note:               'Sprint 113+ will wire to actual LLM. Voice wiring validated.',
    };
    return JSON.stringify(result, null, 2);
  }
}

if (require.main === module) {
  (async () => {
    const tier = (process.env.ACHIRI_TIER ?? 'free') as 'free' | 'tnd_basic' | 'tnd_premium';
    const handler = new AchiriConversationHandler(tier);
    const response = await handler.chat('Aslema! Chnahwelek?');
    console.log('[Achiri] Response:\n' + response);
  })().catch(err => { console.error(err); process.exit(1); });
}
