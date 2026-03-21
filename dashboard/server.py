"""
Kognai + Invoica Vault Dashboard — FastAPI Server
Dual-project monitoring dashboard for the sovereign AI runtime.

Usage:
  python3 -m uvicorn server:app --host 127.0.0.1 --port 11436

Port: 11436 (Ollama=11434, Router=11435, Dashboard=11436)
"""

import asyncio
import json
import time
from datetime import date
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel

from parsers.sprints import get_current_sprint, list_sprints, get_sprint_by_id
from parsers.logs import get_latest_log, get_all_errors
from parsers.routing import get_costs, get_cost_summary, get_model_stats
from parsers.daily_brief import parse_daily_brief, toggle_task, defer_task
from parsers.gates import parse_gates, parse_phases
from parsers.agents import list_agents
from parsers.invoica import (
    get_current_invoica_sprint, list_invoica_sprints,
    get_invoica_sprint_by_id, list_invoica_agents,
    get_invoica_stats, INVOICA_SPRINTS, INVOICA_AGENTS,
)
from parsers.chain import get_chain_data
from parsers.project_overview import get_project_overview
from parsers.assets import get_all_assets
from parsers.daily_plans import get_today_plans
from parsers.pipeline import get_latest_pipeline_run, list_pipeline_runs
from parsers.readiness import get_readiness
from parsers.pipeline_status import get_pipeline_status
from parsers.publish_ledger import get_publish_history, get_publish_stats
from parsers.experiments import get_experiment_stats, get_experiment_history
from parsers.validation_errors import get_validation_errors, get_validation_summary
from parsers.invoica_knowledge import (
    get_invoica_skills, get_invoica_failures, get_cto_insights,
    get_post_sprint_learnings, get_invoica_latest_log, get_invoica_log_errors,
    get_invoica_knowledge_summary,
)
from parsers.sessions import get_sessions_live
from parsers.achiri import parse_achiri_stats
from parsers.swarm import get_swarm_metrics, get_sprint_quality_scores
from parsers.governance import get_governance_summary, get_trust_scores, get_aar_summary, get_constitutional_signals, get_swarm_health


class ToggleRequest(BaseModel):
    block: str   # "AM", "MID", "PM"
    index: int   # 0-based index within the block

# --- Config ---
KOGNAI_ROOT = Path.home() / "kognai"
INVOICA_ROOT = Path.home() / "Documents" / "Invoica"
SPRINTS_DIR = KOGNAI_ROOT / "workspace" / "sprints"
LOGS_DIR = KOGNAI_ROOT / "logs"
ROUTING_DIR = LOGS_DIR / "routing"
DOCS_DIR = KOGNAI_ROOT / "docs"
AGENTS_DIR = KOGNAI_ROOT / "kognai-agents"
SHARED_INFRA = DOCS_DIR / "shared-infra.md"
STATIC_DIR = Path(__file__).parent / "static"

START_TIME = time.time()
VERSION = "3.0.0"

# --- App ---
app = FastAPI(title="Vault Dashboard", version=VERSION)


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browser caching of static assets during development."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(NoCacheStaticMiddleware)

# Serve static files (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Root: serve dashboard ---
@app.get("/", response_class=HTMLResponse)
async def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_text(), status_code=200)
    return HTMLResponse(content="<h1>Dashboard not found</h1>", status_code=404)


# --- Health ---
@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "version": VERSION,
        "uptime_seconds": round(time.time() - START_TIME),
        "timestamp": date.today().isoformat(),
        "kognai_root": str(KOGNAI_ROOT),
    }


# --- Sprints ---
@app.get("/api/sprints")
async def sprints():
    return list_sprints(SPRINTS_DIR)


@app.get("/api/sprints/current")
async def current_sprint():
    return get_current_sprint(SPRINTS_DIR)


@app.get("/api/sprints/{sprint_id}")
async def sprint_detail(sprint_id: str):
    return get_sprint_by_id(SPRINTS_DIR, sprint_id)


