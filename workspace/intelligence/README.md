# Intelligence Memory — AMD-05 IRL Intelligence Layer

6 oracle partitions + weekly reports. Read-only for operational agents.
Only the Intelligence Agent writes here.

## Partitions
- oracle-1-regulatory/   — Gov/Regulatory signals
- oracle-2-economic/     — Economic/Financial signals
- oracle-3-public-health/ — Public Health signals
- oracle-4-environmental/ — Environmental signals
- oracle-5-social/       — Social Intelligence signals
- oracle-6-voxight/      — X Intelligence (Voxight ORACLE-6)
- weekly-reports/        — Weekly Insight Reports (Monday 07:00 UTC)
- signals/               — Cross-oracle Purpose Signal candidates (confidence ≥75)

## Access Control
- Write: Intelligence Agent only
- Read: Any agent with ACP ≥60 (intelligence.signals.query command)
- Weekly reports: ACP ≥70 required (intelligence.report.request command)
