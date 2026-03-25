/**
 * cmd-subscribe.ts — /subscribe Telegram command
 * Sprint 1239 / LEMON-SCAFFOLD-02
 *
 * Shows pricing tiers and LemonSqueezy checkout URLs.
 */

import { LEMON_CHECKOUT_BASE, LEMON_VARIANT_IDS } from '../payments/lemon-config';

export function cmdSubscribe(): string {
  const lines: string[] = [
    `💳 *Kognai — Subscribe*`,
    ``,
    `Power your TikTok content with AI-generated scripts, captions, and posting automation.`,
    ``,
    `*Plans:*`,
  ];

  if (LEMON_VARIANT_IDS.length > 0) {
    LEMON_VARIANT_IDS.forEach((variantId, i) => {
      lines.push(`• Plan ${i + 1}: ${LEMON_CHECKOUT_BASE}/${variantId}`);
    });
  } else {
    lines.push(`• Monthly (€9/mo): ${LEMON_CHECKOUT_BASE}`);
  }

  lines.push(
    ``,
    `After subscribing, open Telegram and send \`/start\` to activate your agent.`,
    ``,
    `Questions? Contact support via @KognaiBot.`,
  );

  return lines.join('\n');
}
