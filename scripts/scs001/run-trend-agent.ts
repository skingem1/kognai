import path from 'path';
import { mkdir } from 'fs/promises';
import { TrendAgent } from '../agents/trend-agent';

const main = async () => {
  const args = process.argv.slice(2);
  const validArgs = new Set(['--dry-run', '--help']);
  const unknownArgs = args.filter(arg => !validArgs.has(arg));

  if (unknownArgs.length > 0) {
    console.log(`Unknown arguments: ${unknownArgs.join(', ')}`);
    console.log('Usage: npx ts-node scripts/scs001/run-trend-agent.ts [--dry-run] [--help]');
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help');

  if (help) {
    console.log('Usage: npx ts-node scripts/scs001/run-trend-agent.ts [--dry-run] [--help]');
    return;
  }

  const outputDir = path.join(__dirname, '..', '..', 'workspace', 'scs001', 'trend-outputs');

  try {
    await mkdir(outputDir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create output directory ${outputDir}:`, err);
    process.exit(1);
  }

  try {
    await TrendAgent.run({ outputDir, dryRun });
  } catch (err) {
    console.error('Error running TrendAgent:', err);
    process.exit(1);
  }
};

main();