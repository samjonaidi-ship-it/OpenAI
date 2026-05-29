# Railway + Neon Production Findings | 2026-04-03

## Scope

This review covers the current production path for:
- `CalExp5` on Railway
- `BB_Micro_Bridge` on Railway
- Neon Postgres behind the Bridge

This is a code-and-config review from the current repositories. It does not inspect live Railway dashboard state, live Neon metrics, or current environment variable values directly.

## Current Production Topology

Current request path:

1. Browser -> `CalExp5` on Railway
2. `CalExp5` proxy -> `BB_Micro_Bridge` on Railway
3. `BB_Micro_Bridge` -> Neon Postgres
4. `BB_Micro_Bridge` -> QBO / QBT / Google / OSRM / AI providers

This means the real production DB layer is not `CalExp5 -> Neon` directly. It is:

- app proxy layer
- bridge service layer
- Neon persistence layer

## Highest-Risk Findings

### 1. Live-looking Neon credential committed in repo

File:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\scripts\seed-properties.js`

Finding:
- A full Neon connection string is hardcoded in source.

Risk:
- credential exposure
- unauthorized database access
- long-term compromise if credential was ever pushed to remote origin or copied into archives

Required action:
- rotate the credential immediately
- replace with env-driven config only
- remove the hardcoded value from the repo and history where feasible

### 2. Prior production outage mode is still reflected in current code paths

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\docs\APRIL_2_CRASH_FULL_ANALYSIS.md`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\cache\image-cache.js`

Finding:
- The outage analysis says nested Neon SQL template fragments caused ImageCache warm failures and connection exhaustion.
- Current `image-cache.js` still composes `sinceClause` and `assetSinceClause` as nested `sql\`...\`` fragments inside outer queries.

Risk:
- recurrence of the same warm-cache failure path
- more Neon connection churn under load or cron overlap
- another restart loop if combined with token persistence failures

Required action:
- patch this path first, in isolation
- validate with a dry-run against staging before touching other production behavior

### 3. Railway health model is liveness-first, not DB-readiness-first

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\railway.json`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\index-v2.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\routes\health-v2.js`

Finding:
- Railway probes `/live`
- `/live` is an under-pressure liveness probe
- deeper dependency readiness lives in `/ready`
- Railway is not using `/ready`

Risk:
- service may be marked healthy while Neon is degraded, token store is degraded, or upstream dependency state is unsafe
- deploys can appear successful while key stateful dependencies are not actually ready

Required action:
- keep `/live` as shallow liveness
- tighten `/ready` as real readiness
- decide carefully whether Railway should continue using `/live` for restart behavior or use `/ready` only after startup/retry semantics are proven safe

### 4. Single replica remains a production single point of failure

File:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\railway.json`

Finding:
- `numReplicas` is `1`

Risk:
- any crash, deploy, boot failure, or memory-pressure event takes out the whole bridge
- CalExp5 depends on the bridge for nearly all app-owned data and stateful operations

Required action:
- do not add replicas immediately
- first finish shared-state readiness for rate limiting, auditability, and cron behavior
- then move to controlled horizontal scaling

### 5. Multi-replica readiness is overstated in docs relative to actual code

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\docs\MULTI_REPLICA.md`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\plugins\rate-limit-v2.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\utils\audit-log.js`

Finding:
- docs say several stateful systems auto-switch to Neon/Postgres for multi-replica operation
- rate limiting is still memory-backed only
- audit path is not fully wired into normal request flow
- cron scheduling is still process-local

Risk:
- enabling multiple replicas now will create split-brain operational behavior
- rate limits will diverge by instance
- process-local jobs may run on more than one replica
- operational metrics and reports may become misleading

Required action:
- do not scale Bridge horizontally until the shared-state gaps are closed

### 6. Token persistence can degrade from Neon to env/file fallback

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\token-store-v2.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\qbo-v2.js`