# --- Invoica Sprints ---
@app.get("/api/invoica/sprints")
async def invoica_sprints():
    return list_invoica_sprints(INVOICA_ROOT)


@app.get("/api/invoica/sprints/current")
async def invoica_current_sprint():
    return get_current_invoica_sprint(INVOICA_ROOT)


@app.get("/api/invoica/sprints/{sprint_id}")
async def invoica_sprint_detail(sprint_id: str):
    return get_invoica_sprint_by_id(INVOICA_ROOT, sprint_id)


@app.get("/api/invoica/agents")
async def invoica_agents():
    return list_invoica_agents(INVOICA_ROOT)


@app.get("/api/invoica/stats")
async def invoica_stats():
    return get_invoica_stats(INVOICA_ROOT)


# --- Daily Brief ---
@app.get("/api/daily-brief")
async def daily_brief():
    doc = KOGNAI_ROOT / "docs" / "daily-brief.md"
    if not doc.exists():
        return {"error": "No daily brief found", "am": [], "mid": [], "pm": []}
    return parse_daily_brief(doc)


@app.post("/api/daily-brief/toggle")
async def toggle_brief_task(req: ToggleRequest):
    doc = KOGNAI_ROOT / "docs" / "daily-brief.md"
    if not doc.exists():
        return {"error": "No daily brief found"}
    result = toggle_task(doc, req.block, req.index)
    if result is None:
        return {"error": "Toggle failed"}
    return {"success": True}


@app.post("/api/daily-brief/defer")
async def defer_brief_task(req: ToggleRequest):
    doc = KOGNAI_ROOT / "docs" / "daily-brief.md"
    if not doc.exists():
        return {"error": "No daily brief found"}
    result = defer_task(doc, req.block, req.index)
    if result is None:
        return {"error": "Defer failed"}
    return {"success": True}


# --- Gates & Phases ---
@app.get("/api/gates")
async def gates():
    gate_doc = KOGNAI_ROOT / "docs" / "gate-tracker.md"
    phase_doc = KOGNAI_ROOT / "docs" / "strategic-context.md"
    return {
        "gates": parse_gates(gate_doc),
        "phases": parse_phases(phase_doc),
    }


# --- Agents ---
@app.get("/api/agents")
async def agents():
    return list_agents(AGENTS_DIR)


# --- Shared Infra ---
@app.get("/api/shared-infra")
async def shared_infra():
    if not SHARED_INFRA.exists():
        return {"error": "No shared-infra.md found"}
    return {"content": SHARED_INFRA.read_text()}


# --- Logs ---
@app.get("/api/logs/latest")
async def latest_log():
    return get_latest_log(LOGS_DIR)


@app.get("/api/logs/errors")
async def errors():
    return get_all_errors(LOGS_DIR)


# --- Routing & Costs ---
@app.get("/api/routing")
async def routing():
    if not ROUTING_DIR.exists():
        return []
    entries = []
    for f in sorted(ROUTING_DIR.glob("*.jsonl"), reverse=True):
        for line in f.read_text().strip().split("\n"):
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries[:100]


@app.get("/api/costs")
async def costs():
    if not ROUTING_DIR.exists():
        return {"error": "Routing dir not found"}
    return get_costs(ROUTING_DIR)


@app.get("/api/costs/summary")
async def costs_summary():
    if not ROUTING_DIR.exists():
        return {"error": "Routing dir not found"}
    return get_cost_summary(ROUTING_DIR)


@app.get("/api/routing/stats")
async def routing_stats():
    if not ROUTING_DIR.exists():
        return {"total": 0, "by_model": {}, "by_sprint": {}, "recent": []}
    return get_model_stats(ROUTING_DIR)

# --- Logs ---


@app.get("/api/logs/{service}")
async def service_log(service: str):
    log_file = LOGS_DIR / f"{service}.log"
    if not log_file.exists():
        return {"error": f"No log for {service}"}

    async def generate():
        with open(log_file, "r") as f:
            for line in f:
                yield line

    return StreamingResponse(generate(), media_type="text/plain")


