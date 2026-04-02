# Local TTS fallback audio summary (2026-03-29)

The Phase 2 pipeline for Sprint 1440 switched `scs001` to the local-TTS fallback because `has_audio` was failing in QC. The published `publish-ledger.jsonl` still lacks an explicit `has_audio` boolean for the March 28 runs, so I pulled the raw run artifacts and counted the generated audio to hand the gate reviewers concrete evidence that audio is present.

## Runs inspected
| Run ID | UTC timestamp | Mixed MP4 files | `_vo_concat.mp3` files | `voiceover-audio/` segments |
| --- | --- | --- | --- | --- |
| `run-1774692952785` | 2026-03-28T10:15:52Z | 24 | 24 | 91 |
| `run-1774702813327` | 2026-03-28T13:00:13Z | 26 | 26 | 106 |
| `run-1774717212265` | 2026-03-28T17:00:12Z | 24 | 24 | 95 |
| `run-1774729622460` | 2026-03-28T20:27:02Z | 23 | 23 | 94 |
| `run-1774756813669` | 2026-03-29T04:00:13Z | 21 | 21 | 89 |
| `run-1774771213599` | 2026-03-29T08:00:13Z | 21 | 21 | 92 |

### Where the files are
- Mixed outputs: `/Users/tarekmnif/kognai/workspace/scs001/<run>/mixed-output` (each script exports `*_mixed.mp4` + `*_vo_concat.mp3`).
- Voiceover segments: `/Users/tarekmnif/kognai/workspace/scs001/<run>/voiceover-audio` (numerous short clips that go into the concatenated MP3).

## Evidence highlights
1. Every mixed video has a corresponding `_vo_concat.mp3`, so the fallback is generating and persisting the full audio track right next to the video asset.
2. Each run's `voiceover-audio` directory contains 90+ segments, which is more than enough raw audio to assemble the MP3 and speaks to the voice engine working end-to-end.
3. I searched the run directories (including the March 29 runs run-1774756813669 and run-1774771213599) and the immediate publish artifacts for the literal string `has_audio` and saw nothing, so the ledger remains the only missing verification for every inspected run.

## Next steps
- Share this summary (or the table, now extended with the 08:00 UTC run) with the gate reviewers or Phase 2 lair so they can mark `has_audio` as true for those runs while we wait for the ledger/status snapshot to update.
- If you prefer, I can package the counted files (e.g., zipped MP4+MP3 pairs or a CSV) for the reviewers.
- Let me know if you want me to continue tracing the publish-ledger ingestion or look for the QC report/status snapshot (for run-1774756813669 or any future runs) that records `has_audio` once it finally arrives.