Finding:
- token store can fall back from Neon to file or env
- env store is read-only and cannot durably persist refreshed tokens
- source classification in `qbo-v2.js` currently treats any non-arrow source as effectively Neon-backed

Risk:
- false confidence about token source
- restarts after degraded operation may come back with stale or missing token state
- deploy-overlap recovery may make the wrong decision

Required action:
- fix source classification first
- make token source state explicit in health/readiness
- decide if production should hard-fail instead of silently degrading in some cases

### 7. CORS can fall open in production

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\config-v2.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\index-v2.js`

Finding:
- if `CORS_ORIGINS` is not configured and Railway public domain inference fails, production can register permissive CORS

Risk:
- broader browser-origin access than intended
- harder-to-audit frontend security posture

Required action:
- fail closed in production when origin allowlist is missing
- do not silently widen CORS in prod

### 8. CalExp5 still carries production-path local file fallback for settings

File:
- `C:\Users\samjo\Desktop\CalExp5\server.js`

Finding:
- settings load/save fall back to local file when Bridge/Neon is unavailable

Risk:
- inconsistent source of truth on Railway ephemeral filesystem
- hidden drift between DB state and app runtime state

Required action:
- keep file fallback only in local development
- disable it in production and staging

## Important Structural Findings

### 9. CalExp5 does not connect to Neon directly

Files:
- `C:\Users\samjo\Desktop\CalExp5\server.js`
- `C:\Users\samjo\Desktop\CalExp5\.env.example`

Finding:
- The app uses `BRIDGE_URL` and `BRIDGE_API_KEY`
- direct `DATABASE_URL` use is not implemented in CalExp5 runtime

Implication:
- production fixes must focus first on `BB_Micro_Bridge`
- CalExp5 should be treated as a consumer app and proxy, not the database owner

### 10. Bridge/app routing contract has drifted before

Files:
- `C:\Users\samjo\Desktop\CalExp5\src\utils\tool-api.js`
- `C:\Users\samjo\Desktop\CalExp5\server.js`

Finding:
- production comments show `VITE_API_BASE` was pointed at the Bridge directly on Railway, bypassing CalExp5 proxy behavior and breaking auth assumptions

Implication:
- deployment contract is too easy to misconfigure
- one canonical routing rule is needed

### 11. Direct vs pooled DB connection split is recommended but not implemented in runtime config

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\config-v2.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\docs\PRODUCTION_HARDENING_REPORT.md`

Finding:
- docs recommend `DATABASE_URL` plus `DATABASE_URL_DIRECT`
- runtime config only exposes `DATABASE_URL`

Implication:
- migrations/admin operations likely use the same path as application traffic
- connection semantics are not explicit enough

## Operational Gaps

### 12. Current tests are not strong enough for immediate prod refactor confidence

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\tests\token-store.test.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\tests\health.test.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\tests\hardening.test.js`

Finding:
- token-store tests still target old implementation file
- tests do not prove current staging/prod readiness around Neon failure, token fallback, warm-cache behavior, or startup ordering

Implication:
- production fixes must be narrow and staged
- test reinforcement should precede any broader change set

### 13. Request metrics are present, but durable request auditing is not fully trustworthy

Files:
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\plugins\request-log.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\utils\audit-log.js`

Finding:
- metrics are recorded on every response
- durable audit recording path is not clearly wired into normal request flow

Implication:
- operational reports can be incomplete
- debugging and postmortem value is lower than docs imply

## Summary Judgment

The production architecture is still viable, but it is not in a state where broad refactoring is safe.

The correct reading is:
- the current setup can be stabilized
- but changes must be narrow, staged, and reversible
- the Bridge is the real control point
- multi-replica should come later, not first

## Recommended Priority Order

1. Rotate exposed Neon credential
2. Patch ImageCache SQL composition bug only
3. Patch QBO token source classification only
4. Remove production file fallback behavior where it can create drift
5. Strengthen health/readiness semantics
6. Add staging and rehearsed cutover flow
7. Only then consider replicas
