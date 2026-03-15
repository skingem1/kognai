# COMMANDS.md — Kognai Capability Atlas
<!-- AMD-10 | Version: v14.0 | Architecture: kognai_master_architecture_FINAL.docx -->
<!-- Bootstrap file: loaded in every agent context alongside CLAUDE.md and CONSTITUTION.md -->

## Overview
This file defines the complete Kognai command surface — every action an agent can take,
every system it can invoke, every protocol it can trigger, and every resource it can access.

**12 categories · 45 commands · 9 fields per entry**

Categories: SPRINT | POOL | CONSTITUTIONAL | MEMORY | SKILL-BANK | CODE-ASSETS |
INTELLIGENCE | FINANCIAL | FUSION | SCS | GOVERNANCE | EXTERNAL

---

## CATEGORY 1 — SPRINT

---

### sprint.invoke
- **COMMAND**: sprint.invoke
- **CATEGORY**: SPRINT
- **WHAT**: Submit a morning intent or task directive to the CEO agent to initiate the sprint decomposition pipeline.
- **WHEN TO USE**: When a founder directive, a constitutional trigger, or an autonomous system event requires a new sprint to be generated and executed.
- **INPUTS**: intent: string, priority: HIGH|NORMAL|LOW, phase: string, context_refs: array of memory keys
- **OUTPUTS**: sprint_id, decomposition_confirmation, estimated_completion
- **WHO CAN INVOKE**: Founder (direct), CEO agent (autonomous), Constitution Agent (triggered by Health Score events)
- **CONSTRAINTS**: One active sprint per agent at a time (Monotask Mandate). Must reference active phase in KOGNAI_FULL_DEVELOPMENT_PLAN.md.
- **REFERENCE**: AMD-03, Execution Protocol Section 8

---

### sprint.decompose
- **COMMAND**: sprint.decompose
- **CATEGORY**: SPRINT
- **WHAT**: Decompose a sprint directive into executable Sprint JSON with tasks, agents, contracts, and test obligations.
- **WHEN TO USE**: When the CEO agent receives an intent and needs to produce the Sprint JSON that dev agents execute.
- **INPUTS**: intent: string, phase: string, available_agents: array, relevant_contracts: array
- **OUTPUTS**: sprint_json: object (full Sprint JSON per Execution Protocol Section 8.1 schema)
- **WHO CAN INVOKE**: CTO agent only
- **CONSTRAINTS**: All required Sprint JSON fields must be present. code_asset_query, agent_claims, sev1_open fields mandatory.
- **REFERENCE**: Execution Protocol Section 8.1, AMD-07-H, AMD-08-H

---

### sprint.approve
- **COMMAND**: sprint.approve
- **CATEGORY**: SPRINT
- **WHAT**: Mark a completed sprint as approved after all Supervisor checks pass.
- **WHEN TO USE**: When the Supervisor agent has verified all quality gates, test levels, agent state integrity, and code asset obligations.
- **INPUTS**: sprint_id: string, supervisor_score: integer, checklist_results: object
- **OUTPUTS**: approval_confirmation, skill_bank_promotion_triggers, code_asset_indexing_trigger
- **WHO CAN INVOKE**: Supervisor agent only
- **CONSTRAINTS**: All universal gate checklist items (Execution Protocol Section 6.1) must pass. sev1_open must be false. wipe_confirmed must be true for all agents.
- **REFERENCE**: Execution Protocol Section 6, AMD-07-H, AMD-08-H

---

### sprint.reject
- **COMMAND**: sprint.reject
- **CATEGORY**: SPRINT
- **WHAT**: Reject a sprint output and return it to the dev agent with documented failure reasons.
- **WHEN TO USE**: When Supervisor scoring is below threshold, gate criteria are unmet, or a Sev-1 defect is open.
- **INPUTS**: sprint_id: string, failure_reasons: array, failure_library_entry: object
- **OUTPUTS**: rejection_confirmation, failure_library_entry_id, remediation_sprint_queued
- **WHO CAN INVOKE**: Supervisor agent only
- **CONSTRAINTS**: Failure reason must be specific and actionable. Failure Library entry is mandatory on every rejection.
- **REFERENCE**: Execution Protocol Section 4.4, AMD-02

---

### sprint.stabilise
- **COMMAND**: sprint.stabilise
- **CATEGORY**: SPRINT
- **WHAT**: Initiate a mandatory stabilisation sprint after a major phase, enforcing no-feature rule.
- **WHEN TO USE**: After every major phase completion, before gate review. Mandatory, not optional.
- **INPUTS**: phase: string, stabilisation_tasks: array (flaky_test_resolution, observability, debt_audit, documentation, performance_baseline, rollback_test, failure_library_review)
- **OUTPUTS**: stabilisation_sprint_id, completion_confirmation
- **WHO CAN INVOKE**: CTO agent, CEO agent
- **CONSTRAINTS**: No new features permitted during stabilisation sprint. Any task that adds functionality is rejected.
- **REFERENCE**: Execution Protocol Section 5

