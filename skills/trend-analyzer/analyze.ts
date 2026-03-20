/**
 * trend-analyzer — T2 Content Skill stub
 * Wraps SCS-001 discovery agent for trending topic analysis.
 * Full implementation in scripts/scs001/ discovery + trend agents.
 */
import * as fs from 'fs';
import * as path from 'path';

const NICHES_PATH = path.join(__dirname, '../../workspace/scs001/viral-topics.json');

interface Topic {
  topic: string;
  niche: string;
  score: number;
  source: string;
  timestamp: string;
}

function loadTopics(): Topic[] {
  if (!fs.existsSync(NICHES_PATH)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(NICHES_PATH, 'utf-8'));
    return Array.isArray(data) ? data : data.topics || [];
  } catch { return []; }
}

function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find(a => /^\d+$/.test(a)) || '10', 10);
  const nichesArg = args.indexOf('--niches');
  const niches = nichesArg >= 0 ? args[nichesArg + 1]?.split(',') : [];

  const topics = loadTopics();
  let filtered = niches.length > 0 ? topics.filter(t => niches.some(n => t.niche?.toLowerCase().includes(n.toLowerCase()))) : topics;
  filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
  filtered = filtered.slice(0, count);

  console.log(`=== Trend Analyzer === (${filtered.length} topics)\n`);
  for (const t of filtered) {
    console.log(`  [${t.score || '?'}] ${t.topic} (${t.niche || 'unknown'})`);
  }
  if (filtered.length === 0) console.log('  No topics found. Run SCS-001 discovery agent first.');
}

main();
