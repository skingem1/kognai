// SCS-001 — Script Validator (Stage 6-validate)
// Pre-editing gate: validates ScriptBundles meet structural requirements
// before they consume EditingAgent compute cycles.
// Invalid bundles are rejected and logged to workspace/scs001/validation-errors.jsonl

import { appendFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import type { ScriptBundle } from '../scs001-script/index';

export interface ValidationResult {
  clip_id:  string;
  valid:    boolean;
  errors:   string[];
}

const LEDGER_PATH = resolve('workspace/scs001/validation-errors.jsonl');

// Validation thresholds
const HOOK_MIN_LENGTH     = 10;
const SEGMENTS_MIN        = 5;
const SEGMENTS_MAX        = 6;
const INTERRUPTS_MIN      = 8;
const DURATION_MIN_S      = 24;
const DURATION_MAX_S      = 28;

export class ScriptValidator {
  validate(bundle: ScriptBundle): ValidationResult {
    const errors: string[] = [];

    // Check hook segment text length
    const hookSeg = bundle.segments.find(s => s.segment_name === 'hook');
    if (!hookSeg || hookSeg.voiceover_text.length < HOOK_MIN_LENGTH) {
      errors.push('Hook text too short (' + (hookSeg?.voiceover_text.length ?? 0) + ' chars, min ' + HOOK_MIN_LENGTH + ')');
    }

    // Check segment count
    if (bundle.segments.length < SEGMENTS_MIN || bundle.segments.length > SEGMENTS_MAX) {
      errors.push('Segment count out of range (' + bundle.segments.length + ', expected ' + SEGMENTS_MIN + '-' + SEGMENTS_MAX + ')');
    }

    // Check pattern interrupts
    if (bundle.pattern_interrupts.length < INTERRUPTS_MIN) {
      errors.push('Insufficient pattern interrupts (' + bundle.pattern_interrupts.length + ', min ' + INTERRUPTS_MIN + ')');
    }

    // Check total duration
    if (bundle.total_duration_seconds < DURATION_MIN_S || bundle.total_duration_seconds > DURATION_MAX_S) {
      errors.push('Duration out of range (' + bundle.total_duration_seconds + 's, expected ' + DURATION_MIN_S + '-' + DURATION_MAX_S + ')');
    }

    const result: ValidationResult = {
      clip_id: bundle.clip_id,
      valid:   errors.length === 0,
      errors,
    };

    if (!result.valid) {
      this.logError(bundle.script_id, result);
    }

    return result;
  }

  validateAll(bundles: ScriptBundle[]): { valid: ScriptBundle[]; invalid: ValidationResult[] } {
    const valid: ScriptBundle[] = [];
    const invalid: ValidationResult[] = [];

    for (const bundle of bundles) {
      const result = this.validate(bundle);
      if (result.valid) {
        valid.push(bundle);
      } else {
        invalid.push(result);
        console.warn('[ScriptValidator] ✗ ' + bundle.script_id + ' rejected: ' + result.errors.join('; '));
      }
    }

    console.log('[ScriptValidator] ' + valid.length + '/' + bundles.length + ' bundles passed validation');
    return { valid, invalid };
  }

  private logError(script_id: string, result: ValidationResult): void {
    try {
      mkdirSync(dirname(LEDGER_PATH), { recursive: true });
      const line = JSON.stringify({
        script_id,
        clip_id:   result.clip_id,
        errors:    result.errors,
        timestamp: new Date().toISOString(),
      });
      appendFileSync(LEDGER_PATH, line + '\n', 'utf8');
    } catch {
      // Non-fatal — don't block the pipeline on logging failures
    }
  }
}
