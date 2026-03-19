/**
 * SCS-001 Pattern Interrupt Renderer
 *
 * Converts PatternInterrupt[] metadata into FFmpeg video filters.
 * Each interrupt type maps to a visual effect applied at the specified time.
 *
 * Interrupt types → FFmpeg filters:
 *   cut        → brightness flash (0.1s white fade)
 *   zoom       → zoompan (1.2x for 0.3s)
 *   text_pop   → overlay text pulse
 *   color_shift → hue rotation (30° for 0.2s)
 *   motion     → shake/translate offset
 *   overlay    → vignette flash
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import type { PatternInterrupt } from "../../agents/scs001-script/index";

// ── Types ──────────────────────────────────────────────

export interface InterruptFilter {
  type: PatternInterrupt["type"];
  time_s: number;
  ffmpeg_filter: string;
  duration_s: number;
}

// ── Filter Builders ────────────────────────────────────

const FFMPEG = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";

/**
 * Generate FFmpeg filter string for a single pattern interrupt.
 */
export function buildInterruptFilter(interrupt: PatternInterrupt): InterruptFilter {
  const t = interrupt.time_s;

  switch (interrupt.type) {
    case "cut":
      // Brief brightness flash — simulates a hard cut transition
      return {
        type: "cut",
        time_s: t,
        ffmpeg_filter: `eq=brightness=0.3:enable='between(t,${t},${t + 0.1})'`,
        duration_s: 0.1,
      };

    case "zoom":
      // Slight zoom-in effect using scale + overlay positioning
      return {
        type: "zoom",
        time_s: t,
        ffmpeg_filter: `zoompan=z='if(between(in_time,${t},${t + 0.3}),1.15,1.0)':d=1:s=1080x1920:fps=30`,
        duration_s: 0.3,
      };

    case "text_pop":
      // No-op in filter chain — text_pop is handled by caption overlay module
      return {
        type: "text_pop",
        time_s: t,
        ffmpeg_filter: "",
        duration_s: 0.2,
      };

    case "color_shift":
      // Hue rotation for a brief moment
      return {
        type: "color_shift",
        time_s: t,
        ffmpeg_filter: `hue=h=30:enable='between(t,${t},${t + 0.2})'`,
        duration_s: 0.2,
      };

    case "motion":
      // Slight horizontal shake
      return {
        type: "motion",
        time_s: t,
        ffmpeg_filter: `crop=iw-20:ih-20:10+5*sin(t*20):10:enable='between(t,${t},${t + 0.3})'`,
        duration_s: 0.3,
      };

    case "overlay":
      // Vignette flash effect
      return {
        type: "overlay",
        time_s: t,
        ffmpeg_filter: `vignette=PI/4:enable='between(t,${t},${t + 0.2})'`,
        duration_s: 0.2,
      };

    default:
      return {
        type: interrupt.type,
        time_s: t,
        ffmpeg_filter: "",
        duration_s: 0,
      };
  }
}

/**
 * Build all interrupt filters for a list of PatternInterrupts.
 * Filters that don't produce FFmpeg output (like text_pop) are excluded.
 */
export function buildAllInterruptFilters(
  interrupts: PatternInterrupt[]
): InterruptFilter[] {
  return interrupts
    .map(buildInterruptFilter)
    .filter((f) => f.ffmpeg_filter !== "");
}

/**
 * Build a combined FFmpeg filter chain string from all interrupts.
 * Compatible: use with -vf flag in FFmpeg command.
 */
export function buildFilterChain(interrupts: PatternInterrupt[]): string {
  const filters = buildAllInterruptFilters(interrupts);
  if (filters.length === 0) return "";

  // Only use simple filters that can be chained with comma
  // Exclude zoompan (requires complex filter graph)
  const simpleFilters = filters
    .filter((f) => f.type !== "zoom")
    .map((f) => f.ffmpeg_filter);

  return simpleFilters.join(",");
}

/**
 * Apply pattern interrupts to a video file.
 */
export function applyInterrupts(
  videoPath: string,
  interrupts: PatternInterrupt[],
  outputPath: string,
  dryRun: boolean = false
): string {
  if (dryRun) {
    const filters = buildAllInterruptFilters(interrupts);
    console.log(
      `  [DRY RUN] Would apply ${filters.length} pattern interrupts to ${videoPath}`
    );
    filters.forEach((f) =>
      console.log(`    ${f.type} @ ${f.time_s}s (${f.duration_s}s)`)
    );
    return outputPath;
  }

  const filterChain = buildFilterChain(interrupts);
  if (!filterChain) {
    // No applicable filters — copy as-is
    if (existsSync(videoPath)) {
      execSync(`${FFMPEG} -y -i "${videoPath}" -c copy "${outputPath}" 2>/dev/null`, {
        stdio: "pipe",
        timeout: 30000,
      });
    }
    return outputPath;
  }

  try {
    execSync(
      `${FFMPEG} -y -i "${videoPath}" -vf "${filterChain}" -c:a copy "${outputPath}" 2>/dev/null`,
      { stdio: "pipe", timeout: 120000 }
    );
  } catch (err: any) {
    console.warn(`  Pattern interrupts failed: ${err.message} — copying without effects`);
    if (existsSync(videoPath)) {
      execSync(`${FFMPEG} -y -i "${videoPath}" -c copy "${outputPath}" 2>/dev/null`, {
        stdio: "pipe",
        timeout: 30000,
      });
    }
  }

  return outputPath;
}
