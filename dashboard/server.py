FILE: dashboard/server.py
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
    return parse_daily_brief(doc.read_text())


@app.post("/api/daily-brief/toggle")
async def toggle_brief_task(req: ToggleRequest):
    doc = KOGNAI_ROOT / "docs" / "daily-brief.md"
    if not doc.exists():
        return {"error": "No daily brief found"}
    content = doc.read_text()
    new_content = toggle_task(content, req.block, req.index)
    doc.write_text(new_content)
    return {"success": True}


@app.post("/api/daily-brief/defer")
async def defer_brief_task(req: ToggleRequest):
    doc = KOGNAI_ROOT / "docs" / "daily-brief.md"
    if not doc.exists():
        return {"error": "No daily brief found"}
    content = doc.read_text()
    new_content = defer_task(content, req.block, req.index)
    doc.write_text(new_content)
    return {"success": True}


# --- Gates & Phases ---
@app.get("/api/gates")
async def gates():
    doc = KOGNAI_ROOT / "docs" / "gates.md"
    if not doc.exists():
        return {"error": "No gates doc found", "gates": [], "phases": []}
    content = doc.read_text()
    return {
        "gates": parse_gates(content),
        "phases": parse_phases(content),
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