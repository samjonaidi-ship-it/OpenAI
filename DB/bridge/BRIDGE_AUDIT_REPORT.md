# BB_Micro_Bridge Master Audit Report | v1.0 | 2026-03-27 | BB

**Codebase:** BB_Micro_Bridge v2.5.5 (package.json) / v2.9.0 (CHANGELOG)
**Stack:** Fastify 5, Node 20+, Neon Postgres, Cockatiel, Railway
**Scope:** 79 source files, 23,183 lines across src/
**Agents deployed:** 5 (Backend Core, GPS/Routes Deep, Data/Config, Documentation, Enterprise Research)
**Total files read by agents:** 200+

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Critical Findings (Fix Immediately)](#2-critical-findings)
3. [High Findings](#3-high-findings)
4. [Medium Findings](#4-medium-findings)
5. [Low Findings](#5-low-findings)
6. [Dead Code & Stale Files](#6-dead-code--stale-files)
7. [Dependency Vulnerabilities](#7-dependency-vulnerabilities)
8. [Documentation Gaps](#8-documentation-gaps)
9. [Enterprise Best Practices Gap Analysis](#9-enterprise-best-practices-gap-analysis)
10. [Prioritized Action Plan](#10-prioritized-action-plan)

---

## 1. EXECUTIVE SUMMARY

### What's Good
- **Resilience layer** (Cockatiel circuit breakers, retry, timeout) is well-implemented
- **Run.bat** is one of the best in the BB ecosystem -- full port cleanup, auto-restart, ANSI banner
- **GPS QBT Integration docs** are exemplary -- 18 hard-won lessons, 32 pre/in/post-flight checks
- **SQL migrations** are clean, idempotent (mostly), well-phased (A through F)
- **Fastify schema validation** is used on many routes (TypeBox)
- **Graceful shutdown** handles SIGTERM/SIGINT with drain timeout
- **Image cache** uses proper LRU pattern with eviction

### What Needs Attention
- **8 CRITICAL findings** -- security authorization gaps, timing attacks, broken production systems
- **18 HIGH findings** -- data leaks, DoS vectors, silent failures, missing resilience
- **~25 MEDIUM findings** -- race conditions, inconsistencies, memory concerns
- **14 dead v1 files** (~1,765 lines) cluttering the codebase
- **6 CVEs** in dependencies (undici, fastify, nodemailer)
- **75+ routes undocumented** -- docs frozen at v2.6.0 while code is at v2.9.0
- **35 environment variables** missing from .env.example

### Risk Profile

| Category | Critical | High | Medium | Low |
|----------|:--------:|:----:|:------:|:---:|
| Security / Auth | 4 | 7 | 3 | 1 |
| Data Integrity | 2 | 2 | 4 | 2 |
| Resilience | 1 | 3 | 3 | 2 |
| Performance | 0 | 2 | 3 | 1 |
| Code Quality | 1 | 2 | 5 | 3 |
| Operations | 0 | 2 | 4 | 3 |
| **Total** | **8** | **18** | **22** | **12** |

---

## 2. CRITICAL FINDINGS

### C1 -- GPS Draft Mutations: No Employee Ownership Check
**File:** `src/routes/gps-v1.js:2217-2363`
**Impact:** Any CalExp5 client with a valid API key can modify, approve, or reject ANY employee's draft timesheets. No `WHERE employee_id = ?` guard.
**Affected endpoints:**
- `PATCH /api/gps/drafts/:draftId` -- no ownership check
- `POST /api/gps/drafts/:draftId/approve` -- no ownership check
- `POST /api/gps/drafts/:draftId/reject` -- no ownership check
- `POST /api/gps/drafts/manual` -- accepts any `employeeId` in body
**Compare to:** `GET /breadcrumbs` (line 626) which correctly uses `isAuthorizedForEmployee()`.
**Fix:** Add these routes to `session-v2.js` Bearer-enforced list + add `isAuthorizedForEmployee()` check.

### C2 -- Admin JWT Verification: Timing-Side-Channel Attack
**File:** `src/routes/cal-auth.js:156`
**Impact:** `verifySessionJwt()` uses `expectedSig !== sigB64` (simple string equality) instead of `crypto.timingSafeEqual()`. Affects admin endpoints: `/api/auth/admin/reset`, `/api/auth/admin/crew-auth`, `/api/auth/session`. An attacker can forge JWT signatures via timing analysis.
**Note:** `session-v2.js` was already patched to use `timingSafeEqual` in v1.4.0 audit -- this file was missed.
**Fix:** One-line change -- replace string comparison with `timingSafeEqual()`.

### C3 -- Overland GPS Ingest: Unbounded Batch + No Auth = DoS Vector
**File:** `src/routes/gps-v1.js:~1065`
**Impact:** `/ingest/overland` is intentionally unauthenticated (devices can't carry API keys). No cap on feature count. A 10MB payload (~200K minimal GeoJSON features) runs ~200K sequential Neon INSERTs, holding a connection for minutes and filling `cal_gps_points` with garbage for `'overland-unknown'` devices.
**Fix:** Add `if (features.length > 500) return reply.code(400)` before any DB access.

### C4 -- Overland Ingest: Device Attribution Error for Multi-Device Batches
**File:** `src/routes/gps-v1.js:1144`
**Impact:** Device registry lookup uses only `features[0]?.properties?.device_id`. All subsequent pings in the same batch are attributed to the first device's employee -- even if the batch contains different device IDs. Silent data misattribution.
**Fix:** Per-ping device_id validation, or reject batches with mixed device IDs.

### C5 -- GPS Reconstruction: No Concurrency Guard
**File:** `src/utils/gps-cron.js:51`, `src/routes/gps-v1.js:2039`
**Impact:** `/reconstruct-day` has no in-process lock. If the cron fires while a manual trigger is running (or Railway restarts mid-run), two reconstructions overlap. The `ON CONFLICT` upsert on `cal_reconstruction_runs` races -- both see no row, both INSERT, one fails silently. Draft timesheets get partially overwritten with no detection.
**Fix:** Add an in-process `_reconstructionInProgress` flag checked at handler entry.

### C6 -- Audit Log: Non-Functional in Production
**File:** `src/utils/audit-log.js`
**Impact:** When `DATABASE_URL` is set (production), `NeonAuditLogger` is instantiated and startup log says "Using NeonAuditLogger". But `record()` is never called from any route/hook, and `flush()` throws "Not implemented". The `/api/reports` endpoint always returns zero entries. The entire audit log system is a facade.
**Fix:** Either wire `record()` into `request-log.js` onResponse hook, or remove `NeonAuditLogger` and use `MemoryAuditLogger` everywhere until implementation is complete.

### C7 -- Neon SQL Singleton: No Reconnect / Error Recovery
**File:** `src/utils/neon-sql.js`
**Impact:** Single shared `_sql` instance for all concurrent requests. If the Neon client's internal state becomes corrupted (connection error, secret rotation), all subsequent requests fail until process restart. No mechanism to recreate the connection.
**Fix:** Add error detection and re-creation logic, or use the Neon `-pooler` connection string (PgBouncer) for automatic pool management.

### C8 -- QBO SQL Sanitizer: Permits Single-Quote Injection
**File:** `src/clients/qbo-v2.js:255-263`
**Impact:** `sanitizeQuery()` strips semicolons and blocks keyword patterns, but does NOT strip single quotes, double quotes, or `--` comment prefix. The `/query` endpoint accepts raw QBO SQL from any API-key consumer. Value injection via quoted string context is possible (e.g., `1' OR '1'='1`).
**Fix:** Strip single/double quotes and `--` from input, or better yet, don't expose raw SQL query endpoint.

---

## 3. HIGH FINDINGS

### H1 -- GPS Read Endpoints: No Ownership Check (Data Leakage)
**Files:** `gps-v1.js:2146, 2191, 782`
- `GET /daily-timeline/:employeeId` -- any API-key caller sees any employee's timeline
- `GET /pending-reviews/:employeeId` -- any API-key caller sees draft timesheets
- `GET /snapped-route/:employeeId` -- any API-key caller gets full road-snapped driving history
**Fix:** Add to `session-v2.js` Bearer-enforced list + `isAuthorizedForEmployee()`.

### H2 -- Fleet/Crew Health: Not Bearer-Gated
**Files:** `session-v2.js:65-74`, `gps-v1.js:74`
- `/api/gps/fleet-health` and `/api/gps/crew-health` return device locations, battery levels, and ping frequency for ALL crew
- Only protected by API key, not Bearer + admin check
- Any CalExp5 user with the shared API key can see all crew locations
**Fix:** Add Bearer enforcement + `isAdmin` check.

### H3 -- Reconstruct Endpoints: Open to All Consumers
**File:** `gps-v1.js:961, 2039`
- `/reconstruct` and `/reconstruct-day` accept any valid API key
- These are expensive: fetch all GPS pings, run DBSCAN, call OSRM, write drafts
- A rate-limited consumer can trigger full reconstruction repeatedly
**Fix:** Require admin API key or dedicated cron key.

### H4 -- Breadcrumbs: Fallback Leaks Cross-Employee Data
**File:** `gps-v1.js:~648-652`
- When `cal_device_ownership_log` and `cal_device_registry` have no entries for an employee, the code falls back to `SELECT id FROM tc_devices` (ALL Traccar devices)
- Subsequent query fetches ALL positions from ALL devices -- attributed to the requested employee
- Returns other employees' GPS data to the requesting crew member
**Fix:** Remove the all-devices fallback; return empty result instead.

### H5 -- GPS Retention: Silently Broken (result.count undefined)
**File:** `src/utils/gps-retention.js:98`
- Batch deletion loop uses `result.count` which is NOT standard for `@neondatabase/serverless`
- `result.count` is always `undefined`, so `batchDeleted = 0` every iteration
- Loop exits after first batch; retention cron appears to succeed but only deletes first 10K rows
- `cal_gps_points` grows unboundedly despite monthly cleanup
**Fix:** Use `result.length` or `result.rowCount` per driver docs.

### H6 -- OSRM Calls Bypass Circuit Breaker
**File:** `gps-v1.js:821-828`
- `/snapped-route` uses manual `withTimeout(Promise.race)` with 8s timeout
- No circuit breaker, no retry -- different from the `osrmPolicy.execute()` pattern elsewhere
- If OSRM is degraded, this route hammers it while the circuit breaker stays closed
**Fix:** Route all OSRM calls through `osrmPolicy.execute()`.

### H7 -- Overland Ingest: Background Work After reply.send()
**File:** `gps-v1.js:1120-1293`
- Handler sends 200 at line 1120, then continues DB work without `return`
- Fastify keeps request "open" until entire handler resolves
- Uncaught exceptions in post-send block can cause "reply already sent" errors
**Fix:** `return` after `reply.send()`, move background work to `setImmediate()`.

### H8 -- Properties: scope=recent Ignores userId
**File:** `src/routes/properties-v1.js:23-39`
- `GET /api/properties?scope=recent&userId=123` accepts `userId` parameter but completely ignores it
- Both `scope=recent` and default return the full set of active properties
- Silently leaks all client addresses to every crew member
**Fix:** Add `userId` filter to the SQL query.

### H9 -- Beta Telemetry: Stack Traces Exposed
**File:** `src/routes/beta-v1.js:176-203`
- `/crash-log` and `/api-error-log` return full stack traces from `cal_beta_events`
- Stack traces expose internal file paths, library versions, code structure
- Accessible to any API-key holder
**Fix:** Strip `stack` field from public responses; expose only to admin.

### H10 -- Device IDs Logged Unconditionally in Production
**File:** `gps-v1.js:1082, 1181, 1187`
- `FUTURE TIMESTAMP rejected` and `CLOCK DRIFT WARNING` log device IDs in plain text
- Uses `console.log` instead of Pino structured logger
- Employee device identifiers in Railway plain-text logs = privacy concern
**Fix:** Route through `request.log` (Pino) with redaction.

### H11 -- PIN/Credential Registration: No Auth
**File:** `src/routes/cal-auth.js:382-407`
- `/pin/set` and WebAuthn register-options have no auth check beyond API key
- Any caller can set a PIN for any employee by submitting their `employeeId`
- WebAuthn credential hijacking possible
**Note:** Intentional for kiosk-style auth flow, but no server-side enforcement.

### H12 -- Neon Routes: Undefined Status Code
**File:** `src/routes/neon.js:24, 33, 43`
- Error handlers pass `err.statusCode` to `sendError`, but standard JS Error has no `statusCode`
- If `err.statusCode` is `undefined`, response may be 200 on errors
**Fix:** Default to 500: `err.statusCode || 500`.

### H13 -- 15 console.log Statements Bypass Pino
**File:** `gps-v1.js` (lines 1082, 1153, 1290, 1292, and 11 more)
- Ingest event counts, clock drift warnings, processing summaries use `console.log`
- Production log aggregators (Logtail, Datadog) only capture Pino output
- These logs are invisible to the monitoring pipeline
**Fix:** Replace with `request.log.info()` / capture `const log = request.log` before async block.

### H14 -- SNAPPED-ROUTE: No Total Time Cap
**File:** `gps-v1.js:820-843`
- Per-segment OSRM `matchTrace` calls have 8s timeout each, but no overall cap
- 10 driving segments x 8s = 80s total; Fastify's 60s `requestTimeout` fires first
- Killing the connection leaves pending OSRM fetches running without abort
**Fix:** Add `AbortController` + overall 30s timeout.

### H15 -- Traccar Sync: Infinite Re-fetch on Partial Failure
**File:** `gps-v1.js:445-480`
- `last_seen` update fires AFTER all positions for a device are processed
- If insert loop throws midway, `last_seen` is never updated
- Next sync re-fetches same failing positions indefinitely
**Fix:** Update `last_seen` per-device after each device completes, even partially.

### H16 -- DBSCAN: seed.shift() is O(n) Degrading to O(n^3)
**File:** `src/clients/dbscan.js:49`
- Plain array `shift()` is O(n); combined with O(n^2) DBSCAN = O(n^3) worst case
- 500 points with dense cluster = multi-second hangs
**Fix:** Replace `seed` array with a `Set` or queue for O(1) dequeue.

### H17 -- Push Admin Status: No Bearer Auth
**File:** `src/routes/push-v1.js:221-241`
- `GET /admin-status` returns every employee's push subscription status and device count
- Only API-key protected, not Bearer + admin
**Fix:** Add Bearer + `isAdmin` check.

### H18 -- GPS Cron: No Fetch Timeout
**File:** `src/utils/gps-cron.js:54`
- `runReconstruction()` uses `fetch` with no timeout
- If `/reconstruct-day` hangs (OSRM slow), the Promise never rejects
- `_consecutiveFailures` never increments, cron silently stalls forever
**Fix:** Add `AbortSignal.timeout(300000)` (5-minute max).

---

## 4. MEDIUM FINDINGS

| # | File | Finding |
|---|------|---------|
| M1 | `gps-retention.js:41` | Retention timing: negative `secsUntil` when started after 3 AM on the 1st causes immediate run on startup |
| M2 | `gps-v1.js:959` | `/reconstruct` lacks `last_seen < 30s` guard that `/reconstruct-day` has -- inconsistency |
| M3 | `timeline-engine.js:96-104` | Short-cluster filter silently drops clusters without counting them in stats |
| M4 | `timeline-engine.js:364` | Back-calculate exit loop assumes strict presence/trip interleaving -- index misalignment possible |
| M5 | `traccar.js:155` | `linkGeofenceToAllDevices` treats all HTTP 400 as "already linked", masking real errors |
| M6 | `gps-v1.js:1748` | `writeAudit` captures mutable outer vars by reference -- misleading audit on failure paths |
| M7 | `gps-v1.js:1330, 1380` | FollowMee/Generic heartbeat only updates first device in multi-device batches |
| M8 | `gps-v1.js:1390` | Generic ingest reports wrong source for multi-source batches (`items[0]?.source`) |
| M9 | `gps-v1.js:1496, 1506` | Double dynamic `import()` of qbt.js in single route handler |
| M10 | `gps-cron.js:52` | Cron uses first API key regardless of tier -- could be rate-limited on its own call |
| M11 | `idempotency.js:53` | `inFlight` key not cleaned up if request terminates abnormally between onRequest and onSend |
| M12 | `idempotency.js:69` | Cache stores parsed response body; 1000 entries of large GPS results = hundreds of MB |
| M13 | `session-v2.js:20` | `lastCleanup` updated before cleanup succeeds -- stale sessions accumulate on failure |
| M14 | `request-log.js:9` | Synchronous `onResponse` hook: if `recordRequest` throws, `done()` never called, response hangs |
| M15 | `image-cache.js:24-29` | Cache eviction does full O(n log n) sort when Map iteration order suffices |
| M16 | `image-cache.js:130` | Street View fetch has no timeout -- blocks entire cache warmer |
| M17 | `cal-auth.js:29` | PIN failure map grows unbounded, never pruned proactively |
| M18 | `beta-v1.js:93, 108` | Unauthenticated beta endpoints: no try/catch around DB INSERT, no size guard on feedback/api-errors |
| M19 | `gps-preprocess.js:38` | Millisecond detection threshold `> 1e12` misclassifies corrupted timestamps in 1e10-1e11 range |
| M20 | `gps-preprocess.js:128` | Batch overlap: last point duplicated, inflating OSRM distance slightly |
| M21 | `push-v1.js:327` | Empty `stage1Ids` fallback `['']` may cause type error with typed `employee_id` column |
| M22 | `rate-limit-v2.js:97` | Per-consumer (not per-consumer+IP) bucketing: shared key exhaustion possible |

---

## 5. LOW FINDINGS

| # | File | Finding |
|---|------|---------|
| L1 | 14 dead files | ~1,765 lines of v1 code never loaded (see Section 6) |
| L2 | `receipt-ai.js:13` | Anthropic key not reported in startup banner; missing key = unhelpful 500 |
| L3 | `rate-limit-v2.js:73` | In-memory rate limiter is per-instance; uncoordinated at multi-replica scale |
| L4 | `webauthn.js:16` | Challenge store has no size cap; rapid registration attempts accumulate unboundedly |
| L5 | `gps-v1.js:2041` | `date` body param not validated before SQL cast; invalid date = 500 |
| L6 | `gps-v1.js:2220` | Time strings in PATCH `/drafts/:draftId` not validated; NaN hours possible |
| L7 | `health-v2.js:30` | 60s healthy-on-restart window masks permanently broken token refresh (restart loop) |
| L8 | `legacy-compat.js:18` | No null check on `req.url` in `rewriteUrl` (extreme edge case) |
| L9 | `index-v2.js:136` | Plugin order: rate limit runs after session, so DoS requests hit DB before 429 |
| L10 | `.rcodex/stream/Run.bat.072237.bak` | Backup file in wrong directory |
| L11 | `scripts/migration-gps-columns.sql` | Migration misplaced in `scripts/` instead of `sql/` |
| L12 | `sql/phase-d-telemetry-schema.sql` | `ADD CONSTRAINT` not idempotent (will throw if run twice) |

---

## 6. DEAD CODE & STALE FILES

### 6.1 Dead V1 Source Files (safe to delete)

The entry point is `src/index-v2.js`. These 14 files are NOT imported anywhere in the active tree:

| Dead File | Replaced By |
|-----------|-------------|
| `src/index.js` | `index-v2.js` |
| `src/config.js` | `config-v2.js` |
| `src/clients/qbo.js` | `clients/qbo-v2.js` |
| `src/clients/token-store.js` | `clients/token-store-v2.js` |
| `src/data/employee-mapping.js` | `data/employee-mapping-v2.js` |
| `src/plugins/auth.js` | `plugins/auth-v2.js` |
| `src/plugins/error-handler.js` | `plugins/error-handler-v2.js` |
| `src/plugins/rate-limit.js` | `plugins/rate-limit-v2.js` |
| `src/routes/health.js` | `routes/health-v2.js` |
| `src/routes/qbt.js` | `routes/qbt-v2.js` |
| `src/routes/qbo.js` | `routes/qbo-v2.js` |
| `src/routes/bill-recon.js` | `routes/bill-recon-v2.js` |
| `src/routes/chase-recon.js` | `routes/chase-recon-v2.js` |
| `src/routes/invoice-recon.js` | `routes/invoice-recon-v2.js` |

**Total dead code: ~1,765+ lines**

### 6.2 Stale Non-Source Files

| File/Dir | Status |
|----------|--------|
| `migrations/seed-supplier-v2.mjs` | Superseded by v3 |
| `debug/` | Empty directory |
| `logs/*.log` (6 files) | Local startup logs, gitignored, harmless |
| `data/settings/settings.json` | Empty `{}` -- correct per BB standards |

### 6.3 Files That Should Be Gitignored

| File | Issue |
|------|-------|
| `test-data/raw/jobsite-map.json` | **Client names and home addresses committed to git** |
| `test-data/raw/` (all) | PII files untracked only by luck -- no gitignore rule |
| `test-data/scenarios/` | Real GPS coordinates, not gitignored |
| `test-data/results/` | Test output, not gitignored |
| `debug/` | Not gitignored (empty now, but could accumulate) |

### 6.4 Hardcoded Secrets

| File | Issue |
|------|-------|
| `scripts/bridge-status.sh` | Hardcoded API key: `ts_prod_key_tsexp5_2026` |
| `scripts/gps-sim.js` | Dev key fallback: `ce_dev_key_calexp5` (acceptable for dev tooling) |

---

## 7. DEPENDENCY VULNERABILITIES

Run `npm audit fix` to address all of these:

| Severity | Package | Issue |
|----------|---------|-------|
| **HIGH** | `undici ^7.8.0` | 6 CVEs: WebSocket overflow crash, HTTP request/response smuggling, unbounded memory consumption, CRLF injection |
| **HIGH** | `minimatch` (transitive) | ReDoS via repeated wildcards |
| **MEDIUM** | `fastify ^5.3.3` | 2 CVEs: malformed Content-Type bypass, `X-Forwarded-Proto`/`Host` spoofing |
| **MEDIUM** | `nodemailer ^8.0.3` | SMTP command injection via unsanitized `envelope.size` |
| **MEDIUM** | `brace-expansion` (transitive) | Zero-step sequence causes hang + memory exhaustion |
| **LOW** | `yaml` (transitive) | Stack overflow via deeply nested YAML collections |

---

## 8. DOCUMENTATION GAPS

### 8.1 Route Documentation

**Documented:** 56 routes (in API_REFERENCE.md + ROUTES_QUICK_REFERENCE.md)
**Actual:** 120+ routes
**Gap:** 75+ routes completely undocumented

| Undocumented Route Module | Routes | Status |
|--------------------------|:------:|--------|
| `gps-v1.js` (`/api/gps`) | 26 | MISSING from all docs |
| `push-v1.js` (`/api/push`) | 9 | MISSING entirely |
| `cal-auth.js` (`/api/auth`) | 11 | MISSING entirely |
| `cal-data.js` (`/api/cal`) | 14 | MISSING entirely |
| `beta-v1.js` (`/api/beta`) | 6 | MISSING entirely |
| `admin-v1.js` (`/api/admin`) | 2 | MISSING entirely |
| `neon.js` (`/api/neon`) | 3 | MISSING entirely |
| `properties-v1.js` (`/api/properties`) | 4 | Partially mentioned |

### 8.2 Architecture Documentation

`docs/ARCHITECTURE.md` is frozen at v1.0 (2026-03-14) -- describes only a QBO/QBT gateway. Missing:
- GPS Intelligence system (entire pipeline)
- Receipt scanning (Claude AI, Drive, email, PDF)
- CalExp5 backend (WebAuthn + PIN auth, sessions, hours CRUD)
- Push notifications (VAPID)
- Beta telemetry
- Admin operations
- 4 cron systems (GPS reconstruct, retention, push scheduler, image cache)
- 10+ external service integrations

### 8.3 Environment Variables

`.env.example` documents ~20 variables. Actual code uses **55+ variables**. Missing ~35 including critical ones:
`SESSION_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_DRIVE_*` (4 vars), `RECEIPT_EMAIL_*` (3 vars), `VAPID_*` (3 vars), `TRACCAR_*` (3 vars), `WEBAUTHN_*` (3 vars), `OPENAI_API_KEY`, `OSRM_URL`, `GPS_CRON_HOUR_PT`, and more.

### 8.4 Stale Documents

| Document | Issue |
|----------|-------|
| `API_REFERENCE.md` | Frozen at v2.6.0; missing 75+ routes |
| `ROUTES_QUICK_REFERENCE.md` | Frozen at v2.6.0; says 56 routes, actual 120+ |
| `ARCHITECTURE.md` | Frozen at v1.0; describes QBO/QBT only |
| `README.md` | Frozen at v2.5.1; wrong file tree, route counts, dependency list |
| `VERSION_MATRIX.md` | Missing 7+ files, stale version numbers |
| `MINI_PARITY.md` | Says ~50 routes, actual 120+; says AI stays on Mini but it's already on Micro |
| `BB_SCAN_STATUS.md` | Lists P0 items as "needs work" that are already done |
| `CHANGELOG.md` | Content current through v2.9.0 but footer watermark says v2.5.1 |

### 8.5 Missing Documentation (Never Existed)

- Cron job schedules and purposes (4 crons, zero docs)
- Database schema reference (20+ Neon tables, no consolidated doc)
- External service dependency map with failure modes
- Security model (3 auth mechanisms, no unified doc)
- Incident response procedures / runbooks
- Push notification system
- CalExp5 auth system (WebAuthn + PIN)
- Image caching architecture
- Error codes for GPS, receipt, auth, push systems

### 8.6 Rate Limit Mismatch

API_REFERENCE.md says CalExp5 is "Standard 100/min" but actual code (`rate-limit-v2.js`) upgraded it to "Heavy 200/min" with comment about receipt thumb headroom.

---

## 9. ENTERPRISE BEST PRACTICES GAP ANALYSIS

Based on online research (2025-2026 sources, cited), here's what BB_Micro_Bridge should adopt:

### 9.1 Security Hardening

| Practice | Current | Recommended |
|----------|---------|-------------|
| HTTP security headers | None | Add `@fastify/helmet` (CSP, HSTS, X-Frame-Options, etc.) |
| Health check separation | `/api/health` (combined) | Split into `/livez` (shallow, never depends on external services) and `/readyz` (deep, checks Neon/QBO) |
| Response schemas | Partial | Add to ALL routes -- prevents accidental data exposure + 2-3x faster serialization |
| Secrets scanning | None | Add `git-secrets` or equivalent to prevent credential commits |
| API key rotation | Manual | 90-day rotation cycle with dual-key overlap period |
| BOLA protection | Inconsistent | Per-resource ownership checks on EVERY endpoint (OWASP API1) |

### 9.2 Resilience

| Practice | Current | Recommended |
|----------|---------|-------------|
| Circuit breakers | Cockatiel (some routes) | Apply to ALL external calls; use `SamplingBreaker` for high-traffic GPS routes |
| Bulkheads | None | Per-dependency isolation: QBO(5), QBT(5), Neon(20), OSRM(10), AI(3), Drive(5) |
| Policy composition | Ad-hoc | Use Cockatiel `wrap()`: fallback > circuitBreaker > bulkhead > retry > timeout |
| Timeout cascade | Inconsistent | Client 30s > Gateway 20s > External API 15s > Database 10s |
| Graceful degradation | Partial | Progressive feature shedding: GPS always works, AI queues for later, Street View serves stale |

### 9.3 Observability

| Practice | Current | Recommended |
|----------|---------|-------------|
| Structured logging | Pino (partial -- 15 console.logs bypass it) | All logging through Pino; add sensitive field redaction |
| Distributed tracing | None | OpenTelemetry + `@autotelic/fastify-opentelemetry` |
| Metrics | Basic in-memory | Prometheus via `fastify-metrics` on separate internal port |
| Error tracking | None | Sentry (or GlitchTip for cost savings) with Fastify integration |
| Log redaction | None | Pino `redact`: `['req.headers.authorization', '*.password', '*.pin']` |

### 9.4 Performance

| Practice | Current | Recommended |
|----------|---------|-------------|
| JSON serialization | Schemas on some routes | Response schemas on ALL routes (fast-json-stringify = 2-3x faster) |
| Caching | Image LRU (good) | Add caching: employee list (5min), jobcodes (15min), stores (1hr), OSRM (24hr) |
| HTTP keep-alive | Default | Explicit keep-alive agent for upstream connections (QBO, QBT, OSRM) |
| Worker threads | None | Consider for CPU-intensive GPS work (DBSCAN, PDF generation) |

### 9.5 Railway Operations

| Practice | Current | Recommended |
|----------|---------|-------------|
| Zero-downtime deploys | Not configured | Set `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=30` + `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30` |
| Build optimization | Nixpacks | Evaluate Railpack (38% smaller images, better caching, no secret leakage) |
| Multi-replica prep | Single instance | Before scaling: add Redis-backed rate limiting + shared session store |
| Automated dependency updates | Manual | Configure Renovate: auto-merge patches, group minors, separate PRs for majors |

### 9.6 Documentation

| Practice | Current | Recommended |
|----------|---------|-------------|
| API spec | Manual markdown | Auto-generate OpenAPI from Fastify route schemas (`@fastify/swagger`) |
| Architecture decisions | None | Start ADR practice in `docs/adr/` |
| Runbooks | None | Create for 6 critical scenarios (QBO token expired, Neon down, GPS overload, etc.) |
| Database schema | Scattered SQL files | Consolidated schema reference document |

---

## 10. PRIORITIZED ACTION PLAN

### Phase 1: Critical Security (Do This Week)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 1 | Add GPS draft mutations to Bearer-enforced list + ownership checks | `session-v2.js`, `gps-v1.js` | 1 hr |
| 2 | Fix `verifySessionJwt` timing-safe comparison | `cal-auth.js:156` | 5 min |
| 3 | Add feature count cap (500) to Overland ingest | `gps-v1.js:~1065` | 10 min |
| 4 | Add GPS read endpoints to Bearer list + ownership checks | `session-v2.js`, `gps-v1.js` | 1 hr |
| 5 | Add Bearer + isAdmin to fleet-health, crew-health, reconstruct | `session-v2.js`, `gps-v1.js` | 30 min |
| 6 | Fix breadcrumbs all-devices fallback | `gps-v1.js:~648` | 15 min |
| 7 | Strip/escape quotes in `sanitizeQuery` | `qbo-v2.js:255` | 10 min |
| 8 | Run `npm audit fix` | `package.json` | 5 min |

### Phase 2: Data Integrity & Resilience (Next Week)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 9 | Fix GPS retention `result.count` bug | `gps-retention.js:98` | 15 min |
| 10 | Add reconstruction concurrency guard | `gps-cron.js`, `gps-v1.js` | 30 min |
| 11 | Fix per-ping device_id validation in Overland ingest | `gps-v1.js:1144` | 30 min |
| 12 | Route all OSRM calls through circuit breaker | `gps-v1.js` (multiple) | 1 hr |
| 13 | Fix Overland background work (return + setImmediate) | `gps-v1.js:1120` | 20 min |
| 14 | Fix Neon SQL singleton reconnect | `neon-sql.js` | 30 min |
| 15 | Add fetch timeout to GPS cron | `gps-cron.js:54` | 10 min |
| 16 | Fix Traccar sync partial failure / last_seen | `gps-v1.js:473` | 30 min |

### Phase 3: Code Cleanup (Same Sprint)

| # | Action | Files | Effort |
|---|--------|-------|--------|
| 17 | Delete 14 dead v1 files | 14 files | 15 min |
| 18 | Replace 15 console.logs with Pino | `gps-v1.js` | 30 min |
| 19 | Add `test-data/raw/`, `test-data/scenarios/`, `test-data/results/` to .gitignore | `.gitignore` | 5 min |
| 20 | Remove hardcoded API key from bridge-status.sh | `scripts/bridge-status.sh` | 5 min |
| 21 | Fix or remove non-functional NeonAuditLogger | `audit-log.js` | 30 min |
| 22 | Fix properties scope=recent userId filter | `properties-v1.js:23` | 20 min |
| 23 | Strip stack traces from beta log endpoints | `beta-v1.js:183` | 10 min |
| 24 | Fix DBSCAN seed.shift() performance | `dbscan.js:49` | 15 min |

### Phase 4: Documentation Refresh (Next Sprint)

| # | Action | Effort |
|---|--------|--------|
| 25 | Update `.env.example` with all 55+ variables | 2 hrs |
| 26 | Rewrite `ARCHITECTURE.md` v2.0 (full platform) | 3 hrs |
| 27 | Add 75+ missing routes to `API_REFERENCE.md` + `ROUTES_QUICK_REFERENCE.md` | 4 hrs |
| 28 | Update `README.md` (file tree, deps, route counts) | 1 hr |
| 29 | Update `VERSION_MATRIX.md` with all new files | 1 hr |
| 30 | Create cron job documentation | 1 hr |
| 31 | Create database schema reference | 2 hrs |
| 32 | Create security model documentation | 1 hr |

### Phase 5: Enterprise Hardening (Next Month)

| # | Action | Effort |
|---|--------|--------|
| 33 | Add `@fastify/helmet` | 30 min |
| 34 | Split health check into `/livez` + `/readyz` | 1 hr |
| 35 | Add response schemas to all routes | 4 hrs |
| 36 | Implement per-dependency bulkheads (Cockatiel) | 2 hrs |
| 37 | Add Prometheus metrics (`fastify-metrics`) | 2 hrs |
| 38 | Add Pino log redaction for sensitive fields | 30 min |
| 39 | Configure Renovate for automated dependency updates | 1 hr |
| 40 | Set Railway zero-downtime deploy vars | 10 min |
| 41 | Create incident runbooks for 6 critical scenarios | 3 hrs |
| 42 | Start ADR practice | Ongoing |
| 43 | Evaluate OpenTelemetry integration | 1 day |
| 44 | Evaluate Sentry/GlitchTip for error tracking | 1 day |

---

## APPENDIX: Sources

**Enterprise Best Practices (researched 2026-03-27):**
- OWASP API Security Top 10 (2023) -- https://owasp.org/API-Security/
- AWS Architecture Blog -- Exponential Backoff and Jitter
- Cockatiel GitHub -- https://github.com/connor4312/cockatiel
- Railway Docs -- Healthchecks, Config as Code, Deployment Teardown
- Railway Blog -- Introducing Railpack (2025)
- Fastify Docs -- Validation and Serialization, Logging, Recommendations
- Sentry Fastify Guide -- https://docs.sentry.io/platforms/javascript/guides/fastify/
- Neon Docs -- Connection Pooling, pgroll Zero-Downtime Migrations
- Drizzle ORM -- Migrations Guide
- arXiv -- Resilient Microservices Systematic Review (Dec 2025)
- Better Stack -- Node.js Prometheus Monitoring Guide
- DZone -- Circuit Breaker Pattern for Resilient Systems
- TurboStarter -- Renovate vs Dependabot Comparison

---

*Report generated by 5 Claude agents running in parallel. Total agent processing time: ~38 minutes.*
*All findings verified against actual source code with file:line references.*
