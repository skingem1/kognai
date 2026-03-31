# Ollama MLX Benchmark Report — 2026-03-31
**Sprint:** TICKET-001 (MacGyver)  
**Upgrade:** Ollama 0.18.3 → 0.19.0  
**Hardware:** Mac Mini M4 (24 GB unified memory)  
**Executed by:** MacGyver (autonomous sprint)

---

## 1. Upgrade Summary

| Item | Before | After |
|---|---|---|
| Ollama version | 0.18.3 | **0.19.0** ✅ |
| Install method | macOS App (`/Applications/Ollama.app`) | Same (zip replacement) |
| Backup location | `/Applications/Ollama.app.bak_0183` | — |
| Serve endpoint | `http://127.0.0.1:11434` | Same |
| ClawRouter config change | — | None required |

---

## 2. Baseline — Ollama 0.18.3 (warm runs)

| Model | Prefill (tok/s) | Generation (tok/s) |
|---|---|---|
| qwen3:14b | 17.13 | 10.21 |
| deepseek-r1:14b | 48.04 | 10.52 |

---

## 3. Post-Upgrade — Ollama 0.19.0

### Cold runs (first invocation after app restart)

| Model | Prefill (tok/s) | Generation (tok/s) | Wall (s) |
|---|---|---|---|
| qwen3:14b | 18.10 | 10.32 | 15.1 |
| deepseek-r1:14b | 23.21 | 10.71 | 41.4 |

### Warm runs (model resident in unified memory)

| Model | Prefill (tok/s) | Generation (tok/s) | Wall (s) |
|---|---|---|---|
| qwen3:14b | 20.89 | 10.35 | 14.3 |
| deepseek-r1:14b | 57.08 | 10.71 | 8.0 |

---

## 4. Delta (warm-to-warm)

| Model | Prefill Δ | Gen Δ | Notes |
|---|---|---|---|
| qwen3:14b | +17.13 → +20.89 = **+21.9%** | +10.21 → +10.35 = **+1.4%** | Consistent MLX backend gain |
| deepseek-r1:14b | +48.04 → +57.08 = **+18.8%** | +10.52 → +10.71 = **+1.8%** | Cold first run was 23.21 (model load cost) |

> **Note:** Sprint spec cited "+57% prefill / +93% decode" from Ollama's announcement.  
> Real-world results: **+19–22% prefill, +1–2% generation** — meaningful but below marketing claims.  
> Generation speed is gated by Metal shader throughput, not the backend switch. Expected.

---

## 5. KV Cache Reuse Test (TASK 4)

Identical prompt submitted twice to `qwen3:14b` without model unload:

| Run | Prefill (tok/s) | Prefill Δ |
|---|---|---|
| Run 1 (no cache) | 46.1 | — |
| Run 2 (cached) | **217.1** | **+4.7×** ✅ |

**Result:** KV cache reuse is fully operational in 0.19.0. Repeated prompt prefill is 4.7× faster.  
This is the highest-value improvement for Voxight and SCS-001 workflows where the same context is prepended across calls.

---

## 6. ClawRouter Compatibility (TASK 5)

- ClawRouter v2.0 config: `OLLAMA_BASE = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'`
- Live test: `POST /api/generate` → `qwen3:14b` → `done: true` ✅
- **No config changes required.** 0.19.0 is API-compatible; ClawRouter automatically uses the new instance.

---

## 7. TurboQuant+ Evaluation (TASK 6 — Optional)

**Decision: Deferred.**

| Factor | Assessment |
|---|---|
| KV cache compression | 4.9× (turbo3, 3.25-bit) — significant RAM savings |
| Speed regression | 3–8× generation slowdown (issue #23, unresolved) |
| Build requirement | Compile llama.cpp Metal fork from source |
| Mac Mini M4 RAM headroom | 24 GB — current models fit comfortably |
| Use case | Batch/overnight only; interactive use not viable |

**Recommendation:** Revisit when issue #23 is closed upstream. Add to batch-processing backlog for long-context narrative jobs (Voxight Module 3 / `narrativeDetection.js`).

---

## 8. Definition of Done — Checklist

- [x] **TASK 1** — Ollama upgraded to 0.19.0 (`ollama --version` confirmed)
- [x] **TASK 2** — Baseline benchmarks captured on 0.18.3
- [x] **TASK 3** — Post-upgrade benchmarks captured (cold + warm)
- [x] **TASK 4** — KV cache reuse verified (4.7× prefill speedup on repeated prompt)
- [x] **TASK 5** — ClawRouter confirmed compatible (no config changes needed)
- [~] **TASK 6** — TurboQuant+ evaluated → deferred pending issue #23 resolution
- [x] **TASK 7** — This report written to `logs/ollama_mlx_benchmark_20260331.md`

---

## 9. Impact on Kognai Pipeline

| Component | Impact |
|---|---|
| ClawRouter T0/T1 (qwen3:4b, qwen3:14b) | +~20% prefill → faster brief generation |
| Voxight `qwen3Insights.js` | Faster first-token on insight extraction |
| SCS-001 script agents | Warm-cache reuse = 4.7× speedup on repeated context |
| Sherlock cron (sherlock-cron.ts) | Lower latency on ACP evaluation calls |

**Backup preserved at:** `/Applications/Ollama.app.bak_0183`  
**Rollback:** `mv /Applications/Ollama.app /Applications/Ollama.app.0190_bad && mv /Applications/Ollama.app.bak_0183 /Applications/Ollama.app`
