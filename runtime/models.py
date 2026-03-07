"""
Pydantic models and constants for the Kognai router server.
"""
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    """Supported task types for routing."""
    CODE = "code"
    REASONING = "reasoning"
    CREATIVE = "creative"
    GENERAL = "general"


class Tier(str, Enum):
    """Model tiers for cost/performance routing."""
    NANO = "nano"
    LOCAL = "local"
    POWER = "power"
    CLOUD = "cloud"
    APEX = "apex"


TIER_TIMEOUTS: dict[str, int] = {
    "nano": 30,
    "local": 120,
    "power": 600,
    "cloud": 90,
    "apex": 120,
}


class RouteRequest(BaseModel):
    """Request model for the routing endpoint."""
    prompt: str = Field(..., description="The user prompt/task to route")
    context_tokens: Optional[int] = Field(default=0, description="Number of context tokens")
    force_local: Optional[bool] = Field(default=None, description="Force local-only routing")
    max_cost_usd: Optional[float] = Field(default=None, description="Maximum cost in USD")
    sprint_id: Optional[str] = Field(default=None, description="Sprint identifier")
    task_id: Optional[str] = Field(default=None, description="Task identifier")

    class Config:
        json_schema_extra = {
            "example": {
                "prompt": "Write a function to sort a list",
                "context_tokens": 1000,
                "force_local": False,
                "max_cost_usd": 0.01,
                "sprint_id": "sprint-001",
                "task_id": "task-001"
            }
        }


class RouteResponse(BaseModel):
    """Response model from the routing endpoint."""
    task_type: str = Field(..., description="Classified task type")
    tier: str = Field(..., description="Selected model tier")
    model_name: str = Field(..., description="Selected model name")
    endpoint: str = Field(..., description="Model endpoint URL")
    think_mode: bool = Field(..., description="Whether extended thinking is enabled")
    reasoning: str = Field(..., description="Routing decision explanation")
    estimated_cost_usd: float = Field(..., description="Estimated cost in USD")
    fallback_tier: Optional[str] = Field(default=None, description="Fallback tier if primary fails")
    timeout_budget_s: int = Field(..., description="Timeout budget in seconds")

    class Config:
        json_schema_extra = {
            "example": {
                "task_type": "code",
                "tier": "local",
                "model_name": "qwen3:8b",
                "endpoint": "http://localhost:11434/api/generate",
                "think_mode": False,
                "reasoning": "Simple code task, using local Qwen3 for cost efficiency",
                "estimated_cost_usd": 0.001,
                "fallback_tier": "cloud",
                "timeout_budget_s": 120
            }
        }