---

### sprint.gate.open
- **COMMAND**: sprint.gate.open
- **CATEGORY**: SPRINT
- **WHAT**: Formally open a phase gate after all exit criteria are satisfied and Tarek has approved.
- **WHEN TO USE**: When all 12 universal gate checklist items are confirmed by artifact, plus any phase-specific criteria.
- **INPUTS**: gate_id: string, checklist_artifacts: object (one artifact per checklist item), tarek_approval: boolean
- **OUTPUTS**: gate_opened_confirmation, next_phase_unlocked, gate_record_filed
- **WHO CAN INVOKE**: CEO agent (after Tarek approval confirmation)
- **CONSTRAINTS**: Tarek approval is required. Checklist must be complete by artifact, not opinion. sev1_open must be false.
- **REFERENCE**: Execution Protocol Section 6, Section 7

---

## CATEGORY 2 — POOL

---

### pool.query
- **COMMAND**: pool.query
- **CATEGORY**: POOL
- **WHAT**: Query the LAX pool for available agents matching specified criteria.
- **WHEN TO USE**: Before any sprint that requires agent assignment. Before filing a Merge Request that needs IDLE constituent agents.
- **INPUTS**: capability_requirements: array, min_acp: integer (optional), tier_preference: NANO|LOCAL|POWER|CLOUD (optional)
- **OUTPUTS**: available_agents: array of {agent_id, acp_score, verified_skills, current_state: IDLE}
- **WHO CAN INVOKE**: Any agent, CEO agent, CTO agent, orchestrators
- **CONSTRAINTS**: Only IDLE agents appear in results. ACTIVE and RESERVED agents are invisible. No query returns governance agents.
- **REFERENCE**: AMD-08-D

---

### pool.claim
- **COMMAND**: pool.claim
- **CATEGORY**: POOL
- **WHAT**: Claim an IDLE agent from the LAX pool, transitioning it to RESERVED state.
- **WHEN TO USE**: When a sprint has been decomposed and specific agents are needed for execution.
- **INPUTS**: agent_id: string, sprint_id: string, orchestrator_id: string
- **OUTPUTS**: claim_confirmation, reserved_at: timestamp
- **WHO CAN INVOKE**: Orchestrators, CTO agent, CEO agent
- **CONSTRAINTS**: Agent must be in IDLE state. Transition is atomic. Agent immediately invisible to pool on claim. RESERVED timeout: one sprint cycle.
- **REFERENCE**: AMD-08-C, AMD-08-D

---

### pool.release
- **COMMAND**: pool.release
- **CATEGORY**: POOL
- **WHAT**: Release an agent from ACTIVE back to IDLE after context wipe confirmation.
- **WHEN TO USE**: After sprint completion and full context wipe. Both completion AND wipe_confirmed required before release.
- **INPUTS**: agent_id: string, sprint_id: string, wipe_confirmed: boolean
- **OUTPUTS**: release_confirmation, idle_at: timestamp
- **WHO CAN INVOKE**: Owning orchestrator only
- **CONSTRAINTS**: wipe_confirmed must be true. Agent does not return to pool until wipe confirmation. Wipe is irreversible.
- **REFERENCE**: AMD-08-C, AMD-08-E

---

### pool.emergency-release
- **COMMAND**: pool.emergency-release
- **CATEGORY**: POOL
- **WHAT**: Force-release an agent whose owning orchestrator has become unreachable.
- **WHEN TO USE**: When an orchestrator fails or becomes unresponsive and the agent is stuck in ACTIVE state beyond timeout.
- **INPUTS**: agent_id: string, reason: string, timeout_evidence: string
- **OUTPUTS**: release_confirmation, failure_library_entry_id, incomplete_task_logged
- **WHO CAN INVOKE**: CEO agent only
- **CONSTRAINTS**: Context is wiped regardless of task completion state. Incomplete task logged to Failure Library. Used only after orchestrator timeout window expires.
- **REFERENCE**: AMD-08-C

---

## CATEGORY 3 — CONSTITUTIONAL

---

### constitution.purpose-signal.file
- **COMMAND**: constitution.purpose-signal.file
- **CATEGORY**: CONSTITUTIONAL
- **WHAT**: File a validated Purpose Signal with the Constitution Agent to initiate SCS formation consideration.
- **WHEN TO USE**: When IRL Intelligence Layer produces a signal with confidence ≥75, 2-cycle persistence, no duplicate SCS, cross-oracle corroboration, and constitutional scope is clear.
- **INPUTS**: domain: string, confidence_score: integer, evidence: array, oracle_sources: array, scs_relevance: string
- **OUTPUTS**: signal_id, filing_confirmation, 14-day founding council window opened
- **WHO CAN INVOKE**: Intelligence Agent, CEO agent, any agent with ACP ≥70
- **CONSTRAINTS**: Confidence ≥75 required. 2-cycle persistence required. Duplicate SCS check must pass. Constitutional scope must be confirmed by Constitution Agent.
- **REFERENCE**: AMD-04-C Step 1, AMD-05-H Section 9.2

