/**
 * Spielberg — Demo Recording Agent
 * JSON Schema types for demo scripts
 * @version 1.0
 *
 * A demo script defines a sequence of scenes (terminal actions)
 * that Spielberg records via asciinema, then post-processes
 * into a polished video.
 */

// ---------------------------------------------------------------------------
// Scene types
// ---------------------------------------------------------------------------

/** A scene that types text character-by-character with realistic delay */
export interface TypeScene {
  type: 'type';
  /** Text to type */
  text: string;
  /** Delay between keystrokes in ms (default: 80) */
  keystrokeDelayMs?: number;
  /** Optional caption overlay for post-production */
  caption?: string;
}

/** A scene that prints output instantly (not typed) */
export interface OutputScene {
  type: 'output';
  /** Text to output */
  text: string;
  /** Optional caption overlay */
  caption?: string;
}

/** A pause scene */
export interface PauseScene {
  type: 'pause';
  /** Duration in ms */
  durationMs: number;
}

/** A screen-clear scene */
export interface ClearScene {
  type: 'clear';
}

/** A comment scene (ignored during recording, documentation only) */
export interface CommentScene {
  type: 'comment';
  /** Comment text */
  text: string;
}

export type Scene = TypeScene | OutputScene | PauseScene | ClearScene | CommentScene;

// ---------------------------------------------------------------------------
// Terminal config
// ---------------------------------------------------------------------------

export interface TerminalConfig {
  /** Terminal columns (default: 120) */
  cols: number;
  /** Terminal rows (default: 30) */
  rows: number;
  /** Font size for agg rendering (default: 14) */
  fontSize: number;
  /** Color theme for agg rendering (default: 'monokai') */
  theme: string;
}

// ---------------------------------------------------------------------------
// Post-production config
// ---------------------------------------------------------------------------

export interface PostProductionConfig {
  /** Output resolution as "WxH" (default: "1920x1080") */
  resolution: string;
  /** Output FPS (default: 30) */
  fps: number;
  /** Title card configuration */
  titleCard: {
    text: string;
    durationSec: number;
  };
  /** Closing card configuration */
  closingCard: {
    text: string;
    durationSec: number;
  };
}

// ---------------------------------------------------------------------------
// DemoScript — the main input
// ---------------------------------------------------------------------------

/**
 * The complete demo script — input to the Spielberg agent.
 */
export interface DemoScript {
  /** Schema version — must be "1.0" */
  version: '1.0';
  /** Unique script ID (e.g. "demo-typescript-setup") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Short description of what this demo shows */
  description: string;
  /** Ordered list of scenes */
  scenes: Scene[];
  /** Terminal configuration for recording + rendering */
  terminal: TerminalConfig;
  /** Post-production settings */
  postProduction: PostProductionConfig;
  /** ISO 8601 — when this script was created */
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// RecordingResult — output from Spielberg
// ---------------------------------------------------------------------------

/**
 * Result of a Spielberg recording run.
 */
export interface RecordingResult {
  /** Script that was recorded */
  scriptId: string;
  /** Path to the .cast file (asciinema recording) */
  castPath: string;
  /** Path to the GIF (via agg) */
  gifPath: string | null;
  /** Path to the MP4 (via ffmpeg post-production) */
  mp4Path: string | null;
  /** Total pipeline duration in seconds */
  durationSec: number;
  /** ISO 8601 — when recording completed */
  recordedAt: string;
  /** Recording status */
  status: 'success' | 'partial' | 'failed';
  /** Error message if status is not 'success' */
  error?: string;
}
