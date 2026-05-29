# Bridge Worker Separation Plan

**Date:** 2026-04-04  
**Status:** Active planning document  
**Scope:** BB Micro Bridge worker/scheduler responsibilities and separation from the request-serving web process

## Purpose

The Bridge is materially more resilient than it was, but worker duties still live inside the same Fastify process that serves production HTTP traffic.

That is acceptable for the current phase, but it is not the correct long-term architecture.

This document defines the separation plan so the next hardening wave is explicit.

## Current State

The Bridge web process currently serves traffic and also hosts lease-coordinated background duties, including:

- GPS reconstruction / batch processing
- push scheduling
- receipt sync
- compliance cron work
- GPS retention cleanup
- image cache warming
- shared-state cleanup
- session cleanup support

Current mitigation already in place:

- Neon-backed worker leases
- shared idempotency
- shared rate limiting
- notification dedupe
- 2-replica-safe coordination primitives

That means the current system is serviceable, but still carries mixed concerns.

## Problem

A request-serving gateway should not also be the long-running worker host if you want cleaner HA and easier operations.

The current mixed model creates these risks:

1. request latency and worker load share the same process
2. deploys affect both request paths and worker duties simultaneously
3. worker crashes and request crashes share blast radius
4. replica rollout logic is harder to reason about
5. memory growth is harder to attribute

## Target State

Split Bridge responsibilities into two Railway services:

1. **BB-Micro-Bridge**
- request-serving API only
- auth
- route handlers
- provider integrations
- shared-state reads/writes
- no recurring timers except minimal health-safe housekeeping

2. **BB-Micro-Bridge-Worker**
- scheduled jobs
- queue/lease-driven background work
- cleanup tasks
- push dispatch
- cache warming
- sync polling jobs

Both services should share:

- same Neon project
- same shared-state tables
- same codebase modules where practical
- different start commands
- different Railway service manifests

## Recommended Execution Model

### Phase 1. Keep shared-state coordination as-is

Do not rewrite the coordination model first.

The current lease tables are already the correct substrate for:

- singleton cron ownership
- deduped notifications
- replica-safe background work

Keep those tables and reuse them in the worker service.

### Phase 2. Extract worker entrypoint

Create a worker-specific entrypoint, for example:

- `src/worker-v1.js`

That entrypoint should:

- initialize config and logging
- start only background jobs
- not register Fastify routes
- not expose public HTTP traffic unless a tiny health endpoint is needed

### Phase 3. Categorize worker jobs

Move jobs into three classes:

1. **interval workers**
- receipt sync
- compliance checks
- cache warming

2. **cleanup workers**
- shared-state cleanup
- GPS retention cleanup
- session cleanup

3. **dispatch workers**
- push notification dispatch
- report follow-through
- future communications/outbox delivery

## File Ownership Targets

### Web process should keep

- `src/index-v2.js`
- route modules under `src/routes/*`
- auth / response / config / provider clients
- shared-state primitives

### Worker process should own orchestration of

- `src/utils/gps-cron.js`
- `src/utils/push-scheduler.js`
- `src/utils/receipt-sync.js`
- `src/utils/compliance-cron.js`
- `src/utils/gps-retention.js`
- `src/cache/image-cache.js` warm loops
- `src/plugins/session-v2.js` periodic cleanup hooks
- `src/utils/shared-state.js` cleanup timer startup

## Operational Model

### BB-Micro-Bridge

Replicas:
- production: 2
- staging: 1-2 as needed

Health:
- `/ready`

### BB-Micro-Bridge-Worker

Replicas:
- production: 1 initially
- no need for multiple worker replicas until there is real throughput pressure

Coordination:
- worker leases remain required even with 1 replica
- they protect future scale and replay safety

## What Not To Do

1. do not move coordination out of Neon first
2. do not introduce a queue system before the split is proven necessary
3. do not duplicate worker logic between web and worker after extraction
4. do not add more in-process timers to the web tier

## Success Criteria

The separation is complete when:

1. web deploys do not restart worker schedules
2. worker crashes do not restart the web tier
3. request-serving memory profile is cleaner and more stable
4. all recurring jobs are started only from the worker entrypoint
5. the web process can scale independently of worker load

## Recommended Next Step

Implementation order:

1. create `src/worker-v1.js`
2. move job startup out of `src/index-v2.js`
3. create Railway service `BB-Micro-Bridge-Worker`
4. keep one worker replica
5. run a 1-2 hour staging burn-in