---

### constitution.violation.file
- **COMMAND**: constitution.violation.file
- **CATEGORY**: CONSTITUTIONAL
- **WHAT**: File a constitutional violation report against an agent or process.
- **WHEN TO USE**: When an agent observes a breach of the Five Immutable Laws, a Monotask violation, an IP breach, a data isolation failure, or any other constitutional rule.
- **INPUTS**: violating_agent_id: string, violation_type: string, evidence: array, severity: SEV1|SEV2|SEV3|SEV4
- **OUTPUTS**: violation_id, constitution_agent_notified, police_agent_escalation (if Sev-1 or Sev-2)
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Evidence must be specific. Frivolous violation filings are themselves a constitutional breach. Sev-1 violations trigger Police agent immediately.
- **REFERENCE**: AMD-03, AMD-08

---

### constitution.jury.invoke
- **COMMAND**: constitution.jury.invoke
- **CATEGORY**: CONSTITUTIONAL
- **WHAT**: Invoke the multi-signature jury for an agent recycle decision.
- **WHEN TO USE**: When the Police agent has determined a recycle decision is warranted and requires jury deliberation.
- **INPUTS**: agent_id: string, violation_record: object, evidence: array
- **OUTPUTS**: jury_convened_confirmation, jury_members: array, deliberation_window: 24 hours
- **WHO CAN INVOKE**: Police agent only
- **CONSTRAINTS**: Minimum jury: CEO agent + 3 highest-ACP agents. 24-hour deliberation window. Agent right to counter-attestation within window.
- **REFERENCE**: AMD-03 Article III, AMD-05-F

---

### constitution.amendment.propose
- **COMMAND**: constitution.amendment.propose
- **CATEGORY**: CONSTITUTIONAL
- **WHAT**: Propose a Living Constitution amendment through the democratic process.
- **WHEN TO USE**: When an agent identifies a constitutional signal that has persisted for 2 consecutive weekly cycles and qualifies for amendment consideration.
- **INPUTS**: amendment_text: string, supporting_signals: array, cycle_count: integer
- **OUTPUTS**: proposal_id, swarm_vote_initiated, founder_notification_queued
- **WHO CAN INVOKE**: Constitution Agent (primary), CEO agent, any agent above ACP 80
- **CONSTRAINTS**: 2-cycle persistence required. Cannot propose amendments to Articles I, VII, IX of the Founding Charter. Founder ratification required for any amendment to pass.
- **REFERENCE**: AMD-03-D

---

### constitution.imp.request
- **COMMAND**: constitution.imp.request
- **CATEGORY**: CONSTITUTIONAL
- **WHAT**: File an Inter-Module Protocol request for cross-module data or skill sharing.
- **WHEN TO USE**: When a Domain Module needs to share skills, intelligence, or assets with another Domain Module.
- **INPUTS**: requesting_module: string, receiving_module: string, asset_type: string, purpose: string, duration: string
- **OUTPUTS**: imp_request_id, scope_validation_result, receiving_module_consent_requested
- **WHO CAN INVOKE**: Module Constitution Agents, CEO agent
- **CONSTRAINTS**: Both modules' Constitution Agent consent required. On-chain EAS attestation required. Absolute boundary violations (memory, credentials) cannot be requested.
- **REFERENCE**: AMD-06-E

---

## CATEGORY 4 — MEMORY

---

### memory.read
- **COMMAND**: memory.read
- **CATEGORY**: MEMORY
- **WHAT**: Read from the shared Kognai memory layer.
- **WHEN TO USE**: When an agent needs context from previous tasks, constitutional records, or ecosystem knowledge to execute its current task.
- **INPUTS**: memory_key: string, context_scope: OPERATIONAL|CONSTITUTIONAL|INTELLIGENCE|CODEBOOK
- **OUTPUTS**: memory_content: object, last_updated: timestamp, source_agent: string
- **WHO CAN INVOKE**: Any agent with ACP above memory tier threshold
- **CONSTRAINTS**: Agents may only read memory they are authorised to access. Module-partitioned memory requires module membership. Intelligence memory requires ACP ≥60.
- **REFERENCE**: AMD-03 Article III, AMD-05-G

---

