#!/usr/bin/env npx ts-node
/**
 * Harvey Morning Briefing — Daily data aggregator
 * No LLM calls. Reads sprint results, queue, PM2 status, produces structured JSON.
 * Output: workspace/briefings/YYYY-MM-DD-morning.json
 *
 * Sprint 1503 / INTEL-030
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const ROOT = path.resolve(__dirname, "..");
const BRIEFINGS_DIR = path.join(ROOT, "workspace", "briefings");
const SPRINT_QUEUE = path.join(ROOT, "workspace", "sprint-queue.json");
const SPRINTS_DIR = path.join(ROOT, "workspace", "sprints");

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

// ─── Sprint Queue Summary ────────────────────────────────────────────────────

interface SprintQueueItem {
  id: string;
  status: string;
  priority?: string;
  dri?: string;
  [key: string]: unknown;
}

function sprintQueueSummary(): {
  total: number;
  done: number;
  pending: number;
  skipped: number;
  p0_pending: SprintQueueItem[];
} {
  const queue = readJson<SprintQueueItem[]>(SPRINT_QUEUE);
  if (!queue) return { total: 0, done: 0, pending: 0, skipped: 0, p0_pending: [] };

  const done = queue.filter((x) => x.status === "done").length;
  const pending = queue.filter((x) => x.status === "pending").length;
  const skipped = queue.filter((x) => x.status === "skipped").length;
  const p0_pending = queue.filter(
    (x) => x.status === "pending" && x.priority === "P0"
  );

  return { total: queue.length, done, pending, skipped, p0_pending };
}

// ─── Recent Sprint Files ─────────────────────────────────────────────────────

interface SprintFile {
  id: string;
  status?: string;
  dri?: string;
  tasks?: Array<{ id: string; status: string }>;
}

function recentSprintFiles(n = 5): SprintFile[] {
  try {
    const files = fs
      .readdirSync(SPRINTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse()
      .slice(0, n);
    return files.map((f) => {
      const data = readJson<SprintFile>(path.join(SPRINTS_DIR, f));
      return data ?? ({ id: f } as SprintFile);
    });
  } catch {
    return [];
  }
}

// ─── Git Status ──────────────────────────────────────────────────────────────

interface GitStatus {
  branch: string;
  uncommitted_files: number;
  last_commit_hash: string;
  last_commit_message: string;
  last_commit_date: string;
}

function gitStatus(): GitStatus {
  try {
    const branch = execSync("git -C " + ROOT + " rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
    const status = execSync("git -C " + ROOT + " status --short", {
      encoding: "utf8",
    });
    const uncommitted_files = status.trim() ? status.trim().split("\n").length : 0;
    const log = execSync(
      'git -C ' + ROOT + ' log -1 --format="%H|%s|%ci"',
      { encoding: "utf8" }
    ).trim();
    const [hash, msg, date] = log.split("|");
    return {
      branch,
      uncommitted_files,
      last_commit_hash: hash?.slice(0, 8) ?? "unknown",
      last_commit_message: msg ?? "",
      last_commit_date: date ?? "",
    };
  } catch {
    return {
      branch: "unknown",
      uncommitted_files: 0,
      last_commit_hash: "unknown",
      last_commit_message: "",
      last_commit_date: "",
    };
  }
}

// ─── PM2 Status ──────────────────────────────────────────────────────────────

interface Pm2Process {
  name: string;
  status: string;
  restarts: number;
  uptime_ms?: number;
}

function pm2Status(): Pm2Process[] {
  try {
    const raw = execSync("pm2 jlist 2>/dev/null", { encoding: "utf8" });
    const list = JSON.parse(raw) as Array<{
      name: string;
      pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number };
    }>;
    return list.map((p) => ({
      name: p.name,
      status: p.pm2_env?.status ?? "unknown",
      restarts: p.pm2_env?.restart_time ?? 0,
      uptime_ms: p.pm2_env?.pm_uptime
        ? Date.now() - p.pm2_env.pm_uptime
        : undefined,
    }));
  } catch {
    return [];
  }
}

// ─── Latest Swarm Run Report ──────────────────────────────────────────────────

interface SwarmReport {
  date?: string;
  videos_generated?: number;
  videos_delivered?: number;
  errors?: number;
  [key: string]: unknown;
}

function latestSwarmReport(): SwarmReport | null {
  const reportsDir = path.join(ROOT, "reports", "swarm-runs");
  try {
    const files = fs
      .readdirSync(reportsDir)
      .filter((f) => f.startsWith("daily-") && f.endsWith(".json"))
      .sort()
      .reverse();
    if (!files.length) return null;
    return readJson<SwarmReport>(path.join(reportsDir, files[0]));
  } catch {
    return null;
  }
}

// ─── Assemble & Write ─────────────────────────────────────────────────────────

interface MorningBriefing {
  generated_at: string;
  date: string;
  git: GitStatus;
  pm2: Pm2Process[];
  sprint_queue: ReturnType<typeof sprintQueueSummary>;
  recent_sprints: SprintFile[];
  latest_swarm_report: SwarmReport | null;
}

function main(): void {
  const today = todayStr();
  fs.mkdirSync(BRIEFINGS_DIR, { recursive: true });

  const briefing: MorningBriefing = {
    generated_at: new Date().toISOString(),
    date: today,
    git: gitStatus(),
    pm2: pm2Status(),
    sprint_queue: sprintQueueSummary(),
    recent_sprints: recentSprintFiles(5),
    latest_swarm_report: latestSwarmReport(),
  };

  const outPath = path.join(BRIEFINGS_DIR, `${today}-morning.json`);
  fs.writeFileSync(outPath, JSON.stringify(briefing, null, 2));

  console.log(`Morning briefing written: ${outPath}`);
  console.log(`Git: ${briefing.git.branch} — ${briefing.git.uncommitted_files} uncommitted`);
  console.log(
    `Queue: ${briefing.sprint_queue.done} done / ${briefing.sprint_queue.pending} pending / ${briefing.sprint_queue.p0_pending.length} P0 pending`
  );
  console.log(`PM2 processes: ${briefing.pm2.length}`);
}

main();
