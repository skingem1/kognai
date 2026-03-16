"""Parse on-chain infrastructure data: EAS, Agent Registry, AAR logs, Monotask audit."""
import json, os, glob
from pathlib import Path

KOGNAI_ROOT = Path.home() / "kognai"
SHARED = KOGNAI_ROOT / "workspace" / "shared-context"
AAR_DIR = KOGNAI_ROOT / "logs" / "aar"
MONO_LOG = KOGNAI_ROOT / "logs" / "monotask" / "audit.jsonl"


def _load_json(path: Path):
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def _load_jsonl_tail(path: str, n: int = 20) -> list:
    if not os.path.exists(path):
        return []
    with open(path) as f:
        lines = f.readlines()
    result = []
    for line in lines[-n:]:
        try:
            result.append(json.loads(line.strip()))
        except Exception:
            pass
    return result


def get_chain_data() -> dict:
    # EAS Schemas
    eas = _load_json(SHARED / "EAS_SCHEMAS.json")
    # Agent Registry
    registry = _load_json(SHARED / "CHAIN_REGISTRY.json")

    # AAR receipts — last 20 across all day files
    aar_recent = []
    aar_files = sorted(glob.glob(str(AAR_DIR / "*.jsonl")), reverse=True)
    for af in aar_files[:5]:
        aar_recent.extend(_load_jsonl_tail(af, 10))
    aar_recent = sorted(aar_recent, key=lambda x: x.get("timestamp", ""), reverse=True)[:20]

    # Monotask audit — last 30 transitions
    mono_recent = _load_jsonl_tail(str(MONO_LOG), 30)

    # Summary stats
    aar_count = 0
    for af in aar_files:
        with open(af) as f:
            aar_count += sum(1 for _ in f)

    agents_minted = []
    if registry and "agents" in registry:
        for name, info in registry["agents"].items():
            agents_minted.append({
                "name": name,
                "tokenId": info.get("tokenId"),
                "role": info.get("role"),
                "minted": info.get("minted", False),
            })

    schemas = []
    if eas and "schemas" in eas:
        for name, info in eas["schemas"].items():
            schemas.append({
                "name": name,
                "uid": info.get("uid", "")[:16] + "...",
                "uid_full": info.get("uid", ""),
            })

    return {
        "eas_schemas": schemas,
        "eas_network": eas.get("network") if eas else None,
        "eas_registered": eas.get("registeredAt") if eas else None,
        "agent_registry": {
            "address": registry.get("agentRegistry", {}).get("address") if registry else None,
            "network": registry.get("network") if registry else None,
            "standard": registry.get("agentRegistry", {}).get("standard") if registry else None,
            "agents": agents_minted,
        },
        "aar_total_receipts": aar_count,
        "aar_recent": aar_recent[:10],
        "monotask_recent": mono_recent[-10:],
    }