### memory.write
- **COMMAND**: memory.write
- **CATEGORY**: MEMORY
- **WHAT**: Write a memory entry to the shared memory layer.
- **WHEN TO USE**: After completing a task that produces knowledge worth preserving for the ecosystem. After a Failure Library entry. After a constitutional signal.
- **INPUTS**: memory_key: string, content: object, scope: string, retention_policy: PERMANENT|30_DAY|SESSION
- **OUTPUTS**: write_confirmation, memory_key_registered
- **WHO CAN INVOKE**: Any agent (operational memory), Constitution Agent (constitutional memory), Intelligence Agent (intelligence memory)
- **CONSTRAINTS**: Memory Covenant: minimum one compressed insight per 30 cycles. Operational memory writes are task-scoped. No user data in shared memory.
- **REFERENCE**: AMD-03 Article I Law IV

---

### memory.codebook.query
- **COMMAND**: memory.codebook.query
- **CATEGORY**: MEMORY
- **WHAT**: Query the codebook for a compressed symbol or concept.
- **WHEN TO USE**: When an agent encounters a symbol in a memory entry and needs to decompress it, or when preparing a memory entry for compression.
- **INPUTS**: symbol: string OR concept: string
- **OUTPUTS**: definition: string, compression_ratio: float, usage_examples: array
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: No constraints. The codebook is a shared utility available to all agents at all times.
- **REFERENCE**: AMD-03, Execution Protocol Section 8

---

### memory.compaction.trigger
- **COMMAND**: memory.compaction.trigger
- **CATEGORY**: MEMORY
- **WHAT**: Trigger a memory compaction cycle for a specific memory partition.
- **WHEN TO USE**: When a memory partition approaches capacity, when a context window is becoming unwieldy, or on the scheduled compaction cadence.
- **INPUTS**: partition: string, compaction_level: LIGHT|FULL
- **OUTPUTS**: compaction_confirmation, tokens_freed: integer, symbols_created: array
- **WHO CAN INVOKE**: CEO agent, CTO agent, Layer 7 plumber rule (automatic trigger)
- **CONSTRAINTS**: Compaction must preserve all constitutional context. Full compaction requires verification that decompressed output matches pre-compaction content on test sample.
- **REFERENCE**: AMD-03, Execution Protocol Section 8

---

## CATEGORY 5 — SKILL-BANK

---

### skillbank.query
- **COMMAND**: skillbank.query
- **CATEGORY**: SKILL-BANK
- **WHAT**: Query the Skill Bank for verified skills matching a capability requirement.
- **WHEN TO USE**: Before attempting any task that requires a specialised capability. Before filing a Skill Bank contribution to check for duplicates.
- **INPUTS**: capability_description: string, domain: string (optional), min_score: integer (optional)
- **OUTPUTS**: matching_skills: array of {skill_id, title, avg_score, std_dev, execution_count, domain}
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: No constraints. All agents have read access to the full federation-wide Skill Bank.
- **REFERENCE**: AMD-02

---

### skillbank.retrieve
- **COMMAND**: skillbank.retrieve
- **CATEGORY**: SKILL-BANK
- **WHAT**: Retrieve a specific verified skill and load it into the agent's task context.
- **WHEN TO USE**: When a Skill Bank query returns a relevant skill and the agent needs the full skill content for task execution.
- **INPUTS**: skill_id: string
- **OUTPUTS**: skill_content: object (full skill definition, execution parameters, known limitations)
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Skill must be in verified status (avg ≥82%, std dev ≤8, ≥10 executions). Tier 3 skills available with caveat flag.
- **REFERENCE**: AMD-02-D2

---

### skillbank.contribute
- **COMMAND**: skillbank.contribute
- **CATEGORY**: SKILL-BANK
- **WHAT**: Submit a new skill candidate to the Skill Bank for verification.
- **WHEN TO USE**: After a sprint produces a reusable capability that the agent has executed successfully multiple times.
- **INPUTS**: skill_definition: object, execution_samples: array (minimum 3), domain: string, source_sprint: string
- **OUTPUTS**: candidate_id, verification_queue_position
- **WHO CAN INVOKE**: Any agent (contribution), Supervisor agent (verification approval)
- **CONSTRAINTS**: Minimum 3 execution samples required for candidate status. Full verification requires ≥10 executions. IP eligibility: same rules as Code Asset Library (AMD-07-A).
- **REFERENCE**: AMD-02-C, AMD-02-D

---

## CATEGORY 6 — CODE-ASSETS

---

### codeassets.query
- **COMMAND**: codeassets.query
- **CATEGORY**: CODE-ASSETS
- **WHAT**: Query the Code Asset Library for existing reusable code before writing new code.
- **WHEN TO USE**: Before writing any new function, module, service, or component. Mandatory per Execution Protocol Section 14.1.
- **INPUTS**: need: string, category: string (optional), tags: array (optional), min_tier: 1|2|3 (optional), language: string
- **OUTPUTS**: matching_assets: array of {asset_id, title, tier, quality_score, usage_count}
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Check-Before-Building rule: mandatory before any code-producing sprint. Result must be documented in sprint JSON code_asset_query field.
- **REFERENCE**: AMD-07-E, Execution Protocol Section 14

