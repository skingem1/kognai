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
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional


def load_env_file(project_root: Path) -> dict:
    """Load .env file into a dict (values without surrounding quotes)."""
    env = {}
    env_path = project_root / ".env"
    if not env_path.exists():
        return env
    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            env[key.strip()] = val
    except Exception:
        pass
    return env


# --- Config ---
# OLLAMA_HOST may be set in .env (vault Tailscale IP) or OS env — load early
_kognai_env = load_env_file(Path.home() / "kognai")
_ollama_host = (
    os.environ.get("OLLAMA_HOST")
    or _kognai_env.get("OLLAMA_HOST")
    or "http://localhost:11434"
).rstrip("/")
OLLAMA_URL = f"{_ollama_host}/api/generate"
MODEL = "qwen3:14b"
KOGNAI_ROOT = Path.home() / "kognai"
INVOICA_ROOT = Path.home() / "Documents" / "Invoica"

def _discover_kognai_memory() -> Path:
    """Discover the most current MEMORY.md for Kognai.

    Tries the new auto-memory path first (~/.claude/projects/-Users-tarekmnif-kognai/),
    then the legacy path (~/kognai/.claude/projects/-Users-tarekmnif-Documents-Kognai/).
    Returns whichever exists and was modified more recently.
    """
    new_path = Path.home() / ".claude" / "projects" / "-Users-tarekmnif-kognai" / "memory" / "MEMORY.md"
    old_path = Path.home() / "kognai" / ".claude" / "projects" / "-Users-tarekmnif-Documents-Kognai" / "memory" / "MEMORY.md"
    if new_path.exists() and old_path.exists():
        return new_path if new_path.stat().st_mtime >= old_path.stat().st_mtime else old_path
    if new_path.exists():
        return new_path
    return old_path  # fallback (may not exist — caller handles None)


def _discover_kognai_memory_dir() -> Optional[Path]:
    """Return the directory containing auto-memory project_*.md files, if it exists."""
    new_dir = Path.home() / ".claude" / "projects" / "-Users-tarekmnif-kognai" / "memory"
    return new_dir if new_dir.exists() else None


