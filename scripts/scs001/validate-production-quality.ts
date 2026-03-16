// validate-production-quality.ts — Sprint 098
// Validates that the latest pipeline run output meets minimum quality bar for TikTok posting.
// Checks: video files exist and are substantial, SRT files are valid, subtitle burn-in applied.

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface QualityCheck {
  id: string;
  name: string;
  pass: boolean;
  details: string;
  action_required?: string;
}

interface QualityReport {
  sprint: string;
  date: string;
  run_dir: string;
  checks: QualityCheck[];
  all_critical_pass: boolean;
  notes: string;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const scs001Dir = join(root, 'workspace', 'scs001');

  // Find latest run directory (highest run-NNNNN number)
  let runDir = '';
  if (existsSync(scs001Dir)) {
    const entries = readdirSync(scs001Dir).filter(e => /^run-\d+$/.test(e));
    if (entries.length === 0) {
      console.log('No pipeline run directories found in workspace/scs001/');
      process.exit(1);
    }
    entries.sort((a, b) => {
      const na = parseInt(a.replace('run-', ''), 10);
      const nb = parseInt(b.replace('run-', ''), 10);
      return nb - na; // descending — highest first
    });
    runDir = join(scs001Dir, entries[0]);
  } else {
    console.log('workspace/scs001/ does not exist');
    process.exit(1);
  }

  const editingDir = join(runDir, 'editing');
  const captionDir = join(runDir, 'caption');

  // --- CHECK 1: MP4 files exist and are >50KB ---
  const check1: QualityCheck = {
    id: 'video-files',
    name: 'MP4 files exist and are >50KB',
    pass: false,
    details: '',
  };

  if (!existsSync(editingDir)) {
    check1.details = 'editing/ directory not found in run dir';
    check1.action_required = 'Run the pipeline first: npx ts-node agents/scs001-orchestrator/run-pipeline.ts';
  } else {
    const mp4Files = readdirSync(editingDir)
      .filter(f => f.endsWith('.mp4') && !f.includes('-captioned'));
    if (mp4Files.length === 0) {
      check1.details = 'No MP4 files found in editing/';
      check1.action_required = 'Run pipeline in production mode or check FFmpeg output';
    } else {
      const sizes = mp4Files.map(f => statSync(join(editingDir, f)).size);
      const minSize = Math.min(...sizes);
      const maxSize = Math.max(...sizes);
      const allLarge = sizes.every(s => s > 51200);
      check1.pass = allLarge;
      check1.details = 'Found ' + mp4Files.length + ' videos, sizes: ' +
        Math.round(minSize / 1024) + 'KB - ' + Math.round(maxSize / 1024) + 'KB';
      if (!allLarge) {
        check1.action_required = 'Some videos are <50KB — check FFmpeg command output';
      }
    }
  }

  // --- CHECK 2: SRT caption files present and valid ---
  const check2: QualityCheck = {
    id: 'srt-files',
    name: 'SRT caption files present and valid',
    pass: false,
    details: '',
  };

  if (!existsSync(captionDir)) {
    check2.details = 'caption/ directory not found in run dir';
    check2.action_required = 'Run the full pipeline including CaptionAgent';
  } else {
    const srtFiles = readdirSync(captionDir).filter(f => f.endsWith('.srt'));
    if (srtFiles.length === 0) {
      check2.details = 'No SRT files found in caption/';
      check2.action_required = 'Run the full pipeline including CaptionAgent';
    } else {
      let validCount = 0;
      for (const srt of srtFiles) {
        const content = readFileSync(join(captionDir, srt), 'utf-8');
        if (/\d+\n\d{2}:\d{2}:\d{2}/.test(content)) validCount++;
      }
      check2.pass = validCount > 0;
      check2.details = 'Found ' + validCount + '/' + srtFiles.length + ' valid SRT files';
    }
  }

  // --- CHECK 3: Subtitle burn-in applied ---
  const check3: QualityCheck = {
    id: 'subtitle-burnin',
    name: 'Subtitle burn-in applied to captioned videos',
    pass: false,
    details: '',
  };

  if (!existsSync(captionDir) || !existsSync(editingDir)) {
    check3.details = 'caption/ or editing/ directory not found — cannot check burn-in';
  } else {
    const captionedFiles = readdirSync(captionDir).filter(f => f.endsWith('-captioned.mp4'));
    if (captionedFiles.length === 0) {
      check3.details = 'No *-captioned.mp4 files found';
      check3.action_required = 'Set SCS_EDITING_MODE=production and re-run pipeline';
    } else {
      let burnedIn = 0;
      for (const captioned of captionedFiles) {
        const sourceBase = captioned.replace('-captioned.mp4', '.mp4');
        const sourcePath = join(editingDir, sourceBase);
        const captionedPath = join(captionDir, captioned);
        if (existsSync(sourcePath)) {
          const sourceSize = statSync(sourcePath).size;
          const captionedSize = statSync(captionedPath).size;
          if (captionedSize > sourceSize) burnedIn++;
        }
      }
      if (burnedIn > 0) {
        check3.pass = true;
        check3.details = burnedIn + '/' + captionedFiles.length + ' captioned videos larger than source (burn-in confirmed)';
      } else {
        check3.details = 'Mock mode detected — captioned videos are same size as source (no burn-in). Set SCS_EDITING_MODE=production to enable.';
        check3.action_required = 'Set SCS_EDITING_MODE=production and re-run pipeline';
      }
    }
  }

  const checks = [check1, check2, check3];
  const criticalChecks = [check1, check2];
  const all_critical_pass = criticalChecks.every(c => c.pass);
  const human_actions = checks.filter(c => c.action_required).map(c => c.action_required as string);

  const notes = all_critical_pass
    ? 'Pipeline output meets minimum quality bar. Production mode: ' +
      (check3.pass ? 'YES (subtitle burn-in detected)' : 'NO (mock mode — set SCS_EDITING_MODE=production)')
    : 'Pipeline output below minimum quality. Run in production mode or check FFmpeg.';

  const report: QualityReport = {
    sprint: '098',
    date: new Date().toISOString().slice(0, 10),
    run_dir: runDir,
    checks,
    all_critical_pass,
    notes,
  };

  const gatesDir = join(root, 'workspace', 'gates');
  mkdirSync(gatesDir, { recursive: true });
  writeFileSync(join(gatesDir, 'production-quality-check.json'), JSON.stringify(report, null, 2));

  checks.forEach(c => {
    console.log((c.pass ? '\u2713' : '\u2717') + ' [' + c.name + ']: ' + c.details);
  });

  if (human_actions.length > 0) {
    console.log('');
    console.log('ACTIONS NEEDED:');
    human_actions.forEach((a, i) => console.log('  ' + (i + 1) + '. ' + a));
  }

  console.log('');
  console.log(all_critical_pass ? 'QUALITY CHECK PASS' : 'QUALITY CHECK FAIL');
  console.log('Report: workspace/gates/production-quality-check.json');

  process.exit(all_critical_pass ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
