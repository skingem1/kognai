/**
 * video-source-types.ts
 * Shared types for multi-source video pipeline (Sprint-057).
 * Used by pexels-client, pixabay-client, and source-brief-runner.
 */

export type VideoSourceName = 'internet_archive' | 'pexels' | 'pixabay';

export interface VideoSourceItem {
  source: VideoSourceName;
  video_id: string;          // source-specific ID (e.g. "12345678" for Pexels)
  title: string;
  description?: string;
  download_url: string;      // best HD direct download URL
  width: number;
  height: number;
  duration: number;          // seconds
  topic_id: string;          // maps to VIRAL_TOPICS id (e.g. "T01")
  source_url: string;        // canonical page URL
  score: number;             // derived from engagement (views/likes/downloads)
}

/**
 * Map from VIRAL_TOPICS id → search queries optimised for Pexels / Pixabay.
 * Topics not listed here are not well-served by stock footage and are skipped.
 */
export const STOCK_QUERIES: Record<string, string[]> = {
  T01: ['wildlife predator prey', 'lion tiger cheetah hunting', 'animal attack nature'],
  T02: ['space cosmos universe', 'earth from space stars galaxy', 'planet nebula milky way'],
  T04: ['volcanic eruption lava', 'earthquake destruction flood', 'tornado storm disaster'],
  T05: ['underwater ocean coral reef', 'whale dolphin shark fish', 'deep sea marine life'],
  T06: ['lightning thunderstorm hurricane', 'blizzard snowstorm extreme weather', 'flood river overflow'],
  T07: ['skyscraper construction timelapse', 'bridge engineering architecture', 'engineering mega structure'],
  T08: ['science laboratory experiment', 'chemistry reaction microscope', 'medical hospital technology'],
  T09: ['ancient ruins archaeology', 'pyramid temple historic', 'stone monument architecture'],
  T10: ['science experiment reaction fire', 'physics chemistry demonstration', 'slow motion explosion'],
  T11: ['crowd city people street', 'urban timelapse traffic night', 'city skyline drone aerial'],
  T12: ['athlete sports competition', 'extreme sport parkour skateboard', 'marathon race victory'],
  T13: ['northern lights aurora borealis', 'sunset sunrise time lapse', 'nature landscape fog mountains'],
  T14: ['microscope cells bacteria virus', 'biology science nature close up', 'macro photography nature'],
  T15: ['volcano eruption aerial drone', 'wildfire forest fire burning', 'flood aerial nature disaster'],
};