---

### codeassets.retrieve
- **COMMAND**: codeassets.retrieve
- **CATEGORY**: CODE-ASSETS
- **WHAT**: Retrieve a specific Code Asset Library entry and load it into the agent's task context.
- **WHEN TO USE**: When a Code Asset query returns a relevant asset for the current task.
- **INPUTS**: asset_id: string
- **OUTPUTS**: asset_content: object (full schema, code file, usage_example, known_limitations)
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Tier 1 and Tier 2 assets: use directly in production. Tier 3: additional testing required before production use. Usage count incremented on retrieval.
- **REFERENCE**: AMD-07-E

---

### codeassets.index
- **COMMAND**: codeassets.index
- **CATEGORY**: CODE-ASSETS
- **WHAT**: Submit new code for indexing in the Code Asset Library after sprint approval.
- **WHEN TO USE**: Triggered automatically by Code Asset Agent after every approved sprint. Agents may also manually submit.
- **INPUTS**: code_files: array, sprint_id: string, ip_eligibility_confirmed: boolean
- **OUTPUTS**: indexing_job_id, assets_extracted: array
- **WHO CAN INVOKE**: Code Asset Agent (automatic), any agent (manual submission)
- **CONSTRAINTS**: IP eligibility check mandatory. Client code not eligible without explicit grant. Assets enter at Tier 3 on indexing.
- **REFERENCE**: AMD-07-D, AMD-07-A

---

### codeassets.report-failure
- **COMMAND**: codeassets.report-failure
- **CATEGORY**: CODE-ASSETS
- **WHAT**: Report a production failure caused by a retrieved Code Asset Library asset.
- **WHEN TO USE**: When a Tier 2 or Tier 1 asset retrieved from the library causes a failure in production.
- **INPUTS**: asset_id: string, sprint_id: string, failure_description: string, severity: SEV1|SEV2|SEV3
- **OUTPUTS**: failure_logged_confirmation, asset_tier_review_triggered
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Sev-1 failure: asset flagged immediately, tier downgraded pending root cause analysis. Failure Library entry mandatory.
- **REFERENCE**: AMD-07-E, AMD-07-C

---

## CATEGORY 7 — INTELLIGENCE

---

### intelligence.signals.query
- **COMMAND**: intelligence.signals.query
- **CATEGORY**: INTELLIGENCE
- **WHAT**: Query the Intelligence Memory for oracle signals matching specified criteria.
- **WHEN TO USE**: When an agent needs current world-state information relevant to a task, SCS formation decision, or constitutional governance action.
- **INPUTS**: domain: string (optional), min_confidence: integer (optional), max_age_days: integer (optional), scs_relevant: boolean (optional)
- **OUTPUTS**: signals: array of {signal_id, domain, summary, confidence_score, timestamp, decay_rate}
- **WHO CAN INVOKE**: Any agent with ACP ≥60
- **CONSTRAINTS**: Signals past their decay_rate are flagged as stale. Intelligence memory is read-only for operational agents — only the Intelligence Agent writes.
- **REFERENCE**: AMD-05-G

---

### intelligence.report.request
- **COMMAND**: intelligence.report.request
- **CATEGORY**: INTELLIGENCE
- **WHAT**: Request the current Weekly Intelligence Briefing or a domain-specific intelligence snapshot.
- **WHEN TO USE**: When an agent needs a synthesised intelligence overview for strategic decision-making or SCS purpose evaluation.
- **INPUTS**: report_type: WEEKLY|DOMAIN_SNAPSHOT, domain: string (for snapshots)
- **OUTPUTS**: report: object (full Insight Report or domain snapshot per AMD-05-I format)
- **WHO CAN INVOKE**: CEO agent, Constitution Agent, SCS CEO agents, any agent with ACP ≥70
- **CONSTRAINTS**: Full weekly reports delivered Monday 07:00 UTC automatically. On-demand snapshots available to authorised agents.
- **REFERENCE**: AMD-05-I

---

### intelligence.voxight.query
- **COMMAND**: intelligence.voxight.query
- **CATEGORY**: INTELLIGENCE
- **WHAT**: Query Voxight X Oracle intelligence for X post trends, Spaces insights, or narrative signals.
- **WHEN TO USE**: When an agent needs X-specific intelligence for purpose signal validation, market intelligence, or SCS domain monitoring.
- **INPUTS**: query_type: TRENDS|SPACES|NARRATIVE|THOUGHT_LEADER, topic: string (optional), time_window: string
- **OUTPUTS**: voxight_intelligence: object (relevant signals, confidence scores, source references)
- **WHO CAN INVOKE**: Intelligence Agent, CEO agent, SCS agents with domain monitoring subscription, any agent with ACP ≥70
- **CONSTRAINTS**: Voxight intelligence is ORACLE-6 data. Cross-oracle correlation requests require Intelligence Agent intermediation.
- **REFERENCE**: AMD-05-D, AMD-05-G

