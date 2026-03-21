# API Reference

## Pipeline API

### Run Pipeline
```bash
npx ts-node scripts/scs001/run-pipeline.ts
```
Executes the full 12-stage SCS-001 pipeline. Outputs to `workspace/scs001/`.

### Run Multiformat Pipeline
```bash
npx ts-node scripts/scs001/run-multiformat-pipeline.ts
```
Generates videos in multiple formats (standard, vertical, cinematic).

## Telegram Bot Commands

| Command | Method | Description |
|---------|--------|-------------|
| `/status` | GET | Full pipeline + gate status |
| `/today` | GET | Daily operator morning cockpit |
| `/review` | GET | Top 3 QC-passed videos ready for posting |
| `/queue` | GET | Unposted video queue with daily pace |
| `/post-now` | GET | Manual posting assistant (file path + hashtags) |
| `/caption` | GET | Generate ready-to-paste TikTok caption |
| `/record` | POST | Record a posted video to gate tracker |
| `/update-views <id> <views>` | POST | Update view count for a posted video |
| `/metrics` | GET | Pipeline metrics (runs, quality, throughput) |
| `/revenue` | GET | Revenue tracking and financial gates |
| `/pace` | GET | Dynamic posting pace calculator |
| `/viral` | GET | Trending topics for content inspiration |
| `/lastrun` | GET | Latest pipeline execution summary |

## Achiri API

### Chat Endpoint
```
POST /chat
Content-Type: application/json

{
  "user_id": "string",
  "message": "string"
}
```

**Response:**
```json
{
  "response": "string",
  "user_id": "string",
  "tier": "free | growth | premium"
}
```

### Telegram Integration
| Command | Description |
|---------|-------------|
| `/achiri <message>` | Chat with Achiri |
| `/start` | Onboarding flow |
| `/invite-achiri <chat_id>` | Invite to alpha |

## Supabase Event Bus

Events are published to the `kognai_events` table:

```sql
CREATE TABLE kognai_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Event Types

| Event | Source | Description |
|-------|--------|-------------|
| `pipeline.run.start` | scs001-orchestrator | Pipeline execution started |
| `pipeline.run.complete` | scs001-orchestrator | Pipeline execution finished |
| `video.generated` | scs001-editing | New video generated |
| `video.posted` | scs001-publishing | Video posted to TikTok |
| `qc.pass` | scs001-qc | Video passed quality control |
| `qc.fail` | scs001-qc | Video failed quality control |
| `gate.check` | gate-validator | Gate assessment triggered |

## Stripe Webhooks

```
POST /webhook/stripe
```

Handles subscription events for SCS-001:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

## Model Router API

```python
# runtime/router.py
from router import route_request

response = route_request(
    prompt="Your prompt",
    complexity="low|medium|high|critical",
    max_cost=0.01  # USD budget
)
```

Routes to the optimal model tier based on complexity and cost constraints.