@app.get("/api/logs")
async def list_log_files():
    return [f.name for f in sorted(LOGS_DIR.glob("*.log"))]


# --- SSE: live tail ---
@app.get("/api/logs/tail/{service}")
async def tail_log(service: str):
    log_file = LOGS_DIR / f"{service}.log"
    if not log_file.exists():
        return StreamingResponse(iter(["No log file"]), media_type="text/event-stream")

    async def event_stream():
        with open(log_file, "r") as f:
            f.seek(0, 2)  # EOF
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5)
                    continue
                yield f"data: {line}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --- SSE: live swarm activity (AAR + routing JSONL) ---
AAR_DIR = LOGS_DIR / "aar"
INVOICA_SWARM_DIR = INVOICA_ROOT / "logs" / "swarm-runs"

@app.get("/api/swarm/stream")
async def swarm_stream():
    """Stream live swarm activity from AAR receipts and routing logs (both projects)."""
    today = date.today().isoformat()

    # Collect all JSONL sources to tail
    sources = []
    aar_kognai = AAR_DIR / f"{today}.jsonl"
    aar_invoica = INVOICA_ROOT / "logs" / "aar" / f"{today}.jsonl"
    routing_kognai = ROUTING_DIR / f"{today}.jsonl"
    routing_invoica = INVOICA_ROOT / "logs" / "routing" / f"{today}.jsonl"

    for path, event_type, project in [
        (aar_kognai, "aar", "kognai"),
        (aar_invoica, "aar", "invoica"),
        (routing_kognai, "routing", "kognai"),
        (routing_invoica, "routing", "invoica"),
    ]:
        if path.exists():
            sources.append((path, event_type, project))

    async def event_stream():
        # Open all files, seek to end
        handles = []
        for path, event_type, project in sources:
            fh = open(path, "r")
            fh.seek(0, 2)  # EOF
            handles.append((fh, event_type, project))

        # Also check for new files appearing (e.g. Invoica starts running)
        check_interval = 0
        try:
            while True:
                found_data = False
                for fh, event_type, project in handles:
                    line = fh.readline()
                    if line:
                        line = line.strip()
                        if line:
                            # Inject project and event type into the SSE event
                            try:
                                payload = json.loads(line)
                                payload["_project"] = project
                                payload["_event_type"] = event_type
                                yield f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"
                            except json.JSONDecodeError:
                                yield f"event: {event_type}\ndata: {json.dumps({'raw': line, '_project': project, '_event_type': event_type})}\n\n"
                            found_data = True

                if not found_data:
                    await asyncio.sleep(1)

                # Every 30 seconds, check for new files that may have appeared
                check_interval += 1
                if check_interval >= 30:
                    check_interval = 0
                    for path, event_type, project in [
                        (aar_kognai, "aar", "kognai"),
                        (aar_invoica, "aar", "invoica"),
                        (routing_kognai, "routing", "kognai"),
                        (routing_invoica, "routing", "invoica"),
                    ]:
                        already = any(h[0].name == str(path) for h in handles)
                        if not already and path.exists():
                            fh = open(path, "r")
                            fh.seek(0, 2)
                            handles.append((fh, event_type, project))

                # Send keepalive every cycle to detect disconnects
                yield ": keepalive\n\n"
        finally:
            for fh, _, _ in handles:
                fh.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --- SSE: recent swarm events (non-streaming fallback) ---
@app.get("/api/swarm/recent")
async def swarm_recent(limit: int = 50):
    """Return the most recent AAR events (for initial load / SSE fallback)."""
    today = date.today().isoformat()
    events = []

    for aar_path, project in [
        (AAR_DIR / f"{today}.jsonl", "kognai"),
        (INVOICA_ROOT / "logs" / "aar" / f"{today}.jsonl", "invoica"),
    ]:
        if aar_path.exists():
            try:
                lines = aar_path.read_text().strip().splitlines()
                for line in lines[-limit:]:
                    try:
                        data = json.loads(line)
                        data["_project"] = project
                        events.append(data)
                    except json.JSONDecodeError:
                        pass
            except OSError:
                pass

    # Sort by timestamp, most recent first
    events.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return events[:limit]


