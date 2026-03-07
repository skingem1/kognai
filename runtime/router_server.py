"""
FastAPI HTTP server wrapping KognaiRouter for local task routing decisions.

Dependency note: pip3 install fastapi uvicorn httpx
Port: 11435 (override via ROUTER_PORT env var)
"""
import os
import sys
import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Ensure runtime dir is on path for sibling imports
_runtime_dir = os.path.dirname(os.path.abspath(__file__))
if _runtime_dir not in sys.path:
    sys.path.insert(0, _runtime_dir)

from models import RouteRequest, RouteResponse, TIER_TIMEOUTS
from router_wrapper import get_router, create_router

# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

app = FastAPI(
    title="Kognai Router",
    description="Intelligent task routing across local and cloud inference tiers",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://localhost:3000", "http://localhost:3001",
                   "http://localhost:11434", "http://localhost:11435", "http://127.0.0.1"],
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@app.post("/route", response_model=RouteResponse)
async def route_task(req: RouteRequest) -> RouteResponse:
    """Route a task to the appropriate model tier."""
    try:
        # Use per-request router if overrides are present, otherwise singleton
        if req.force_local is not None or req.max_cost_usd is not None:
            router = create_router(
                force_local=req.force_local,
                max_cost_usd=req.max_cost_usd,
            )
        else:
            router = get_router()

        decision = router.route(req.prompt, context_tokens=req.context_tokens or 0)

        tier_name = decision.tier.name.lower()
        fallback_name = decision.fallback_tier.name.lower() if decision.fallback_tier else None
        timeout_s = TIER_TIMEOUTS.get(tier_name, 90)

        return RouteResponse(
            task_type=decision.task_type.value,
            tier=tier_name,
            model_name=decision.model.name,
            endpoint=decision.model.endpoint,
            think_mode=decision.think_mode,
            reasoning=decision.reasoning,
            estimated_cost_usd=decision.estimated_cost,
            fallback_tier=fallback_name,
            timeout_budget_s=timeout_s,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/health")
async def health() -> dict:
    """Return server health and basic router stats."""
    try:
        router = get_router()
        stats = router._stats
        total = stats.get("total_tasks", 0)
        total_cost = stats.get("total_cost", 0.0)
        tier_counts = stats.get("tier_counts", {})
        local_tiers = {"nano", "local", "power"}
        local_count = sum(
            v for k, v in tier_counts.items()
            if (k.name.lower() if hasattr(k, "name") else str(k).lower()) in local_tiers
        )
        local_pct = round((local_count / total * 100) if total else 0.0, 1)
        avg_cost = round(total_cost / total if total else 0.0, 6)
    except Exception:
        total, local_pct, avg_cost = 0, 0.0, 0.0

    return {
        "status": "ok",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "total_tasks_routed": total,
        "local_pct": local_pct,
        "avg_cost_per_task_usd": avg_cost,
        "port": int(os.environ.get("ROUTER_PORT", "11435")),
    }


@app.get("/stats")
async def stats() -> dict:
    """Return detailed router statistics."""
    try:
        router = get_router()
        raw = router._stats
        tier_counts = {
            (k.name if hasattr(k, "name") else str(k)): v
            for k, v in raw.get("tier_counts", {}).items()
        }
        return {
            "total_tasks": raw.get("total_tasks", 0),
            "total_cost_usd": round(raw.get("total_cost", 0.0), 6),
            "tier_counts": tier_counts,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ─────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.environ.get("ROUTER_PORT", "11435"))
    uvicorn.run("router_server:app", host="0.0.0.0", port=port, log_level="info", reload=False)
