/**
 * Telegram bot commands — extracted from telegram-bot.ts (Sprint 455)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  ROOT, readJSON, readLines, getPm2List, fmtUptime, fmtMem, latestSprintFile,
  findCaptionedMp4, getExperimentData, buildTikTokCaption,
  loadSpeakerMap, diversifyBySpeaker, loadHookMap, diversifyByHook,
  freshnessScore, loadArchived, saveArchived, ARCHIVE_PATH,
} from './shared';

export function cmdHelp(): string {
  return (
    `*Kognai Bot Commands*\n\n` +
    `/menu      — Quick access button menu\n` +
    `/report    — Full system status (real data, no AI)\n` +
    `/pm2       — Live PM2 process table\n` +
    `/boot      — Start all essential PM2 crons\n` +
    `/shutdown  — Stop all non-essential PM2 crons\n` +
    `/reload    — Restart bot to pick up code changes\n` +
    `/crons     — All PM2 cron schedules\n` +
    `/health    — Health check summary\n` +
    `/preflight — Production readiness checklist\n` +
    `/smoke     — Pipeline smoke test (1-3 min)\n` +
    `/tier      — Current tier + MRR\n` +
    `/sprint    — Latest sprint progress\n` +
    `/gate      — Phase 1.5 gate countdown\n` +
    `/queue     — Unposted videos ranked by viral score\n` +
    `/review    — Latest generated video details\n` +
    `/record    — Record a manual TikTok post (usage: /record <id> <views> [tiktok_url])\n` +
    `/posted    — Mark last auto-delivered video as posted\n` +
    `/deliver   — Batch-send ready videos with captions\n` +
    `/publish   — One-tap publish to TikTok + IG + YouTube via Blotato\n` +
    `/caption   — Generate TikTok-ready caption for a video\n` +
    `/streak    — Posting streak tracker + pace\n` +
    `/analytics — Content performance insights\n` +
    `/onboard   — First-time posting walkthrough\n` +
    `/pipeline  — Content pipeline inventory & health\n` +
    `/produce   — Produce video with local TTS ($0.00)\n` +
    `/v2        — V2 pipeline: AI video (fal.ai + Captions.ai)\n` +
    `/stockpile — Batch-produce N videos (multiformat pipeline)\n` +
    `/inventory — Video inventory: unique topics + gate status\n` +
    `/batchdeliver — Send N unposted videos to Telegram\n` +
    `/refresh   — Trigger new pipeline run (2-5 min)\n` +
    `/tiktokauth — TikTok OAuth setup guide\n` +
    `/today     — Daily posting brief + recommendations\n` +
    `/calendar  — 7-day content posting plan\n` +
    `/golive    — Phase 1 go-live readiness check\n` +
    `/audit     — Content quality audit + recommendations\n` +
    `/quickstart — Post your first video in 5 minutes\n` +
    `/schedule    — Today's posting time slots\n` +
    `/leaderboard — Speaker performance rankings\n` +
    `/updateviews — Update view count for a posted video\n` +
    `/achiri     — Achiri alpha readiness status\n` +
    `/alpha      — Alpha launch report: gates, countdowns, verdict\n` +
    `/achiridata — Achiri analytics dashboard data\n` +
    `/waitlist   — Achiri waitlist management\n` +
    `/digest     — Daily digest: gate + queue + Stripe\n` +
    `/weeklydigest — 7-day trend: sprints + content + Achiri\n` +
    `/metrics    — Pipeline performance metrics\n` +
    `/pace       — Posting velocity & gate projection\n` +
    `/postnow    — Send best video for immediate posting\n` +
    `/revenue    — Revenue dashboard + financial gates\n` +
    `/autopost   — Auto-post readiness + token status\n` +
    `/lastrun    — Latest pipeline run details\n` +
    `/viral      — Trending topics for content\n` +
    `/postplan   — 7-day posting plan with videos\n` +
    `/broadcast  — Send announcement to alpha users\n` +
    `/dashboard  — Full system status overview\n` +
    `/todaycaptions — Copy-paste captions for today\n` +
    `/hookstats  — Hook formula performance rankings\n` +
    `/gateanalytics — April 7 gate progress + projections\n` +
    `/youtube    — YouTube Shorts upload status\n` +
    `/queueopt   — Diversity-optimized posting order\n` +
    `/viralstats — Viral score summary + top 3\n` +
    `/checkout  — Generate Stripe checkout link\n` +
    `/subscribers — Active Stripe subscribers + MRR\n` +
    `/funnel    — Content pipeline funnel + conversions\n` +
    `/hooktest  — Hook formula A/B test rankings\n` +
    `/formatstats — Video format performance breakdown\n` +
    `/blockers — All pending human-action items across active tracks\n` +
    `/bottest  — Run smoke tests on all bot commands + posting flow\n` +
    `/godman   — Godman Protocols launch readiness\n` +
    `/godman-smoke — Run smoke tests on all 7 Godman protocols\n` +
    `/godman-thread — Show X launch megathread (10 tweets, copy-paste)\n` +
    `/caption-next — Auto-pick top unposted video + show TikTok caption\n` +
    `/deliver-next — Send top unposted video mp4 file to Telegram\n` +
    `/changelog — Recent sprints shipped\n` +
    `/besttime  — Optimal posting time analysis\n` +
    `/export    — Batch export manifest for posting\n` +
    `/weeklyreport — Weekly performance summary\n` +
    `/speakertest — Speaker A/B test rankings\n` +
    `/contentplan — 7-day content filming plan\n` +
    `/filmkit   — Instant filming brief for next video\n` +
    `/progress  — Visual gate progress tracker\n` +
    `/scorecard — Content strategy scorecard\n` +
    `/compare   — A/B compare hooks or speakers\n` +
    `/suggest   — Data-driven content suggestion\n` +
    `/history   — Posting history timeline + trends\n` +
    `/archive   — Archive a video (hide from queue)\n` +
    `/unarchive — Restore an archived video\n` +
    `/note      — Add notes to a video\n` +
    `/pickup    — One-tap posting: best video + caption + buttons\n` +
    `/status    — Unified dashboard: gate + queue + streak + next\n` +
    `/dedup     — Content diversity scanner + duplicate detection\n` +
    `/top30     — Auto-select best 30 videos for the gate\n` +
    `/session   — Start interactive posting session\n` +
    `/done      — Record post + get next video (in session)\n` +
    `/endsession — End posting session + summary\n` +
    `/abresults — View-based A/B content analysis\n` +
    `/stale     — Show/archive stale content (>7 days)\n` +
    `/purge     — Quality filter: archive low-scoring clips\n` +
    `/cleanup   — Archive old pipeline runs, free disk space\n` +
    `/postnext  — Top 5 unposted videos by viral score\n` +
    `/postauto  — Trigger browser auto-poster (1-5 videos)\n` +
    `/postinghealth — Posting infrastructure health check\n` +
    `/bulkcaptions — Export all ready videos with TikTok captions\n` +
    `/batch     — Batch operations summary\n` +
    `/postlog   — Recent posting activity log\n` +
    `/costs     — API cost breakdown\n` +
    `/replenish — Auto-replenish content pipeline\n` +
    `/postbrowser — Post via browser automation\n` +
    `/help      — This message`
  );
}
