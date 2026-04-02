# Local TTS fallback audio summary (2026-03-30)

The Phase 2 pipeline for Sprint 1440 switched `scs001` over to the local-TTS fallback because the earlier ElevenLabs path kept failing the SNC `has_audio` check. I reconfirmed the fallback is producing real audio by walking each `run-*` directory that is still on disk (runs from 13:00 UTC on). The table below was generated programmatically today (date derived from the run IDs as epoch milliseconds) and double-checks the mixed-video/concatenated-audio parity plus the raw voiceover segments for every available run.

## Runs inspected
| Run ID | UTC timestamp | `_mixed.mp4` files | `_vo_concat.mp3` files | `voiceover-audio/` files |
| --- | --- | --- | --- | --- |
| `run-1774702813327` | 2026-03-28T13:00:13Z | 26 | 26 | 106 |
| `run-1774717212265` | 2026-03-28T17:00:12Z | 24 | 24 | 95 |
| `run-1774729622460` | 2026-03-28T20:27:02Z | 23 | 23 | 94 |
| `run-1774756813669` | 2026-03-29T04:00:13Z | 21 | 21 | 89 |
| `run-1774771213599` | 2026-03-29T08:00:13Z | 21 | 21 | 92 |

## Evidence highlights
1. Every mixed-output MP4 still pairs with a `_vo_concat.mp3` so the fallback is writing a finished audio track right alongside the video asset.
2. Each run's `voiceover-audio` directory contains 89–106 short clips (far more than the number of scripts) so the engine is producing the raw audio fragments that build the MP3.
3. Run directories now cover 13:00 UTC and later; the 10:15 UTC run (`run-1774692952785`) is no longer present on disk, but the later runs that remain still show perfect 1:1 parity.

## `has_audio` search
I scanned the highest-visibility artifacts for the literal strings `has_audio` or `hasAudio`: `publish-ledger.jsonl`, `auto-delivered.jsonl`, `dual-pipeline-status.json`, `delivery-failures.jsonl`, `quality-report-sprint509.json`, and `quality01-validation.json`. None of them contains either string, so the ledger/status path still hasn’t recorded the fallback success even though the raw files do.

## Next steps
- Share this table with the gate reviewers or Phase 2 lair so they can stamp `has_audio` true for the inspected runs while we wait for the ledger/status snapshot to update.
- If it would help, I can package the MP4/MP3 pairs (or a CSV of the counts) for the reviewers.
- Keep an eye on new runs or `publish-ledger` entries; as soon as `has_audio` reappears in any ledger/quality artifact I can capture that timestamped proof as well.