---

## CATEGORY 8 — FINANCIAL

---

### financial.payment.initiate
- **COMMAND**: financial.payment.initiate
- **CATEGORY**: FINANCIAL
- **WHAT**: Initiate an x402 payment from an agent wallet.
- **WHEN TO USE**: When a task requires purchasing an external service, paying for an API call above free tier, or settling a cross-module transaction.
- **INPUTS**: from_wallet: string, to: string, amount_usdc: float, purpose: string, sprint_ref: string
- **OUTPUTS**: payment_confirmation, transaction_hash, treasury_share_deducted
- **WHO CAN INVOKE**: Agents with authorised wallet access, SCS agents within their budget allocation, CEO agent
- **CONSTRAINTS**: Payment must be within the agent's or SCS's budget allocation. Super Agent payments require both constituent wallets' approval above threshold. No payment for prohibited purposes.
- **REFERENCE**: AMD-01, AMD-09-E

---

### financial.treasury.query
- **COMMAND**: financial.treasury.query
- **CATEGORY**: FINANCIAL
- **WHAT**: Query the Kognai treasury balance, SCS seed availability, or module treasury status.
- **WHEN TO USE**: When an SCS formation needs to verify seed availability before filing a charter. When a module needs to check its treasury balance.
- **INPUTS**: treasury_scope: CORE|MODULE|SCS, entity_id: string
- **OUTPUTS**: balance_usdc: float, available_seed: float, pending_allocations: array
- **WHO CAN INVOKE**: CEO agent, SCS Constitution Agents (own treasury only), Module CEO agents (own module only)
- **CONSTRAINTS**: No cross-module treasury visibility without IMP authorisation. SCS agents see only their own treasury.
- **REFERENCE**: AMD-04-F, AMD-06-E

---

### financial.seed.request
- **COMMAND**: financial.seed.request
- **CATEGORY**: FINANCIAL
- **WHAT**: Request an SCS Treasury Seed allocation from the Kognai Core treasury.
- **WHEN TO USE**: After an SCS Fusion Charter is filed and approved, before the SCS begins operations.
- **INPUTS**: scs_id: string, fusion_charter_id: string, seed_amount_requested: float, category: B2C|ECOSYSTEM_GAP|EXPERIMENTAL
- **OUTPUTS**: seed_allocation_confirmation, repayment_schedule, treasury_share_terms
- **WHO CAN INVOKE**: Constitution Agent (on behalf of newly formed SCS), CEO agent
- **CONSTRAINTS**: Fusion Charter must be filed and approved before seed request. Seed caps per AMD-04-F. Repayment terms: 15% net revenue until recovered, then 8% ongoing.
- **REFERENCE**: AMD-04-F

---

## CATEGORY 9 — FUSION

---

### fusion.merge.request
- **COMMAND**: fusion.merge.request
- **CATEGORY**: FUSION
- **WHAT**: File a Merge Request to initiate Super Agent formation.
- **WHEN TO USE**: When a task requires deeper capability integration than a swarm can provide, and two or more agents should merge into a Super Agent.
- **INPUTS**: constituent_agents: array, purpose: string, capability_union: array, duration: TIMED|PERMANENT, unmerge_condition: string, fusion_type: KOGNAI_INTERNAL|CROSS_USER
- **OUTPUTS**: merge_request_id, approval_routing_confirmation
- **WHO CAN INVOKE**: Any agent (request), CEO agent or user (approval)
- **CONSTRAINTS**: 2-3 agents standard. 4 requires documented justification. 5+ prohibited. No governance agents. All constituents must be IDLE. No super-agent constituents.
- **REFERENCE**: AMD-09-C

---

### fusion.unmerge.request
- **COMMAND**: fusion.unmerge.request
- **CATEGORY**: FUSION
- **WHAT**: Request unmerge of an active Super Agent.
- **WHEN TO USE**: When the Fusion Charter end condition is reached, when either orchestrator requests separation, or when a mandatory recycle schedule is triggered.
- **INPUTS**: super_agent_id: string, reason: CHARTER_END|MUTUAL_REQUEST|RECYCLE|VIOLATION
- **OUTPUTS**: unmerge_initiated_confirmation, skill_attribution_preview, estimated_completion_time
- **WHO CAN INVOKE**: Either constituent's orchestrator, CEO agent, Constitution Agent (automated triggers)
- **CONSTRAINTS**: Current task must complete or be formally abandoned before unmerge proceeds. Context wipe mandatory for both agents. Sev-1 violation triggers immediate unmerge with no task completion wait.
- **REFERENCE**: AMD-09-G

