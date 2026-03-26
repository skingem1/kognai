/**
 * cmd-cmo.ts — CMO Telegram commands (Sprint TICKET-013-CMO-03)
 *
 * /approve-content [YYYY-MM-DD] — Approve the weekly content plan for the given Monday date
 * /revise-content [YYYY-MM-DD] <feedback> — Mark plan as needs-revision with feedback (up to 3 cycles)
 *
 * Approval loop: CMO generates plan → CEO reviews → if rejected, revise up to 3 times
 * X agent ONLY posts from plans with status === "approved"
 */

import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from './shared';

const CMO_REPORTS = path.join(ROOT, 'reports', 'cmo');
const MAX_REVISION_CYCLES = 3;

function getMondayDate(args: string): string {
  const dateArg = args.trim().split(/\s+/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) return dateArg;
  // Default: next Monday
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  return monday.toISOString().slice(0, 10);
}

function getPlanPath(mondayDate: string): string {
  return path.join(CMO_REPORTS, `weekly-content-plan-${mondayDate}.json`);
}

/**
 * /approve-content [YYYY-MM-DD]
 * Sets plan status to "approved". X agent will execute it starting Monday.
 */
export function cmdApproveContent(args: string): string {
  const mondayDate = getMondayDate(args);
  const planPath = getPlanPath(mondayDate);

  if (!fs.existsSync(planPath)) {
    return (
      `❌ *No content plan found for week of ${mondayDate}*\n\n` +
      `Expected: \`reports/cmo/weekly-content-plan-${mondayDate}.json\`\n` +
      `Run \`/contentplan\` to see available plans.`
    );
  }

  let plan: any;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  } catch {
    return `❌ Failed to parse plan file for ${mondayDate}.`;
  }

  if (plan.status === 'approved') {
    return `✅ Plan for week of *${mondayDate}* is already approved. X agent will execute as scheduled.`;
  }

  plan.status = 'approved';
  plan.ceo_approval = {
    approved: true,
    approved_at: new Date().toISOString(),
    approved_via: 'telegram /approve-content',
  };

  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  const postCount = Object.keys(plan.days || {}).length * 3;
  return (
    `✅ *Content plan approved — Week of ${mondayDate}*\n\n` +
    `📋 *Strategy:* ${plan.strategy_note || '(no strategy note)'}\n` +
    `📝 *Posts ready:* ${postCount} (${Object.keys(plan.days || {}).length} days × 3 slots)\n\n` +
    `X agent will execute this plan starting Monday. No further action required.`
  );
}

/**
 * /revise-content [YYYY-MM-DD] <feedback>
 * Marks plan as needs-revision with CEO feedback. Increments revision_cycle counter.
 * After MAX_REVISION_CYCLES, escalates to human (does not reject outright).
 */
export function cmdReviseContent(args: string): string {
  const parts = args.trim().split(/\s+/);
  let mondayDate: string;
  let feedback: string;

  if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    mondayDate = parts[0];
    feedback = parts.slice(1).join(' ').trim();
  } else {
    mondayDate = getMondayDate('');
    feedback = args.trim();
  }

  if (!feedback) {
    return (
      `❌ *Usage:* \`/revise-content [YYYY-MM-DD] <feedback>\`\n\n` +
      `Example: \`/revise-content 2026-04-06 Too many technical posts — need more founder voice\`\n` +
      `Example: \`/revise-content Too many technical posts — need more founder voice\``
    );
  }

  const planPath = getPlanPath(mondayDate);
  if (!fs.existsSync(planPath)) {
    return `❌ No content plan found for week of ${mondayDate}.`;
  }

  let plan: any;
  try {
    plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  } catch {
    return `❌ Failed to parse plan file for ${mondayDate}.`;
  }

  const cycle = (plan.revision_cycle || 0) + 1;
  plan.status = 'needs-revision';
  plan.revision_cycle = cycle;
  plan.ceo_revision_feedback = plan.ceo_revision_feedback || [];
  plan.ceo_revision_feedback.push({
    cycle,
    feedback,
    requested_at: new Date().toISOString(),
    requested_via: 'telegram /revise-content',
  });

  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));

  if (cycle >= MAX_REVISION_CYCLES) {
    return (
      `⚠️ *Content plan marked for revision — Cycle ${cycle}/${MAX_REVISION_CYCLES} (FINAL)*\n\n` +
      `📋 *Week:* ${mondayDate}\n` +
      `💬 *Feedback:* ${feedback}\n\n` +
      `This is revision cycle ${cycle}/${MAX_REVISION_CYCLES}. Maximum cycles reached.\n` +
      `CMO will attempt one final regeneration. If still rejected, manual edit required.\n` +
      `Edit \`reports/cmo/weekly-content-plan-${mondayDate}.json\` directly and set \`status: "approved"\`.`
    );
  }

  return (
    `🔄 *Content plan marked for revision — Cycle ${cycle}/${MAX_REVISION_CYCLES}*\n\n` +
    `📋 *Week:* ${mondayDate}\n` +
    `💬 *Feedback:* ${feedback}\n\n` +
    `CMO will regenerate the plan incorporating this feedback.\n` +
    `You'll receive a notification when the new draft is ready for review.\n` +
    `Use \`/approve-content ${mondayDate}\` to approve or \`/revise-content ${mondayDate} <feedback>\` to request another revision.`
  );
}
