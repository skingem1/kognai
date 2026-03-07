"""
Router wrapper module providing a singleton KognaiRouter instance.

This module provides thread-safe access to a singleton router instance with
support for per-request configuration overrides.
"""

import sys
import threading
from pathlib import Path
from typing import Optional

# Add the runtime directory to sys.path to enable imports from same directory
_runtime_dir = str(Path(__file__).parent)
if _runtime_dir not in sys.path:
    sys.path.insert(0, _runtime_dir)

from router import KognaiRouter, Tier


# Module-level lock for thread-safety
_router_lock = threading.RLock()
_router: Optional[KognaiRouter] = None


def get_router() -> KognaiRouter:
    """
    Get the singleton KognaiRouter instance.
    
    This function is thread-safe and returns the existing singleton instance
    if one has been created, otherwise it creates one with default settings.
    
    Returns:
        KognaiRouter: The singleton router instance.
    """
    global _router
    
    with _router_lock:
        if _router is None:
            _router = KognaiRouter()
        return _router


def create_router(force_local: Optional[bool] = None, max_cost_usd: Optional[float] = None) -> KognaiRouter:
    """
    Create a new KognaiRouter instance with optional per-request overrides.
    
    This function allows creating a router with specific configuration overrides
    for the current request. The returned router is NOT the singleton - it's a
    new instance configured according to the provided parameters.
    
    Args:
        force_local: If True, forces all requests to use local models only.
                     If False, allows cloud models. If None, uses default behavior.
        max_cost_usd: Maximum cost in USD for a single request. If None, uses
                      the default cost limit configured in the router.
    
    Returns:
        KognaiRouter: A new router instance configured with the given overrides.
    """
    router = KognaiRouter()
    
    if force_local is not None:
        router.force_local = force_local
    
    if max_cost_usd is not None:
        router.max_cost_usd = max_cost_usd
    
    return router


# Expose the singleton instance at module level for convenience
# This is initialized lazily on first access via get_router()
@property
def _router_instance() -> KognaiRouter:
    """Lazy property to access the singleton router instance."""
    return get_router()