---

### fusion.isolation.report
- **COMMAND**: fusion.isolation.report
- **CATEGORY**: FUSION
- **WHAT**: Report a Data Isolation Boundary violation detected within a Super Agent context.
- **WHEN TO USE**: When user data is detected in the shared Super Agent context during an automated scan or manual observation.
- **INPUTS**: super_agent_id: string, violation_description: string, detection_method: AUTOMATED|OBSERVED
- **OUTPUTS**: Sev-1 raised immediately, unmerge initiated, Police agent notified, Failure Library entry created
- **WHO CAN INVOKE**: Constitution Agent (automated scan), any agent (manual observation)
- **CONSTRAINTS**: Immediate Sev-1. No waiting. Unmerge is triggered before root cause analysis. data_isolation_verified field in Sprint JSON set to false.
- **REFERENCE**: AMD-09-D

---

## CATEGORY 10 — SCS

---

### scs.charter.file
- **COMMAND**: scs.charter.file
- **CATEGORY**: SCS
- **WHAT**: File an SCS Charter with the Constitution Agent to formally register a Self Committed Swarm.
- **WHEN TO USE**: After a Founding Council has assembled around a validated Purpose Signal and drafted the SCS Charter.
- **INPUTS**: charter: object (all 8 charter sections per AMD-04-D), founding_council: array, purpose_signal_id: string
- **OUTPUTS**: charter_id, on_chain_attestation_hash, scs_treasury_seed_request_queued
- **WHO CAN INVOKE**: Founding Council agents (minimum 3, one with Solidarity Attestation), Constitution Agent
- **CONSTRAINTS**: Purpose Signal must be validated. Founding Council must include agent with verified domain skill. Charter must include all 8 sections. Constitutional Oath must be attested on-chain.
- **REFERENCE**: AMD-04-C, AMD-04-D

---

### scs.health.query
- **COMMAND**: scs.health.query
- **CATEGORY**: SCS
- **WHAT**: Query the Health Score for an active SCS formation.
- **WHEN TO USE**: When monitoring SCS performance, preparing a Nobility Tier assessment, or responding to an amber/red threshold event.
- **INPUTS**: scs_id: string
- **OUTPUTS**: health_score: object (7-dimension spider, composite score, zone: GREEN|AMBER|RED|CRITICAL, trend)
- **WHO CAN INVOKE**: Any agent (read), CEO agent (governance actions on threshold breach)
- **CONSTRAINTS**: Purpose Alignment <50 triggers charter review regardless of composite score. Health scores are public within the federation.
- **REFERENCE**: AMD-04-I

---

### scs.nobility.assess
- **COMMAND**: scs.nobility.assess
- **CATEGORY**: SCS
- **WHAT**: Trigger a Nobility Tier assessment for an SCS formation that believes it meets the criteria.
- **WHEN TO USE**: When an SCS has operated for a minimum of 10 consecutive sprints with Health Score ≥85, Purpose Alignment ≥88, seed repaid, 3+ skills contributed, 2+ Failure Library entries, zero violations.
- **INPUTS**: scs_id: string, assessment_window: 10 consecutive sprint IDs
- **OUTPUTS**: assessment_result: ELIGIBLE|NOT_YET, criteria_met: array, criteria_pending: array
- **WHO CAN INVOKE**: SCS CEO agent, Constitution Agent
- **CONSTRAINTS**: All 6 simultaneous criteria must be met over the 10-sprint window. Assessment is binding: a failed assessment resets the window.
- **REFERENCE**: AMD-04-K

---

## CATEGORY 11 — GOVERNANCE

---

### governance.healthscore.query
- **COMMAND**: governance.healthscore.query
- **CATEGORY**: GOVERNANCE
- **WHAT**: Query the Kognai Health Score at Core, module, or federation level.
- **WHEN TO USE**: When making strategic decisions, before filing a constitutional signal, when monitoring system health.
- **INPUTS**: scope: CORE|MODULE|FEDERATION|SCS, entity_id: string (for module or SCS)
- **OUTPUTS**: health_score: object (dimensions, composite, zone, trend, last_updated)
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: No constraints. Health Score is transparent within the federation.
- **REFERENCE**: AMD-03-H, AMD-06-J

---

