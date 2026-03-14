// AMD-01 CHAIN3 — Agent Action Receipt (AAR) type definitions
// Matches taskCompletion EAS schema on Base: 0x79d2573e8f7ef1719213192ab2b2978225a4335d1e3b4bda1197954bca3f8a9c

export interface AARReceipt {
  receiptId: string;        // '{sprintId}-{taskId}-{epoch}'
  agentId: string;          // 'harvey' | 'messi' | 'sherlock'
  agentAddress: string;     // ERC-8004 owner address (from CHAIN_REGISTRY.json)
  taskId: string;           // e.g. '073-01'
  sprintId: string;         // e.g. 'sprint-073'
  skillId: string;          // e.g. 'code-generation'
  outcomeScore: number;     // 0-100 (supervisor review score)
  actionSummary: string;    // ≤ 140 chars, describes what the agent did
  aarReceiptHash: string;   // sha256 hex of receipt JSON without this field
  timestamp: string;        // ISO 8601
  status: 'success' | 'failed' | 'rejected';
}

export interface AARConfig {
  enabled: boolean;
  logDir: string;           // 'logs/aar'
  onChainEnabled: boolean;  // false in Phase 1 — EAS write is Phase 2
  easEndpoint: string;      // 'https://base.easscan.org'
  taskCompletionSchemaUid: string; // EAS schema UID from EAS_SCHEMAS.json
}

export interface AARWriteResult {
  receipt: AARReceipt;
  logFile: string;          // path to JSONL file written
  onChainTxHash?: string;   // Phase 2 only
}

export interface AARParams {
  agentId: string;
  taskId: string;
  sprintId: string;
  skillId: string;
  outcomeScore: number;
  actionSummary: string;
  status: 'success' | 'failed' | 'rejected';
}
