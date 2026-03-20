/**
 * caption-optimizer — T2 Content Skill stub
 * Optimizes captions and hashtags for social media platforms.
 */

interface OptimizedCaption {
  platform: string;
  original: string;
  optimized: string;
  hashtags: string[];
  char_count: number;
  emoji_count: number;
}

function optimizeCaption(text: string, platform: string = 'tiktok'): OptimizedCaption {
  let optimized = text.trim();
  const hashtags: string[] = [];

  // Extract existing hashtags
  const hashRegex = /#\w+/g;
  const existing = optimized.match(hashRegex) || [];
  hashtags.push(...existing);
  optimized = optimized.replace(hashRegex, '').trim();

  // Platform-specific rules
  if (platform === 'tiktok') {
    // TikTok: short, punchy, emoji-heavy, max 2200 chars
    if (optimized.length > 150) optimized = optimized.substring(0, 147) + '...';
    if (!hashtags.some(h => h === '#fyp')) hashtags.push('#fyp');
    if (!hashtags.some(h => h === '#viral')) hashtags.push('#viral');
  } else if (platform === 'youtube') {
    // YouTube: descriptive, keyword-rich, fewer hashtags
    if (hashtags.length > 3) hashtags.splice(3);
  } else if (platform === 'instagram') {
    // Instagram: up to 30 hashtags, mix broad + niche
    if (!hashtags.some(h => h === '#reels')) hashtags.push('#reels');
  }

  const final = `${optimized}\n\n${hashtags.join(' ')}`;

  return {
    platform,
    original: text,
    optimized: final,
    hashtags,
    char_count: final.length,
    emoji_count: (final.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length,
  };
}

function main() {
  const args = process.argv.slice(2);
  const textIdx = args.indexOf('--text');
  const text = textIdx >= 0 ? args[textIdx + 1] : 'Check out this amazing content!';
  const platformIdx = args.indexOf('--platform');
  const platform = platformIdx >= 0 ? args[platformIdx + 1] : 'tiktok';

  const result = optimizeCaption(text, platform);
  console.log('=== Caption Optimizer ===\n');
  console.log(`  Platform: ${result.platform}`);
  console.log(`  Original: ${result.original}`);
  console.log(`  Optimized: ${result.optimized}`);
  console.log(`  Chars: ${result.char_count}, Hashtags: ${result.hashtags.length}`);
}

main();
