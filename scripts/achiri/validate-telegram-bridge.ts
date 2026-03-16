// Sprint 116 — Validate Achiri Telegram Bridge
// Tests handleAchiri() in ACHIRI_DRY_RUN=1 mode (no real LLM calls).

process.env.ACHIRI_DRY_RUN = '1';

import { AchiriConversationHandler } from '../../agents/achiri/index';

async function main(): Promise<void> {
  console.log('[validate-telegram-bridge] Running in dry-run mode...\n');

  let passed = 0;
  let failed = 0;

  function check(name: string, ok: boolean, detail = ''): void {
    if (ok) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ ${name}${detail ? ': ' + detail : ''}`); }
  }

  // 1. Handler instantiates for chatId
  const chatId = 999999;
  const handler = new AchiriConversationHandler('free', String(chatId));
  check('Handler instantiates for chatId', !!handler);

  // 2. chat() returns a non-empty string
  const reply = await handler.chat('Aslema! Chnahwelek?');
  check('chat() returns non-empty reply', typeof reply === 'string' && reply.length > 0, 'len=' + reply.length);

  // 3. Dry-run reply contains model info
  const parsed = JSON.parse(reply);
  check('Dry-run reply has status=dry_run', parsed.status === 'dry_run', JSON.stringify(parsed).slice(0, 60));

  // 4. Dry-run reply has model field
  check('Dry-run reply has model field', typeof parsed.model === 'string', parsed.model);

  // 5. Second message preserves handler (memory store test)
  const reply2 = await handler.chat('Labas?');
  check('Second chat() call succeeds', typeof reply2 === 'string' && reply2.length > 0);

  console.log(`\n[validate-telegram-bridge] ${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    console.error('[validate-telegram-bridge] FAIL');
    process.exit(1);
  }
  console.log('[validate-telegram-bridge] PASS');
}

main().catch(err => { console.error(err); process.exit(1); });
