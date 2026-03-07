"""
Test suite for router_wrapper module.
"""

import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add runtime directory to path
_runtime_dir = str(Path(__file__).parent)
if _runtime_dir not in sys.path:
    sys.path.insert(0, _runtime_dir)

# Import the module under test
from router_wrapper import get_router, create_router, _router


class TestRouterWrapper:
    """Test cases for router_wrapper module."""

    def test_get_router_returns_singleton(self):
        """get_router() should return the same instance on multiple calls."""
        with patch('router_wrapper.KognaiRouter') as MockRouter:
            mock_instance = MagicMock()
            MockRouter.return_value = mock_instance
            
            router1 = get_router()
            router2 = get_router()
            
            assert router1 is router2
            assert MockRouter.call_count == 1

    def test_create_router_returns_new_instance(self):
        """create_router() should return a new instance each time."""
        with patch('router_wrapper.KognaiRouter') as MockRouter:
            mock_instance = MagicMock()
            MockRouter.return_value = mock_instance
            
            router1 = create_router()
            router2 = create_router()
            
            assert router1 is not router2
            assert MockRouter.call_count == 2

    def test_create_router_with_force_local(self):
        """create_router(force_local=True) should pass override to router."""
        with patch('router_wrapper.KognaiRouter') as MockRouter:
            mock_instance = MagicMock()
            MockRouter.return_value = mock_instance
            
            router = create_router(force_local=True)
            
            MockRouter.assert_called_once()

    def test_thread_safety_get_router(self):
        """get_router() should be thread-safe for concurrent reads."""
        with patch('router_wrapper.KognaiRouter') as MockRouter:
            mock_instance = MagicMock()
            MockRouter.return_value = mock_instance
            
            results = []
            
            def get_router_thread():
                r = get_router()
                results.append(r)
            
            threads = [threading.Thread(target=get_router_thread) for _ in range(10)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            
            assert all(r is results[0] for r in results)
            assert MockRouter.call_count == 1