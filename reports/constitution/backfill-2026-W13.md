# Constitutional Signal Backfill Report — 2026-W13
*Generated: 2026-03-21T11:25:14.804Z by backfill-signals.ts*

## Data Sources
- AAR log entries: 13
- Validation errors: 7
- Date range: All available historical data

## Signals Identified

| Theme | Severity | Description | Count |
|-------|----------|-------------|-------|
| Governance | MEDIUM | Agent concentration: coder handles 92% of all tasks | 12 |
| Renewal | MEDIUM | Low-quality approvals: 5 tasks approved with score < 60 | 5 |
| Safety | MEDIUM | 7 validation errors in pipeline | 7 |
| Solidarity | LOW | Low agent diversity: only 2 unique agents in 13 tasks | 2 |

## Top 3 Recommendations

1. **Governance** (MEDIUM): Agent concentration: coder handles 92% of all tasks
   Evidence: 12/13 AAR entries from coder

2. **Renewal** (MEDIUM): Low-quality approvals: 5 tasks approved with score < 60
   Evidence: sprint-170/170-01 (0/100); sprint-170/170-02 (0/100); sprint-171/171-01 (0/100); sprint-173/173-01 (0/100); sprint-178/178-01 (0/100)

3. **Safety** (MEDIUM): 7 validation errors in pipeline
   Evidence: workspace/scs001/validation-errors.jsonl — 7 entries

