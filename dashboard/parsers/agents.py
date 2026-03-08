"""Parse kognai-agents/*/agent.yaml for agent status."""

from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    yaml = None


def parse_agent_yaml(path: Path) -> Optional[dict]:
    """Parse a single agent.yaml file."""
    if yaml is None:
        # Fallback: simple regex parsing
        content = path.read_text()
        import re
        name = re.search(r'^name:\s*(.+)', content, re.MULTILINE)
        role = re.search(r'^role:\s*(.+)', content, re.MULTILINE)
        llm = re.search(r'^llm:\s*(.+)', content, re.MULTILINE)
        fallback = re.search(r'^fallback_llm:\s*(.+)', content, re.MULTILINE)
        return {
            "name": name.group(1).strip() if name else path.parent.name,
            "role": role.group(1).strip() if role else "",
            "llm": llm.group(1).strip() if llm else "unknown",
            "fallback_llm": fallback.group(1).strip() if fallback else "",
        }

    try:
        data = yaml.safe_load(path.read_text())
        if not isinstance(data, dict):
            return None
        return {
            "name": data.get("name", path.parent.name),
            "role": data.get("role", ""),
            "llm": data.get("llm", "unknown"),
            "fallback_llm": data.get("fallback_llm", ""),
            "tools": data.get("tools", []),
            "managed_agents": data.get("managed_agents", []),
        }
    except Exception:
        return None


def list_agents(agents_dir: Path) -> list:
    """List all agent configs."""
    agents = []
    for agent_dir in sorted(agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        yaml_path = agent_dir / "agent.yaml"
        if not yaml_path.exists():
            continue
        parsed = parse_agent_yaml(yaml_path)
        if parsed:
            # Categorize by LLM
            llm = parsed.get("llm", "")
            if "claude" in llm.lower() or "anthropic" in llm.lower():
                tier = "cloud"
            elif "minimax" in llm.lower() or "blockrun" in llm.lower():
                tier = "cloud"
            elif "qwen" in llm.lower() or "ollama" in llm.lower():
                tier = "local"
            elif "deepseek" in llm.lower():
                tier = "local"
            else:
                tier = "auto"

            parsed["tier"] = tier
            parsed["dir"] = agent_dir.name
            agents.append(parsed)

    return agents
