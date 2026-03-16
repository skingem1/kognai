import * as fs from 'fs';
import * as path from 'path';
import { Router } from '../runtime/router';
import { DedupLedger } from '../runtime/dedupledger';
import { GateReport } from '../workspace/shared-types';

const KOGNAI_ROOT = process.env.KOGNAI_ROOT || '/Users/tarekmnif/kognai';
const GATE_REPORT_PATH = path.join(KOGNAI_ROOT, 'workspace/gates/phase0-phase1-gate.json');
const ROUTING_LOG_PATH = path.join(KOGNAI_ROOT, 'logs/routing/latest-routing.log');
const ROUTER_PY_PATH = path.join(KOGNAI_ROOT, 'runtime/router.py');

interface ValidationReport {
  status: 'passed' | 'failed';
  routingValid: boolean;
  dedupValid: boolean;
  dryRunValid: boolean;
  details: {
    routing?: string[];
    dedup?: string[];
    dryRun?: string[];
  };
}

async function validatePhase0Gate(): Promise<ValidationReport> {
  const report: ValidationReport = {
    status: 'failed',
    routingValid: false,
    dedupValid: false,
    dryRunValid: false,
    details: {}
  };

  try {
    // 1. Validate routing logic in router.py
    const routerPyContent = fs.readFileSync(ROUTER_PY_PATH, 'utf-8');
    const routingValid = routerPyContent.includes('ollama') && routerPyContent.includes('TASK_TARGET');
    report.routingValid = routingValid;
    report.details.routing = routingValid 
      ? ['Router.py contains required ollama/TASK_TARGET references']
      : ['Router.py missing ollama/TASK_TARGET references'];

    // 2. Validate routing logs
    let routingLogValid = false;
    if (fs.existsSync(ROUTING_LOG_PATH)) {
      const logLines = fs.readFileSync(ROUTING_LOG_PATH, 'utf-8').split('\n');
      const taskTargetLines = logLines.filter(line => line.includes('TASK_TARGET'));
      routingLogValid = taskTargetLines.some(line => line.includes('ollama'));
      report.details.routing = report.details.routing || [];
      report.details.routing.push(`Found ${taskTargetLines.length} TASK_TARGET lines, ${taskTargetLines.filter(line => line.includes('ollama')).length} contain ollama`);
    } else {
      report.details.routing.push(`Routing log file not found at ${ROUTING_LOG_PATH}`);
    }
    report.routingValid = report.routingValid && routingLogValid;

    // 3. Validate DedupLedger
    const dedupValid = await checkDedupLedger();
    report.dedupValid = dedupValid;
    report.details.dedup = dedupValid 
      ? ['DedupLedger successfully prevented duplicate clip']
      : ['DedupLedger failed to prevent duplicate clip'];

    // 4. Validate dry-run output
    const dryRunValid = await checkDryRunOutput();
    report.dryRunValid = dryRunValid;
    report.details.dryRun = dryRunValid 
      ? ['Dry-run produced valid output structure']
      : ['Dry-run output structure validation failed'];

    // Final status determination
    report.status = (report.routingValid && report.dedupValid && report.dryRunValid) ? 'passed' : 'failed';

    // Write gate report
    await fs.promises.mkdir(path.dirname(GATE_REPORT_PATH), { recursive: true });
    await fs.promises.writeFile(GATE_REPORT_PATH, JSON.stringify(report, null, 2));

  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(`Gate validation failed: ${errorMessage}`);
    report.details.dryRun = report.details.dryRun || [];
    report.details.dryRun.push(`Critical error during validation: ${errorMessage}`);
    report.status = 'failed';
    
    // Write error report even if validation fails
    try {
      await fs.promises.mkdir(path.dirname(GATE_REPORT_PATH), { recursive: true });
      await fs.promises.writeFile(GATE_REPORT_PATH, JSON.stringify(report, null, 2));
    } catch (writeError) {
      console.error(`Failed to write gate report: ${(writeError as Error).message}`);
    }
  }

  return report;
}

async function checkDedupLedger(): Promise<boolean> {
  const ledger = new DedupLedger();
  try {
    // Insert test clip
    await ledger.insertClip('test-clip-123', 'test-clip-123');
    
    // Attempt to insert duplicate
    try {
      await ledger.insertClip('test-clip-123', 'test-clip-123');
      return false; // Should throw error on duplicate
    } catch (error) {
      // Verify error is a DuplicateClipError
      const errorMsg = (error as Error).message;
      if (errorMsg.includes('Duplicate clip')) {
        // Clean up test data
        await ledger.removeClip('test-clip-123');
        return true;
      }
      throw error;
    }
  } catch (error) {
    console.error(`DedupLedger test failed: ${(error as Error).message}`);
    return false;
  }
}

async function checkDryRunOutput(): Promise<boolean> {
  const router = new Router();
  try {
    const result = await router.processTask({
      type: 'test',
      payload: { test: 'data' }
    });
    
    return (
      result && 
      result.status && 
      result.payload && 
      typeof result.payload === 'object'
    );
  } catch (error) {
    console.error(`Dry-run validation failed: ${(error as Error).message}`);
    return false;
  }
}

// Entry point
validatePhase0Gate()
  .catch(error => {
    console.error(`Gate validation entry point failed: ${(error as Error).message}`);
  });