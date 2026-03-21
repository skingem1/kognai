/**
 * ACP — Agent Capability Protocol v1
 *
 * Defines capability declarations for each agent in the Kognai swarm.
 * Each agent declares what it CAN and CANNOT do, enabling:
 *   - Constitution enforcement (prevent agents from exceeding scope)
 *   - CTO approval gate capability checks
 *   - Task routing based on declared capabilities
 *
 * Capability tiers:
 *   T1 (Foundation): read, write, search
 *   T2 (Content):    llm_call, tts, video_gen, script_gen
 *   T3 (Integration): api_call, db_query, telegram, stripe
 *   T4 (System):     deploy, pm2, git_push, shell_exec
 *
 * Sprint 650 — ACP v1 implementation
 */

// ── Types ─────────────────────────────────────────────────────────────

export type CapabilityTier = 'T1' | 'T2' | 'T3' | 'T4';

export type Capability =
  // T1 Foundation
  | 'read_files' | 'write_files' | 'search_code' | 'git_read'
  // T2 Content
  | 'llm_call_local' | 'llm_call_cloud' | 'tts_generate' | 'video_composite'
  | 'script_generate' | 'image_generate' | 'avatar_generate'
  // T3 Integration
  | 'api_call_external' | 'db_query' | 'db_write' | 'telegram_send'
  | 'stripe_read' | 'stripe_write' | 'youtube_read' | 'tiktok_post'
  // T4 System
  | 'deploy' | 'pm2_manage' | 'git_push' | 'shell_exec' | 'env_modify';

export interface AgentCapabilityDeclaration {
  agent_id:       string;
  display_name:   string;
  tier:           CapabilityTier;
  capabilities:   Capability[];
  denied:         Capability[];    // Explicit denials (overrides any grants)
  scope:          string;          // Human-readable scope description
  max_model_tier: 'nano' | 'local' | 'power' | 'cloud' | 'apex';
}

export interface CapabilityCheckResult {
  allowed:  boolean;
  agent_id: string;
  capability: Capability;
  reason:   string;
}

// ── Capability Tier Map ───────────────────────────────────────────────

const TIER_CAPABILITIES: Record<CapabilityTier, Capability[]> = {
  T1: ['read_files', 'write_files', 'search_code', 'git_read'],
  T2: ['llm_call_local', 'llm_call_cloud', 'tts_generate', 'video_composite',
       'script_generate', 'image_generate', 'avatar_generate'],
  T3: ['api_call_external', 'db_query', 'db_write', 'telegram_send',
       'stripe_read', 'stripe_write', 'youtube_read', 'tiktok_post'],
  T4: ['deploy', 'pm2_manage', 'git_push', 'shell_exec', 'env_modify'],
};

// ── Agent Registry ────────────────────────────────────────────────────

