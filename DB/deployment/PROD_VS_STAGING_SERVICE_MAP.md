# Prod vs Staging Service Map | 2026-04-03

## Objective

Provide a clear service layout so staging is production-like without sharing critical mutable state with production.

## Recommended Service Layout

### Production

| Layer | Service | Notes |
|---|---|---|
| Frontend/app proxy | `calexp5-prod` | Railway service |
| Gateway/stateful backend | `bb-micro-bridge-prod` | Railway service |
| Database | `neon-prod` | prod branch or dedicated prod DB |
| Optional background service | `bb-micro-bridge-prod-worker` | only after cron extraction |

### Staging

| Layer | Service | Notes |
|---|---|---|
| Frontend/app proxy | `calexp5-staging` | separate Railway service |
| Gateway/stateful backend | `bb-micro-bridge-staging` | separate Railway service |
| Database | `neon-staging` | staging branch or separate staging DB |
| Optional background service | `bb-micro-bridge-staging-worker` | only after cron extraction |

### Local

| Layer | Service | Notes |
|---|---|---|
| Frontend/app proxy | local CalExp5 | local dev only |
| Gateway/stateful backend | local Bridge | local dev only |
| Database | local/dev Neon branch or dev DB | never prod |

## Connection Map

### Production
- Browser -> `calexp5-prod`
- `calexp5-prod` -> internal `bb-micro-bridge-prod`
- `bb-micro-bridge-prod` -> `neon-prod`

### Staging
- Browser -> `calexp5-staging`
- `calexp5-staging` -> internal `bb-micro-bridge-staging`
- `bb-micro-bridge-staging` -> `neon-staging`

## Routing Rules

### Rule 1
CalExp5 should be the app-facing proxy for app traffic.

### Rule 2
Bridge should own database access and external integration access.

### Rule 3
Only explicitly designated long-running routes may use the Bridge public URL path if internal Railway transport still cannot safely support them.

### Rule 4
Staging must not share the same mutable DB branch as production.

## Release Path

1. deploy Bridge to staging
2. run staging migration with direct DB connection
3. run Bridge smoke tests
4. deploy CalExp5 to staging
5. run end-to-end smoke tests
6. deploy Bridge to prod
7. validate Bridge
8. deploy CalExp5 to prod
9. validate end-to-end

## Replica Guidance

### Near term
- `bb-micro-bridge-prod`: 1 replica
- `calexp5-prod`: 1 replica
- `bb-micro-bridge-staging`: 1 replica
- `calexp5-staging`: 1 replica

### After shared-state readiness
- `bb-micro-bridge-prod`: 2 replicas
- `bb-micro-bridge-staging`: optional 2 replicas if needed for rehearsal
- `calexp5-prod`: 1 or 2 based on traffic and deployment tolerance

## What must be shared before Bridge replicas
- rate limiting backing store
- token persistence
- any must-have audit/reporting state
- cron/distributed job coordination or worker extraction
- trusted readiness semantics

## What should not be shared between staging and prod
- API keys
- domains
- notification destinations
- live mutable DB branch
- auth/session secrets
