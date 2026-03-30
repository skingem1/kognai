/**
 * tiktok-guide-context.ts — SCS001 TikTok Video Generation Guide v1.0
 *
 * Exports structured context from the TikTok Guide for injection into
 * all scriptgen prompts. All pipelines (P1/P3/P4) import from here.
 *
 * Source: workspace/scs001/TIKTOK_GUIDE_V1.md
 * Raised: 2026-03-29 | Godman
 */

export const HOOK_FORMULAS = `
HOOK FORMULAS (rotate — pick the strongest for this topic):
1. The Curiosity Gap: "Most people don't know that [X] exists — and it changes everything."
2. The Contrarian: "Stop doing [X]. Here's what actually works."
3. The Specific Number: "3 things that made [X] happen in [timeframe]."
4. The Relatable Pain: "If you've ever felt [X], watch this."
5. The Reveal Tease: "I tried [X] for 30 days. Here's what happened."
6. The Direct Address: "Hey [audience segment] — this one's specifically for you."
7. The Bold Claim: "This is the most underrated [X] I've ever found."
8. The Story Start: "Three weeks ago, [inciting incident happened]..."
9. The Challenge: "Can you spot what's wrong with this?"
`;

export const FREYTAG_STRUCTURE = `
FREYTAG'S PYRAMID (map ALL 5 beats before scripting — no beat can be empty):
1. Exposition (0–3s): Who is this for? What is the tension? = The hook.
2. Rising Action (3s–midpoint): Inciting moment, build stakes, keep information moving.
3. Climax (midpoint): The revelation, proof, or transformation. Earns the share.
4. Falling Action (midpoint–end): What changed? What does this mean? Application step.
5. Resolution/CTA (final 3–5s): Closed loop OR open loop to Part 2 OR direct action prompt.
`;

export const RETENTION_RULES = `
RETENTION ENGINEERING:
- Pattern interrupt every 3–5 seconds (cut, new text overlay, B-roll, audio shift)
- Mid-video retention hook at 15s mark: "But here's the part most people miss..."
- Deliver the payoff at 60–70% of video, not the very end
- No padding. No repeating the same point. No long pauses.
- First 10 seconds must deliver value or lose the viewer
`;

export const COMPLETION_TARGETS = `
TARGET METRICS (self-check before generating):
- 3s hook retention: must hold 70%+ of viewers
- Completion rate: structure must drive 65%+
- Ending: must earn save, share, or comment
- Length sweet spot: 21–34s for best balance | 35–60s for educational depth
`;

export const CTA_RULES = `
CTA (one CTA per video — no more):
- Follow (for series / episodic content)
- Save (for reference / how-to content)
- Comment with specific prompt: "Comment [X] if you want Part 2"
- Share / Tag (for "show your friend this" moments)
- Never end without a CTA. Never use more than one.
`;

export const AUDIO_RULES = `
AUDIO:
- Voiceover narration: music ducked to 20-30% under voice
- Text-only videos: music mandatory (silence underperforms)
- No music at full volume for talking-head or narration content
- Sync visual cuts to the beat when using music
`;

export const VISUAL_RULES = `
VISUAL STANDARDS:
- Vertical 9:16 only. Full-screen.
- Keep text and faces in central 70% of frame (bottom 20% = TikTok UI overlay)
- Primary text: top 40% of frame, visible for minimum 2 seconds
- Cuts every 3–5 seconds maximum for high-retention content
- Authentic aesthetic preferred over polished/commercial
- NEVER include screens, text signs, documents, UI, code, charts, laptops in AI-generated visual prompts
`;

export const HASHTAG_RULES = `
HASHTAG STRATEGY (5–7 max):
- 1 broad niche tag (150M+ videos): discoverability
- 2–3 mid-tier topic tags (10M–150M): niche community
- 1–2 specific content tags (under 10M): precision targeting
- Never: hashtag stuffing, #fyp or #viral as standalone strategy
`;

/**
 * Full protocol block to inject into any scriptgen prompt.
 * Includes hook + Freytag + retention + CTA requirements.
 */
export function getTikTokProtocolBlock(): string {
  return `
=== TIKTOK VIDEO GENERATION PROTOCOL (MANDATORY — SCS001 v1.0) ===

${HOOK_FORMULAS}

${FREYTAG_STRUCTURE}

${RETENTION_RULES}

${COMPLETION_TARGETS}

${CTA_RULES}

${VISUAL_RULES}

10-STEP SELF-CHECK (run before returning JSON):
1. Core message: Can I state this in one sentence? If no — rewrite the script.
2. Format: Did I choose the right content format for this message?
3. Hook: Did I generate 3 hook variations and pick the strongest?
4. Freytag: Are all 5 beats explicitly mapped? No empty beats?
5. Pattern interrupts: Are there changes every 3–5 seconds?
6. Audio: Is the audio strategy defined?
7. CTA: Is there exactly one CTA in the ending?
8. Visual: Are all visual prompts AI-safe (no screens/text/UI)?
9. Length: Is the total duration in the optimal sweet spot for this format?
10. Metrics test: Would this hold 70%+ at 3s? Drive 65%+ completion? Earn a save or share?

If NO to any step — fix before outputting JSON.
=== END PROTOCOL ===
`;
}