const REGISTRY: AgentCapabilityDeclaration[] = [
  // ─── Kognai Core Agents ─────────────────────────────────
  {
    agent_id: 'ceo', display_name: 'CEO', tier: 'T4',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local', 'llm_call_cloud', 'shell_exec', 'git_push'],
    denied: ['stripe_write', 'tiktok_post', 'env_modify'],
    scope: 'Strategy, vision, agent coordination. No financial ops or posting.',
    max_model_tier: 'apex',
  },
  {
    agent_id: 'cto', display_name: 'CTO', tier: 'T4',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local', 'llm_call_cloud', 'shell_exec', 'git_push', 'deploy', 'pm2_manage'],
    denied: ['stripe_write', 'tiktok_post'],
    scope: 'Architecture review, sprint approval, deployment, infra management.',
    max_model_tier: 'cloud',
  },
  {
    agent_id: 'cfo', display_name: 'CFO', tier: 'T3',
    capabilities: ['read_files', 'search_code', 'git_read', 'llm_call_local', 'stripe_read', 'db_query'],
    denied: ['write_files', 'shell_exec', 'git_push', 'deploy', 'stripe_write'],
    scope: 'Financial reporting, cost tracking, budget analysis. Read-only financial access.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'cmo', display_name: 'CMO', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write', 'stripe_write'],
    scope: 'Marketing strategy, content planning, brand narrative.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'supervisor', display_name: 'Supervisor', tier: 'T3',
    capabilities: ['read_files', 'search_code', 'git_read', 'llm_call_local', 'db_query'],
    denied: ['write_files', 'shell_exec', 'deploy', 'git_push'],
    scope: 'Sprint review, quality validation. Read-only analysis.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'devops', display_name: 'DevOps', tier: 'T4',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'shell_exec', 'deploy', 'pm2_manage', 'git_push', 'env_modify'],
    denied: ['stripe_write', 'tiktok_post', 'llm_call_cloud'],
    scope: 'Infrastructure, deployment, monitoring, PM2 process management.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'security', display_name: 'Security', tier: 'T3',
    capabilities: ['read_files', 'search_code', 'git_read', 'llm_call_local', 'db_query'],
    denied: ['write_files', 'shell_exec', 'deploy', 'git_push', 'db_write'],
    scope: 'Security audit, vulnerability scanning. Read-only.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'achiri', display_name: 'Achiri', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'llm_call_local', 'llm_call_cloud', 'db_query', 'db_write', 'telegram_send'],
    denied: ['shell_exec', 'deploy', 'git_push', 'stripe_write'],
    scope: 'AI companion conversations, memory, Tunisian cultural adaptation.',
    max_model_tier: 'cloud',
  },
  {
    agent_id: 'backend-core', display_name: 'Backend Core', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'db_query', 'db_write', 'api_call_external'],
    denied: ['deploy', 'shell_exec', 'stripe_write'],
    scope: 'Backend API development, database operations.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'backend-ledger', display_name: 'Backend Ledger', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'db_query', 'db_write'],
    denied: ['deploy', 'shell_exec', 'stripe_write'],
    scope: 'Ledger management, financial record keeping.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'backend-tax', display_name: 'Backend Tax', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'db_query'],
    denied: ['deploy', 'shell_exec', 'stripe_write', 'db_write'],
    scope: 'Tax calculation logic. Read-only DB.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'bizdev', display_name: 'BizDev', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write', 'stripe_write'],
    scope: 'Business development strategy and research.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'conflict-analyzer', display_name: 'Conflict Analyzer', tier: 'T1',
    capabilities: ['read_files', 'search_code', 'git_read'],
    denied: ['write_files', 'shell_exec', 'deploy', 'db_write'],
    scope: 'Detect conflicts between agent outputs. Read-only.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'conway-integration', display_name: 'Conway Integration', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Conway governance protocol integration.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'execution-verifier', display_name: 'Execution Verifier', tier: 'T1',
    capabilities: ['read_files', 'search_code', 'git_read'],
    denied: ['write_files', 'shell_exec', 'deploy'],
    scope: 'Verify sprint execution results. Read-only.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'execution-watchdog', display_name: 'Execution Watchdog', tier: 'T2',
    capabilities: ['read_files', 'search_code', 'git_read', 'llm_call_local', 'telegram_send'],
    denied: ['write_files', 'shell_exec', 'deploy'],
    scope: 'Monitor execution health, alert on anomalies.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'frontend', display_name: 'Frontend', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write', 'stripe_write'],
    scope: 'Frontend UI development.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'invoica-x-admin', display_name: 'Invoica X Admin', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'api_call_external'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Invoica cross-product administration.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'market-intelligence', display_name: 'Market Intelligence', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local', 'api_call_external'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Market research, competitor analysis, trend tracking.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'pipeline-health-monitor', display_name: 'Pipeline Health Monitor', tier: 'T3',
    capabilities: ['read_files', 'search_code', 'git_read', 'db_query', 'telegram_send'],
    denied: ['write_files', 'shell_exec', 'deploy'],
    scope: 'Monitor pipeline health metrics, send alerts.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'skills', display_name: 'Skills Manager', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'OpenClaw skills registry management.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'sprint-retrospective', display_name: 'Sprint Retrospective', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Sprint analysis and retrospective reports.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'telegram-support', display_name: 'Telegram Support', tier: 'T3',
    capabilities: ['read_files', 'search_code', 'git_read', 'telegram_send', 'llm_call_local'],
    denied: ['write_files', 'shell_exec', 'deploy', 'db_write'],
    scope: 'Telegram bot command handling and notifications.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'test-failure-predictor', display_name: 'Test Failure Predictor', tier: 'T1',
    capabilities: ['read_files', 'search_code', 'git_read'],
    denied: ['write_files', 'shell_exec', 'deploy'],
    scope: 'Predict likely test failures from code changes.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'test-runner', display_name: 'Test Runner', tier: 'T2',
    capabilities: ['read_files', 'search_code', 'git_read', 'shell_exec'],
    denied: ['write_files', 'deploy', 'git_push', 'db_write'],
    scope: 'Execute test suites. Shell access for test commands only.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'test-utility-generator', display_name: 'Test Utility Generator', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Generate test fixtures and utility code.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'x-admin', display_name: 'X Admin', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'git_read', 'api_call_external'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'X/Twitter administration and posting.',
    max_model_tier: 'power',
  },

  // ─── SCS-001 Pipeline Agents ────────────────────────────
  {
    agent_id: 'scs001-orchestrator', display_name: 'SCS-001 Orchestrator', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'search_code', 'llm_call_local', 'llm_call_cloud', 'api_call_external', 'telegram_send'],
    denied: ['deploy', 'git_push', 'stripe_write', 'env_modify'],
    scope: 'Video pipeline orchestration. Coordinates all SCS-001 agents.',
    max_model_tier: 'cloud',
  },
  {
    agent_id: 'scs001-discovery', display_name: 'SCS-001 Discovery', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'api_call_external', 'youtube_read'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Discover trending topics and YouTube clips.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-clip-detection', display_name: 'SCS-001 Clip Detection', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Detect and score clips from downloaded videos.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'scs001-insight', display_name: 'SCS-001 Insight', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local', 'llm_call_cloud'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Generate insight briefs from qualified clips.',
    max_model_tier: 'cloud',
  },
  {
    agent_id: 'scs001-script', display_name: 'SCS-001 Script', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local', 'llm_call_cloud', 'script_generate'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Generate video scripts from insight briefs. LLM rewrite.',
    max_model_tier: 'cloud',
  },
  {
    agent_id: 'scs001-script-validator', display_name: 'SCS-001 Script Validator', tier: 'T1',
    capabilities: ['read_files'],
    denied: ['write_files', 'shell_exec', 'deploy'],
    scope: 'Validate script bundles for quality and format compliance.',
    max_model_tier: 'nano',
  },
  {
    agent_id: 'scs001-scorer', display_name: 'SCS-001 Scorer', tier: 'T1',
    capabilities: ['read_files', 'write_files'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Score content quality and viral potential.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-editing', display_name: 'SCS-001 Editing', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'shell_exec', 'video_composite', 'tts_generate'],
    denied: ['deploy', 'git_push', 'api_call_external'],
    scope: 'Video editing, FFmpeg composition, TTS generation.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-caption', display_name: 'SCS-001 Caption', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'shell_exec', 'video_composite'],
    denied: ['deploy', 'git_push'],
    scope: 'Burn captions and subtitles into video.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-qc', display_name: 'SCS-001 QC', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Quality control checks on finished videos.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'scs001-publishing', display_name: 'SCS-001 Publishing', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'api_call_external', 'tiktok_post', 'telegram_send'],
    denied: ['shell_exec', 'deploy', 'git_push'],
    scope: 'Publish videos to TikTok and notify via Telegram.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-hosting', display_name: 'SCS-001 Hosting', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'api_call_external'],
    denied: ['shell_exec', 'deploy', 'git_push'],
    scope: 'Upload and host video files.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-analytics', display_name: 'SCS-001 Analytics', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'db_query', 'api_call_external'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'View analytics, engagement metrics, performance tracking.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-trend', display_name: 'SCS-001 Trend', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'api_call_external', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'db_write'],
    scope: 'Track trending topics across platforms.',
    max_model_tier: 'power',
  },
  {
    agent_id: 'scs001-experiment', display_name: 'SCS-001 Experiment', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'A/B testing framework for content optimization.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-flywheel', display_name: 'SCS-001 Flywheel', tier: 'T2',
    capabilities: ['read_files', 'write_files', 'llm_call_local'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Content flywheel optimization and feedback loops.',
    max_model_tier: 'local',
  },
  {
    agent_id: 'scs001-failure-library', display_name: 'SCS-001 Failure Library', tier: 'T1',
    capabilities: ['read_files', 'write_files'],
    denied: ['shell_exec', 'deploy', 'api_call_external'],
    scope: 'Track and learn from pipeline failures.',
    max_model_tier: 'nano',
  },
  {
    agent_id: 'scs001-viral-downloader', display_name: 'SCS-001 Viral Downloader', tier: 'T3',
    capabilities: ['read_files', 'write_files', 'api_call_external', 'shell_exec'],
    denied: ['deploy', 'git_push', 'db_write'],
    scope: 'Download viral video clips for analysis. Shell for yt-dlp.',
    max_model_tier: 'local',
  },
];

