import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

// Type definitions
export interface AarReceipt {
  taskId: string;
  agentId: string;
  agentAddress: string;
  taskOutput: string;
  aarReceiptHash: string;
  schemaUid: string;
  timestamp: number;
}

export interface AarLogEntry extends AarReceipt {
  loggedAt: string;
  logType: 'aar_receipt';
}

// Constants
const CHAIN_REGISTRY_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'workspace',
  'shared-context',
  'CHAIN_REGISTRY.json'
);

const LOGS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs', 'aar');

// Implementation
export async function generateAarReceipt(
  taskId: string,
  agentId: string,
  taskOutput: string
): Promise<AarLogEntry> {
  // Read agent address from CHAIN_REGISTRY
  const chainRegistry = JSON.parse(await fs.promises.readFile(CHAIN_REGISTRY_PATH, 'utf-8'));
  const agentAddress = chainRegistry[agentId as keyof typeof chainRegistry];
  
  if (!agentAddress) {
    throw new Error(`Agent address not found in CHAIN_REGISTRY for agentId: ${agentId}`);
  }

  // Create receipt
  const receipt: AarReceipt = {
    taskId,
    agentId,
    agentAddress,
    taskOutput,
    schemaUid: '0x79d2573e8f7ef1719213192ab2b2978225a4335d1e3b4bda1197954bca3f8a9c',
    timestamp: Math.floor(Date.now() / 1000)
  };

  // Compute SHA-256 hash
  const receiptHash = crypto.createHash('sha256')
    .update(JSON.stringify(receipt))
    .digest('hex');

  // Create log entry
  const logEntry: AarLogEntry = {
    ...receipt,
    aarReceiptHash: receiptHash,
    loggedAt: new Date().toISOString(),
    logType: 'aar_receipt'
  };

  // Write to JSONL log
  await writeJsonlLog(logEntry);

  return logEntry;
}

async function writeJsonlLog(entry: AarLogEntry): Promise<void> {
  // Create logs directory if not exists
  await promisify(fs.mkdir)(LOGS_DIR, { recursive: true });

  // Format date for filename
  const date = new Date();
  const logFilename = path.join(
    LOGS_DIR,
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.jsonl`
  );

  // Append to log file
  await fs.promises.appendFile(
    logFilename,
    JSON.stringify(entry) + '\n'
  );
}