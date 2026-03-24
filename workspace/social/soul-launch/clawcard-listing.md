# SOUL — ClaWHub Listing

**Name:** SOUL — Constitutional Constraints and Safety  
**Namespace:** `@godman-protocols/soul`  
**Version:** 0.2.0  
**License:** Apache 2.0  
**Tier:** T2 (infrastructure protocol)  
**Category:** Agent Infrastructure / Safety  

## Short description (140 chars)
Constitutional safety layer for AI agents. Signed constraints, kill switches, default-deny, append-only audit trail.

## Full description
SOUL is the lowest layer of the Godman Protocol stack — a constitutional engine that encodes operator safety constraints into a signed document that survives context compaction. Every agent action is evaluated against the constitution before execution, producing an append-only audit trail. Kill switches halt execution unconditionally when runtime metrics breach defined thresholds.

**Key features:**
- `createConstitution(operator, constraints, killSwitches)` — define the constitution
- `signConstitution(constitution, secret)` — HMAC-sign to prevent tampering
- `evaluateAction(constitution, agentId, action)` — evaluate with deny-first precedence
- `checkKillSwitches(constitution, context)` — numeric threshold kill switch engine
- `createAudit(agentId, action, evaluation)` — append-only audit entry
- Default-deny: no explicit allow rule = action is denied
- Summer Yu Rule compliant: constraints survive context compaction (bootstrapped: true)

**Install:**
```bash
npx skills add https://github.com/godman-protocols/soul
```

## Tags
safety, constitutional-ai, kill-switches, constraints, audit-trail, agent-safety, godman-protocols
