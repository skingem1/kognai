// Achiri — Phase 2A Conversation Handler (voice-before-memory)
// Loads personality from kognai-agents/achiri/prompt.md
// Loads config from kognai-agents/achiri/config.json
// Tier-based model selection. Sprint 113: wired to Ollama (free) + Anthropic SDK (paid).
// Sprint 122: daily message limit enforcement (messages_per_day from config).
// Sprint 123: pre-flight safety filter (T3 skill: achiri-safety).
// Sprint 128: memory context injection (T3 skill: achiri-memory).

// Sentinel prefix returned when user hits their daily limit.
// Server detects this to return structured { error: 'limit_exceeded' } response.
export const ACHIRI_LIMIT_EXCEEDED = 'ACHIRI_LIMIT_EXCEEDED:';

import { readFileSync } from 'fs';
import { join } from 'path';
import { AchiriMemoryStore } from './memory-store';
import { safetyCheck } from './safety-filter';
import { injectMemoryContext } from './memory-search';
import { extractUserProfile, buildProfileContext } from './user-profile';
import { buildSummaryContext } from './conversation-summary';
import { selectTurnsWithinBudget } from './context-window';
import { detectEmotion, getMoodHint } from './emotion-detector';
import { buildTopicHint } from './topic-suggester';
import { shouldAskFeedback, parseFeedbackRating, storeFeedback, buildFeedbackPromptHint } from './feedback-collector';
import { routeCall } from '../../scripts/lib/clawrouter-v2';

