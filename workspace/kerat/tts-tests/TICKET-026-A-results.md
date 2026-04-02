# TICKET-026-A: Kokoro TTS Smoke Test Results
**Date**: 2026-03-30  
**Status**: ✅ DONE

## Model
- **Repo**: `mlx-community/Kokoro-82M-bf16`
- **Voice tested**: `am_adam`
- **License**: CC BY-NC-4.0
- **Languages**: 9 (a=en-us, b=en-gb, e=es, f=fr, h=hi, i=it, p=pt, j=ja, z=zh)

## Performance (Mac Mini M4 Pro, warm model)
| Metric | Value |
|--------|-------|
| RTF | **0.08x** (12× faster than real-time) |
| TTFA — 1-word chunk | **95ms** (avg 99ms over 5 runs) |
| TTFA — short sentence (~2s audio) | **140ms best, 167ms avg** |
| TTFA — full sentence (~2.6s audio) | **196ms best, 221ms avg** |
| Audio quality | 24kHz, 16-bit mono WAV |
| Model load (cold) | ~1.9s |
| JIT warm-up (first call) | ~3s |

## Sample output
`workspace/kerat/tts-tests/kael_smoke_test.wav`  
Text: "Intelligence is not a feature. It is a sovereign right. Kael is watching."  
Duration: 4.9s audio generated in 4.43s processing (0.90x RTF cold, 0.08x RTF warm)

## TTFA Target Assessment
- Spec target: ~90ms → ✅ **Confirmed** for 1-word streaming chunks
- Production sentence-level streaming: 140-220ms (acceptable for Voxight narration pipeline)
- Recommendation: split at sentence boundaries (`\n` delimiter) for streaming playback

## Dependencies installed
- `mlx-audio==0.4.1` (Python 3.12 only — uses `|` union types)
- `misaki==0.9.4` + `misaki[en]` extras (phonemizer-fork, spacy-curated-transformers)
- `en_core_web_sm==3.8.0` (spaCy English model — installed via direct wheel URL)
- `espeak-ng==1.52.0` (via Homebrew)
- `espeakng_loader==0.2.4`
- `phonemizer-fork==3.3.2`
- `torch==2.11.0` (pulled by spacy-curated-transformers)

## Patches applied
**`/opt/homebrew/lib/python3.12/site-packages/misaki/espeak.py`**  
phonemizer API changed: `EspeakWrapper.set_data_path()` → `EspeakWrapper.data_path` (property).  
Also added `espeakng_loader.make_library_available()` + `os.environ['ESPEAK_DATA_PATH']` before wrapper init.

## Notes for TICKET-030-B (Voxtral→LatentSync pipeline)
- Model must be kept warm in process (load once, reuse KokoroPipeline instance)
- Set `ESPEAK_DATA_PATH=/opt/homebrew/Cellar/espeak-ng/1.52.0/share/espeak-ng-data` before import
- Use `split_pattern=r'\n+'` and pre-split text at sentence boundaries for streaming
- Python 3.12 required (`python3.12`, not system `python3` which is 3.9)
