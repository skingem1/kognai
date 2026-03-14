import * as fs from 'fs/promises';
import * as path from 'path';

interface Agent {
  tokenId: number;
  ownerAddress: string;
  minted: boolean;
}

interface EASSchema {
  easContract: string;
  schemas: {
    [key: string]: {
      uid: string;
    };
  };
}

class AARMiddleware {
  private static instance: AARMiddleware | null = null;
  private chainRegistry: { agents: { [key: string]: Agent } } | null = null;
  private easSchemas: EASSchema | null = null;

  private constructor() {
    // Constructor remains synchronous
  }

  public static async initialize(): Promise<AARMiddleware> {
    if (AARMiddleware.instance) {
      return AARMiddleware.instance;
    }

    const middleware = new AARMiddleware();
    await middleware.loadChainRegistry();
    await middleware.loadEASSchemas();
    AARMiddleware.instance = middleware;
    return middleware;
  }

  private async loadChainRegistry(): Promise<void> {
    try {
      const filePath = path.join(__dirname, '../..', 'workspace', 'shared-context', 'CHAIN_REGISTRY.json');
      const data = await fs.readFile(filePath, 'utf-8');
      this.chainRegistry = JSON.parse(data);
    } catch (error) {
      console.error('Failed to load chain registry:', error);
      throw error;
    }
  }

  private async loadEASSchemas(): Promise<void> {
    try {
      const filePath = path.join(__dirname, '../..', 'workspace', 'shared-context', 'EAS_SCHEMAS.json');
      const data = await fs.readFile(filePath, 'utf-8');
      this.easSchemas = JSON.parse(data);
    } catch (error) {
      console.error('Failed to load EAS schemas:', error);
      throw error;
    }
  }

  public getAgentById(id: string): Agent | undefined {
    if (!this.chainRegistry || !this.chainRegistry.agents) {
      return undefined;
    }
    return this.chainRegistry.agents[id];
  }

  public async logEvent(eventType: string, agentId: string, payload: any): Promise<void> {
    const agent = this.getAgentById(agentId);
    if (!agent) {
      console.error(`Agent ${agentId} not found for event logging`);
      return;
    }

    // Placeholder structure for EAS attestation call
    // This would be replaced with actual contract interaction after sprint completion
    console.log({
      event: eventType,
      agent,
      payload,
      easSchema: this.easSchemas?.schemas[eventType],
      contract: this.easSchemas?.easContract,
    });
  }

  public async generateAndLog(eventType: string, agentId: string, payload: any): Promise<void> {
    await this.logEvent(eventType, agentId, payload);
  }
}

export { AARMiddleware };