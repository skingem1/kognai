import * as fs from 'fs/promises';
import * as path from 'path';

interface OracleSignal {
  signal_id: string;
  confidence: number;
  scs_relevant: boolean;
  topic: string;
}

interface TrendOutput {
  processed_signals: OracleSignal[];
  keyword_clusters: string[][];
}

async function main() {
  try {
    // Read mock oracle feed
    const mockFeedPath = path.join('contracts', 'scs-001', 'mock-oracle6-feed.json');
    const data = await fs.readFile(mockFeedPath, 'utf-8');
    const signals: OracleSignal[] = JSON.parse(data).signals;

    // Filter signals (all should pass in mock data)
    const processedSignals = signals.filter(signal => 
      signal.confidence >= 72 && signal.scs_relevant
    );

    // Derive keyword clusters from topics
    const keywordClusters = processedSignals.map(signal => {
      return signal.topic.split(/[\s\-]+/).map(term => term.toLowerCase());
    });

    // Prepare output
    const output: TrendOutput = {
      processed_signals: processedSignals,
      keyword_clusters: keywordClusters
    };

    // Write to output directory
    const outputDir = path.join('workspace', 'scs001', 'trend-outputs');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'trend-output.json'),
      JSON.stringify(output, null, 2)
    );

    console.log('Trend processing completed successfully');
  } catch (error) {
    console.error('Error in trend processing:', error);
    throw error;
  }
}

main().catch(err => {
  console.error('Uncaught error in trend agent:', err);
  process.exit(1);
});