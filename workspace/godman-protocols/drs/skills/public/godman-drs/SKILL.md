---
name: godman-drs
description: "Use DRS to allocate GPU/CPU resources, schedule agent tasks by priority, and handle preemption when resources are over-committed."
tags: ["resource-scheduling", "allocation", "preemption", "godman-protocols"]
version: "0.2.0"
---

# DRS — Dynamic Resource Scheduling

Use this skill when multiple agents compete for limited resources (model API slots, GPU, memory) and you need priority-based allocation with preemption.

## Key Operations

```typescript
import { ResourceScheduler } from '@godman-protocols/drs';
import type { ResourcePool, AllocationRequest, PreemptionEvent } from '@godman-protocols/drs';

const scheduler = new ResourceScheduler();
scheduler.registerPool({ id: 'gpu-pool', capacity: 4, resource_type: 'gpu' });

// Request allocation
const alloc = await scheduler.allocate({ agent: 'video-encoder', units: 2, priority: 8 });

// Handle preemption
scheduler.on('preempt', (event: PreemptionEvent) => {
  // save state and release resources
});
```

## When to Use
- Swarm runs with >5 parallel agents sharing model API rate limits
- Batch video production pipelines (SCS-001 pattern)
- Preventing OOM by scheduling memory-heavy tasks sequentially
