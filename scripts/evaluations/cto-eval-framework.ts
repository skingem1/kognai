// CTO Evaluation Framework — Reusable library evaluation template
// Used by CTO agent (deepseek-r1:14b) to evaluate external libraries
// for Kognai integration. 5-criteria scoring with ADOPT/PARTIAL/REJECT verdict.
//
// Usage: Import and extend for each EVAL-NNN evaluation.
// Each criterion is scored 1-5, weighted, and aggregated.

export interface EvalCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;        // 0.0-1.0, all weights sum to 1.0
  score: number;         // 1-5
  evidence: string;      // What was found
  risks: string[];       // Identified risks
  mitigations: string[]; // Proposed mitigations
}

export type EvalVerdict = 'ADOPT' | 'PARTIAL' | 'REJECT';

export interface EvalReport {
  eval_id: string;
  title: string;
  library_name: string;
  library_url: string;
  library_license: string;
  library_stars: number;
  evaluated_by: string;     // Agent name
  evaluated_at: string;     // ISO datetime
  criteria: EvalCriterion[];
  weighted_score: number;   // 1.0-5.0
  verdict: EvalVerdict;
  verdict_reasoning: string;
  next_steps: string[];
  blockers: string[];
}

// Score thresholds for verdict
const ADOPT_THRESHOLD = 3.5;
const PARTIAL_THRESHOLD = 2.5;

export function computeVerdict(criteria: EvalCriterion[]): { weighted_score: number; verdict: EvalVerdict } {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const weighted_score = criteria.reduce((sum, c) => sum + (c.score * c.weight), 0) / totalWeight;
  const rounded = Math.round(weighted_score * 100) / 100;

  let verdict: EvalVerdict;
  if (rounded >= ADOPT_THRESHOLD) {
    verdict = 'ADOPT';
  } else if (rounded >= PARTIAL_THRESHOLD) {
    verdict = 'PARTIAL';
  } else {
    verdict = 'REJECT';
  }

  return { weighted_score: rounded, verdict };
}

export function printEvalReport(report: EvalReport): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('CTO EVALUATION REPORT: ' + report.eval_id);
  console.log('═'.repeat(60));
  console.log('Library: ' + report.library_name + ' (' + report.library_url + ')');
  console.log('License: ' + report.library_license + ' | Stars: ' + report.library_stars);
  console.log('Evaluator: ' + report.evaluated_by);
  console.log('Date: ' + report.evaluated_at);
  console.log('');

  console.log('CRITERIA:');
  for (const c of report.criteria) {
    const bar = '█'.repeat(c.score) + '░'.repeat(5 - c.score);
    console.log('  ' + c.id + ': ' + c.name + ' [' + bar + '] ' + c.score + '/5 (w:' + c.weight + ')');
    console.log('    ' + c.evidence);
    if (c.risks.length > 0) {
      console.log('    Risks: ' + c.risks.join('; '));
    }
  }

  console.log('');
  console.log('WEIGHTED SCORE: ' + report.weighted_score.toFixed(2) + '/5.00');
  console.log('VERDICT: ' + report.verdict);
  console.log('REASONING: ' + report.verdict_reasoning);

  if (report.next_steps.length > 0) {
    console.log('');
    console.log('NEXT STEPS:');
    for (const step of report.next_steps) {
      console.log('  → ' + step);
    }
  }

  if (report.blockers.length > 0) {
    console.log('');
    console.log('BLOCKERS:');
    for (const b of report.blockers) {
      console.log('  ⚠ ' + b);
    }
  }

  console.log('═'.repeat(60));
}

export function validateReport(report: EvalReport): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!report.eval_id) errors.push('Missing eval_id');
  if (!report.library_name) errors.push('Missing library_name');
  if (report.criteria.length < 3) errors.push('Need at least 3 criteria');

  const totalWeight = report.criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push('Weights sum to ' + totalWeight.toFixed(2) + ', expected 1.0');
  }

  for (const c of report.criteria) {
    if (c.score < 1 || c.score > 5) errors.push(c.id + ': score must be 1-5, got ' + c.score);
    if (!c.evidence) errors.push(c.id + ': missing evidence');
  }

  if (!['ADOPT', 'PARTIAL', 'REJECT'].includes(report.verdict)) {
    errors.push('Invalid verdict: ' + report.verdict);
  }

  return { valid: errors.length === 0, errors };
}