// ── Public API ────────────────────────────────────────────────────────

/** Get all registered agents */
export function getAllAgents(): AgentCapabilityDeclaration[] {
  return [...REGISTRY];
}

/** Get a specific agent by ID */
export function getAgent(agentId: string): AgentCapabilityDeclaration | undefined {
  return REGISTRY.find(a => a.agent_id === agentId);
}

/** Check if an agent has a specific capability */
export function checkCapability(agentId: string, capability: Capability): CapabilityCheckResult {
  const agent = getAgent(agentId);
  if (!agent) {
    return { allowed: false, agent_id: agentId, capability, reason: `Agent "${agentId}" not registered in ACP` };
  }

  // Explicit denials always override
  if (agent.denied.includes(capability)) {
    return { allowed: false, agent_id: agentId, capability, reason: `Capability "${capability}" explicitly denied for ${agent.display_name}` };
  }

  // Check if capability is in agent's granted list
  if (agent.capabilities.includes(capability)) {
    return { allowed: true, agent_id: agentId, capability, reason: `Capability "${capability}" granted to ${agent.display_name}` };
  }

  return { allowed: false, agent_id: agentId, capability, reason: `Capability "${capability}" not declared for ${agent.display_name}` };
}

/** Check multiple capabilities at once */
export function checkCapabilities(agentId: string, capabilities: Capability[]): CapabilityCheckResult[] {
  return capabilities.map(cap => checkCapability(agentId, cap));
}

