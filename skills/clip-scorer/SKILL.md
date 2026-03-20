---
name: clip-scorer
version: 1.0.0
description: Video clip quality scoring for SCS-001. Evaluates clips on hook strength, visual quality, audio clarity, and engagement potential. Used by QC gate before publishing.
---

# Clip Scorer

Scores video clips for quality and engagement potential.

## Capabilities
- Hook strength: first 3 seconds engagement score
- Visual quality: resolution, motion, face detection
- Audio clarity: voice-over quality, music mix, noise levels
- Engagement potential: topic virality x production quality
- Output: 0-100 score with breakdown per dimension

## Usage
```bash
npx tsx skills/clip-scorer/score.ts --video workspace/clips/video-001.mp4
npx tsx skills/clip-scorer/score.ts --batch workspace/clips/
```

## Integration
Wraps SCS-001 QC agent scoring logic. Called after video production, before publishing. Videos below score 60 are flagged for rework.