# --- File Browser (read-only) ---
@app.get("/api/fs/{path:path}")
async def read_file(path: str):
    # Security: only allow files under KOGNAI_ROOT
    target = (KOGNAI_ROOT / path).resolve()
    try:
        target.relative_to(KOGNAI_ROOT.resolve())
    except ValueError:
        return {"error": "Access denied"}

    if target.is_dir():
        return {"type": "dir", "children": [p.name for p in sorted(target.iterdir())]}
    if target.is_file():
        return {"type": "file", "content": target.read_text()[:5000]}
    return {"error": "Not found"}


# --- Constants for frontend ---
@app.get("/api/constants")
async def constants():
    return {
        "INVOICA_SPRINTS": INVOICA_SPRINTS,
        "INVOICA_AGENTS": INVOICA_AGENTS,
    }


# --- On-Chain Data ---
@app.get("/api/chain")
async def chain():
    return get_chain_data()


# --- Project Overview ---
@app.get("/api/overview")
async def overview():
    return get_project_overview()


# --- Assets (Skills + Code) ---
@app.get("/api/assets")
async def assets():
    return get_all_assets()


# --- Invoica Knowledge ---
@app.get("/api/invoica/knowledge")
async def invoica_knowledge():
    """Full Invoica knowledge dump: skills, failures, CTO insights, learnings."""
    return {
        "skills": get_invoica_skills(limit=50),
        "failures": get_invoica_failures(limit=30),
        "cto_insights": get_cto_insights(),
        "learnings": get_post_sprint_learnings(limit=10),
        "summary": get_invoica_knowledge_summary(),
    }


@app.get("/api/invoica/failures")
async def invoica_failures():
    return get_invoica_failures(limit=50)


@app.get("/api/invoica/logs/latest")
async def invoica_latest_log():
    log = get_invoica_latest_log()
    if not log:
        return {"error": "No Invoica logs found"}
    return log


@app.get("/api/invoica/logs/errors")
async def invoica_log_errors():
    return get_invoica_log_errors()


# --- Daily Plans (both projects) ---
@app.get("/api/daily-plans")
async def daily_plans():
    return get_today_plans()


# --- Pipeline Runs ---
@app.get("/api/pipeline/latest")
async def pipeline_latest():
    run = get_latest_pipeline_run()
    if not run:
        return {"error": "No pipeline runs yet"}
    return run


@app.get("/api/pipeline/runs")
async def pipeline_runs():
    return list_pipeline_runs()


@app.get("/api/readiness")
async def readiness():
    return get_readiness()


@app.get("/api/pipeline/status")
async def pipeline_status():
    return get_pipeline_status()


# --- Publish Ledger ---
@app.get("/api/publish/history")
async def publish_history():
    return get_publish_history()


@app.get("/api/publish/stats")
async def publish_stats():
    return get_publish_stats()


# --- Experiments ---
@app.get("/api/experiments/stats")
async def experiments_stats():
    return get_experiment_stats()


@app.get("/api/experiments/history")
async def experiments_history():
    return get_experiment_history()


# --- Achiri Stats ---
@app.get("/api/achiri/stats")
async def achiri_stats():
    return parse_achiri_stats(KOGNAI_ROOT)


# Sprint 482: Swarm metrics
@app.get("/api/swarm/metrics")
async def swarm_metrics():
    return get_swarm_metrics()


@app.get("/api/swarm/quality")
async def swarm_quality():
    return get_sprint_quality_scores()


# --- Validation Errors ---
@app.get("/api/validation/errors")
async def validation_errors():
    return get_validation_errors()


@app.get("/api/validation/summary")
async def validation_summary():
    return get_validation_summary()


