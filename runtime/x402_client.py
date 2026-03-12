"""
Kognai Runtime — x402 Cloud LLM Client
Pay-per-call LLM inference via x402 protocol (PayAI facilitator).
No subscription APIs. Payment IS authentication.

Flow:
    Agent task → router selects model (expertise + complexity)
    → x402 client signs EIP-3009 USDC transfer
    → Calls x402 gateway with X-PAYMENT header
    → Gateway routes to LLM provider, settles USDC on Base
    → Response returned to agent

Gateway options (set X402_GATEWAY_URL):
    - ClawRouter: https://api.clawrouter.ai/v1   (41+ models, 5% fee)
    - Router402:  https://api.router402.xyz/v1    (OpenRouter-compatible)
    - Self-hosted: local ai-inference.ts endpoint

Requires: pip install eth-account httpx
Wallet:   Set X402_WALLET_KEY env var (Base mainnet, funded with USDC)
"""

import os
import json
import time
import base64
import logging
import secrets
from dataclasses import dataclass, field
from typing import Optional

import httpx

log = logging.getLogger("kognai.x402")

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────

# Base Mainnet USDC
USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
BASE_CHAIN_ID = 8453
NETWORK_ID = "eip155:8453"

# PayAI facilitator
DEFAULT_FACILITATOR = "https://facilitator.payai.network"

# x402 gateway for cloud LLM calls
DEFAULT_GATEWAY = os.getenv("X402_GATEWAY_URL", "https://api.clawrouter.ai/v1")

# CEO wallet budget (monthly, in USDC)
DEFAULT_MONTHLY_BUDGET = float(os.getenv("CEO_WALLET_BUDGET_USDC", "200.0"))


@dataclass
class WalletState:
    """Tracks CEO wallet spend for CFO agent budget rules."""
    monthly_budget: float = DEFAULT_MONTHLY_BUDGET
    spent_this_month: float = 0.0
    call_count: int = 0
    last_reset: float = field(default_factory=time.time)

    @property
    def remaining(self) -> float:
        return max(0, self.monthly_budget - self.spent_this_month)

    @property
    def burn_pct(self) -> float:
        return (self.spent_this_month / self.monthly_budget * 100) if self.monthly_budget > 0 else 0

    @property
    def frozen(self) -> bool:
        """At 95% burn, only local + cloud-post tasks continue."""
        return self.burn_pct >= 95.0

    @property
    def degraded(self) -> bool:
        """At 80% burn, non-critical cloud tasks switch to local."""
        return self.burn_pct >= 80.0

    def record_spend(self, amount_usdc: float):
        self.spent_this_month += amount_usdc
        self.call_count += 1
        if self.burn_pct >= 95:
            log.critical(f"CEO WALLET 95% BURN: ${self.spent_this_month:.4f}/${self.monthly_budget} — FREEZING cloud calls")
        elif self.burn_pct >= 80:
            log.warning(f"CEO WALLET 80% BURN: ${self.spent_this_month:.4f}/${self.monthly_budget} — switching non-critical to local")


# ─────────────────────────────────────────────
# EIP-3009 Signing (x402 payment)
# ─────────────────────────────────────────────

def _try_import_eth():
    """Lazy import eth_account — graceful degradation if not installed."""
    try:
        from eth_account import Account
        return Account
    except ImportError:
        return None


def sign_eip3009(
    private_key: str,
    to_address: str,
    amount: int,
    valid_seconds: int = 120,
) -> dict:
    """
    Sign an EIP-3009 TransferWithAuthorization for USDC on Base.
    Returns the x402 payment payload (base64-encoded for X-PAYMENT header).
    """
    Account = _try_import_eth()
    if Account is None:
        raise RuntimeError(
            "eth_account not installed. Run: pip install eth-account\n"
            "Required for x402 USDC payments. Without it, only local models available."
        )

    account = Account.from_key(private_key)
    now = int(time.time())
    nonce = "0x" + secrets.token_hex(32)

    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"},
            ],
        },
        "primaryType": "TransferWithAuthorization",
        "domain": {
            "name": "USD Coin",
            "version": "2",
            "chainId": BASE_CHAIN_ID,
            "verifyingContract": USDC_CONTRACT,
        },
        "message": {
            "from": account.address,
            "to": to_address,
            "value": amount,
            "validAfter": now,
            "validBefore": now + valid_seconds,
            "nonce": nonce,
        },
    }

    signed = Account.sign_typed_data(
        private_key,
        full_message=typed_data,
    )

    payment_payload = {
        "x402Version": 2,
        "scheme": "exact",
        "network": NETWORK_ID,
        "payload": {
            "signature": signed.signature.hex(),
            "authorization": {
                "from": account.address,
                "to": to_address,
                "value": str(amount),
                "validAfter": str(now),
                "validBefore": str(now + valid_seconds),
                "nonce": nonce,
            },
        },
    }

    return payment_payload


