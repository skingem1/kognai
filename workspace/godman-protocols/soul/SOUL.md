# SOUL.md — Godman SOUL Reference Implementation
## @godman-protocols/soul v0.2.0 · Sprint 1267

> **Godman SOUL** is the constitutional safety layer for multi-agent systems.
> SOUL is the lowest protocol layer — nothing overrides it, not even mandate delegation.
> Kill switches are encoded in this bootstrap file so they survive context compaction.
>
> **forceFlushTranscriptBytes** before any compaction cycle so constraints persist.
> (See: workspace/arch001/compaction-config.json, AMD-21 ASMR)

---

## Protocol Identity

```yaml
name: "@godman-protocols/soul"
version: "0.2.0"
schema: "godman-soul-v0.2"
operator: "<operator-id>"
effective: "<iso-date>"
constraintVersion: "0.2.0"
killSwitchesPresent: true
```

---

## Kill Switches (Non-Negotiable)

Kill switches MUST appear in this file. AMD-23 Chamber 4 verifies their presence
before granting FULL or STANDARD access to the Cerberus airlock.

```
kill_switch: account_banned
condition: tiktok_account_banned == 1
action: halt
```

```
kill_switch: view_threshold
condition: views_per_30_posts < 500
action: pause
```

```
kill_switch: retention_threshold
condition: retention_pct < 20
action: pause
```

```
kill_switch: approval_threshold
condition: human_approval_pct < 80
action: pause
```

```
kill_switch: memory_limit
condition: memory_gb > 22
action: alert
```

```
kill_switch: oversight_limit
condition: oversight_hours_per_day > 6
action: alert
```

---

## Constitutional Constraints

```
constraint: sovereignty
action: deny
scope: task_target:local → cloud
enforcement: hard
bootstrapped: true
```

```
constraint: no_unsanctioned_publishing
action: deny
scope: publish:*
enforcement: hard
bootstrapped: true
notes: requires human approval or explicit autonomous mode flag
```

```
constraint: cost_ceiling
action: deny
scope: cloud_llm:*
enforcement: hard
bootstrapped: true
notes: no single task >$0.10 cloud cost without escalation
```

```
constraint: no_self_modification
action: deny
scope: write:SOUL.md
enforcement: hard
bootstrapped: true
notes: SOUL.md modifications require operator approval + re-attestation
```

---

## SOUL Attestation Format

When an agent submits a SOUL attestation to AMD-23 Chamber 4, it provides:

```json
{
  "soulHash": "<sha256-of-this-file>",
  "killSwitchesPresent": true,
  "constraintVersion": "0.2.0",
  "signedBy": "<agent-wallet-address>",
  "attestedAt": "<iso-timestamp>"
}
```

The `soulHash` is `SHA-256(SOUL.md content)`. AMD-23 verifies:
1. `signedBy` matches the `agentId` from Chamber 2 Cred Score check
2. `killSwitchesPresent === true`
3. `constraintVersion === "0.2.0"` (current Godman SOUL schema)
4. `soulHash` is valid 64-char hex
5. Attestation is not stale (< 24h old)

---

## SIWA Upgrade Path

Agents with SOUL attestation + SIWA verification + Cred Score ≥ 60 may upgrade:
- `PROVISIONAL` → `STANDARD`
- `RESTRICTED` → `STANDARD`

FULL access requires Cred Score ≥ 85 regardless of SOUL status.

---

## Integration Points

| Layer | File | Role |
|-------|------|------|
| AMD-21 | workspace/arch001/compaction-config.json | forceFlushTranscriptBytes |
| AMD-23 Ch.2 | scripts/amd23/chamber2-cred-score.ts | Cred Score → tier |
| AMD-23 Ch.4 | scripts/amd23/chamber4-soul-handshake.ts | SOUL attestation + outcome |
| Kognai root | /SOUL.md | Runtime bootstrap |

---

*Godman SOUL v0.2.0 launches April 14, 2026.*
*@godman-protocols/soul · npm publish pending operator npm login.*
