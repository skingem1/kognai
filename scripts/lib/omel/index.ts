// OMEL Phase 1 — barrel export for all 5 components (Sprint 180, AMD-13)

export { phantomWorkspace }                        from './phantom-workspace';
export { credentialVault }                         from './credential-vault';
export { wipeWitness }                             from './wipe-witness';
export type { WitnessToken }                       from './wipe-witness';
export { humanBrake }                              from './human-brake';
export type { HighRiskOp, ApprovalResult }         from './human-brake';
export { contaminationGuard }                      from './contamination-guard';
export type { ContaminationContext }               from './contamination-guard';
