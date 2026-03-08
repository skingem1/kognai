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
from parsers.routing import get_costs, get_cost_summary
from parsers.daily_brief import parse_daily_brief, toggle_task, defer_task
from parsers.gates import parse_gates, parse_phases
from parsers.agents import list_agents
from parsers.invoica import (
    get_current_invoica_sprint, list_invoica_sprints,
    get_invoica_sprint_by_id, list_invoica_agents,
    get_invoica_stats, INVOICA_SPRINTS, INVOICA_AGENTS,
)


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
VERSION = "2.0.0"

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
        "invoica_root": str(INVOICA_ROOT),
        "projects": ["kognai", "invoica"],
    }


# ========================
# KOGNAI Sprint Endpoints
# ========================

@app.get("/api/sprint/current")
async def sprint_current():
    result = get_current_sprint(SPRINTS_DIR)
    if result is None:
        return {"error": "No sprints found", "path": str(SPRINTS_DIR)}
    result["project"] = "kognai"
    return result


@app.get("/api/sprint/list")
async def sprint_list():
    sprints = list_sprints(SPRINTS_DIR)
    for s in sprints:
        s["project"] = "kognai"
    return sprints


@app.get("/api/sprint/{sprint_id}")
async def sprint_detail(sprint_id: str):
    result = get_sprint_by_id(SPRINTS_DIR, sprint_id)
    if result is None:
        return {"error": f"Sprint {sprint_id} not found"}
    result["project"] = "kognai"
    return result


# ========================
# INVOICA Sprint Endpoints
# ========================

@app.get("/api/invoica/sprint/current")
async def invoica_sprint_current():
    result = get_current_invoica_sprint()
    if result is None:
        return {"error": "No Invoica sprints found", "path": str(INVOICA_SPRINTS)}
    return result


@app.get("/api/invoica/sprint/list")
async def invoica_sprint_list():
    return list_invoica_sprints(limit=20)


@app.get("/api/invoica/sprint/{sprint_id}")
async def invoica_sprint_detail(sprint_id: str):
    result = get_invoica_sprint_by_id(INVOICA_SPRINTS, sprint_id)
    if result is None:
        return {"error": f"Invoica sprint {sprint_id} not found"}
    return result


@app.get("/api/invoica/stats")
async def invoica_stats():
    return get_invoica_stats()


@app.get("/api/invoica/agents")
async def invoica_agents():
    return list_invoica_agents()


# ========================
# Combined Overview
# ========================

@app.get("/api/overview")
async def overview():
    """Combined overview of both projects — main dashboard data source."""
    kognai_sprint = get_current_sprint(SPRINTS_DIR)
    invoica_sprint = get_current_invoica_sprint()
    kognai_agents = list_agents(AGENTS_DIR)
    inv_agents = list_invoica_agents()
    inv_stats = get_invoica_stats()

    if kognai_sprint:
        kognai_sprint["project"] = "kognai"
    if invoica_sprint:
        invoica_sprint["project"] = "invoica"

    return {
        "kognai": {
            "current_sprint": kognai_sprint,
            "agent_count": len(kognai_agents),
            "agents": kognai_agents,
        },
        "invoica": {
            "current_sprint": invoica_sprint,
            "agent_count": len(inv_agents),
            "agents": inv_agents,
            "stats": inv_stats,
        },
        "shared": {
            "shared_infra_exists": SHARED_INFRA.exists(),
            "shared_infra_updated": _file_age_str(SHARED_INFRA),
        },
    }


def _file_age_str(path: Path) -> str:
    """Human-readable file age."""
    try:
        if not path.exists():
            return "missing"
        age = time.time() - path.stat().st_mtime
        if age < 3600:
            return f"{int(age / 60)}m ago"
        elif age < 86400:
            return f"{int(age / 3600)}h ago"
        else:
            return f"{int(age / 86400)}d ago"
    except OSError:
        return "unknown"


# ========================
# Existing Kognai Endpoints
# ========================

# --- Today's tasks ---
@app.get("/api/tasks/today")
async def tasks_today():
    return parse_daily_brief(DOCS_DIR / "daily-brief.md")