# --- Autonomous Sessions ---
KOGNAI_SESSIONS_DIR = KOGNAI_ROOT / "logs" / "autonomous"
INVOICA_SESSIONS_DIR = INVOICA_ROOT / "logs" / "autonomous"


@app.get("/api/sessions/live")
async def sessions_live():
    """Get live autonomous session status for both projects."""
    return get_sessions_live()


@app.get("/api/sessions/stream")
async def sessions_stream():
    """SSE: tail active autonomous session logs for real-time output."""

    async def find_active_logs():
        """Find the most recent active (or latest) log file per project."""
        import subprocess
        result = subprocess.run(["ps", "aux"], capture_output=True, text=True, timeout=5)
        active = {}
        for line in result.stdout.splitlines():
            if "script" in line and "autonomous" in line and "grep" not in line:
                if "kognai" in line and "kognai" not in active:
                    import re
                    m = re.search(r"(/\S+logs/autonomous/session-[^\s]+\.log)", line)
                    if m:
                        active["kognai"] = Path(m.group(1))
                if "Invoica" in line and "invoica" not in active:
                    import re
                    m = re.search(r"(/\S+logs/autonomous/session-[^\s]+\.log)", line)
                    if m:
                        active["invoica"] = Path(m.group(1))
        return active

    async def event_stream():
        active_logs = await find_active_logs()
        handles = {}
        for project, path in active_logs.items():
            if path.exists():
                fh = open(path, "r", errors="replace")
                # Read last 2KB for initial context, then tail
                fh.seek(max(0, path.stat().st_size - 2048))
                initial = fh.read()
                if initial.strip():
                    # Send last few lines as initial context
                    for line in initial.strip().splitlines()[-5:]:
                        payload = json.dumps({"project": project, "line": line.strip()[:200]})
                        yield f"event: session\ndata: {payload}\n\n"
                handles[project] = fh

        check_count = 0
        try:
            while True:
                found = False
                for project, fh in list(handles.items()):
                    line = fh.readline()
                    if line:
                        line = line.strip()
                        if line and len(line) > 1:
                            payload = json.dumps({"project": project, "line": line[:300]})
                            yield f"event: session\ndata: {payload}\n\n"
                            found = True

                if not found:
                    await asyncio.sleep(1)

                # Re-check for new active sessions every 30s
                check_count += 1
                if check_count >= 30:
                    check_count = 0
                    new_active = await find_active_logs()
                    for project, path in new_active.items():
                        if project not in handles and path.exists():
                            fh = open(path, "r", errors="replace")
                            fh.seek(0, 2)
                            handles[project] = fh

                yield ": keepalive\n\n"
        finally:
            for fh in handles.values():
                fh.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --- Debug: ping all services ---
@app.get("/api/debug/ping")
async def ping_services():
    import socket

    def port_open(host: str, port: int, timeout: float = 0.5) -> bool:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            sock.close()
            return True
        except (socket.error, socket.timeout):
            return False

    services = [
        ("Ollama", "127.0.0.1", 11434),
        ("Router", "127.0.0.1", 11435),
        ("Dashboard", "127.0.0.1", 11436),
    ]
    return {name: port_open(host, port) for name, host, port in services}


# --- Sprint 467: Dashboard v2 panels ---

