// SCS-001 Pipeline Notifier — Telegram notification after each pipeline run
// Sends summary to all active subscribers + error alerts to owner only
// Non-fatal: notification failure never blocks the pipeline

import { sendMessage } from '../telegram-bot/bot';
import { TelegramDB } from '../telegram-bot/db';
import type { PipelineRunReport } from './index';

const OWNER_CHAT_ID = process.env.OWNER_TELEGRAM_CHAT_ID || '';

function formatPipelineSummary(report: PipelineRunReport): string {
  const s = report.summary;
  const elapsed = (report.total_elapsed_ms / 1000).toFixed(1);
  const mode = report.mode === 'live' ? '🟢 LIVE' : '🔵 MOCK';
  const errors = report.stages.filter(st => st.status === 'error');

  const lines = [
    `📡 *SCS-001 Pipeline Complete*`,
    `${mode} | ${elapsed}s | ${report.stages.length} stages`,
    '',
    `📊 *Funnel*`,
    `${s.topics_found} topics → ${s.clips_qualified} qualified → ${s.published} published`,
    '',
  ];

  if (s.viral > 0 || s.performing > 0 || s.failure_library > 0) {
    lines.push('📈 *Performance*');
    if (s.viral > 0) lines.push(`🔥 ${s.viral} viral (${s.flywheel_derivatives} derivatives queued)`);
    if (s.performing > 0) lines.push(`✅ ${s.performing} performing`);
    if (s.failure_library > 0) lines.push(`📕 ${s.failure_library} failure library entries`);
    lines.push('');
  }

  // Sprint 1377: QC pass/fail detail
  const qcTotal = s.qc_passed + s.qc_failed;
  if (qcTotal > 0) {
    lines.push(`🎬 *QC* — ${s.qc_passed}/${qcTotal} passed`);
    if (s.qc_failed > 0 && s.qc_failures?.length) {
      for (const reason of s.qc_failures) {
        lines.push(`  ✗ ${reason}`);
      }
    }
    lines.push('');
  }

  if (errors.length > 0) {
    lines.push('⚠️ *Errors*');
    for (const e of errors) {
      lines.push(`• ${e.stage}: ${e.error ?? 'unknown'}`);
    }
    lines.push('');
  }

  lines.push(`_${new Date(report.started_at).toLocaleString()}_`);
  return lines.join('\n');
}

export async function notifyPipelineComplete(report: PipelineRunReport): Promise<void> {
  const subscribers = TelegramDB.list().filter(s => s.active);

  if (subscribers.length === 0) {
    console.log('[notifier] 0 active subscribers — skipping notification');
    return;
  }

  const text = formatPipelineSummary(report);
  let sent = 0;

  for (const sub of subscribers) {
    try {
      await sendMessage(sub.chatId, text);
      sent++;
    } catch (err) {
      console.warn('[notifier] Failed to notify chatId ' + sub.chatId + ': ' + (err as Error).message);
    }
  }

  console.log('[notifier] Sent pipeline summary to ' + sent + '/' + subscribers.length + ' subscribers');
}

export async function notifyPipelineError(error: string): Promise<void> {
  if (!OWNER_CHAT_ID) {
    console.warn('[notifier] No OWNER_TELEGRAM_CHAT_ID — cannot send error alert');
    return;
  }

  const text = [
    '🚨 *SCS-001 Pipeline FAILED*',
    '',
    '```',
    error.substring(0, 500),
    '```',
    '',
    `_${new Date().toLocaleString()}_`,
  ].join('\n');

  try {
    await sendMessage(OWNER_CHAT_ID, text);
    console.log('[notifier] Error alert sent to owner');
  } catch (err) {
    console.warn('[notifier] Failed to send error alert: ' + (err as Error).message);
  }
}
