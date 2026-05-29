# Smoke Test Runbook | 2026-04-03

## Purpose

This runbook is used after staging and production deploys.

It is intentionally small. The goal is fast confidence, not exhaustive QA.

## Bridge Smoke Tests

### 1. Process liveness
- [ ] `GET /live` returns 200

### 2. Basic health
- [ ] `GET /api/health` returns expected shape
- [ ] version/build info looks correct

### 3. Detailed dependency state
- [ ] `GET /api/health/detailed` succeeds
- [ ] token source is what you expect
- [ ] QBO state is acceptable
- [ ] QBT state is acceptable
- [ ] no obvious degraded DB state

### 4. DB-backed read
- [ ] one known Neon-backed read route succeeds

### 5. DB-backed write
- [ ] one low-risk Neon-backed write route succeeds
- [ ] data is visible on re-read

### 6. QBO path
- [ ] one QBO read route succeeds

### 7. QBT path
- [ ] one QBT read route succeeds

### 8. Startup side-effects
- [ ] no immediate ImageCache warm failure
- [ ] no connection-storm log pattern
- [ ] no token fallback anomaly

## CalExp5 Smoke Tests

### 1. App liveness
- [ ] `GET /health` returns 200

### 2. App shell
- [ ] app loads in browser
- [ ] no immediate boot error

### 3. Proxy path
- [ ] one app request through CalExp5 proxy succeeds

### 4. Settings load
- [ ] settings load succeeds from Bridge/Neon

### 5. Settings save
- [ ] settings save succeeds to Bridge/Neon
- [ ] re-read confirms persistence

### 6. Long-running path
- [ ] one designated long-running AI path completes through expected route

## DB Observations

### During smoke window
- [ ] no connection exhaustion logs
- [ ] no repeated warm-cache failures
- [ ] no restart loop
- [ ] no obvious query storm on boot

## Monitoring Window

Do not declare success immediately after boot.

Monitor for:
- [ ] one ImageCache interval
- [ ] one proactive QBO refresh cycle
- [ ] a short normal-traffic window

## Failure Triggers

Rollback or halt if any occur:
- [ ] Bridge health unstable after startup window
- [ ] CalExp5 proxy broken
- [ ] settings persistence broken
- [ ] QBO or QBT critical read path broken
- [ ] repeated DB connection errors
- [ ] restart loop

## Minimum Evidence To Record

After each staging or prod deploy, capture:
- [ ] deployed commit/version
- [ ] timestamp
- [ ] health endpoint outputs
- [ ] token source state
- [ ] results of DB/QBO/QBT smoke checks
- [ ] result of CalExp5 settings load/save
- [ ] yes/no on rollback trigger conditions
