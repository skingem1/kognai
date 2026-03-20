/**
 * scheduling-engine — T2 Content Skill stub
 * Content scheduling and posting time optimization.
 */

interface ScheduleSlot {
  date: string;
  time: string;
  platform: string;
  niche: string;
  status: 'scheduled' | 'produced' | 'posted';
}

function getBestTimes(platform: string = 'tiktok'): string[] {
  // Optimal posting times (research-based defaults)
  const times: Record<string, string[]> = {
    tiktok: ['07:00', '12:00', '17:00', '21:00'],
    youtube: ['09:00', '12:00', '15:00', '18:00'],
    instagram: ['08:00', '11:00', '14:00', '19:00'],
  };
  return times[platform] || times.tiktok;
}

function generateCalendar(days: number = 7): ScheduleSlot[] {
  const niches = ['fitness', 'tech', 'finance', 'productivity', 'lifestyle'];
  const slots: ScheduleSlot[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split('T')[0];
    const times = getBestTimes('tiktok');

    // 2 posts per day, rotate niches
    for (let p = 0; p < 2; p++) {
      const nicheIdx = (d * 2 + p) % niches.length;
      slots.push({
        date: dateStr,
        time: times[p % times.length],
        platform: 'tiktok',
        niche: niches[nicheIdx],
        status: 'scheduled',
      });
    }
  }
  return slots;
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--best-time')) {
    const platform = args[args.indexOf('--best-time') + 1] || 'tiktok';
    const times = getBestTimes(platform);
    console.log(`=== Best Times for ${platform} ===`);
    times.forEach(t => console.log(`  ${t}`));
    return;
  }

  const daysIdx = args.indexOf('--next');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1] || '7', 10) : 7;
  const calendar = generateCalendar(days);

  console.log(`=== Content Calendar (${days} days) ===\n`);
  let currentDate = '';
  for (const slot of calendar) {
    if (slot.date !== currentDate) {
      currentDate = slot.date;
      console.log(`\n  ${slot.date}:`);
    }
    console.log(`    ${slot.time} — ${slot.platform} — ${slot.niche} [${slot.status}]`);
  }
}

main();
