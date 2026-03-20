// Sprint 445: Music Selector — picks background track based on hook formula
// Maps hook formulas to mood categories, selects appropriate background music.
// Returns path to the mp3 file in workspace/scs001/music/.

import { existsSync } from 'fs';
import { join } from 'path';

const MUSIC_DIR = join(process.cwd(), 'workspace', 'scs001', 'music');

type MusicTrack = 'tech-ambient' | 'lo-fi-pulse' | 'calm-pad';

// Hook formula → music mood mapping
const HOOK_MUSIC_MAP: Record<string, MusicTrack> = {
  // Energetic/tech hooks → tech ambient
  curiosity_gap: 'tech-ambient',
  secret:        'tech-ambient',
  urgency:       'tech-ambient',
  challenge:     'tech-ambient',
  // Narrative/emotional hooks → lo-fi pulse
  story:         'lo-fi-pulse',
  question:      'lo-fi-pulse',
  contrarian:    'lo-fi-pulse',
  // Authoritative/factual hooks → calm pad
  authority:     'calm-pad',
  proof:         'calm-pad',
  statistic:     'calm-pad',
};

const DEFAULT_TRACK: MusicTrack = 'tech-ambient';

/**
 * Select background music track based on hook formula.
 * Returns absolute path to mp3, or null if music files don't exist.
 */
export function selectMusic(hookFormula: string): string | null {
  const track = HOOK_MUSIC_MAP[hookFormula] ?? DEFAULT_TRACK;
  const trackPath = join(MUSIC_DIR, `${track}.mp3`);
  return existsSync(trackPath) ? trackPath : null;
}

/**
 * Check if background music library is available.
 */
export function isMusicAvailable(): boolean {
  return existsSync(join(MUSIC_DIR, 'tech-ambient.mp3'));
}

/**
 * Get all available music tracks.
 */
export function listTracks(): Array<{ name: MusicTrack; path: string; exists: boolean }> {
  const tracks: MusicTrack[] = ['tech-ambient', 'lo-fi-pulse', 'calm-pad'];
  return tracks.map(name => ({
    name,
    path: join(MUSIC_DIR, `${name}.mp3`),
    exists: existsSync(join(MUSIC_DIR, `${name}.mp3`)),
  }));
}