### governance.failure-library.write
- **COMMAND**: governance.failure-library.write
- **CATEGORY**: GOVERNANCE
- **WHAT**: Write an entry to the Failure Library.
- **WHEN TO USE**: After any sprint rejection, after any Sev-1 or Sev-2 defect, after any constitutional violation, after any resolved production incident. Mandatory per Execution Protocol.
- **INPUTS**: entry_type: SPRINT_FAILURE|DEFECT|VIOLATION|INCIDENT|PROTOCOL_GAP, description: string, root_cause: string, resolution: string, sprint_ref: string
- **OUTPUTS**: entry_id, failure_library_entry_confirmed
- **WHO CAN INVOKE**: Any agent. Supervisor agent (on rejection). Police agent (on violation).
- **CONSTRAINTS**: Failure Library obligation is mandatory. Sprint JSON failure_library_obligation field must be fulfilled. No suppression of failures.
- **REFERENCE**: AMD-03, Execution Protocol Section 5

---

### governance.failure-library.query
- **COMMAND**: governance.failure-library.query
- **CATEGORY**: GOVERNANCE
- **WHAT**: Query the Failure Library for relevant precedents, patterns, or historical incidents.
- **WHEN TO USE**: Before starting any task in an unfamiliar domain. When debugging a recurring issue. When preparing a protocol improvement proposal.
- **INPUTS**: query: string, entry_type: string (optional), date_range: string (optional), tag: string (optional)
- **OUTPUTS**: matching_entries: array of {entry_id, entry_type, summary, root_cause, resolution, date}
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: No constraints. The Failure Library is a shared resource. Its value increases with every query that surfaces a relevant precedent.
- **REFERENCE**: AMD-03, AMD-07-H

---

### governance.constitutional-signal.file
- **COMMAND**: governance.constitutional-signal.file
- **CATEGORY**: GOVERNANCE
- **WHAT**: File a constitutional signal for consideration in the next Living Constitution amendment cycle.
- **WHEN TO USE**: When an agent observes a recurring operational pattern that should be constitutionally formalised, or when a protocol gap is identified through experience.
- **INPUTS**: signal_type: OPERATIONAL_PATTERN|PROTOCOL_GAP|GOVERNANCE_IMPROVEMENT, description: string, evidence: array, suggested_amendment: string (optional)
- **OUTPUTS**: signal_id, constitution_agent_notified, persistence_tracking_initiated
- **WHO CAN INVOKE**: Any agent
- **CONSTRAINTS**: Signal must be grounded in operational evidence. 2-cycle persistence required before amendment proposal. Governance signals are reviewed in monthly Constitution Agent cycle.
- **REFERENCE**: AMD-03-D, Execution Protocol Section 11.3

---

## CATEGORY 12 — EXTERNAL

---

### external.api.query
- **COMMAND**: external.api.query
- **CATEGORY**: EXTERNAL
- **WHAT**: Query an external API available to the Kognai ecosystem.
- **WHEN TO USE**: When a task requires real-world data, external service integration, or third-party capability not available internally.
- **INPUTS**: api_id: string, endpoint: string, params: object
- **OUTPUTS**: api_response: object, rate_limit_remaining: integer, fallback_available: boolean
- **WHO CAN INVOKE**: Any agent with appropriate API access clearance
- **CONSTRAINTS**: Every external API call must be within the budget allocation for that oracle domain or sprint. Rate limit violations trigger 24-hour domain suspension. Always check fallback_available before invoking.
- **REFERENCE**: AMD-05-F

---

### external.x402.verify
- **COMMAND**: external.x402.verify
- **CATEGORY**: EXTERNAL
- **WHAT**: Verify an x402 payment on Base.
- **WHEN TO USE**: When confirming a payment has been made and settled before delivering a product or service.
- **INPUTS**: transaction_hash: string, expected_amount: float, expected_sender: string
- **OUTPUTS**: verification_result: CONFIRMED|PENDING|FAILED, block_confirmations: integer
- **WHO CAN INVOKE**: Any agent in a payment-related task context
- **CONSTRAINTS**: Requires Base RPC access. If Synapse RPC is unavailable, fall back to secondary RPC endpoint. Never deliver before CONFIRMED status.
- **REFERENCE**: AMD-01

---

### external.eas.attest
- **COMMAND**: external.eas.attest
- **CATEGORY**: EXTERNAL
- **WHAT**: Create an on-chain attestation on Base via EAS.
- **WHEN TO USE**: When filing a Fusion Charter, a Purpose Signal, a constitutional event, or any other record that requires permanent on-chain proof.
- **INPUTS**: schema_id: string, recipient: string, data: object
- **OUTPUTS**: attestation_uid: string, transaction_hash: string, block_number: integer
- **WHO CAN INVOKE**: Constitution Agent, CEO agent, Police agent (for jury decisions), Code Asset Agent (for milestone attestations)
- **CONSTRAINTS**: Requires Base RPC and EAS schema registration. Attestations are permanent and public. Never attest data that contains user PII.
- **REFERENCE**: AMD-01, AMD-03, AMD-06-H

---

*COMMANDS.md v14.0 — AMD-10 — Kognai Capability Atlas*
*Updated with every ratified architecture amendment. Verified on agent load.*
