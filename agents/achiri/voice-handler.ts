// Achiri — Voice Handler T3 Skill (Sprint 127)
// Processes voice messages for tnd_premium tier.
// formatForVoice: strips markdown, produces short sentences for TTS/voice output.
// processVoiceMessage: transcribes (via Whisper stub) + generates voice-friendly reply.
// Whisper wiring: set WHISPER_PATH=/path/to/whisper to enable local ASR.

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AchiriConversationHandler } from './index';

export interface VoiceParams {
  userId: string;
  tier: string;
  audioText: string;         // pre-transcribed text (used when Whisper not available)
  audioFilePath?: string;    // path to audio file (WAV/MP3/OGG) for Whisper transcription
}

export interface VoiceResult {
  transcript: string;
  reply: string;
  voice_reply: string;
  model: string;
  provider: string;
  tier: string;
  whisper_used: boolean;
}

export class VoiceTierError extends Error {
  constructor(tier: string) {
    super(`Voice feature requires tnd_premium tier. Current tier: ${tier}`);
    this.name = 'VoiceTierError';
  }
}

// Strips markdown formatting and produces voice-friendly text.
// Rules:
//   - Remove headers (# ## ###)
//   - Remove bold/italic (* _ __ **)
//   - Remove inline code (`)
//   - Remove code blocks (```)
//   - Remove bullet/numbered lists (replace with ", ")
//   - Remove links [text](url) → keep text only
//   - Break sentences longer than 20 words into shorter ones
export function formatForVoice(text: string): string {
  let t = text;

  // Remove code blocks
  t = t.replace(/```[\s\S]*?```/g, '');

  // Remove inline code
  t = t.replace(/`[^`]*`/g, match => match.slice(1, -1));

  // Remove headers
  t = t.replace(/^#{1,6}\s+/gm, '');

  // Remove bold/italic (**, *, __, _)
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove links [text](url) → text
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Replace bullet list items with comma-separated text
  t = t.replace(/^[\s]*[-*+]\s+/gm, '');
  t = t.replace(/^[\s]*\d+\.\s+/gm, '');

  // Collapse multiple newlines
  t = t.replace(/\n{2,}/g, '. ');
  t = t.replace(/\n/g, ' ');

  // Remove extra spaces
  t = t.replace(/\s{2,}/g, ' ').trim();

  // Break long sentences at natural pause points
  t = breakLongSentences(t, 20);

  return t;
}

function breakLongSentences(text: string, maxWords: number): string {
  // Split on sentence boundaries first
  const sentences = text.split(/(?<=[.!?])\s+/);
  const result: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (words.length <= maxWords) {
      result.push(sentence);
    } else {
      // Break at comma or every maxWords words
      let chunk: string[] = [];
      for (const word of words) {
        chunk.push(word);
        const isComma = word.endsWith(',') || word.endsWith(';');
        if (chunk.length >= maxWords || (isComma && chunk.length >= 8)) {
          result.push(chunk.join(' '));
          chunk = [];
        }
      }
      if (chunk.length > 0) result.push(chunk.join(' '));
    }
  }

  return result.join('. ').replace(/\.\s*\./g, '.').trim();
}

// Transcribe audio file using Whisper CLI (if available).
// Returns transcription text or throws if Whisper not found.
function transcribeWithWhisper(audioFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const whisperPath = process.env.WHISPER_PATH;
    if (!whisperPath || !fs.existsSync(whisperPath)) {
      return reject(new Error('WHISPER_PATH not set or not found'));
    }
    const outDir = os.tmpdir();
    const proc = child_process.spawn(whisperPath, [
      audioFilePath,
      '--language', 'ar',
      '--output_format', 'txt',
      '--output_dir', outDir,
      '--model', 'small',
    ]);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('Whisper exited ' + code + ': ' + stderr));
      const base = path.basename(audioFilePath, path.extname(audioFilePath));
      const outFile = path.join(outDir, base + '.txt');
      if (!fs.existsSync(outFile)) return reject(new Error('Whisper output not found: ' + outFile));
      resolve(fs.readFileSync(outFile, 'utf8').trim());
    });
  });
}

export async function processVoiceMessage(params: VoiceParams): Promise<VoiceResult> {
  const { userId, tier, audioText, audioFilePath } = params;

  // Voice is a tnd_premium-only feature
  if (tier !== 'tnd_premium') {
    throw new VoiceTierError(tier);
  }

  // Step 1: Transcription
  let transcript = audioText;
  let whisperUsed = false;

  if (audioFilePath && fs.existsSync(audioFilePath)) {
    try {
      transcript = await transcribeWithWhisper(audioFilePath);
      whisperUsed = true;
    } catch {
      // Whisper not available — fall back to audioText
      whisperUsed = false;
    }
  }

  if (!transcript || transcript.trim() === '') {
    transcript = audioText;
  }

  // Step 2: Generate reply via Achiri conversation handler
  const handler = new AchiriConversationHandler('tnd_premium', userId);
  const modelConfig = handler.getModelConfig();
  const reply = await handler.chat(transcript.trim());

  // Step 3: Format reply for voice output (no markdown, short sentences)
  const voiceReply = formatForVoice(reply);

  return {
    transcript,
    reply,
    voice_reply: voiceReply,
    model: modelConfig.model,
    provider: modelConfig.provider,
    tier: modelConfig.tier,
    whisper_used: whisperUsed,
  };
}