# Project-specific configs
PROJECTS = {
    "kognai": {
        "root": KOGNAI_ROOT,
        "memory": _discover_kognai_memory(),
        "memory_dir": _discover_kognai_memory_dir(),
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


def get_last_sprint_from_git(project_root: Path) -> Optional[int]:
    """Parse git log to find the highest sprint number committed."""
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-30"],
            capture_output=True, text=True, cwd=str(project_root), timeout=10
        )
        if result.returncode != 0:
            return None
        highest = 0
        for line in result.stdout.strip().splitlines():
            m = re.search(r'Sprint (\d+):', line)
            if m:
                num = int(m.group(1))
                if num > highest:
                    highest = num
        return highest if highest > 0 else None
    except Exception:
        return None


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


def make_fallback_sections(config: dict, git_log: str) -> tuple:
    """Build Current State + Sprint History sections without Ollama.

    Returns (state_summary, sprint_summary) as plain strings.
    """
    # --- Current State: read last 50 lines of progress.md ---
    progress_path = config.get("progress")
    state_lines = []
    if progress_path and Path(progress_path).exists():
        try:
            all_lines = Path(progress_path).read_text().splitlines()
            tail = all_lines[-50:] if len(all_lines) > 50 else all_lines
            state_lines.append("*(Ollama unavailable — raw progress.md tail below)*\n")
            state_lines.extend(tail)
        except Exception as e:
            state_lines.append(f"[could not read progress.md: {e}]")
    else:
        state_lines.append("[progress.md not found]")
    state_summary = "\n".join(state_lines)

    # --- Sprint History: parse last 3 ## Sprint entries from progress.md ---
    sprint_summary_lines = ["*(Ollama unavailable — extracted from progress.md)*\n"]
    if progress_path and Path(progress_path).exists():
        try:
            text = Path(progress_path).read_text()
            # Find last 3 sprint sections
            import re as _re
            blocks = _re.split(r"\n(?=## Sprint \d+)", text)
            recent = [b.strip() for b in blocks if b.strip().startswith("## Sprint")][-3:]
            for block in recent:
                # First 4 lines of each block
                first_lines = block.splitlines()[:5]
                sprint_summary_lines.extend(first_lines)
                sprint_summary_lines.append("")
        except Exception as e:
            sprint_summary_lines.append(f"[parse error: {e}]")

    sprint_summary_lines.append(f"\nGit log:\n{git_log}")
    sprint_summary = "\n".join(sprint_summary_lines)

    return state_summary, sprint_summary


def get_latest_sprint_file(sprints_dir: Path) -> Optional[str]:
    """Read the sprint JSON file with the HIGHEST sprint number (authoritative order).

    Sorts by numeric ID extracted from filename (sprint-NNN.json), NOT by mtime.
    This prevents a recently-touched stale sprint (e.g. sprint-186 failed run)
    from appearing as 'latest' when the repo is actually at sprint-232+.
    Skips sprint files where ALL tasks have status 'skipped'.
    """
    if not sprints_dir.exists():
        return None

    def sprint_num(f: Path) -> int:
        m = re.search(r'sprint-(\d+)', f.stem)
        return int(m.group(1)) if m else 0

    files = sorted(sprints_dir.glob("sprint-*.json"), key=sprint_num, reverse=True)
    if not files:
        return None

    # Find the highest-numbered sprint that has at least one non-skipped task
    for f in files:
        try:
            data = json.loads(f.read_text())
            tasks = data.get("tasks", [])
            if tasks and all(t.get("status") == "skipped" for t in tasks):
                # All tasks skipped — this sprint was deferred, skip to next
                continue
            content = f.read_text()
            return f"File: {f.name}\n{content[:3000]}"
        except Exception:
            continue

    # Fallback: return highest-numbered file even if all skipped
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


def get_existing_commands(project_root: Path) -> str:
    """Scan Telegram bot commands.ts for already-implemented commands."""
    commands_file = project_root / "agents" / "telegram-bot" / "commands.ts"
    if not commands_file.exists():
        return "commands.ts not found"
    try:
        content = commands_file.read_text()
        import re as _re
        handlers = _re.findall(r'export async function (handle\w+)', content)
        if handlers:
            # Convert handlePostNow → /post-now, handleGate → /gate, etc.
            cmds = []
            for h in handlers:
                name = h.replace("handle", "", 1)
                # CamelCase → kebab-case
                kebab = _re.sub(r'([A-Z])', r'-\1', name).lstrip('-').lower()
                cmds.append(f"/{kebab}")
            return "Already implemented Telegram commands: " + ", ".join(cmds)
        return "No commands found"
    except Exception as e:
        return f"[scan error: {e}]"


def get_existing_scripts(project_root: Path) -> str:
    """List key scripts that already exist."""
    scripts_dir = project_root / "scripts" / "scs001"
    if not scripts_dir.exists():
        return "scripts/scs001/ not found"
    try:
        files = sorted(f.name for f in scripts_dir.iterdir() if f.suffix == '.ts')
        if files:
            return "Existing scripts in scripts/scs001/: " + ", ".join(files[:30])
        return "No scripts found"
    except Exception:
        return "scan error"


def _get_committed_sprint_numbers(project_root: Path) -> set:
    """Scan git log for sprint numbers that are already committed.

    Looks for commit messages matching 'Sprint NNN:' pattern.
    Also checks for sprint-NNN.json files in workspace/sprints/.
    Returns set of consumed sprint numbers.
    """
    consumed = set()
    # Method 1: git log
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "--all", "-200"],
            capture_output=True, text=True, cwd=str(project_root), timeout=10
        )
        if result.returncode == 0:
            import re as _re
            for match in _re.finditer(r'Sprint (\d+):', result.stdout):
                consumed.add(int(match.group(1)))
    except Exception:
        pass
    # Method 2: existing sprint files
    sprints_dir = project_root / "workspace" / "sprints"
    if sprints_dir.exists():
        import re as _re
        for f in sprints_dir.iterdir():
            m = _re.match(r'sprint-(\d+)\.json', f.name)
            if m:
                consumed.add(int(m.group(1)))
    return consumed


