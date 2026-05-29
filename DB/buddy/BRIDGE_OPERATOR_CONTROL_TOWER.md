# Bridge Operator Control Tower

## Purpose
The Bridge now needs an operator-facing control surface, not just logs and ad hoc scripts. The control tower is the admin surface for web + worker runtime health, projection refresh state, replay/backfill jobs, and shared-state pressure.

## Required panels

### 1. Overview
- service readiness
- web runtime mode
- worker runtime mode
- active replica count
- active worker leases
- queued/running/failed operator jobs
- latest projection refresh runs
- token persistence status
- qbo/qbt provider status

### 2. Worker Leases
- lease key
- current owner
- lease expiry
- last renewal time
- stale lease indicator

This answers:
- which process owns cache warmer
- which process owns receipt sync
- which process owns compliance
- whether lease renewal is healthy

### 3. Projection Operations
- latest qbo projection refresh runs
- rows touched
- range refreshed
- duration
- success/failure
- last watermark / last replay window

### 4. Operator Jobs
- queued jobs
- running jobs
- retrying jobs
- failed jobs
- completed jobs
- cancel / retry / inspect details

Initial managed job types:
- `qbo_projection_backfill`
- `qbo_cdc_replay`

### 5. Shared-State Pressure
- idempotency status counts
- top rate-limited consumers in recent window
- notification dedupe/send/fail counts

### 6. Audit / Actions
- who queued jobs
- who cancelled jobs
- who triggered compliance/manual runs

## Backend contract
The Bridge control tower should be backed by:
- `/api/admin/operator/overview`
- `/api/admin/operator/leases`
- `/api/admin/operator/projections`
- `/api/admin/operator/rate-limits`
- `/api/admin/operator/idempotency`
- `/api/admin/operator/notifications`
- `/api/admin/operator/jobs`
- `/api/admin/operator/jobs/:jobId`
- `/api/admin/operator/jobs/:jobId/cancel`

## Product stance
This is not a generic developer console. It is a small operational cockpit for:
- sync health
- worker ownership
- replay/backfill management
- pressure visibility
- administrative intervention
