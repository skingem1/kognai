#!/usr/bin/env python3
"""
KOGNAI Sprint Brief Generator — Qwen Pre-Flight
=================================================
Runs BEFORE each autonomous Claude Code session.
Uses Qwen3:14b (local, $0) to read all state files and produce a condensed
"sprint brief" so Claude doesn't have to read raw files (saving ~95% input tokens).

Output: workspace/sprint-brief.md (~3-5K tokens vs ~100K+ tokens from raw files)

Usage:
  python3 scripts/generate-sprint-brief.py                  # Kognai brief
  python3 scripts/generate-sprint-brief.py --project invoica # Invoica brief

Architecture:
  1. Read each source file (MEMORY.md, progress.md, git log, etc.)
  2. Send each to Qwen3:14b via Ollama with a focused extraction prompt
  3. Combine extractions into structured brief
  4. Write to workspace/sprint-brief.md
  5. Claude starts, reads ONLY the brief

Cost: $0 (all local inference)
Time: ~60-90 seconds on M4
"""

import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# --- Config ---
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen3:14b"
KOGNAI_ROOT = Path.home() / "kognai"
INVOICA_ROOT = Path.home() / "Documents" / "Invoica"

# Project-specific configs
PROJECTS = {
    "kognai": {
        "root": KOGNAI_ROOT,
        "memory": Path.home() / "kognai" / ".claude" / "projects" / "-Users-tarekmnif-Documents-Kognai" / "memory" / "MEMORY.md",
        "progress": KOGNAI_ROOT / "workspace" / "scs001" / "progress.md",
        "sprints_dir": KOGNAI_ROOT / "workspace" / "sprints",
        "output": KOGNAI_ROOT / "workspace" / "sprint-brief.md",
        "agents_dir": KOGNAI_ROOT / "agents",
    },
    "invoica": {
        "root": INVOICA_ROOT,
        "memory": INVOICA_ROOT / "MEMORY.md",
        "progress": INVOICA_ROOT / "progress.md",
        "sprints_dir": INVOICA_ROOT / "sprints",
        "output": INVOICA_ROOT / "workspace" / "sprint-brief.md",
        "agents_dir": INVOICA_ROOT / "agents",
    },
}


def call_qwen(prompt: str, max_tokens: int = 2000) -> str:
    """Call Qwen3:14b via Ollama API. Returns extracted text."""
    try:
        result = subprocess.run(
            ["curl", "-s", "--max-time", "120", OLLAMA_URL,
             "-d", json.dumps({
                 "model": MODEL,
                 "prompt": prompt,
                 "stream": False,
                 "options": {
                     "num_predict": max_tokens,
                     "temperature": 0.1,
                     "num_ctx": 16384,
                 },
                 # Disable thinking mode — we want direct output
                 "think": False,
             })],
            capture_output=True, text=True, timeout=180
        )
        if result.returncode != 0:
            return f"[ERROR: Ollama call failed: {result.stderr[:200]}]"

        response = json.loads(result.stdout)
        return response.get("response", "[ERROR: No response from Qwen]").strip()
    except subprocess.TimeoutExpired:
        return "[ERROR: Qwen timed out after 180s]"
    except (json.JSONDecodeError, KeyError) as e:
        return f"[ERROR: Bad response from Ollama: {e}]"


def read_file_safe(path: Path, max_lines: int = 300) -> Optional[str]:
    """Read a file safely, truncating if too long."""
    if not path.exists():
        return None
    try:
        lines = path.read_text().split("\n")
        if len(lines) > max_lines:
            return "\n".join(lines[:max_lines]) + f"\n... [{len(lines) - max_lines} more lines truncated]"
        return "\n".join(lines)
    except Exception as e:
        return f"[ERROR reading {path}: {e}]"


def get_git_log(project_root: Path, n: int = 25) -> str:
    """Get recent git log."""
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", f"-{n}"],
            capture_output=True, text=True, cwd=str(project_root), timeout=10
        )
        return result.stdout.strip() if result.returncode == 0 else "[git log failed]"
    except Exception:
        return "[git log failed]"


