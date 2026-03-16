"""Parse project overview: git status, amendments, build progress, security."""
import subprocess, os, re, json
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
INVOICA_ROOT = Path.home() / "Documents" / "Invoica"
FULL_PLAN = Path.home() / "Documents" / "Kognai" / "plans" / "FULL_WORK_PLAN.md"


def _run_git(cwd, cmd):
    try:
        r = subprocess.run(
            ["git"] + cmd, cwd=cwd, capture_output=True, text=True, timeout=10
        )
        return r.stdout.strip()
    except Exception as e:
        return f"error: {e}"


def get_git_status() -> dict:
    repos = {}
    for name, path in [("kognai", str(KOGNAI_ROOT)), ("invoica", str(INVOICA_ROOT))]:
        last_commit = _run_git(path, ["log", "--oneline", "-1"])
        branch = _run_git(path, ["branch", "--show-current"])
        ahead = _run_git(path, ["rev-list", "--count", "origin/main..HEAD"])
        behind = _run_git(path, ["rev-list", "--count", "HEAD..origin/main"])
        status_lines = _run_git(path, ["status", "--short"])
        modified = len([l for l in status_lines.split("\n") if l.strip() and l[0] == "M"])
        untracked = len([l for l in status_lines.split("\n") if l.strip() and l.startswith("??")])

        repos[name] = {
            "branch": branch,
            "last_commit": last_commit,
            "ahead": int(ahead) if ahead.isdigit() else 0,
            "behind": int(behind) if behind.isdigit() else 0,
            "modified": modified,
            "untracked": untracked,
            "clean": modified == 0 and untracked == 0,
        }
    return repos


def get_amendments():
    """Return AMD status. Hardcoded from MEMORY.md (most reliable source)."""
    return [
        {"id": "AMD-01", "title": "A2A / AP2 / x402 / ERC-8004", "p0": "3/3 DONE", "status": "✅", "phase": "COMPLETE", "detail": "CHAIN1+2+3 all live"},
        {"id": "AMD-02", "title": "Skill Bank & Knowledge Assets", "p0": "4/4 DONE", "status": "✅", "phase": "P1 indexing", "detail": "12 skills, crystalliser wired"},
        {"id": "AMD-02A", "title": "BrainX Persistent Memory", "p0": "2/2 DONE", "status": "✅", "phase": "P1 write path", "detail": "pgvector 768-dim, store/retrieve live"},
        {"id": "AMD-03", "title": "Constitutional Framework", "p0": "1/1 DONE", "status": "✅", "phase": "P1 Charter", "detail": "Constitution Agent bootstrapped"},
        {"id": "AMD-04", "title": "Self Committed Swarms", "p0": "1/1 DONE", "status": "✅", "phase": "P1 Signals", "detail": "Glossary + Charter template"},
        {"id": "AMD-05", "title": "IRL Intelligence Layer", "p0": "3/3 DONE", "status": "✅", "phase": "P1 Econ+Reg", "detail": "ORACLE-6 seeded, voxight-client wired"},
        {"id": "AMD-06", "title": "Federated Modular Architecture", "p0": "N/A", "status": "⏳", "phase": "Phase 2 docs", "detail": "No immediate build"},
        {"id": "AMD-07", "title": "Code Asset Library", "p0": "2/2 DONE", "status": "✅", "phase": "P1 indexing", "detail": "4 Tier-3 assets, crystalliser live"},
        {"id": "AMD-08", "title": "Monotask Mandate", "p0": "1/1 DONE", "status": "✅", "phase": "P1 enforced", "detail": "State machine + orchestrator wired"},
        {"id": "AMD-09", "title": "Agent Fusion Protocol", "p0": "N/A", "status": "⏳", "phase": "Phase 3-4", "detail": "Super Agent spec only"},
        {"id": "AMD-10", "title": "Capability Atlas", "p0": "1/1 DONE", "status": "✅", "phase": "P1 commands", "detail": "45 commands, 12 categories"},
        {"id": "AMD-11", "title": "KBVS (Builder Verification)", "p0": "N/A", "status": "⏳", "phase": "Phase 3-4", "detail": "7-item checklist spec only"},
    ]


def get_build_progress():
    """Build Priority Sequence from Section 05."""
    return [
        {"num": 1, "task": "OpenClaw + 3-agent swarm", "status": "done"},
        {"num": 2, "task": "GitHub repo + architecture", "status": "done"},
        {"num": 3, "task": "Session log system (SOUL.md)", "status": "done"},
        {"num": 4, "task": "Internet Archive scraper", "status": "done"},
        {"num": 5, "task": "Vision scoring agent", "status": "done"},
        {"num": 6, "task": "Caption + TikTok posting", "status": "done"},
        {"num": 7, "task": "Telegram bot + Stripe", "status": "done"},
        {"num": 8, "task": "Layer 5A compression", "status": "seeded"},
        {"num": 9, "task": "Phase 2-4 items", "status": "future"},
    ]


