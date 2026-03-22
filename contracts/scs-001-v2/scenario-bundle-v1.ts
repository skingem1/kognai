/**
 * ScenarioBundle v1 — SCS-001 v2 Pipeline Contract
 * Sprint 786 (SCS-001-V2-001)
 *
 * Producer: Scorsese Agent (T3 APEX Claude Sonnet)
 * Consumers: MovieEditor Agent, ArtDirector Agent
 *
 * A ScenarioBundle is the v2 replacement for ScriptBundle.
 * Key differences from v1:
 *   - Scenes instead of segments (more cinematic)
 *   - Emotional arc tracking
 *   - Hook test is constitutional: must prove 10M+ view format
 *   - Visual style system instead of generic directives
 *   - Music cue integration
 */

// ─── Input: TrendSignal (what Scorsese receives) ─────────────────────

export interface TrendSignal {
  topic_id: string;
  topic_name: string;
  confidence_score: number;         // 0-100
  keyword_cluster: string[];
  top_speakers?: Array<{
    name: string;
    handle?: string;
    authority_score?: number;
  }>;
  domain_tags: string[];
  provenance_source?: string;       // where the trend was detected
  viral_examples?: string[];        // URLs of viral videos on this topic
}

// ─── Output: ScenarioBundle (what Scorsese produces) ──────────────────

export type VisualStyle =
  | 'kinetic_text'      // fast text animations (most viral)
  | 'split_screen'      // side-by-side comparison
  | 'react_cam'         // avatar reacting to content
  | 'b_roll_montage'    // stock footage + voice
  | 'screen_recording'  // showing an app/website
  | 'meme_template'     // meme-style with text overlay
  | 'documentary'       // talking head + b-roll intercut

export type EmotionBeat =
  | 'curiosity'   // hook — "wait what?"
  | 'shock'       // "no way..."
  | 'intrigue'    // building tension
  | 'revelation'  // the key insight
  | 'urgency'     // "you need to know this"
  | 'satisfaction' // payoff
  | 'loop'        // drives rewatch

export interface Scene {
  scene_id: string;
  scene_name: string;               // e.g., "hook", "setup", "conflict", "revelation", "cta"
  duration_s: number;                // seconds for this scene
  voiceover: string;                 // TTS text
  visual_style: VisualStyle;
  visual_description: string;        // detailed description for video generation
  caption_overlay: string;           // on-screen text
  emotion: EmotionBeat;
  music_cue: 'tension_build' | 'impact_hit' | 'ambient' | 'upbeat' | 'silence';
  pattern_interrupts: number;        // how many visual cuts in this scene (min 2 per scene)
}

export interface HookTest {
  format_reference: string;          // "This follows the [X] format that gets 10M+ views"
  viral_proof: string;               // URL or description of a viral example using this format
  why_it_works: string;              // psychological mechanism
  estimated_hook_rate: number;        // 0-100 predicted % of viewers who watch past 3s
}

export interface ScenarioBundle {
  scenario_id: string;
  trend_signal_id: string;           // links back to TrendSignal.topic_id
  title: string;                     // working title for the video
  angle: string;                     // the unique angle/take on this topic
  scenes: Scene[];                   // ordered scene list (5-7 scenes)
  hook_test: HookTest;              // constitutional: must pass this
  total_duration_s: number;          // 24-60 seconds
  target_emotion_arc: EmotionBeat[]; // the emotional journey
  speaker_name: string;              // AI personality delivering this
  tts_voice: string;                 // voice ID for TTS
  hashtags: string[];                // recommended hashtags
  created_at: string;                // ISO timestamp
  model_used: string;                // which LLM produced this
}

// ─── Validation ────────────────────────────────────────────────────────

export function validateScenarioBundle(bundle: ScenarioBundle): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!bundle.scenario_id) errors.push('Missing scenario_id');
  if (!bundle.trend_signal_id) errors.push('Missing trend_signal_id');
  if (!bundle.title) errors.push('Missing title');
  if (!bundle.angle) errors.push('Missing angle');

  // Scenes validation
  if (!bundle.scenes || bundle.scenes.length < 4) {
    errors.push(`Need at least 4 scenes, got ${bundle.scenes?.length ?? 0}`);
  }
  if (bundle.scenes && bundle.scenes.length > 8) {
    errors.push(`Too many scenes: ${bundle.scenes.length} (max 8)`);
  }

  // Duration
  const totalDuration = bundle.scenes?.reduce((sum, s) => sum + s.duration_s, 0) ?? 0;
  if (totalDuration < 24) errors.push(`Too short: ${totalDuration}s (min 24s)`);
  if (totalDuration > 60) errors.push(`Too long: ${totalDuration}s (max 60s)`);

  // Hook test is constitutional — must exist
  if (!bundle.hook_test) {
    errors.push('Missing hook_test (constitutional requirement)');
  } else {
    if (!bundle.hook_test.format_reference) errors.push('Hook test missing format_reference');
    if (!bundle.hook_test.why_it_works) errors.push('Hook test missing why_it_works');
    if (bundle.hook_test.estimated_hook_rate < 30) {
      errors.push(`Hook rate too low: ${bundle.hook_test.estimated_hook_rate}% (min 30%)`);
    }
  }

  // Pattern interrupts — min 2 per scene
  if (bundle.scenes) {
    for (const scene of bundle.scenes) {
      if (scene.pattern_interrupts < 2) {
        errors.push(`Scene "${scene.scene_name}": needs min 2 pattern interrupts, has ${scene.pattern_interrupts}`);
      }
    }
  }

  // First scene must be curiosity or shock (hook)
  if (bundle.scenes?.[0]?.emotion !== 'curiosity' && bundle.scenes?.[0]?.emotion !== 'shock') {
    errors.push(`First scene emotion must be curiosity or shock, got "${bundle.scenes?.[0]?.emotion}"`);
  }

  return { valid: errors.length === 0, errors };
}
