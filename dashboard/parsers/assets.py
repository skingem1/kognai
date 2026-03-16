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


def get_kognai_crystallised_skills() -> dict:
    """Read ALL crystallised skills from Kognai's skill bank (top-level + subdirs).

    This is the REAL crystallised count — skills that passed the AMD-02 quality gate
    (score >= 75) and were written to skill-bank/kognai-owned/.
    """
    skills = []
    if not SKILL_DIR.exists():
        return {"total": 0, "skills": [], "avg_score": 0}

    # Collect all JSON files: top-level + all subdirectories
    all_json = list(SKILL_DIR.glob("*.json")) + list(SKILL_DIR.rglob("*/*.json"))
    for f in sorted(all_json, key=lambda p: p.stat().st_mtime, reverse=True):
        if f.name == "schema.json":
            continue
        try:
            data = json.load(open(f))
            avg_score = 0
            history = data.get("score_history", [])
            if history:
                avg_score = round(sum(e.get("score", 0) for e in history) / len(history), 1)
            # Fall back to quality_score or score if no history
            if not avg_score:
                avg_score = data.get("quality_score", data.get("score", 0))

            skills.append({
                "skill_id": data.get("skill_id", f.stem),
                "name": data.get("name", data.get("title", f.stem)),
                "description": data.get("description", ""),
                "agent": data.get("agent_id", data.get("agent", "unknown")),
                "type": "kognai-owned",
                "subdir": f.parent.name if f.parent != SKILL_DIR else "",
                "avg_score": avg_score,
                "execution_count": data.get("execution_count", 1),
                "access_tier": data.get("access_tier", "internal"),
                "source_sprint": data.get("source_sprint", data.get("sprint_id", data.get("provenance", ""))),
                "created_at": data.get("created_at", ""),
            })
        except (json.JSONDecodeError, OSError):
            skills.append({"skill_id": f.stem, "name": f.stem, "error": True})

    avg_all = 0
    scored = [s for s in skills if s.get("avg_score", 0) > 0]
    if scored:
        avg_all = round(sum(s["avg_score"] for s in scored) / len(scored), 1)

    return {
        "total": len(skills),
        "skills": skills,
        "avg_score": avg_all,
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
    from parsers.invoica_knowledge import (
        get_invoica_skills, get_invoica_failures,
        get_invoica_knowledge_summary, get_invoica_crystallised_skills,
    )

    kognai_skills = get_skill_bank()
    kognai_crystallised = get_kognai_crystallised_skills()
    invoica_skills = get_invoica_skills(limit=50)
    invoica_failures = get_invoica_failures(limit=30)
    invoica_summary = get_invoica_knowledge_summary()
    invoica_crystallised = get_invoica_crystallised_skills()

    return {
        "skills": kognai_skills,
        "code_assets": get_code_assets(),
        "kognai_crystallised_skills": kognai_crystallised,
        "invoica_skills": invoica_skills,
        "invoica_failures": invoica_failures,
        "invoica_summary": invoica_summary,
        "invoica_crystallised_skills": invoica_crystallised,
    }
