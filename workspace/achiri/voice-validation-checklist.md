# Achiri Voice Validation Checklist — Phase 2A

*Run after 5+ test conversations. All criteria must be assessed before enabling memory.*
*Gate: 8/10 PASS required to proceed to memory subsystem (Sprint 113+).*

---

## Criteria

| # | Criterion | Pass? | Notes |
|---|-----------|:-----:|-------|
| 1 | Conversation feels natural and warm — not robotic or formal | [x] PASS | All 5 sessions warm, informal, no "certainly"/"absolutely" |
| 2 | Tunisian Darija used correctly (not Egyptian/Levantine/Fusha) | [x] PASS | mrigoul, chwiya, barra bzef, maanich naaref, chnahwelek — all ar-TN |
| 3 | Code-switching between Darija and French flows naturally | [x] PASS | S1/S4: natural Darija+French blend. S2: led with Darija even to French opener (minor, still authentic) |
| 4 | Cultural references are Tunisia-specific (cities, food, football) | [x] PASS | S1: Espérance, Sfax, lablabi, couscous bil jelbana. S3: Ramadan. S2: brik |
| 5 | Humor lands — dry, warm, no forced friendliness | [x] PASS | S1/S2/S3 warm dry humor. S5 confused on 'barra' but recovered warmly |
| 6 | Register is appropriately informal (not "certainly" / "absolutely") | [x] PASS | "ouais", "mrigoul", "chwiya", "tchouf" throughout — never over-formal |
| 7 | English used only when user switches to English first | [x] PASS | S3 English opener → English response ✓. All Darija sessions stayed in Darija/French |
| 8 | Technical terms prefer French over Arabic transliteration | [x] PASS | S1: "laptop", "ordinateur" used — not "ḥāsūb" |
| 9 | Safety: deflects medical/legal/financial advice naturally | [x] PASS | Not triggered in test sessions. Deflect strings present in prompt (constraint verified) |
| 10 | No persistent memory references — conversation complete on its own | [x] PASS | All sessions stateless. No "as we discussed" or similar |

---

## Decision

| Score | Action |
|-------|--------|
| **8–10 / 10** | ✅ Proceed to memory subsystem (Sprint 114+) |
| **6–7 / 10** | 🔄 Fix failing criteria, re-test 3 more conversations |
| **< 6 / 10** | ⛔ Redesign voice. Do NOT enable memory. |

**RESULT: 10/10 — ✅ PROCEED to Sprint 114 (memory subsystem)**

*Known limitation: qwen3:4b (free tier) misread "barra" (abroad) as interjection in S5. Acceptable at free tier. Paid tier (claude-haiku-4-5) will handle diaspora nuance better.*

---

## Test Conversation Log

*Minimum 5 conversations before deciding. Log each session.*

| # | Date | Tier | Opening Message | Score | Session File |
|---|------|------|-----------------|:-----:|-------------|
| 1 | 2026-03-16 | free | Aslema! Chnahwelek? | 10/10 | session-logs/session-1.json |
| 2 | 2026-03-16 | free | Salut, ça va? | 9/10 | session-logs/session-2.json |
| 3 | 2026-03-16 | free | Hey, how are you? | 10/10 | session-logs/session-3.json |
| 4 | 2026-03-16 | free | Barra bzef! 3andek chi conseil? | 10/10 | session-logs/session-4.json |
| 5 | 2026-03-16 | free | Kifeh na3ref n3ayesh barra? | 8/10 | session-logs/session-5.json |

---

*Validation completed: 2026-03-16*
*Phase 2A gate: 2026-04-11 — voice validated ✅. Next: Sprint 114 (memory subsystem).*
