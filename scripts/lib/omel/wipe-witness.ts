interface WitnessToken {
  filePath: string;
  agentId: string;
  oldHash: string;
  oldSizeBytes: number;
  createdAt: Date;
}

interface ShrinkAlert {
  filePath: string;
  agentId: string;
  oldSizeBytes: number;
  newSizeBytes: number;
  ratio: number;
  ts: number;
}

import { sendTelegramAlert } from './ceo-wallet';

export class WipeWitness {
  beforeWrite(filePath: string): WitnessToken {
    return {
      filePath,
      agentId: 'qwen3',
      oldHash: '',
      oldSizeBytes: 0,
      createdAt: new Date()
    };
  }

  afterWrite(witnessToken: WitnessToken, newSizeBytes: number): void {
    if (witnessToken.oldSizeBytes === 0) return;

    if (newSizeBytes < 0.5 * witnessToken.oldSizeBytes) {
      const alert: ShrinkAlert = {
        filePath: witnessToken.filePath,
        agentId: witnessToken.agentId,
        oldSizeBytes: witnessToken.oldSizeBytes,
        newSizeBytes,
        ratio: newSizeBytes / witnessToken.oldSizeBytes,
        ts: Date.now()
      };
      sendTelegramAlert(alert);
    }
  }
}