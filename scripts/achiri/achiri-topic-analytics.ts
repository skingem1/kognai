#!/usr/bin/env npx ts-node
/**
 * achiri-topic-analytics.ts — Sprint 327
 * Keyword-based topic detection on Achiri conversations.
 * Reads user messages from workspace/achiri/memory/*.jsonl,
 * classifies into topic categories, and outputs distribution.
 *
 * Zero LLM cost ($0.00) — pure keyword matching.
 *
 * Usage: npx ts-node scripts/achiri/achiri-topic-analytics.ts [--json]
 * Output: workspace/achiri/topic-analytics.json
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const CWD = process.cwd();
const MEMORY_DIR = join(CWD, 'workspace', 'achiri', 'memory');
const OUTPUT_PATH = join(CWD, 'workspace', 'achiri', 'topic-analytics.json');
const JSON_MODE = process.argv.includes('--json');

// Topic categories with multilingual keywords (English, French, Darija)
const TOPIC_KEYWORDS: Record<string, string[]> = {
  education: ['study', 'school', 'university', 'exam', 'learn', 'course', 'homework', 'teacher',
    'étudier', 'école', 'université', 'examen', 'cours', 'prof',
    'na9ra', 'naqra', 'imti7an', 'jami3a', 'madrsa', 'dars'],
  technology: ['code', 'programming', 'app', 'phone', 'computer', 'software', 'ai', 'tech',
    'informatique', 'ordinateur', 'téléphone', 'logiciel',
    'tel', 'pc', 'laptop', 'internet', 'wifi'],
  health: ['health', 'exercise', 'sleep', 'stress', 'workout', 'diet', 'mental',
    'santé', 'sport', 'sommeil', 'dormir',
    'sa7a', 'riyadha', 'n3as', 'ta3b'],
  career: ['job', 'work', 'career', 'interview', 'salary', 'boss', 'company', 'business',
    'travail', 'emploi', 'entreprise', 'salaire', 'patron',
    'khedma', 'nakhdhem', 'chrika', 'patron'],
  relationships: ['friend', 'family', 'love', 'boyfriend', 'girlfriend', 'parent', 'brother', 'sister',
    'ami', 'famille', 'amour', 'copain', 'copine', 'frère', 'soeur',
    'sa7bi', '3a2ila', '7ob', 'khouya', 'okhti', 'mama', 'baba'],
  entertainment: ['movie', 'music', 'game', 'book', 'series', 'youtube', 'tiktok', 'netflix',
    'film', 'musique', 'jeu', 'livre', 'série',
    'film', 'ghnya', 'la3ba', 'ktab'],
  emotions: ['happy', 'sad', 'angry', 'anxious', 'bored', 'tired', 'excited', 'worried', 'lonely',
    'content', 'triste', 'fâché', 'anxieux', 'ennui', 'fatigué',
    'far7an', '7zin', 'za3lan', 'ta3ban', 's3id', 'wa7id'],
  culture: ['tunisia', 'tunis', 'arabic', 'french', 'darija', 'ramadan', 'tradition', 'food', 'cuisine',
    'tunisie', 'arabe', 'français', 'tradition', 'nourriture',
    'tounes', '3arbi', 'akla', 'makla', 'tajin', 'couscous', 'brik'],
  goals: ['goal', 'dream', 'plan', 'future', 'want', 'hope', 'achieve', 'success',
    'objectif', 'rêve', 'plan', 'avenir', 'espoir', 'réussir',
    'hadaf', '7elm', 'moustaqbal', 'nja7'],
};

interface TopicResult {
  topic: string;
  count: number;
  percentage: number;
  sample_messages: string[];
}

interface AnalyticsReport {
  generated_at: string;
  total_messages_analyzed: number;
  total_users: number;
  topics: TopicResult[];
  uncategorized_count: number;
  uncategorized_pct: number;
}

function loadUserMessages(): Array<{ userId: string; content: string }> {
  if (!existsSync(MEMORY_DIR)) return [];

  const messages: Array<{ userId: string; content: string }> = [];
  const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.jsonl'));

  for (const file of files) {
    const filePath = join(MEMORY_DIR, file);
    try {
      const lines = readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Only analyze user messages, not assistant responses
          if (entry.role === 'user' && entry.content) {
            const userId = file.replace('.jsonl', '').replace(/^e2e-.*-/, '');
            messages.push({ userId, content: entry.content });
          }
        } catch { /* skip malformed */ }
      }
    } catch { /* skip unreadable */ }
  }

  return messages;
}

function detectTopics(message: string): string[] {
  const lc = message.toLowerCase();
  const detected: string[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const kw of keywords) {
      if (lc.includes(kw)) {
        detected.push(topic);
        break; // One match per topic is enough
      }
    }
  }

  return detected;
}

function analyze(): AnalyticsReport {
  const messages = loadUserMessages();
  const userIds = new Set(messages.map(m => m.userId));

  const topicCounts: Record<string, number> = {};
  const topicSamples: Record<string, string[]> = {};
  let uncategorized = 0;

  for (const topic of Object.keys(TOPIC_KEYWORDS)) {
    topicCounts[topic] = 0;
    topicSamples[topic] = [];
  }

  for (const msg of messages) {
    const topics = detectTopics(msg.content);
    if (topics.length === 0) {
      uncategorized++;
    } else {
      for (const topic of topics) {
        topicCounts[topic]++;
        if (topicSamples[topic].length < 3) {
          topicSamples[topic].push(msg.content.slice(0, 80));
        }
      }
    }
  }

  const total = messages.length;
  const topics: TopicResult[] = Object.entries(topicCounts)
    .map(([topic, count]) => ({
      topic,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      sample_messages: topicSamples[topic],
    }))
    .sort((a, b) => b.count - a.count);

  return {
    generated_at: new Date().toISOString(),
    total_messages_analyzed: total,
    total_users: userIds.size,
    topics,
    uncategorized_count: uncategorized,
    uncategorized_pct: total > 0 ? Math.round((uncategorized / total) * 100) : 0,
  };
}

function main(): void {
  const report = analyze();

  // Save to file
  mkdirSync(join(CWD, 'workspace', 'achiri'), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), 'utf-8');

  if (JSON_MODE) {
    console.log(JSON.stringify(report));
    return;
  }

  console.log('📊 Achiri Topic Analytics');
  console.log(`   Messages: ${report.total_messages_analyzed} | Users: ${report.total_users}`);
  console.log('');

  for (const t of report.topics.filter(t => t.count > 0)) {
    const bar = '█'.repeat(Math.max(1, Math.round(t.percentage / 5)));
    console.log(`   ${t.topic.padEnd(15)} ${bar} ${t.count} (${t.percentage}%)`);
  }

  if (report.uncategorized_count > 0) {
    console.log(`   uncategorized ${'░'.repeat(Math.max(1, Math.round(report.uncategorized_pct / 5)))} ${report.uncategorized_count} (${report.uncategorized_pct}%)`);
  }

  console.log(`\n📁 Saved to: ${OUTPUT_PATH}`);
}

main();
