# Production Fix Checklist | 2026-04-03

## Purpose

This checklist is for the first production stabilization wave.

Use it to control changes to the current Railway + Bridge + Neon stack without introducing broad refactor risk.

## Rules For This Wave

- smallest possible change set
- one wave at a time
- no opportunistic cleanup
- no replica changes
- no schema redesign in the same deploy
- every step must have rollback criteria

## Wave 0 — Pre-Change Freeze

### Required
- [ ] Freeze non-essential deploys to `CalExp5` and `BB_Micro_Bridge`
- [ ] Confirm who is on point for deploy, validation, and rollback
- [ ] Export current Railway service settings for prod services
- [ ] Snapshot current env var names for both prod services
- [ ] Capture current Bridge health responses:
  - [ ] `/live`
  - [ ] `/api/health`
  - [ ] `/api/health/detailed`
- [ ] Capture current CalExp5 `/health`
- [ ] Capture current Neon schema snapshot
- [ ] Capture current row counts for critical tables
- [ ] Record current deployed commit/version for:
  - [ ] `CalExp5`
  - [ ] `BB_Micro_Bridge`

### Required rollback condition definition
- [ ] Bridge fails to boot cleanly
- [ ] Bridge health stays degraded beyond agreed startup window
- [ ] CalExp5 cannot load through proxy
- [ ] settings load/save fails
- [ ] QBO/QBT read path fails
- [ ] unexpected Neon connection spike or query storm

## Wave 0A — Secret Hygiene

### Required
- [ ] Rotate exposed Neon credential
- [ ] Replace hardcoded credential use in scripts with env-only access
- [ ] Verify old credential is invalidated
- [ ] Confirm new credential works from approved runtime only

### Do not continue until
- [ ] old credential is dead
- [ ] prod Bridge still boots and reaches expected health

## Wave 1 — Narrow Hotfixes Only

### Allowed code changes
- [ ] Fix ImageCache SQL composition bug
- [ ] Fix QBO token source classification logic

### Explicitly not allowed in this wave
- [ ] no replica changes
- [ ] no rate limiter redesign
- [ ] no readiness route redesign
- [ ] no CORS redesign
- [ ] no broad cleanup
- [ ] no migration framework change

## Wave 1 — Staging Validation

### Deploy Bridge hotfix to staging first
- [ ] staging Bridge boots cleanly
- [ ] staging `/live` is 200
- [ ] staging `/api/health` is acceptable
- [ ] staging `/api/health/detailed` shows expected token source and upstream state

### Validate hotfix behavior
- [ ] ImageCache warm no longer throws on incremental path
- [ ] no unexpected Neon connection spike during cache warm
- [ ] QBO token source is reported correctly
- [ ] token refresh still works
- [ ] no regression in app-facing routes used by CalExp5

## Wave 1 — Production Deploy

### Before deploy
- [ ] Confirm rollback commit is known
- [ ] Confirm staging results are documented
- [ ] Confirm deploy window is clear

### Deploy sequence
- [ ] Deploy `BB_Micro_Bridge-prod`
- [ ] Wait for boot and startup stabilization
- [ ] Verify Bridge health endpoints
- [ ] Verify one QBO read
- [ ] Verify one QBT read
- [ ] Verify one Neon-backed read
- [ ] Verify one Neon-backed write
- [ ] Verify ImageCache warm starts without obvious failure

### CalExp5 validation after Bridge deploy
- [ ] CalExp5 loads
- [ ] proxy requests succeed
- [ ] settings load succeeds
- [ ] settings save succeeds
- [ ] long-running AI route still succeeds through expected path

## Wave 1 — Monitoring Window

Monitor for at least:
- [ ] one ImageCache interval
- [ ] one proactive QBO refresh cycle
- [ ] enough traffic to confirm CalExp5 proxy path remains stable

Watch specifically for:
- [ ] connection exhaustion messages
- [ ] token reload/fallback anomalies
- [ ] repeated warm-cache failures
- [ ] restart loops
- [ ] Bridge latency spikes

## Wave 2 — Production Tightening

Only after Wave 1 is stable:
- [ ] disable production file fallback in CalExp5 settings path
- [ ] tighten CORS fail-closed behavior in production
- [ ] add runtime support for `DATABASE_URL_DIRECT`
- [ ] improve readiness/reporting semantics

## Wave 3 — Staging Build-Out

- [ ] create permanent staging Railway services
- [ ] create staging Neon branch / DB
- [ ] mirror env shape from prod to staging
- [ ] rehearse deploys and migrations there

## Wave 4 — Replica Readiness

Do not enable Bridge replicas until all are true:
- [ ] rate limiting is shared across replicas
- [ ] stateful request reporting is adequate across replicas
- [ ] cron/process-local jobs are replica-safe or extracted
- [ ] readiness is trusted
- [ ] zero-downtime deploy behavior is rehearsed in staging

## Rollback Checklist For Any Wave

Trigger rollback if any of these occur:
- [ ] Bridge boot failure
- [ ] health endpoint instability beyond startup threshold
- [ ] CalExp5 proxy failure
- [ ] settings persistence failure
- [ ] QBO/QBT critical path failure
- [ ] new DB error storm
- [ ] unbounded connection growth

Rollback steps:
- [ ] redeploy last known good Bridge version
- [ ] verify Bridge health
- [ ] verify CalExp5 proxy path
- [ ] verify token source and Neon write path
- [ ] capture incident notes before next change