/** Get all agents with a specific capability */
export function getAgentsWithCapability(capability: Capability): AgentCapabilityDeclaration[] {
  return REGISTRY.filter(a => a.capabilities.includes(capability) && !a.denied.includes(capability));
}

/** Get the tier for a capability */
export function getCapabilityTier(capability: Capability): CapabilityTier | undefined {
  for (const [tier, caps] of Object.entries(TIER_CAPABILITIES)) {
    if ((caps as Capability[]).includes(capability)) return tier as CapabilityTier;
  }
  return undefined;
}

/** Validate that a sprint's task assignments respect ACP */
export function validateSprintAssignments(
  tasks: Array<{ agent: string; required_capabilities: Capability[] }>
): { valid: boolean; violations: CapabilityCheckResult[] } {
  const violations: CapabilityCheckResult[] = [];
  for (const task of tasks) {
    for (const cap of task.required_capabilities) {
      const result = checkCapability(task.agent, cap);
      if (!result.allowed) violations.push(result);
    }
  }
  return { valid: violations.length === 0, violations };
}

/** Get summary stats */
export function getRegistryStats(): {
  total_agents: number;
  by_tier: Record<CapabilityTier, number>;
  kognai_agents: number;
  scs001_agents: number;
} {
  const byTier: Record<CapabilityTier, number> = { T1: 0, T2: 0, T3: 0, T4: 0 };
  let scs001 = 0;
  for (const a of REGISTRY) {
    byTier[a.tier]++;
    if (a.agent_id.startsWith('scs001-')) scs001++;
  }
  return {
    total_agents: REGISTRY.length,
    by_tier: byTier,
    kognai_agents: REGISTRY.length - scs001,
    scs001_agents: scs001,
  };
}
