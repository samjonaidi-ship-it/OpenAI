# Production Safe Plan And Environment Model | 2026-04-03

## Goal

Stabilize the current Railway + Bridge + Neon production stack without extended downtime, then introduce a proper staging path and only later enable horizontal scaling.

## Principle

Do not treat this as a broad cleanup.

Treat it as:
- isolate highest-risk faults
- patch in small reversible increments
- stage against a production-like environment
- cut over only after explicit smoke checks

## Current Production Model

Current live model:
- `CalExp5` on Railway
- `BB_Micro_Bridge` on Railway
- Neon Postgres behind Bridge

Recommended future model:
- `CalExp5-prod` -> `BB_Micro_Bridge-prod` -> `Neon prod branch`
- `CalExp5-staging` -> `BB_Micro_Bridge-staging` -> `Neon staging branch`

Do not share one live Bridge service between staging and production.
Do not share one mutable database branch between staging and production.

## Production-Safe Fix Sequence

### Wave 0. Secrets and freeze

Before code changes:

1. Rotate the leaked Neon credential.
2. Freeze non-essential deploys.
3. Export current Railway env vars and service settings.
4. Capture a current health baseline:
   - Bridge `/live`
   - Bridge `/api/health`
   - Bridge `/api/health/detailed`
   - CalExp5 `/health`
5. Capture current Neon schema and row-count snapshots.

This wave should not change behavior except credential rotation.

### Wave 1. Narrow production hotfixes only

First deploy should contain only:

1. ImageCache SQL composition fix
2. QBO token source classification fix
3. no broad refactors
4. no replica changes
5. no health-path changes yet

Reason:
- these are the two most credible recurrence risks
- they can be tested narrowly
- they are easier to roll back cleanly

### Wave 2. Production correctness tightening

After Wave 1 is stable:

1. disable or environment-gate production file fallback in CalExp5 settings path
2. tighten CORS failure mode in production
3. add real `DATABASE_URL_DIRECT` support for migrations/admin scripts
4. improve health/readiness reporting for token-store source and Neon dependency state

Still no replica change in this wave.

### Wave 3. Staging environment activation

Once prod is stable, create a permanent staging stack:

- `CalExp5-staging` Railway service
- `BB_Micro_Bridge-staging` Railway service
- `Neon staging branch` or separate staging DB

Then rehearse:
- deploy path
- migration path
- startup path
- token loading behavior
- cron startup behavior
- app-to-bridge routing
- smoke tests

### Wave 4. Shared-state readiness for replicas

Before multiple replicas, finish these:

1. rate limiting must be shared across replicas
2. any audit/reporting path that matters must be reliable across replicas
3. cron jobs must not run independently on every replica
4. readiness must expose true shared-state health
5. rollout must tolerate one replica booting with stale state while another is active

Only when those are done should Bridge scale horizontally.

## Recommended Environment Layout

## 1. Production

### Railway services

Production should have at least:

- `calexp5-prod`
- `bb-micro-bridge-prod`
- optional separate Railway cron worker only if cron logic is extracted from the web process

### Neon

Use:
- `prod` branch or dedicated production database
- pooled connection for app traffic
- direct connection only for migrations/admin scripts

### Production env rules

For `BB_Micro_Bridge-prod`:
- `DATABASE_URL` = pooled Neon connection
- `DATABASE_URL_DIRECT` = direct Neon connection
- `TOKEN_STORE` = explicit, not implicit, once stabilized
- `CORS_ORIGINS` = explicit allowlist only
- `SESSION_SECRET` = explicit and strong
- `QBO_*`, `QBT_*`, VAPID, Google, AI provider keys = env only

For `CalExp5-prod`:
- `BRIDGE_URL` = internal Railway URL for Bridge service
- `BRIDGE_PUBLIC_URL` = public Railway Bridge URL only if specific long-running routes still require it
- `BRIDGE_API_KEY` = prod app key
- `VITE_API_BASE` should not bypass CalExp5 proxy
- production file fallback should be disabled

## 2. Staging

### Railway services

Create separate services, not feature flags on prod:
- `calexp5-staging`
- `bb-micro-bridge-staging`

### Neon

Use:
- staging branch cloned from production schema
- seeded with safe representative data, not live mutable production state unless explicitly controlled

### Staging env rules

Keep env shape identical to production except:
- staging domains
- staging API keys
- staging QBO/QBT sandbox or limited prod-safe integration strategy
- staging notification/email destinations
- staging webauthn/session origins