def get_scs001_blocks():
    """SCS-001 Build Track block status."""
    return [
        {"block": "A", "name": "Signal Pipeline", "agents": "Trend + Discovery + Clip Detection", "status": "conditional_pass", "sprints": "076/077/078 DONE"},
        {"block": "B", "name": "Content Intelligence", "agents": "Insight + Script", "status": "not_started", "sprints": "079-080"},
        {"block": "C", "name": "Production Pipeline", "agents": "Video Editor + Caption + QC", "status": "not_started", "sprints": "081-083"},
        {"block": "D", "name": "Live Integration", "agents": "ORACLE-6 live feed", "status": "blocked", "sprints": "Blocked on Voxight Module 2"},
        {"block": "E", "name": "Distribution", "agents": "Publishing + Analytics", "status": "blocked", "sprints": "Blocked on TikTok API"},
        {"block": "F", "name": "Autonomous Flywheel", "agents": "30-day autonomous", "status": "future", "sprints": "Block E + 30 days"},
        {"block": "G", "name": "Expansion", "agents": "Multi-platform", "status": "future", "sprints": "Post-Flywheel"},
    ]


def get_security_status():
    """Security layers status."""
    return [
        {"layer": 0, "name": "Physical Vault", "status": "partial", "detail": "Ollama 127.0.0.1 (SEC1 DONE). Router 127.0.0.1 (SEC3 DONE). YubiKey pending (SEC4)."},
        {"layer": 1, "name": "Network ACLs", "status": "done", "detail": "Tailscale ACTIVE. ACLs locked autogroup:member. Ollama+Router localhost-only."},
        {"layer": 2, "name": "Memory Isolation", "status": "future", "detail": "Phase 2 — two-section split"},
        {"layer": 3, "name": "On-Chain Governance", "status": "done", "detail": "EAS + ERC-8004 + AAR all live"},
        {"layer": 4, "name": "Self-Policing", "status": "future", "detail": "Phase 2-3 — Plumber + Police agents"},
        {"layer": 5, "name": "External Access", "status": "future", "detail": "Phase 3 — View-only, PayAI, Ban list"},
    ]


def get_blockers():
    """Critical blockers preventing Phase 2."""
    return [
        {"name": "TikTok App Review", "status": "waiting", "detail": "Submitted 2026-03-15. Day 2 of 1-7 window.", "owner": "external"},
        {"name": "Stripe Account Setup", "status": "blocked", "detail": "Code complete. Needs account + env vars.", "owner": "human"},
        {"name": "Calibration Set", "status": "blocked", "detail": "50-clip curation needed for Block A full pass.", "owner": "human"},
        {"name": "SEC1+SEC3 Binding", "status": "done", "detail": "Ollama + Router both bound to 127.0.0.1.", "owner": "resolved"},
    ]


def get_revenue_metrics() -> dict:
    """Revenue targets from v5.0 plan."""
    return {
        "current_mrr": 0,
        "phase": "Phase 1 — Block A conditional pass",
        "first_revenue_gate": "TikTok API approval + Stripe setup",
        "targets": [
            {"month": "M+2", "mrr": 500, "source": "TikTok subs"},
            {"month": "M+4", "mrr": 1500, "source": "+Achiri +Invoica"},
            {"month": "M+6", "mrr": 3500, "source": "Multi-deploy"},
            {"month": "M+9", "mrr": 7000, "source": "+DRI +ALX"},
        ],
    }


def get_backlog_evals():
    """Backlog evaluation status."""
    return [
        {"id": "EVAL-001", "product": "OpenViking", "purpose": "Skill Bank (ByteDance context DB)", "status": "not_started", "gate": "Phase 2A", "owner": "CTO agent"},
        {"id": "EVAL-002", "product": "Cognee", "purpose": "Knowledge graph agent memory", "status": "not_started", "gate": "Phase 2A", "owner": "CTO agent"},
    ]


def get_project_overview() -> dict:
    return {
        "git": get_git_status(),
        "amendments": get_amendments(),
        "build_progress": get_build_progress(),
        "scs001_blocks": get_scs001_blocks(),
        "security": get_security_status(),
        "blockers": get_blockers(),
        "revenue": get_revenue_metrics(),
        "backlog_evals": get_backlog_evals(),
    }
