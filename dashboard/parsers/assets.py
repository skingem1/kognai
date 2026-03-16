"""Parse Skill Bank and Code Asset data."""
import json, os, glob
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
SKILL_DIR = KOGNAI_ROOT / "skill-bank" / "kognai-owned"
CODE_INDEX = KOGNAI_ROOT / "code_assets" / "index.json"


def get_skill_bank() -> dict:
    skills = []
    if SKILL_DIR.exists():
        for f in sorted(glob.glob(str(SKILL_DIR / "*.json"))):
            try:
                with open(f) as fh:
                    data = json.load(fh)
                skills.append({
                    "file": os.path.basename(f),
                    "title": data.get("title", os.path.basename(f)),
                    "agent": data.get("agent", "unknown"),
                    "score": data.get("quality_score", data.get("score", 0)),
                    "sprint": data.get("sprint_id", data.get("provenance", "")),
                    "category": data.get("category", "unknown"),
                })
            except Exception:
                skills.append({"file": os.path.basename(f), "title": os.path.basename(f), "error": True})

    # Also count subdirectories (skill categories)
    subdirs = []
    if SKILL_DIR.exists():
        for d in SKILL_DIR.iterdir():
            if d.is_dir():
                count = len(list(d.glob("*.json")))
                subdirs.append({"name": d.name, "count": count})

    return {
        "total_skills": len(skills) + sum(s["count"] for s in subdirs),
        "skill_files": skills,
        "skill_dirs": subdirs,
    }


def get_code_assets() -> dict:
    if not CODE_INDEX.exists():
        return {"total_assets": 0, "assets": [], "tier_counts": {}}
    with open(CODE_INDEX) as f:
        data = json.load(f)

    meta = data.get("_meta", {})
    assets = []
    for a in data.get("assets", []):
        assets.append({
            "title": a.get("title", "Unknown"),
            "tier": a.get("tier", 0),
            "score": a.get("quality_score", 0),
            "language": a.get("language", "unknown"),
            "category": a.get("category", "unknown"),
            "usage_count": a.get("usage_count", 0),
            "provenance": a.get("provenance", ""),
        })

    return {
        "total_assets": meta.get("total_assets", len(assets)),
        "tier_counts": meta.get("tier_counts", {}),
        "assets": assets,
    }


def get_all_assets() -> dict:
    return {
        "skills": get_skill_bank(),
        "code_assets": get_code_assets(),
    }
