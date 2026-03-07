"""Tests for runtime/models.py"""
import pytest
from runtime.models import RouteRequest, RouteResponse, TIER_TIMEOUTS


class TestRouteRequest:
    def test_minimal_request(self):
        req = RouteRequest(prompt="test prompt")
        assert req.prompt == "test prompt"
        assert req.context_tokens == 0
        assert req.force_local is None

    def test_full_request(self):
        req = RouteRequest(
            prompt="code something",
            context_tokens=2000,
            force_local=True,
            max_cost_usd=0.05,
            sprint_id="s-1",
            task_id="t-1"
        )
        assert req.context_tokens == 2000
        assert req.force_local is True

    def test_serialization(self):
        req = RouteRequest.model_validate({"prompt": "test"})
        assert req.prompt == "test"


class TestRouteResponse:
    def test_response_creation(self):
        resp = RouteResponse(
            task_type="code",
            tier="local",
            model_name="qwen3:8b",
            endpoint="http://localhost:11434",
            think_mode=False,
            reasoning="simple task",
            estimated_cost_usd=0.001,
            timeout_budget_s=120
        )
        assert resp.tier == "local"
        assert resp.fallback_tier is None

    def test_response_with_fallback(self):
        resp = RouteResponse(
            task_type="reasoning",
            tier="power",
            model_name="qwen3:32b",
            endpoint="http://localhost:11434",
            think_mode=True,
            reasoning="complex reasoning",
            estimated_cost_usd=0.01,
            fallback_tier="cloud",
            timeout_budget_s=600
        )
        assert resp.fallback_tier == "cloud"


class TestTierTimeouts:
    def test_timeout_values(self):
        assert TIER_TIMEOUTS["nano"] == 30
        assert TIER_TIMEOUTS["local"] == 120
        assert TIER_TIMEOUTS["power"] == 600
        assert TIER_TIMEOUTS["cloud"] == 90
        assert TIER_TIMEOUTS["apex"] == 120