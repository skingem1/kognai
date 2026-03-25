# Sprint 1257 Output — GODMAN-LAUNCH npm Provenance + Publish Script
*Validated: 2026-03-25 | 20d until April 14 launch*

## Status

✅ **ALREADY COMPLETE** — `publish-all.sh` was built in Sprint 1254.

Sprint 1257 validation confirms the script is correct and fully operational.

## publish-all.sh Verification

```
8/8 DRY-RUN OK (protocols first, then SDK)
  ✓ pact@0.2.0
  ✓ lax@0.2.0
  ✓ score@0.2.0
  ✓ signal@0.2.0
  ✓ soul@0.2.0
  ✓ amf@0.2.0
  ✓ drs@0.2.0
  ✓ sdk@0.2.0
```

## Script Features Confirmed

- **`--provenance`** flag present in live publish path (npm trust scores)
- **Correct order**: 7 protocols first → SDK last (SDK depends on all 7)
- **Safety**: dry-run by default, `--live` requires explicit flag + 5s abort window
- **Error handling**: `FAILED` array collects failures, exits non-zero if any fail
- **`--access public`**: set for scoped `@godman-protocols/*` packages

## On Launch Day

```bash
cd ~/kognai/workspace/godman-protocols
npm login  # authenticate as skingem1
./publish-all.sh --live
```