Staging should exist to prove:
- service boot
- token loading
- DB connection behavior
- migrations
- cron startup
- app routing
- smoke interactions

## 3. Local development

Local should remain separate from staging/prod assumptions.

Allowed locally:
- file fallback
- relaxed CORS
- mock or partial data

Not allowed to leak into staging/prod:
- direct secrets in scripts
- permissive routing contracts
- silent fallback as a production dependency

## Staging And Release Flow

Recommended release path:

1. code merged to release branch
2. deploy to staging Railway services
3. run migration against staging via direct Neon connection
4. run smoke pack
5. hold for manual review
6. deploy to production Bridge
7. verify Bridge health and key flows
8. deploy to production CalExp5 if needed
9. run prod smoke pack
10. monitor for one full cron interval and one token refresh cycle

## Mandatory Smoke Tests

After every staging and production deploy:

### Bridge
- `/live` returns 200
- `/api/health` returns expected status
- `/api/health/detailed` shows correct token source and upstream state
- one Neon-backed read route works
- one Neon-backed write route works
- QBO read works
- QBT read works

### CalExp5
- `/health` returns 200
- app loads
- one proxy request succeeds
- one settings load succeeds from Bridge/Neon
- one settings save succeeds to Bridge/Neon
- one long-running AI route still works through the intended path

### DB
- confirm no connection spike or query storm on boot
- confirm no schema drift
- confirm expected audit/metrics behavior

## How Replica Function Fits In

## What a replica is doing here

A Railway replica is another running container instance of the same service behind Railway load balancing.

For `BB_Micro_Bridge`, replicas improve:
- availability during restarts/deploys
- traffic capacity
- resilience to single-instance crashes

But replicas only help when state coordination is already correct.

## When replicas help

Replicas are useful after:
- token persistence is centralized and reliable
- rate limiting is shared
- audit/reporting state is trustworthy enough
- cron execution is extracted or distributed safely
- readiness semantics are correct

Then Railway can route traffic across multiple healthy Bridge instances.

## When replicas hurt

Replicas hurt if enabled too early.

Examples:
- in-memory rate limits diverge by replica
- every replica starts the same cron loop
- one replica boots with stale token fallback while another uses fresh Neon state
- request reports become partial by instance
- deploy overlap bugs get harder to reason about

## Recommended replica order

### Near term

Keep:
- `CalExp5`: 1 replica is acceptable initially
- `BB_Micro_Bridge`: 1 replica until shared-state gaps are closed

### After shared-state fixes

Then move to:
- `BB_Micro_Bridge`: 2 replicas first
- keep CalExp5 at 1 unless the proxy layer itself becomes the bottleneck

Reason:
- Bridge is the more critical failure domain
- CalExp5 is largely a proxy and static asset host relative to Bridge statefulness

### Long term

Potential steady state:
- `BB_Micro_Bridge`: 2 replicas minimum
- `CalExp5`: 1-2 replicas depending on traffic and deployment needs
- cron/background work moved out of the web process or protected by distributed locking

## Required Changes Before Enabling Bridge Replicas

1. Replace memory-backed rate limiting with shared backing store.
2. Ensure any request audit/reporting path required for ops is replica-safe.
3. Remove process-local cron duplication risk.
4. Make token source and readiness explicit and observable.
5. Rehearse zero-downtime deploy behavior in staging.

## Configuration Contract To Adopt

## Bridge

Production and staging should both use:
- `DATABASE_URL` for pooled app traffic
- `DATABASE_URL_DIRECT` for migrations/admin scripts
- explicit `CORS_ORIGINS`
- explicit `TOKEN_STORE`
- explicit `SESSION_SECRET`
- no credential literals in code or scripts

## CalExp5

Production and staging should both use:
- app always calls its own proxy
- proxy always injects `X-API-Key`
- proxy calls Bridge through configured Bridge URL
- only explicitly designated long-running routes may use public Bridge URL path if still necessary
- no production write fallback to local files

## Operational Recommendations

1. Add a deployment checklist tied to staging and production.
2. Add a smoke-test script for Bridge and CalExp5.
3. Add a startup status log that clearly prints:
   - token store source
   - Neon enabled yes/no
   - pooled/direct DB config availability
   - CORS mode
   - cron enabled yes/no
4. Add a documented rollback trigger for each wave.

## Bottom Line

The safe path is:
- stabilize current single-replica production first
- create a real staging stack
- rehearse deploys and migrations there
- only then enable Bridge replicas

Replicas are not the first fix.
They are a later availability improvement after state coordination is correct.