@app.get("/api/gate-countdown")
async def gate_countdown():
    """April 7 gate countdown with posting pace and days remaining."""
    from datetime import datetime, timezone
    gate_date = datetime(2026, 4, 7, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    days_remaining = max(0, (gate_date - now).days)

    # Read posting log for count
    posting_log = KOGNAI_ROOT / "workspace" / "posting-log.json"
    posts_done = 0
    if posting_log.exists():
        try:
            data = json.loads(posting_log.read_text())
            posts_done = len(data) if isinstance(data, list) else data.get("count", 0)
        except Exception:
            pass

    # Also check telegram-sent.jsonl for posted count
    sent_log = KOGNAI_ROOT / "workspace" / "scs001" / "telegram-sent.jsonl"
    if sent_log.exists():
        try:
            lines = [l for l in sent_log.read_text().strip().split("\n") if l.strip()]
            posts_done = max(posts_done, len(lines))
        except Exception:
            pass

    target = 30
    posts_remaining = max(0, target - posts_done)
    posts_per_day = round(posts_remaining / max(1, days_remaining), 1) if days_remaining > 0 else posts_remaining

    # Read gate JSON for phase status
    gate_file = KOGNAI_ROOT / "workspace" / "gates" / "phase1-5-gate.json"
    gate_criteria = []
    if gate_file.exists():
        try:
            gdata = json.loads(gate_file.read_text())
            gate_criteria = gdata.get("criteria", gdata.get("gates", []))
        except Exception:
            pass

    return {
        "gate_date": "2026-04-07",
        "days_remaining": days_remaining,
        "posts_done": posts_done,
        "posts_target": target,
        "posts_remaining": posts_remaining,
        "required_posts_per_day": posts_per_day,
        "pace_status": "on_track" if posts_per_day <= 3 else ("behind" if posts_per_day <= 5 else "critical"),
        "gate_criteria": gate_criteria,
    }


@app.get("/api/posting-tracker")
async def posting_tracker():
    """Track posting progress across platforms."""
    result = {"tiktok": [], "youtube": [], "total": 0}

    # TikTok posts from telegram-sent
    sent_log = KOGNAI_ROOT / "workspace" / "scs001" / "telegram-sent.jsonl"
    if sent_log.exists():
        try:
            for line in sent_log.read_text().strip().split("\n"):
                if line.strip():
                    entry = json.loads(line)
                    result["tiktok"].append({
                        "date": entry.get("timestamp", entry.get("date", "")),
                        "topic": entry.get("topic", entry.get("niche", "unknown")),
                        "status": entry.get("status", "sent"),
                    })
        except Exception:
            pass

    # YouTube uploads
    yt_log = KOGNAI_ROOT / "workspace" / "youtube" / "uploads.json"
    if yt_log.exists():
        try:
            yt_data = json.loads(yt_log.read_text())
            uploads = yt_data if isinstance(yt_data, list) else yt_data.get("uploads", [])
            for u in uploads:
                result["youtube"].append({
                    "date": u.get("uploaded_at", u.get("date", "")),
                    "title": u.get("title", "unknown"),
                    "status": u.get("status", "uploaded"),
                })
        except Exception:
            pass

    result["total"] = len(result["tiktok"]) + len(result["youtube"])
    return result


@app.get("/api/api-health")
async def api_health():
    """Check health of all configured API integrations."""
    import socket
    import os

    def port_open(host: str, port: int, timeout: float = 0.5) -> bool:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            sock.close()
            return True
        except (socket.error, socket.timeout):
            return False

    checks = {}

    # Local services
    checks["ollama"] = {"status": "up" if port_open("127.0.0.1", 11434) else "down", "type": "local"}
    checks["router"] = {"status": "up" if port_open("127.0.0.1", 11435) else "down", "type": "local"}
    checks["dashboard"] = {"status": "up", "type": "local"}

    # API keys presence
    api_keys = {
        "telegram": "TELEGRAM_BOT_TOKEN",
        "supabase": "SUPABASE_URL",
        "stripe": "STRIPE_SECRET_KEY",
        "youtube": "YOUTUBE_API_KEY",
        "tiktok": "TIKTOK_ACCESS_TOKEN",
        "elevenlabs": "ELEVENLABS_API_KEY",
        "openai": "OPENAI_API_KEY",
        "anthropic": "ANTHROPIC_API_KEY",
        "pexels": "PEXELS_API_KEY",
        "fal": "FAL_KEY",
    }
    for name, env_var in api_keys.items():
        val = os.environ.get(env_var, "")
        checks[name] = {
            "status": "configured" if val else "missing",
            "type": "api_key",
            "env_var": env_var,
        }

    # Vault (Tailscale)
    vault_ip = os.environ.get("VAULT_TAILSCALE_IP", "")
    if vault_ip:
        checks["vault"] = {"status": "up" if port_open(vault_ip, 11434, timeout=1.0) else "down", "type": "remote"}
    else:
        checks["vault"] = {"status": "not_configured", "type": "remote"}

    up_count = sum(1 for c in checks.values() if c["status"] in ("up", "configured"))
    total = len(checks)
    return {"services": checks, "healthy": up_count, "total": total, "health_pct": round(up_count / total * 100)}


@app.get("/api/stripe-status")
async def stripe_status():
    """Stripe subscription and MRR status."""
    import os
    result = {
        "configured": bool(os.environ.get("STRIPE_SECRET_KEY")),
        "webhook_configured": bool(os.environ.get("STRIPE_WEBHOOK_SECRET")),
        "prices": {
            "growth": os.environ.get("STRIPE_PRICE_GROWTH", "not_set"),
            "premium": os.environ.get("STRIPE_PRICE_PREMIUM", "not_set"),
        },
        "mrr": 0.0,
        "subscribers": 0,
        "status": "not_live",
    }

    # Check for local subscription data
    subs_file = KOGNAI_ROOT / "workspace" / "billing" / "subscriptions.json"
    if subs_file.exists():
        try:
            subs = json.loads(subs_file.read_text())
            active = [s for s in subs if s.get("status") == "active"]
            result["subscribers"] = len(active)
            result["mrr"] = sum(s.get("amount", 9.0) for s in active)
            result["status"] = "live" if active else "no_subscribers"
        except Exception:
            pass

    if result["configured"]:
        result["status"] = result["status"] if result["status"] != "not_live" else "keys_set_not_tested"

    return result


# --- Sprint 515: PM2 Status ---
@app.get("/api/pm2/status")
async def pm2_status():
    """Get PM2 process list with status, memory, CPU, restarts."""
    import subprocess
    try:
        proc = subprocess.run(
            ["pm2", "jlist"],
            capture_output=True, text=True, timeout=10
        )
        if proc.returncode != 0:
            return {"error": "PM2 not running or not installed", "processes": [], "summary": {}}
        processes = json.loads(proc.stdout)
    except FileNotFoundError:
        return {"error": "PM2 not found in PATH", "processes": [], "summary": {}}
    except subprocess.TimeoutExpired:
        return {"error": "PM2 timed out", "processes": [], "summary": {}}
    except json.JSONDecodeError:
        return {"error": "PM2 returned invalid JSON", "processes": [], "summary": {}}

    result = []
    counts = {"online": 0, "stopped": 0, "errored": 0, "total": 0}
    for p in processes:
        env = p.get("pm2_env", {})
        monit = p.get("monit", {})
        status = env.get("status", "unknown")
        entry = {
            "name": p.get("name", "unknown"),
            "pm_id": p.get("pm_id"),
            "status": status,
            "cpu": monit.get("cpu", 0),
            "memory_mb": round(monit.get("memory", 0) / 1048576, 1),
            "restarts": env.get("restart_time", 0),
            "uptime_ms": env.get("pm_uptime", 0),
        }
        result.append(entry)
        counts["total"] += 1
        if status == "online":
            counts["online"] += 1
        elif status == "stopped":
            counts["stopped"] += 1
        else:
            counts["errored"] += 1

    return {"processes": result, "summary": counts}


# Sprint 719: Governance panel API endpoints
@app.get("/api/governance")
async def api_governance():
    return get_governance_summary()

@app.get("/api/governance/trust-scores")
async def api_trust_scores():
    return get_trust_scores()

@app.get("/api/governance/aar")
async def api_aar():
    return get_aar_summary()

@app.get("/api/governance/signals")
async def api_signals():
    return get_constitutional_signals()

@app.get("/api/governance/health")
async def api_swarm_health():
    return get_swarm_health()