def get_sprint_queue(project_root: Path) -> Optional[dict]:
    """Read workspace/sprint-queue.json — authoritative ordered sprint plan.

    Returns the first queued item (status != 'done'/'skipped') if any exist,
    else None. Auto-skips items whose sprint number is already in git log
    (prevents collision with consumed sprint numbers).

    This bypasses Qwen's sprint recommendation when the human has prescribed
    a specific next sprint.
    """
    queue_file = project_root / "workspace" / "sprint-queue.json"
    if not queue_file.exists():
        return None
    try:
        data = json.loads(queue_file.read_text())
        items = data.get("queue", [])

        # Auto-sync: find sprint numbers already consumed in git
        consumed = _get_committed_sprint_numbers(project_root)
        queue_modified = False

        for item in items:
            if item.get("status") in ("done", "skipped"):
                continue
            sprint_num = item.get("sprint")
            if sprint_num and sprint_num in consumed:
                # Auto-skip: sprint number already exists in git
                item["status"] = "skipped"
                item["_note"] = f"Auto-skipped: sprint-{sprint_num} already committed"
                queue_modified = True
                print(f"[QUEUE AUTO-SYNC] Sprint {sprint_num} already in git — auto-skipped")
                continue
            # This is the first valid pending item
            if queue_modified:
                # Write back auto-sync changes
                queue_file.write_text(json.dumps(data, indent=2) + "\n")
                print(f"[QUEUE AUTO-SYNC] Wrote {sum(1 for i in items if i.get('_note','').startswith('Auto-skipped'))} auto-skip(s) to queue file")
            return item

        # All items done or skipped
        if queue_modified:
            queue_file.write_text(json.dumps(data, indent=2) + "\n")
        return None
    except Exception as e:
        print(f"[WARNING] Could not read sprint-queue.json: {e}")
        return None


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
    memory_path = config.get("memory")
    memory_raw = read_file_safe(memory_path) if memory_path else None
    if memory_path:
        print(f"       → Using: {memory_path}")

    # Augment with auto-memory project_*.md files if available
    memory_dir = config.get("memory_dir")
    if memory_dir and Path(memory_dir).exists():
        extra_parts = []
        for md_file in sorted(Path(memory_dir).glob("project_*.md")):
            content = read_file_safe(md_file, max_lines=50)
            if content:
                extra_parts.append(f"=== {md_file.name} ===\n{content}")
        if extra_parts:
            memory_raw = (memory_raw or "") + "\n\n--- AUTO-MEMORY PROJECT FILES ---\n" + "\n\n".join(extra_parts)
            print(f"       → Augmented with {len(extra_parts)} auto-memory project file(s)")

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

    # --- Phase 2: Extract with Qwen (falls back to raw text if Ollama unavailable) ---
    print("\n--- Qwen Extraction Phase ---")
    ollama_ok = True

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

    if state_summary.startswith("[ERROR"):
        ollama_ok = False

    # Extract 2: Sprint progress
    print("[Qwen 2/3] Analyzing progress + git log...")
    sprint_summary = ""
    if ollama_ok:
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
        if sprint_summary.startswith("[ERROR"):
            ollama_ok = False

    # Override sprint numbers from git log (authoritative source)
    # CRITICAL: Replace Qwen's stale sprint numbers entirely — do NOT prepend.
    # Qwen reads progress.md which may say "Sprint 103" while git log says "Sprint 237".
    # Prepending creates TWO conflicting "LAST sprint" lines → Claude gets confused.
    last_git = get_last_sprint_from_git(config["root"])
    if last_git:
        next_sprint_num = last_git + 1
        # Strip any "LAST sprint number" or "NEXT sprint number" lines Qwen produced
        cleaned_lines = []
        for line in sprint_summary.split("\n"):
            lower = line.lower().strip("- *")
            if "last sprint number" in lower or "next sprint number" in lower:
                continue  # Drop Qwen's stale sprint number lines
            cleaned_lines.append(line)
        sprint_summary = "\n".join(cleaned_lines)
        # Now prepend the authoritative git-derived numbers
        git_override = f"\n- **LAST sprint number completed**: Sprint {last_git}\n- **NEXT sprint number needed**: Sprint {next_sprint_num}\n"
        sprint_summary = git_override + sprint_summary

    # Fallback: Ollama unavailable — build sections from raw files
    if not ollama_ok:
        print("[FALLBACK] Ollama unavailable — building brief from raw files...")
        state_summary, sprint_summary = make_fallback_sections(config, git_log)

    # Scan existing code to avoid recommending already-built features
    print("[6b/6] Scanning existing commands and scripts...")
    existing_commands = get_existing_commands(config["root"])
    existing_scripts = get_existing_scripts(config["root"])

    # --- Check authoritative sprint queue FIRST ---
    # If workspace/sprint-queue.json has a queued item, skip Qwen recommendation entirely.
    # The human controls the plan via that file. Qwen only recommends when no queue exists.
    queue_item = get_sprint_queue(config["root"])

    # Extract 3: Next sprint recommendation (skip if queue exists OR Ollama unavailable)
    if queue_item:
        sprint_num_q = queue_item.get("sprint", "?")
        sprint_title_q = queue_item.get("title", "")
        sprint_block_q = queue_item.get("block", "")
        sprint_rationale_q = queue_item.get("rationale", "")
        print(f"[QUEUE] Sprint queue active — next: Sprint {sprint_num_q} ({sprint_title_q})")
        print("[Qwen 3/3] SKIPPED — sprint queue takes precedence over Qwen recommendation")

        # PRE-GENERATE the sprint JSON directly from queue item.
        # This prevents Qwen from reinterpreting/ignoring the queue directive.
        # The orchestrator will find this file and skip its own sprint generation.
        sprint_json_path = config["root"] / "workspace" / "sprints" / f"sprint-{sprint_num_q}.json"
        if not sprint_json_path.exists():
            sprint_json = {
                "sprint_id": f"sprint-{sprint_num_q}",
                "title": sprint_title_q,
                "description": sprint_rationale_q,
                "source": "queue-prescribed",
                "tasks": [
                    {
                        "id": f"{sprint_num_q}-01",
                        "title": sprint_title_q,
                        "type": "feature",
                        "task_type": sprint_block_q.lower().replace("-", "_") if sprint_block_q else "infra",
                        "task_target": f"workspace/sprints/sprint-{sprint_num_q}-output.md",
                        "agent": "coder",
                        "status": "pending",
                        "priority": queue_item.get("priority", "high"),
                        "sprint_id": f"sprint-{sprint_num_q}",
                    }
                ],
            }
            sprint_json_path.parent.mkdir(parents=True, exist_ok=True)
            sprint_json_path.write_text(json.dumps(sprint_json, indent=2))
            print(f"[QUEUE] Pre-generated sprint JSON: {sprint_json_path}")
        else:
            print(f"[QUEUE] Sprint JSON already exists: {sprint_json_path}")
        next_sprint = f"""## ⚠️ MANDATORY — QUEUE-PRESCRIBED SPRINT

**DO NOT deviate from this. The human has prescribed this sprint via workspace/sprint-queue.json.**

- **Sprint number**: {sprint_num_q}
- **Title**: {sprint_title_q}
- **Block**: {sprint_block_q}
- **Rationale**: {sprint_rationale_q}

### What to do
1. Create `workspace/sprints/sprint-{sprint_num_q}.json` with 3-5 tasks
2. Execute each task
3. Validate and commit
4. **After committing**: update `workspace/sprint-queue.json` — set `"status": "done"` for Sprint {sprint_num_q}
5. The NEXT session will automatically pick up the next queue item

### Compliance rule
You MUST execute Sprint {sprint_num_q} as described. Do NOT substitute a different sprint number or topic. If you believe there is a blocker, document it in the sprint JSON and still attempt the tasks — the human will review."""
    elif ollama_ok:
        print("[Qwen 3/3] No queue found — Qwen recommending next sprint...")
        next_sprint = call_qwen(f"""You are a sprint planner for the {project_name.upper()} project. Based on:

CURRENT STATE:
{state_summary}

RECENT SPRINTS:
{sprint_summary}

ENV STATUS:
{env_status}

AGENTS: {agent_list}

ALREADY BUILT (DO NOT recommend re-building these):
{existing_commands}
{existing_scripts}

Recommend the NEXT sprint. Provide:
1. Sprint number (increment from last)
2. Sprint name (short, descriptive)
3. What to build (3-5 concrete tasks with file paths)
4. Acceptance criteria (how to know it's done)
5. Any dependencies or blockers to watch

IMPORTANT: Do NOT recommend building features that already exist (see ALREADY BUILT section above).
Be specific and actionable. Reference exact file paths where possible.""", max_tokens=1500)
        if next_sprint.startswith("[ERROR"):
            next_sprint = "*(Ollama unavailable — see Recent Sprint History above and increment sprint number)*"
    else:
        print("[Qwen 3/3] SKIPPED — Ollama unavailable")
        next_sprint = "*(Ollama unavailable — see Recent Sprint History above and increment sprint number)*"

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

## Sprint JSON Schema (FORMAT REFERENCE ONLY)
*⚠️ This is the MOST RECENTLY MODIFIED sprint file — shown for JSON FORMAT ONLY.*
*DO NOT work on these tasks. Use the "NEXT sprint number" from Recent Sprint History above.*
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
9. **AUTHORITATIVE sprint number**: Use the "LAST sprint completed" and "NEXT sprint" values from Recent Sprint History above (sourced from git log). DO NOT infer sprint number from the JSON schema example below — that file may show stale task statuses.

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