def get_latest_sprint_file(sprints_dir: Path) -> Optional[str]:
    """Read the most recent sprint JSON file."""
    if not sprints_dir.exists():
        return None
    files = sorted(sprints_dir.glob("sprint-*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not files:
        return None
    try:
        content = files[0].read_text()
        return f"File: {files[0].name}\n{content[:3000]}"
    except Exception:
        return None


def get_env_status(project_root: Path) -> str:
    """Check which critical env vars are set (without exposing values)."""
    env_file = project_root / ".env"
    if not env_file.exists():
        return "NO .env FILE FOUND"
    try:
        lines = env_file.read_text().split("\n")
        status = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key = line.split("=", 1)[0].strip()
                val = line.split("=", 1)[1].strip()
                has_value = len(val) > 5 and not val.startswith("#")
                status.append(f"  {key}: {'SET' if has_value else 'EMPTY/MISSING'}")
        return "\n".join(status)
    except Exception as e:
        return f"[ERROR reading .env: {e}]"


def generate_brief(project_name: str):
    """Generate the sprint brief for a project."""
    config = PROJECTS.get(project_name)
    if not config:
        print(f"ERROR: Unknown project '{project_name}'. Use 'kognai' or 'invoica'.")
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"SPRINT BRIEF GENERATOR — {project_name.upper()}")
    print(f"Model: {MODEL} (local, $0)")
    print(f"{'='*60}")
    start_time = time.time()

    # --- Phase 1: Gather raw data ---
    print("\n[1/6] Reading MEMORY.md...")
    memory_raw = read_file_safe(config["memory"])

    print("[2/6] Reading progress.md...")
    progress_raw = read_file_safe(config["progress"], max_lines=200)

    print("[3/6] Getting git log...")
    git_log = get_git_log(config["root"])

    print("[4/6] Reading latest sprint file...")
    latest_sprint = get_latest_sprint_file(config["sprints_dir"])

    print("[5/6] Checking env vars...")
    env_status = get_env_status(config["root"])

    print("[6/6] Checking agents directory...")
    agents_dir = config["agents_dir"]
    agent_list = ""
    if agents_dir.exists():
        dirs = sorted([d.name for d in agents_dir.iterdir() if d.is_dir()])
        agent_list = ", ".join(dirs) if dirs else "none"
    else:
        agent_list = "agents directory not found"

    # --- Phase 2: Extract with Qwen ---
    print("\n--- Qwen Extraction Phase ---")

    # Extract 1: Current state from MEMORY.md
    print("[Qwen 1/3] Analyzing MEMORY.md...")
    if memory_raw:
        state_summary = call_qwen(f"""You are a project state analyzer. Read this MEMORY.md file and extract ONLY:
1. Current phase and what's blocking progress
2. What was most recently completed (last 3-5 items)
3. What needs to be done next (next 3-5 items)
4. Critical blockers or gaps
5. Any important technical state (what's running, what's broken)

Be concise — bullet points only. No preamble, no explanation. Just the facts.

MEMORY.md:
{memory_raw}""", max_tokens=1500)
    else:
        state_summary = "[MEMORY.md not found]"

    # Extract 2: Sprint progress
    print("[Qwen 2/3] Analyzing progress + git log...")
    progress_input = ""
    if progress_raw:
        # Only send last 100 lines of progress (most recent)
        progress_lines = progress_raw.split("\n")
        progress_tail = "\n".join(progress_lines[-100:]) if len(progress_lines) > 100 else progress_raw
        progress_input += f"PROGRESS LOG (recent):\n{progress_tail}\n\n"
    progress_input += f"GIT LOG (last 25 commits):\n{git_log}"

    sprint_summary = call_qwen(f"""You are a sprint tracker. From this progress log and git history, extract:
1. The LAST sprint number completed (e.g., "Sprint 154")
2. What the last 5 sprints built (one line each)
3. The NEXT sprint number needed
4. Any patterns (are sprints getting stuck? are tests failing? is the same area being reworked?)

Be concise — bullet points only. No preamble.

{progress_input}""", max_tokens=1000)

    # Extract 3: Next sprint recommendation
    print("[Qwen 3/3] Recommending next sprint...")
    next_sprint = call_qwen(f"""You are a sprint planner for the {project_name.upper()} project. Based on:

CURRENT STATE:
{state_summary}

RECENT SPRINTS:
{sprint_summary}

ENV STATUS:
{env_status}

AGENTS: {agent_list}

Recommend the NEXT sprint. Provide:
1. Sprint number (increment from last)
2. Sprint name (short, descriptive)
3. What to build (3-5 concrete tasks with file paths)
4. Acceptance criteria (how to know it's done)
5. Any dependencies or blockers to watch

Be specific and actionable. Reference exact file paths where possible.""", max_tokens=1500)

    # --- Phase 3: Assemble brief ---
    print("\n--- Assembling Brief ---")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    brief = f"""# Sprint Brief — {project_name.upper()}
*Auto-generated by Qwen3:14b (local, $0) at {now}*
*DO NOT read raw MEMORY.md or progress.md — this brief contains everything you need.*

---

## Current State
{state_summary}

---

## Recent Sprint History
{sprint_summary}

---

## Next Sprint Recommendation
{next_sprint}

---

## Environment Status
```
{env_status}
```

## Active Agents
{agent_list}

---

## Sprint JSON Schema
*Use this format for the sprint file:*
"""

    if latest_sprint:
        brief += f"""```json
{latest_sprint[:2000]}
```
"""
    else:
        brief += "*No recent sprint file found. Check workspace/sprints/ for format.*\n"

    brief += f"""
---

## Rules for This Session
1. **DO NOT read MEMORY.md or progress.md** — this brief already summarizes them
2. **DO NOT read the master architecture docx** — the state above reflects it
3. Plan the sprint, write the JSON, execute, validate, commit, loop
4. If this brief seems stale or wrong, ONLY THEN read the raw files
5. Keep sprints small: 3-5 tasks, one file per task, <200 lines per file
6. After shipping: update MEMORY.md and progress.md, commit, then START NEXT SPRINT
7. NO OPUS — all work done by Sonnet. Use Haiku only for test validation.
8. Target: <5K input tokens per sprint cycle (this brief is your primary context)

*Generated in {time.time() - start_time:.1f}s by {MODEL}*
"""

    # Write output
    config["output"].parent.mkdir(parents=True, exist_ok=True)
    config["output"].write_text(brief)
    elapsed = time.time() - start_time

    print(f"\n{'='*60}")
    print(f"BRIEF WRITTEN: {config['output']}")
    print(f"Size: {len(brief)} chars (~{len(brief)//4} tokens)")
    print(f"Time: {elapsed:.1f}s")
    print(f"Cost: $0.00")
    print(f"{'='*60}")


if __name__ == "__main__":
    project = "kognai"
    if "--project" in sys.argv:
        idx = sys.argv.index("--project")
        if idx + 1 < len(sys.argv):
            project = sys.argv[idx + 1].lower()

    generate_brief(project)