# --- Toggle task checkbox ---
@app.post("/api/tasks/toggle")
async def tasks_toggle(req: ToggleRequest):
    brief_path = DOCS_DIR / "daily-brief.md"
    result = toggle_task(brief_path, req.block.upper(), req.index)
    if result is None:
        return {"error": "Could not toggle task", "block": req.block, "index": req.index}
    return result


# --- Defer task to tomorrow ---
@app.post("/api/tasks/defer")
async def tasks_defer(req: ToggleRequest):
    brief_path = DOCS_DIR / "daily-brief.md"
    result = defer_task(brief_path, req.block.upper(), req.index)
    if result is None:
        return {"error": "Could not defer task", "block": req.block, "index": req.index}
    return result


# --- Gates ---
@app.get("/api/gates")
async def gates():
    return parse_gates(DOCS_DIR / "gate-tracker.md")


# --- Phases ---
@app.get("/api/phases")
async def phases():
    return parse_phases(DOCS_DIR / "strategic-context.md")


# --- Costs ---
@app.get("/api/costs")
async def costs():
    if not ROUTING_DIR.exists():
        return {
            "date": date.today().isoformat(),
            "total_usd": 0.0,
            "task_count": 0,
            "by_tier": {"NANO": 0, "LOCAL": 0, "POWER": 0, "CLOUD": 0, "APEX": 0},
            "local_pct": 0,
            "cloud_pct": 0,
            "avg_cost_per_task": 0,
            "daily_budget": 5.00,
            "budget_remaining": 5.00,
            "message": "No routing logs yet. Sprint 063 will create these.",
        }
    return get_costs(ROUTING_DIR)


@app.get("/api/costs/summary")
async def costs_summary():
    if not ROUTING_DIR.exists():
        return {"total_usd": 0, "total_tasks": 0, "message": "No routing data yet"}
    return get_cost_summary(ROUTING_DIR)


# --- Logs ---
@app.get("/api/logs/latest")
async def logs_latest():
    result = get_latest_log(LOGS_DIR)
    if result is None:
        return {"lines": [], "errors": [], "summary": {"total_lines": 0}, "message": "No sprint logs found"}
    return result


@app.get("/api/logs/errors")
async def logs_errors():
    return get_all_errors(LOGS_DIR)


# --- Agents ---
@app.get("/api/agents")
async def agents():
    return list_agents(AGENTS_DIR)


# --- SSE Stream for auto-refresh ---
WATCH_TARGETS = {
    "sprints": SPRINTS_DIR,
    "logs": LOGS_DIR,
    "brief": DOCS_DIR / "daily-brief.md",
    "gates": DOCS_DIR / "gate-tracker.md",
    "strategic": DOCS_DIR / "strategic-context.md",
    "invoica_sprints": INVOICA_SPRINTS,
    "invoica_agents": INVOICA_AGENTS,
    "shared_infra": SHARED_INFRA,
}


def get_mtime(path: Path) -> float:
    """Get modification time for a file or newest file in a directory."""
    try:
        if path.is_file():
            return path.stat().st_mtime
        elif path.is_dir():
            files = [f for f in path.iterdir() if f.is_file()]
            if files:
                return max(f.stat().st_mtime for f in files)
    except OSError:
        pass
    return 0.0


async def event_generator():
    """Generate SSE events when watched files change."""
    last_mtimes = {k: get_mtime(v) for k, v in WATCH_TARGETS.items()}

    # Send initial connected event
    yield f"data: {json.dumps({'type': 'connected', 'timestamp': time.time()})}\n\n"

    while True:
        changed = []
        for key, path in WATCH_TARGETS.items():
            mtime = get_mtime(path)
            if mtime > last_mtimes[key]:
                last_mtimes[key] = mtime
                changed.append(key)

        if changed:
            yield f"data: {json.dumps({'type': 'update', 'sources': changed, 'timestamp': time.time()})}\n\n"

        # Send heartbeat every 30s to keep connection alive
        yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': time.time()})}\n\n"

        await asyncio.sleep(5)


@app.get("/api/stream")
async def stream():
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=11436)