// Sprint 308: Onboarding hint for brand-new users (first message ever)
const ONBOARDING_HINT = `## First-Time User — Onboarding
This is a BRAND NEW user who has never talked to you before. Make an amazing first impression:
1. Introduce yourself warmly in Darija: you're Achiri, their AI companion from Tunisia
2. Briefly mention what you can help with (chat, advice, learning, just vibing)
3. Naturally ask their name — e.g. "Chnowa esmek?" or "Comment tu t'appelles?"
4. Keep it short, warm, and inviting — don't overwhelm them
5. Match their language (if they wrote in French, respond in French with Darija touches)
DO NOT list features like a manual. Be a friend meeting someone new, not a product tour.`;

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

  buildSystemPrompt(isNewSession: boolean = false, moodHint: string = '', topicHint: string = '', feedbackHint: string = ''): string {
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

    // Sprint 301: Inject user profile context (language preference, interests)
    // Sprint 302: Inject conversation summary (persistent facts from past sessions)
    // Sprint 305: Pass isNewSession for personalized greeting
    // Sprint 308: Onboarding hint for first-time users
    let personalBlock = '';
    if (this.memory) {
      const profile = extractUserProfile(this.userId);
      const profileCtx = buildProfileContext(profile);
      const summaryCtx = buildSummaryContext(this.userId, isNewSession);
      if (profileCtx) personalBlock += profileCtx + '\n\n';
      if (summaryCtx) personalBlock += summaryCtx + '\n\n';

      // Sprint 308: First-time user onboarding
      if (isNewSession && !summaryCtx && profile.message_count === 0) {
        personalBlock += ONBOARDING_HINT + '\n\n';
      }

      if (personalBlock) personalBlock += '---\n\n';
    }

    // Sprint 307: Inject mood hint for emotion-adaptive responses
    const moodBlock = moodHint ? moodHint + '\n\n---\n\n' : '';

    // Sprint 309: Inject topic suggestion hint for conversation stalls
    const topicBlock = topicHint ? topicHint + '\n\n---\n\n' : '';

    // Sprint 312: Inject feedback request hint
    const feedbackBlock = feedbackHint ? feedbackHint + '\n\n---\n\n' : '';

    return header + personalBlock + moodBlock + topicBlock + feedbackBlock + this.systemPromptRaw;
  }

  buildMessages(userMessage: string, history: ConversationTurn[] = [], isNewSession: boolean = false, moodHint: string = '', topicHint: string = '', feedbackHint: string = ''): ConversationTurn[] {
    return [
      { role: 'system', content: this.buildSystemPrompt(isNewSession, moodHint, topicHint, feedbackHint) },
      ...history,
      { role: 'user', content: userMessage },
    ];
  }

  clearMemory(userId?: string): void {
    this.memory?.clearHistory(userId ?? this.userId);
  }

  async chat(userMessage: string, history?: ConversationTurn[]): Promise<string> {
    // --- Daily message limit check (Sprint 122) ---
    // Bypass with ACHIRI_NO_LIMIT=1 (tests / admin use)
    if (process.env.ACHIRI_NO_LIMIT !== '1') {
      const tierCfg = this.config.tiers[this.tier] ?? this.config.tiers['free'];
      const dailyLimit: number = tierCfg.messages_per_day ?? 50;
      if (dailyLimit > 0) {
        const store = this.memory ?? new AchiriMemoryStore();
        const todayCount = store.getDailyCount(this.userId);
        if (todayCount >= dailyLimit) {
          const msg = 'Waslet el 7ed mtaa el yawm (' + dailyLimit + ' messages). 3awedha ghodwa aw bedel plan!';
          console.log('[Achiri] limit_exceeded user=' + this.userId + ' tier=' + this.tier + ' count=' + todayCount + '/' + dailyLimit);
          return ACHIRI_LIMIT_EXCEEDED + ' ' + msg;
        }
      }
    }

    // --- Sprint 312: Check if user is responding with a feedback rating ---
    const feedbackRating = parseFeedbackRating(userMessage);
    if (feedbackRating > 0) {
      storeFeedback(this.userId, feedbackRating);
      // Still process the message normally — the rating is stored silently
    }

    // --- Pre-flight safety check (Sprint 123 — T3 skill: achiri-safety) ---
    const safety = safetyCheck(userMessage);
    if (!safety.safe) {
      console.log('[Achiri] safety_block category=' + safety.category + ' user=' + this.userId);
      // Blocked messages don't count toward daily limit (zero LLM cost)
      return safety.reply ?? 'Ma njemch n3awnek fi hatha el mawdou3.';
    }

    // Load history from memory store if enabled and no override provided
    const resolvedHistory: ConversationTurn[] = history ?? (this.memory ? this.memory.loadHistory(this.userId) : []);

    // --- Memory context injection (Sprint 128 — T3 skill: achiri-memory) ---
    // Injects relevant past conversation context into the system prompt.
    let effectiveHistory = resolvedHistory;
    if (this.memory && resolvedHistory.length > 2) {
      const memCtx = injectMemoryContext(this.userId, userMessage);
      if (memCtx) {
        // Prepend memory context as a system turn before the conversation history
        effectiveHistory = [{ role: 'system', content: memCtx }, ...resolvedHistory];
      }
    }

    // Sprint 305: Detect new session (returning user, empty current history)
    const isNewSession = resolvedHistory.length === 0 && this.memory !== null;

    // Sprint 306: Smart context windowing — trim history to fit model's token budget
    const model = this.getModelConfig();
    const windowedHistory = selectTurnsWithinBudget(effectiveHistory, model.model);
    if (windowedHistory.length < effectiveHistory.length) {
      console.log('[Achiri] context_window trimmed=' + effectiveHistory.length + '→' + windowedHistory.length + ' model=' + model.model);
    }

    // Sprint 307: Emotion detection — inject mood hint into system prompt
    const emotion = detectEmotion(userMessage);
    const moodHint = getMoodHint(emotion.mood);
    if (emotion.mood !== 'neutral') {
      console.log('[Achiri] emotion=' + emotion.mood + ' confidence=' + emotion.confidence + ' signals=' + emotion.signals.join(','));
    }

    // Sprint 309: Topic suggestions for conversation stalls
    const topicProfile = this.memory ? extractUserProfile(this.userId) : null;
    const topicHint = buildTopicHint(userMessage, topicProfile);
    if (topicHint) {
      console.log('[Achiri] topic_suggestion injected for stall message');
    }

    // Sprint 312: Feedback collection — inject rating request hint every N messages
    const askFeedback = shouldAskFeedback(this.userId) && feedbackRating === 0;
    if (askFeedback) {
      console.log('[Achiri] feedback_request injected for user=' + this.userId);
    }

    const feedbackHint = askFeedback ? buildFeedbackPromptHint() : '';
    const messages = this.buildMessages(userMessage, windowedHistory, isNewSession, moodHint, topicHint, feedbackHint);
    console.log('[Achiri] chat() model=' + model.model + ' tier=' + model.tier + ' msg_len=' + userMessage.length + ' history=' + windowedHistory.length + (isNewSession ? ' NEW_SESSION' : '') + (emotion.mood !== 'neutral' ? ' mood=' + emotion.mood : '') + (topicHint ? ' TOPIC_HINT' : ''));

    // Dry-run mode for CI/tests
    if (process.env.ACHIRI_DRY_RUN === '1') {
      return JSON.stringify({ status: 'dry_run', model: model.model, provider: model.provider, tier: model.tier, message_count: messages.length, system_prompt_len: messages[0].content.length });
    }

    const systemPrompt = messages[0].content;
    const chatMessages = messages.slice(1).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    let reply: string;
    try {
      if (model.provider === 'local') {
        // Ollama chat API — Sprint 298: 30s timeout to avoid 5-min waits when Ollama is down
        const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const res = await fetch(ollamaUrl + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model.model, messages: [{ role: 'system', content: systemPrompt }, ...chatMessages], stream: false }),
            signal: controller.signal,
          });
          if (!res.ok) throw new Error('Ollama error: ' + res.status);
          const data = await res.json() as { message: { content: string } };
          reply = data.message.content;
        } finally {
          clearTimeout(timeout);
        }
      } else if (model.provider === 'anthropic') {
        const conversationText = chatMessages.map(m => (m.role === 'user' ? 'User' : 'Assistant') + ': ' + m.content).join('\n');
        const result = await routeCall({
          task_type:           'conversation',
          tier_class:          'text',
          complexity:          'apex',
          context_tokens:      1024,
          constitutional_flag: true,
          agent_id:            'achiri',
          payload:             { prompt: systemPrompt + '\n\n' + conversationText },
        });
        reply = result.content;
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

    // Increment daily counter after successful reply (Sprint 122)
    if (process.env.ACHIRI_NO_LIMIT !== '1') {
      const store = this.memory ?? new AchiriMemoryStore();
      store.incrementDailyCount(this.userId);
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
