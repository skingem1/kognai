// OMEL Phase 1 + Phase 2 + SEC1 — barrel export for all 6 components (Sprint 180/185, AMD-13, TICKET-012-SEC1)

export { phantomWorkspace }                          from './phantom-workspace';
export type { PhantomContext }                       from './phantom-workspace';
export { credentialVault }                           from './credential-vault';
export type { CredentialVault }                      from './credential-vault';
export { wipeWitness }                               from './wipe-witness';
export type { WitnessToken, ShrinkAlert,
              IntegrityReport }                      from './wipe-witness';
export { humanBrake }                               from './human-brake';
export type { HighRiskOp, ApprovalResult }           from './human-brake';
export { contaminationGuard }                        from './contamination-guard';
export type { ContaminationContext }                 from './contamination-guard';
export { auditOllamaLoopback, auditClawRouterLoopback } from './network-audit';
export type { NetworkAuditResult }                      from './network-audit';
