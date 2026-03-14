// AMD-01 CHAIN3 — Agent Action Receipt middleware
// Phase 1: generate receipt + append to logs/aar/YYYY-MM-DD.jsonl
// Phase 2 (TODO): write EAS on-chain attestation via base.easscan.org

import { createHash } from 'crypto';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AARReceipt, AARConfig, AARWriteResult, AARParams } from './aar-types';

const ROOT = join(__dirname, '../..');
const EAS_SCHEMAS_PATH = join(ROOT, 'workspace/shared-context/EAS_SCHEMAS.json');
const CHAIN_REGISTRY_PATH = join(ROOT, 'workspace/shared-context/CHAIN_REGISTRY.json');

function loadConfig(): AARConfig {
  const schemas = JSON.parse(readFileSync(EAS_SCHEMAS_PATH, 'utf-8')) as {
    easContract: string;
    schemas: { taskCompletion: { uid: string } };
  };
  return {
    enabled: true,
    logDir: join(ROOT, 'logs/aar'),
    onChainEnabled: false,
    easEndpoint: schemas.easContract,
    taskCompletionSchemaUid: schemas.schemas.taskCompletion.uid,
  };
}

function getAgentAddress(agentId: string): string {
  try {
    const registry = JSON.parse(readFileSync(CHAIN_REGISTRY_PATH, 'utf-8')) as {
      agents: Record<string, { ownerAddress: string }>;
    };
    return registry.agents[agentId]?.ownerAddress || '0x0000000000000000000000000000000000000000';
  } catch {
    return '0x0000000000000000000000000000000000000000';
  }
}

export class AARMiddleware {
  static generateReceipt(params: AARParams): AARReceipt {
    const receiptId = `${params.sprintId}-${params.taskId}-${Date.now()}`;
    const agentAddress = getAgentAddress(params.agentId);
    const partial = {
      receiptId,
      agentId: params.agentId,
      agentAddress,
      taskId: params.taskId,
      sprintId: params.sprintId,
      skillId: params.skillId,
      outcomeScore: params.outcomeScore,
      actionSummary: params.actionSummary.substring(0, 140),
      timestamp: new Date().toISOString(),
      status: params.status,
    };
    const aarReceiptHash = createHash('sha256')
      .update(JSON.stringify(partial))
      .digest('hex');
    return { ...partial, aarReceiptHash };
  }

  static writeLog(receipt: AARReceipt): AARWriteResult {
    const config = loadConfig();
    if (!config.enabled) return { receipt, logFile: '' };
    const today = new Date().toISOString().substring(0, 10);
    const logFile = join(config.logDir, `${today}.jsonl`);
    if (!existsSync(config.logDir)) mkdirSync(config.logDir, { recursive: true });
    appendFileSync(logFile, JSON.stringify(receipt) + '\n', 'utf-8');
    return { receipt, logFile };
  }

  static async generateAndLog(params: AARParams): Promise<AARWriteResult> {
    const receipt = AARMiddleware.generateReceipt(params);
    return AARMiddleware.writeLog(receipt);
  }
}