# ─────────────────────────────────────────────
# x402 Cloud LLM Client
# ─────────────────────────────────────────────

class X402CloudClient:
    """
    Calls cloud LLMs via x402 pay-per-call (no subscription API keys).
    Uses ClawRouter/Router402 as the x402 gateway.
    PayAI as the payment facilitator.
    """

    def __init__(
        self,
        gateway_url: str = DEFAULT_GATEWAY,
        wallet_key: Optional[str] = None,
        facilitator_url: str = DEFAULT_FACILITATOR,
        monthly_budget: float = DEFAULT_MONTHLY_BUDGET,
    ):
        self.gateway_url = gateway_url.rstrip("/")
        self.wallet_key = wallet_key or os.getenv("X402_WALLET_KEY", "")
        self.facilitator_url = facilitator_url
        self.wallet = WalletState(monthly_budget=monthly_budget)
        self._http = httpx.Client(timeout=180)

        if not self.wallet_key:
            log.warning(
                "X402_WALLET_KEY not set — cloud LLM calls will fail. "
                "Set the env var with your Base mainnet wallet private key (funded with USDC)."
            )

    @property
    def available(self) -> bool:
        """Can we make x402 cloud calls?"""
        return bool(self.wallet_key) and not self.wallet.frozen

    def call_llm(
        self,
        model: str,
        prompt: str,
        system: str = "",
        max_tokens: int = 4096,
        think: bool = False,
    ) -> str:
        """
        Call a cloud LLM via x402 payment. OpenAI-compatible chat completions format.

        Args:
            model: Model identifier (e.g. "anthropic/claude-sonnet-4",
                   "deepseek/deepseek-coder-v2", "mistralai/mistral-large")
            prompt: User prompt
            system: System prompt
            max_tokens: Max response tokens
            think: Enable extended thinking (if supported)

        Returns:
            LLM response text

        Raises:
            RuntimeError if wallet is frozen or not configured
        """
        if not self.wallet_key:
            raise RuntimeError("x402 wallet not configured (X402_WALLET_KEY env var)")

        if self.wallet.frozen:
            raise RuntimeError(
                f"CEO wallet frozen (95% burn: ${self.wallet.spent_this_month:.2f}/"
                f"${self.wallet.monthly_budget:.2f}). Top up to continue cloud calls."
            )

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if think:
            payload["thinking"] = {"type": "enabled", "budget_tokens": 2048}

        url = f"{self.gateway_url}/chat/completions"

        # Step 1: Initial request (expect 402)
        resp = self._http.post(url, json=payload)

        if resp.status_code == 402:
            # Step 2: Parse payment requirements
            payment_req = resp.json()
            accepts = payment_req.get("accepts", [{}])[0]
            amount = int(accepts.get("amount", "10000"))  # default 0.01 USDC
            pay_to = accepts.get("payTo", "")
            amount_usdc = amount / 1_000_000  # USDC has 6 decimals

            if self.wallet.degraded:
                log.warning(f"Wallet at {self.wallet.burn_pct:.0f}% — consider switching to local")

            # Step 3: Sign EIP-3009 payment
            payment = sign_eip3009(
                private_key=self.wallet_key,
                to_address=pay_to,
                amount=amount,
            )

            # Step 4: Retry with payment header
            payment_b64 = base64.b64encode(
                json.dumps(payment).encode()
            ).decode()

            resp = self._http.post(
                url,
                json=payload,
                headers={"X-PAYMENT": payment_b64},
            )

            if resp.status_code == 200:
                self.wallet.record_spend(amount_usdc)
                log.info(f"x402 payment: ${amount_usdc:.4f} USDC for {model}")

        resp.raise_for_status()
        data = resp.json()

        # OpenAI-compatible response format
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")

        # Anthropic-style response format (fallback)
        content = data.get("content", [])
        if content:
            return " ".join(b.get("text", "") for b in content if b.get("type") == "text")

        return str(data)

    def wallet_status(self) -> dict:
        return {
            "monthly_budget_usdc": self.wallet.monthly_budget,
            "spent_usdc": round(self.wallet.spent_this_month, 4),
            "remaining_usdc": round(self.wallet.remaining, 4),
            "burn_pct": round(self.wallet.burn_pct, 1),
            "call_count": self.wallet.call_count,
            "degraded": self.wallet.degraded,
            "frozen": self.wallet.frozen,
            "gateway": self.gateway_url,
        }
