/**
 * One-shot cleanup: delete all wikimedia briefs from Supabase.
 * Run with: npx tsx src/cleanup-wikimedia.ts
 */
import './env.ts';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const { data, error } = await sb
  .from('tiktok_briefs')
  .delete()
  .eq('video_source', 'wikimedia')
  .select('id, hook');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`Deleted ${data?.length ?? 0} wikimedia brief(s):`);
data?.forEach(r => console.log(`  • ${r.id} — ${r.hook}`));
