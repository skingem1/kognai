#!/usr/bin/env ts-node
// SCS-001 Caption Agent — Block C Completion Integration Test
// Chains: MockBriefs → ScriptAgent → EditingAgent → CaptionAgent → validate CaptionedVideo[]
// Block C gate: Full Production Layer validation (Editing + Caption)

import { existsSync, readFileSync } from 'fs';
import { getMockInsightBriefs } from '../../agents/scs001-insight/index';
import { ScriptAgent, ScriptBundle } from '../../agents/scs001-script/index';
import { EditingAgent, EditedVideo } from '../../agents/scs001-editing/index';
import { CaptionAgent, CaptionedVideo } from '../../agents/scs001-caption/index';

function assert(condition: boolean, msg: string): void {
  if (!condition) { console.error('  \u2717 FAIL: ' + msg); process.exitCode = 1; }
  else            { console.log('  \u2713 PASS: ' + msg); }
}

async function main(): Promise<void> {
  console.log('');
  console.log('\ud83c\udfa4 SCS-001 Caption Agent \u2014 Block C Completion Test');
  console.log('');

  // --- Stage 1: Upstream pipeline ---
  console.log('Stage 1: Upstream pipeline (Insight → Script → Editing)');
  const briefs = getMockInsightBriefs();
  const scriptAgent = new ScriptAgent();
  const bundles: ScriptBundle[] = scriptAgent.run(briefs);
  assert(bundles.length >= 1, 'ScriptAgent produced bundles (' + bundles.length + ')');

  const testDir = 'workspace/scs001/caption-test-' + Date.now();
  const editingAgent = new EditingAgent(testDir + '/editing');
  const videos: EditedVideo[] = editingAgent.run(bundles);
  assert(videos.length >= 1, 'EditingAgent produced videos (' + videos.length + ')');
  console.log('');

  // --- Stage 2: Caption Agent ---
  console.log('Stage 2: Caption Agent');
  const captionAgent = new CaptionAgent(testDir + '/caption');
  const captioned: CaptionedVideo[] = captionAgent.run(videos, bundles);

  assert(Array.isArray(captioned), 'Output is an array');
  assert(captioned.length >= 1, 'At least 1 CaptionedVideo produced (' + captioned.length + ')');
  assert(captioned.length === videos.length, 'One CaptionedVideo per EditedVideo (' + captioned.length + ')');
  console.log('');

  // --- Stage 3: CaptionedVideo validation ---
  console.log('Stage 3: CaptionedVideo validation');
  const videoIds = new Set(videos.map(v => v.video_id));

  captioned.forEach((cv, idx) => {
    const label = 'caption[' + idx + ']';

    // ID check
    assert(videoIds.has(cv.video_id),
      label + ' video_id links to valid EditedVideo');

    // File existence
    assert(existsSync(cv.file_path),
      label + ' captioned video file exists');

    // SRT file existence and content
    assert(existsSync(cv.caption_timing_file),
      label + ' SRT file exists at ' + cv.caption_timing_file);

    const srtContent = readFileSync(cv.caption_timing_file, 'utf-8');
    assert(srtContent.length > 50,
      label + ' SRT file has content (' + srtContent.length + ' chars)');
    assert(srtContent.includes('-->'),
      label + ' SRT file has timing markers');

    // Count SRT entries (lines that are just numbers)
    const srtEntryCount = srtContent.split('\n').filter(line => /^\d+$/.test(line.trim())).length;
    assert(srtEntryCount >= 3,
      label + ' SRT has >= 3 caption entries (' + srtEntryCount + ')');

    // Caption style
    assert(cv.caption_style === 'word_by_word' || cv.caption_style === 'phrase_sync',
      label + ' caption_style valid (' + cv.caption_style + ')');

    // Keyword highlights
    assert(Array.isArray(cv.keyword_highlights) && cv.keyword_highlights.length >= 1,
      label + ' has keyword highlights (' + cv.keyword_highlights.length + ')');
    assert(cv.keyword_highlights.length <= 5,
      label + ' keyword highlights <= 5');

    // Font size
    assert(typeof cv.font_size_px === 'number' && cv.font_size_px >= 48,
      label + ' font_size_px >= 48 (' + cv.font_size_px + ')');

    // Contrast ratio
    assert(typeof cv.contrast_ratio === 'number' && cv.contrast_ratio >= 4.5,
      label + ' contrast_ratio >= 4.5 (' + cv.contrast_ratio + ')');
  });

  // --- Stage 4: Constitutional check ---
  console.log('');
  console.log('Stage 4: Constitutional verification');

  // Verify why_does_this_matter text appears in SRT captions
  bundles.forEach((b, i) => {
    const cv = captioned[i];
    if (cv) {
      const srtContent = readFileSync(cv.caption_timing_file, 'utf-8');
      // The insight segment caption should contain at least part of insight_statement
      const insightSeg = b.segments.find(s => s.segment_name === 'insight');
      if (insightSeg && insightSeg.caption_text) {
        const snippet = insightSeg.caption_text.substring(0, 30);
        assert(srtContent.includes(snippet),
          'bundle[' + i + '] insight caption text present in SRT');
      }
    }
  });

  // --- Block C Completion Gate ---
  console.log('');
  console.log('Block C Completion Gate:');
  assert(bundles.length > 0, 'Script Agent produced output');
  assert(videos.length === bundles.length, 'Editing Agent processed all bundles');
  assert(captioned.length === videos.length, 'Caption Agent processed all videos');
  const allFilesExist = captioned.every(cv => existsSync(cv.file_path) && existsSync(cv.caption_timing_file));
  assert(allFilesExist, 'All captioned files + SRT files exist');
  const allFontOk = captioned.every(cv => cv.font_size_px >= 48);
  assert(allFontOk, 'All font sizes meet 48px minimum');
  const allContrastOk = captioned.every(cv => cv.contrast_ratio >= 4.5);
  assert(allContrastOk, 'All contrast ratios meet 4.5:1 minimum');

  const code = process.exitCode === 1 ? 1 : 0;
  console.log('');
  console.log(code === 0 ? '\u2705 Block C Completion Test: PASS' : '\u274c Block C Completion Test: FAIL');
  process.exit(code);
}

main().catch(err => { console.error('Validation failed:', err); process.exit(1); });
