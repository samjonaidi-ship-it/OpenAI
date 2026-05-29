# BB Platform Readiness Report | v1.3 | 2026-03-14 | BB

> **Objective:** Validate the BB platform plan across four dimensions -- Railway hosting, CalExp5 as first production app, Neon DB strategy, and the evolved two-compartment + superset enrichment architecture. This report synthesizes findings from research agents, codebase audits, architecture documents, and the 2026-03-14 architecture evolution session.
>
> **Cross-references:** BB_DB_STRATEGY.md v1.4 | BB_CALEXP5_SCHEMA.md v1.2 | BB_PLATFORM_SCHEMA-v2.md v2.23

> **Changelog v1.3 (2026-03-14):** Cross-doc reconciliation audit. Fixed Neon driver contradiction (use `@neondatabase/serverless`). Resolved CalExp5 server question (keep Express proxy for Phase 1, evaluate removal in Phase 5). Standardized jobcodes endpoint to `/api/master/jobcodes`. Fixed uploadedTimesheetsByUser phase sequencing (table created in DB-2, migration starts in Cal-Phase 2). Clarified audit log strategy (app-specific + shared). Added initial load strategy for Bridge unavailability. Added bulk-upsert endpoints. Fixed phase dependency timing. Added rollback procedure for dual-write. Added composite QBT write endpoints.
>
> **Changelog v1.2 (2026-03-14):** Reconciled with BB_DB_STRATEGY.md v1.4 (two-compartment model, superset enrichment, Data Manager UI). Updated CalExp5 phases to route through Bridge. Added Data Manager as new app. Updated Bridge gaps for enrichment registry and working data CRUD. Revised implementation phases to align with new architecture. Added Section 8 (Data Manager Readiness).

---

## EXECUTIVE VERDICT

| Dimension | Status | Confidence |
|-----------|--------|------------|
| 1. Railway Hosting Framework | SOLID -- minor gaps | 90% |
| 2. CalExp5 as First App | VIABLE -- significant work needed | 70% |
| 3. Neon DB Strategy | SOLID -- evolved to two-compartment model | 92% |
| 4. Two-Compartment + Superset Enrichment | SOUND -- phased delivery critical | 85% |

**Bottom line:** The strategy is architecturally sound and has been strengthened by the two-compartment model and superset enrichment decisions. The core value proposition -- eliminating duplicated QBO queries, siloed enrichment, and fragile local storage -- is clear and compelling. CalExp5 remains the right first app. The Data Manager UI is a significant new deliverable but can be built incrementally. No fundamental redesign of existing plans needed -- the new architecture extends them.

---

## 1. RAILWAY HOSTING FRAMEWORK

### What's Already Right

| Decision | Validation |
|----------|-----------|
| Single Railway project for all services | Confirmed -- private networking and reference variables are project-scoped |
| Neon external to Railway | Correct -- eliminates SPOF, now also serves as centralized persistence for all apps |
| Fastify with `host: '::'` | Critical -- `localhost` or `127.0.0.1` causes 502 on Railway |
| Pre-Deploy Command for migrations | Correct -- runs in deployed container with full network access |
| Pro plan | Right choice -- $20/month covers all services |

### Estimated Monthly Cost (Updated)

| Service | Estimate |
|---------|----------|
| Railway Pro subscription | $20 (doubles as usage credit) |
| Micro-Bridge + Data Manager + 3 frontends | $20-45 overage |
| Neon Launch plan | $19 |
| Clerk (free tier, <10K MAU) | $0 |
| **Total** | **$59-84/month** |

*Note: Data Manager added as new Railway service. Cost estimate increased by ~$5-10/mo.*

### Gaps Found

| # | Gap | Severity | Action | Status |
|---|-----|----------|--------|--------|
| R1 | No `railway.json` in any project | LOW | Create for each service | CalExp5 DONE |
| R2 | No health check endpoint in Micro-Bridge | HIGH | Add `GET /health` returning 200 | DEFERRED to Bridge session |
| R3 | No graceful shutdown handler | MEDIUM | Add `SIGTERM` handler | DEFERRED to Bridge session |
| R4 | No PR preview environments configured | LOW | Future -- GitHub integration | TODO |
| R5 | Memory misconfiguration risk | MEDIUM | Don't hardcode `--max-old-space-size` low | Noted |
| R6 | QBO OAuth callback requires custom domain | HIGH | Configure `api.bainbridgebuilders.com` | TODO |
| R7 | No spending limit configured | LOW | Set Railway spending limit | TODO (Sam) |

### Key Best Practices

1. **Private networking:** Use `http://micro-bridge.railway.internal` (not `https://`). WireGuard-encrypted. Zero egress cost.
2. **Environment isolation:** Staging cannot reach production over private networking.
3. **Shared Variables:** Use `${{shared.DATABASE_URL}}` for cross-service env vars.
4. **No Serverless mode** for Micro-Bridge -- cold start latency unacceptable for API gateway.
5. **Single replica for now.** Scale to 2 only after externalizing rate limiting.
6. **Cloudflare:** If using proxy, set SSL/TLS to "Full" (not "Full Strict").

---

## 2. CALEXP5 AS FIRST APP

### Current State (Audit Summary)

| Aspect | Status |
|--------|--------|
| Frontend | React 19 + Zustand 5 + Vite 6 + Tailwind 4 -- solid |
| Server | Express 4 proxy on port 3200 --> Bridge on 3105 -- simple, clean |
| Auth | NONE. Users self-select from a dropdown. |
| Data persistence | 100% client-side (localStorage + IndexedDB). Zero server state. |
| Database packages | NONE installed |
| PWA | Configured via `vite-plugin-pwa` + Workbox -- good foundation |
| Offline support | Read cache only (NetworkFirst). No offline write queue. |

### Critical Gaps (Ordered by Priority)

| # | Gap | Why Critical | Phase |
|---|-----|-------------|-------|
| C1 | Zero authentication | Anyone can act as any employee. Multi-user DB meaningless without identity. | Phase 1 |
| C2 | `data/settings.json` on ephemeral disk | Destroyed on every Railway deploy. | Phase 2 |
| C3 | `uploadedTimesheetsByUser` in localStorage only | If cleared, app creates DUPLICATE timesheets. Data corruption risk. | Phase 2 |
| C4 | Manual hours, audit log, upload log all localStorage-only | No cross-device sync, lost on browser clear | Phase 3 |
| C5 | No offline write queue | Timesheet creates/updates fail immediately when offline | Phase 4 |
| C6 | Server proxy doesn't forward `Authorization` headers | Hardcoded header block -- must add JWT forwarding | Phase 1 |
| C7 | No `.env` file or env var documentation | Required for Railway deployment | Phase 1 |
| C8 | Hardcoded QBT IDs (PTO jobcodes, custom field IDs) | Not a blocker but must document | Phase 2 |
| C9 | IndexedDB cache has no user-level isolation | Shared device: one user sees another's cached data | Phase 3 |
| C10 | `injectTestData()` callable in production | Debug function should be gated or removed | Phase 1 |
| C11 | CalExp5 queries QBO/QBT directly for master data | Must switch to Bridge master data API (Compartment 1) | Phase 2 |
| C12 | CalExp5 has its own settings UI for employee enrichment | Must migrate to superset enrichment via Data Manager | Phase 3 |

### Recommended 5-Phase Migration Plan (Updated for Two-Compartment Model)

#### Phase 1 -- Auth Foundation (Week 1)
- Install `@clerk/clerk-react`, wrap app in `ClerkProvider`
- Build SMS OTP sign-in flow (E.164 phone format)
- Add `Authorization: Bearer <jwt>` to `apiCall()` in `src/utils/api.js`
- Add Fastify auth middleware using `jose` (manual JWKS verification)
- Configure roles in `user.public_metadata`: `admin`, `crew_lead`, `field_worker`
- **Always enforce roles server-side** -- UI filtering is cosmetic only
- Remove `injectTestData()` or gate behind dev flag
- Create `.env.example` with all required vars

#### Phase 2 -- Bridge Integration + Settings Migration (Week 1-2)
- Keep Express 4 proxy for now (evaluate removal in Phase 5 -- CalExp5 may become a pure static SPA calling Bridge directly from browser, eliminating the need for a CalExp5 server entirely)
- **Switch CalExp5 to read master data from Bridge API** (`GET /api/master/employees?app=calexp5`) instead of calling QBO/QBT directly
- **Switch CalExp5 to read jobcodes from Bridge API** (`GET /api/master/jobcodes`)
- Migrate `data/settings.json` to `app_settings` table via Bridge (`PUT /api/settings/calexp5/*`)
- **Migrate `uploadedTimesheetsByUser` to Bridge** (`/api/cal/uploaded-timesheets`) -- PRIORITY (duplicate risk)
- Add `railway.json` with Node version pin and health check
- Document hardcoded QBT IDs in code comments

#### Phase 3 -- Working Data Dual-Write + Cutover (Week 3-4)
- **Prerequisite:** Bridge Phase 2 (DB-2) MUST be complete -- `cal_*` tables and `/api/cal/*` endpoints must be live before this phase starts.
- Implement dual-write in Zustand store (localStorage + Bridge API)
- Feature flag controls write percentage (5% --> 25% --> 50% --> 100%)
- Shift reads from localStorage to Bridge API (same ramp)
- Add user-level isolation to IndexedDB cache keys
- **Remove CalExp5-specific employee enrichment UI** -- point Sam to Data Manager instead
- **Rollback procedure:** If bugs found during dual-write, set feature flag back to 0% (localStorage-only). The `cal_migrated` flag in localStorage controls which mode is active. Bridge data can be truncated and re-migrated.

#### Phase 4 -- Offline Hardening (Week 3-4)
- Add Dexie.js `syncQueue` for offline write queue
- Wire flush to `window.online` event
- Add Workbox `BackgroundSyncPlugin` for `/api/` mutations
- Add `SyncStatusBar` component (BB theme colors)
- Conflict resolution: Last-Write-Wins with server timestamp
- Test offline --> reconnect --> sync cycle

#### Phase 5 -- PWA Polish (Week 4)
- Switch to `injectManifest` strategy for custom service worker
- Configure cache headers: hashed assets get `immutable`; SW + HTML get `no-store`
- Target Lighthouse PWA score 90+
- Add SW update prompt banner
- Test install prompt on Android Chrome

### Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| `jose` for Clerk JWT verification | No official Clerk Fastify SDK exists |
| `@neondatabase/serverless` for Neon connection | Works on both edge AND Node.js runtimes. Neon's recommended driver. Handles WebSocket connections and pooling natively. |
| Dexie.js for IndexedDB sync queue | Better API than raw IndexedDB, `useLiveQuery` hook for React |
| Feature flags via localStorage | Sufficient for BB scale (<100 users) |
| Last-Write-Wins conflict resolution | Appropriate for crew scheduling, not financial transactions |
| Keep IndexedDB as read cache | Works well for offline reads -- just add user isolation |
| **CalExp5 reads master data from Bridge, not QBO directly** | Eliminates duplicated QBO queries. Bridge syncs once, CalExp5 reads shared data. |
| **CalExp5 working data goes through Bridge API** | Eliminates localStorage/ephemeral dependency. Persistent in Neon. |

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Zustand `persist` race condition with IndexedDB | Manual hydration with `onRehydratedStorage`; block renders until complete |
| Stale service worker breaking updates | Never cache `/sw.js`, `/index.html`; `Cache-Control: no-store` |
| Neon cold starts on first Monday request | Sub-1 second. Optional: cron ping every 4 minutes. |
| Background Sync Safari limitations | Workbox degrades gracefully; manual `navigator.onLine` polling as fallback |
| Duplicate timesheets if localStorage cleared | Phase 2 priority: migrate `uploadedTimesheetsByUser` to Bridge |
| Bridge down = CalExp5 can't read/write data | IndexedDB read cache provides offline reads. Queue writes for replay. |
| Bridge/Neon unavailable on initial app load | CalExp5 loads from IndexedDB cache (last-known data). Shows "Offline" banner. Retries Bridge connection every 30s. If no cache exists (first-ever load), show "Service unavailable" message. |
| QBT timesheet create succeeds but Neon write fails | Bridge logs to sync_log for manual reconciliation. Retry Neon write on next request. Never lose the QBT timesheet ID. |

---

## 3. NEON DB STRATEGY

### What's Already Right

| Decision | Validation |
|---------|-----------|
| Neon over Railway Postgres | Confirmed -- scale-to-zero, SPOF separation, branching |
| Drizzle ORM | Confirmed -- SQL-first, TypeScript, ~7kb bundle |
| JSONB enrichment column pattern | Confirmed -- now extended to superset model with central registry |
| Additive-only migrations | Confirmed best practice |
| Pooled connection for app, direct for migrations | Confirmed critical |
| `max: 10` app-level pool | Correct -- Neon PgBouncer handles 10K clients |
| GIN index on enrichment JSONB | Confirmed -- `jsonb_path_ops` for containment queries |
| **Two-compartment model** | Sound -- shared master data + per-app working data addresses all BB pain points |
| **Superset enrichment** | Sound -- eliminates duplicated settings UIs, central registry with validation |

### Corrections Applied in BB_DB_STRATEGY.md v1.4

| # | Issue | Correction | Status |
|---|-------|------------|--------|
| D1 | `sslmode` not specified | Must use `sslmode=verify-full` | DONE (v1.2) |
| D2 | PITR window defaults understated | Launch = 1 day default, must configure to 7 | DONE (v1.2) |
| D3 | No two-compartment model | Added Sections 6-8 for compartments, superset enrichment, Data Manager | DONE (v1.3) |
| D4 | No enrichment registry | Added enrichment_fields + app_field_subscriptions tables | DONE (v1.3) |
| D5 | No app_settings table | Added shared infrastructure table | DONE (v1.3) |

### Findings Incorporated

| # | Finding | Impact | Status |
|---|---------|--------|--------|
| N1 | `pg_stat_statements` wiped on scale-to-zero | Accept periodic loss | Documented |
| N2 | OpenTelemetry requires Scale plan | Dashboard + manual monitoring | Documented |
| N3 | PgBouncer transaction mode limitations | Test Drizzle prepared statements early | Documented |
| N4 | Branch billing ~$1.50/branch-month | Budget for dev branches | Documented |
| N5 | `sslnegotiation=direct` saves ~119ms | Performance optimization | Documented |
| N6 | Idempotent seeding (`ON CONFLICT DO UPDATE`) | All seed scripts must use | Documented |
| N7 | No circuit breaker for DB calls | Add Cockatiel for Neon calls | Documented |
| N8 | IP allowlisting available | Restrict to Railway IPs in production | TODO |
| N9 | Free plan compute limits | Launch plan minimum for production | Documented |

### Recommended Neon Connection Pattern

```typescript
// src/db/index.ts -- Fastify on Railway (NOT edge runtime)
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';

const db = drizzle({
  connection: process.env.DATABASE_URL,  // must contain -pooler hostname
  ws: ws
});

// drizzle.config.ts -- migrations use DIRECT connection
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT  // non-pooler hostname
  }
};
```

### Recommended Seed Script Pattern

```typescript
// scripts/seed.ts -- idempotent, safe to re-run
await db.transaction(async (tx) => {
  for (const emp of employees) {
    await tx.insert(users)
      .values({ clerkId: emp.clerkId, name: emp.name, role: emp.role })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { name: emp.name, role: emp.role }
      });
  }
});
```

### Retry Logic for Neon Cold Starts

```typescript
import retry from 'retry';

function queryWithRetry(queryFn: () => Promise<any>) {
  return new Promise((resolve, reject) => {
    const op = retry.operation({
      retries: 5,
      minTimeout: 4000,
      randomize: true
    });
    op.attempt(async () => {
      try {
        resolve(await queryFn());
      } catch (err) {
        if (!op.retry(err as Error)) {
          reject(op.mainError());
        }
      }
    });
  });
}
```

---

## 4. MICRO-BRIDGE READINESS

### Current State: Production-Grade API Gateway

The Bridge is architecturally solid for its current role (single-tenant QBO/QBT proxy). Key strengths:
- Fastify 5 with Undici connection pools
- Circuit breakers (Cockatiel) with per-service retry/timeout policies
- Auto-paginating QBO queries with 5-minute cache
- Atomic token file writes with proactive refresh
- Graceful shutdown, structured Pino logging
- Consistent JSON error/success response envelopes

### Gaps for Two-Compartment + Superset Enrichment Platform

| # | Gap | Severity | Phase | Status (v2.5.0 audit) |
|---|-----|----------|-------|------|
| B1 | Zero database code (no Postgres, no Drizzle, no ORM) | CRITICAL | Bridge Phase 1 | **PARTIAL** — NeonTokenStore/NeonAuditLogger stubs exist but throw "not implemented". DB abstraction layer designed, not wired. |
| B2 | Zero Clerk integration (static API key only) | CRITICAL | Bridge Phase 1 | **OPEN** — Commented stub in auth-v2.js. No @clerk packages installed. |
| B3 | Hardcoded employee mapping (16 employees in JS array) | HIGH | Bridge Phase 1 | **REMEDIED** — 16-employee array in employee-mapping-v2.js with 3-tier upgrade path (Neon → QBO → hardcoded fallback). |
| B4 | No enrichment registry API | HIGH | Bridge Phase 2 | **OPEN** — No /api/registry endpoints. |
| B5 | No master data CRUD API | HIGH | Bridge Phase 1 | **OPEN** — No /api/master endpoints. Individual QBO entity routes exist but no abstract master data layer. |
| B6 | No working data CRUD API | HIGH | Bridge Phase 2 | **REMEDIED** — QBO Customer/TimeActivity/Purchase/Invoice CRUD + QBT Timesheet CRUD fully implemented with TypeBox validation. |
| B7 | No app settings API | MEDIUM | Bridge Phase 2 | **OPEN** — No /api/settings endpoints. settings.json exists but empty. |
| B8 | No QBO/QBT scheduled sync | HIGH | Bridge Phase 1 | **OPEN** — No cron packages, zero scheduled sync. |
| B9 | `RateLimiterMemory` breaks with >1 replica | MEDIUM | Bridge Phase 3 | **OPEN** — Commented future code for RateLimiterPostgres not wired. |
| B10 | CORS open if `CORS_ORIGINS` not set | MEDIUM | Immediate | **REMEDIED** — Defaults to Railway domain in production. Warns if CORS_ORIGINS empty. |
| B11 | Reconciliation endpoints require zero auth | MEDIUM | Bridge Phase 1 | **REMEDIED** — Intentional design for Chrome extension compatibility. API key honored if sent. |
| B12 | No per-user QBO rate limit awareness | MEDIUM | Bridge Phase 3 | **PARTIAL** — Per-consumer tiers exist (80% of QBO 500/min). No per-user within app. |
| B13 | `@sinclair/typebox` installed but unused | LOW | Bridge Phase 2 | **REMEDIED** — 20+ TypeBox schemas wired to Fastify route validation. |
| B14 | No `GET /health` endpoint | HIGH | Bridge Phase 1 | **REMEDIED** — `/api/health` + `/api/health/detailed` + `/api/metrics` + `/api/reports`. |
| B15 | No `SIGTERM` handler | MEDIUM | Bridge Phase 1 | **REMEDIED** — Full graceful shutdown with SIGTERM/SIGINT, pool cleanup, 10s timeout. |
| B16 | No enrichment validation against registry | MEDIUM | Bridge Phase 2 | **OPEN** — Depends on B4 (registry). |
| B17 | No app field filtering (subscriptions) | MEDIUM | Bridge Phase 2 | **OPEN** — No `?app=` parameter filtering. |

> **Summary (v2.5.0):** 7 remedied (B3, B6, B10, B11, B13, B14, B15), 2 partial (B1, B12), 8 open (B2, B4, B5, B7, B8, B9, B16, B17). The 8 open gaps are all platform features (database, auth, sync, enrichment) — the Bridge is solid as a QBO/QBT proxy but lacks the Neon integration layer.

### Recommended Bridge Enhancement Order (Updated for v2.5.0)

```
Bridge Phase 1 (DB-1) -- Foundation
  DONE: CORS locked (env var + Railway domain default)
  DONE: GET /health + SIGTERM handler
  DONE: TypeBox schemas wired to routes
  1. Install drizzle-orm, @neondatabase/serverless, ws, drizzle-kit
  2. Wire NeonTokenStore + NeonAuditLogger stubs to actual Drizzle queries
  3. Create master data tables (employees, work_jobcodes + 6 infra)
  4. Add QBO/QBT scheduled sync (node-cron, 15-min during business hours)
  5. Add master data CRUD endpoints (/api/master/employees, /api/master/jobcodes)
  6. Add Clerk auth alongside API keys (uncomment auth-v2.js stub, install @clerk/backend)
  7. Add Clerk-to-employee matching (phone lookup + clerk_id linking)
  8. Upgrade employee-mapping-v2.js from hardcoded to Neon lookup (tier 1)

Bridge Phase 2 (DB-2) -- Enrichment + Working Data
  9. Create enrichment_fields + app_field_subscriptions tables
  10. Add enrichment registry API (/api/registry/*)
  11. Add enrichment validation (type checking against registry)
  12. Add app field filtering (?app=calexp5)
  13. Create CalExp5 working data tables (cal_*)
  14. Add CalExp5 working data API (/api/cal/*)
  15. Add bulk-upsert endpoints for localStorage migration
  16. Add app_settings table + API (/api/settings/*)

Bridge Phase 3 -- Scale + Polish
  17. Wire RateLimiterPostgres (replace createLimiter stub)
  18. Add per-user QBO rate limit awareness
  19. Create customers + vendors + properties master data tables
```

---

## 5. CONSOLIDATED ACTION ITEMS

### Immediate (Before Any Deployment)

| # | Action | Owner | Status |
|---|--------|-------|--------|
| A1 | Lock CORS on Bridge (`CORS_ORIGINS` env var) | Bridge session | DEFERRED |
| A2 | Add `railway.json` to CalExp5 | Claude | DONE (2026-03-14) |
| A3 | Create `.env.example` for CalExp5 | Claude | DONE (2026-03-14) |
| A4 | Fix SSL mode in BB_DB_STRATEGY.md | Claude | DONE (v1.2) |
| A5 | Fix PITR window docs | Claude | DONE (v1.2) |
| A6 | Add two-compartment model to BB_DB_STRATEGY.md | Claude | DONE (v1.3) |
| A7 | Add superset enrichment + Data Manager to BB_DB_STRATEGY.md | Claude | DONE (v1.3) |
| A8 | Update BB_CALEXP5_SCHEMA.md for new architecture | Claude | DONE (v1.1) |
| A9 | Set Railway spending limit | Sam | TODO |

### Phase Dependency Map

```
Bridge Phase 1 (DB-1) [Week 1-2]
  |
  +--> CalExp5 Phase 1 (Cal-1: Auth) [Week 2] -- can start mid-Bridge-1
  |
  +--> Bridge Phase 2 (DB-2) [Week 2-3] -- needs DB-1 complete
         |
         +--> CalExp5 Phase 2 (Cal-2: Working Data) [Week 3] -- needs DB-2 complete
         |
         +--> Data Manager v1 (DB-3) [Week 3-4] -- needs DB-2 complete
                |
                +--> CalExp5 Phase 3 (Cal-3: Dual-Write) [Week 4] -- needs Cal-2 complete
                       |
                       +--> CalExp5 Phase 4 (Cal-4: Offline) [Week 5]
                              |
                              +--> CalExp5 Phase 5 (Cal-5: PWA Polish) [Week 5-6]
```

**Hard dependencies:** Cal-2 CANNOT start before DB-2 is complete. Data Manager CANNOT start before DB-2 is complete. Cal-3 CANNOT start before Cal-2 is complete.

### Bridge Phase 1 (DB-1) -- Foundation (Week 1-2)

| # | Action | Target |
|---|--------|--------|
| BP1 | Add Neon + Drizzle to Bridge | Bridge |
| BP2 | Create master data tables in Neon | Neon |
| BP3 | Implement QBO/QBT scheduled sync (15-min cron) | Bridge |
| BP4 | Add master data CRUD API (`/api/master/*`) | Bridge |
| BP5 | Add Clerk auth alongside API keys | Bridge |
| BP6 | Migrate hardcoded employee mapping to Neon | Bridge |
| BP7 | Add `GET /health` + `SIGTERM` handler | Bridge |
| BP8 | Lock CORS + close open routes | Bridge |

### Bridge Phase 2 (DB-2) -- Enrichment + Working Data (Week 2-3)

| # | Action | Target |
|---|--------|--------|
| BP9 | Create enrichment_fields + app_field_subscriptions tables | Neon |
| BP10 | Add enrichment registry API (`/api/registry/*`) | Bridge |
| BP11 | Add enrichment validation (type checking) | Bridge |
| BP12 | Add app field filtering (`?app=calexp5`) | Bridge |
| BP13 | Create CalExp5 working data tables (`cal_*`) | Neon |
| BP14 | Add CalExp5 working data API (`/api/cal/*`) | Bridge |
| BP15 | Add `app_settings` table + API (`/api/settings/*`) | Bridge + Neon |
| BP16 | Wire TypeBox schemas on routes | Bridge |

### CalExp5 Phase 1 (Cal-1) -- Auth + Bridge Integration (Week 2)

| # | Action | Target |
|---|--------|--------|
| P1 | Install Clerk + jose packages | CalExp5 |
| P2 | Create Neon project, get connection strings | Neon dashboard (Sam) |
| P3 | Implement Clerk SMS OTP flow | CalExp5 |
| P4 | Add Clerk JWT verification middleware | CalExp5 server |
| P5 | Switch master data reads to Bridge API | CalExp5 |
| P6 | Configure custom domain for QBO OAuth callback | Railway + DNS |

### CalExp5 Phase 2 (Cal-2) -- Working Data Migration (Week 3, after DB-2 complete)

| # | Action | Target |
|---|--------|--------|
| P7 | Migrate `uploadedTimesheetsByUser` to Bridge API (PRIORITY) | CalExp5 |
| P8 | Migrate `data/settings.json` to `app_settings` via Bridge | CalExp5 |
| P9 | Implement dual-write (localStorage + Bridge API) | CalExp5 |
| P10 | Migrate manual hours, selected jobcodes to Bridge | CalExp5 |
| P11 | Add user-level isolation to IndexedDB cache | CalExp5 |
| P12 | Remove CalExp5 employee enrichment UI (point to Data Manager) | CalExp5 |

### CalExp5 Phase 4 (Cal-4) -- Offline + PWA (Week 5)

| # | Action | Target |
|---|--------|--------|
| P13 | Add Dexie.js sync queue for offline writes | CalExp5 |
| P14 | Add Workbox BackgroundSyncPlugin | CalExp5 |
| P15 | Add SyncStatusBar component | CalExp5 |
| P16 | Switch to `injectManifest` strategy | CalExp5 |
| P17 | Configure cache headers | CalExp5 |
| P18 | Lighthouse PWA audit -- target 90+ | CalExp5 |

### Data Manager v1 (DB-3, Week 3-4, after DB-2 complete)

| # | Action | Target |
|---|--------|--------|
| DM1 | Scaffold Express + vanilla HTML/CSS/JS app (BB UI System + Clerk) | Data Manager |
| DM2 | Master data grid views (employees, customers, vendors) | Data Manager |
| DM3 | Entity edit form with enrichment fields | Data Manager |
| DM4 | Schema field manager (create/edit/archive fields) | Data Manager |
| DM5 | App subscription manager | Data Manager |
| DM6 | Sync status + manual trigger button | Data Manager |
| DM7 | Deploy to Railway | Data Manager |
| DM8 | (v2) Inline grid editing + bulk operations | Data Manager |
| DM9 | (v2) Working data read-only views | Data Manager |
| DM10 | (v2) Audit log viewer + "Filled %" metrics | Data Manager |

---

## 6. RISK REGISTER (Updated)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| RK1 | Neon cold start delays Monday morning | HIGH | LOW | Sub-1s wake. Optional: cron ping. |
| RK2 | Duplicate timesheets from localStorage loss | MEDIUM | HIGH | Phase 2 priority: server-back via Bridge |
| RK3 | `pg_stat_statements` wiped on scale-to-zero | HIGH | LOW | Accept. Export manually if needed. |
| RK4 | Drizzle prepared statements fail through PgBouncer | MEDIUM | MEDIUM | Test early. Use inline queries if needed. |
| RK5 | Settings lost on Railway deploy | HIGH | HIGH | Phase 2: migrate to `app_settings` table via Bridge |
| RK6 | Zustand persist race condition | LOW | MEDIUM | Manual hydration with `onRehydratedStorage` |
| RK7 | QBO rate limit exhaustion | MEDIUM | MEDIUM | Add per-user rate awareness in Bridge Phase 3 |
| RK8 | No circuit breaker for Neon calls | MEDIUM | MEDIUM | Add Cockatiel breaker in Bridge Phase 3 |
| RK9 | Bridge down = all apps lose data access | LOW | HIGH | Railway auto-restart + IndexedDB read cache + write queue |
| RK10 | Data Manager UI is significant build | MEDIUM | MEDIUM | Phased delivery. v1 = basic grid + edit. v2 = inline editing + bulk. |
| RK11 | Enrichment JSONB becomes junk drawer | LOW | MEDIUM | Registry validates types. "Filled %" metric surfaces unused fields. |
| RK12 | Two apps write conflicting enrichment values | LOW | LOW | Superset model: one UI manages enrichment. Apps only read. |
| RK13 | Dual audit log (app-specific + shared) adds complexity | LOW | LOW | App-specific logs (`cal_audit_log`) have full detail. Shared `audit_log` has summary entries for cross-app visibility. CalExp5 writes to both via Bridge. |

---

## 7. WHAT THIS REPORT DOES NOT COVER

- Detailed Drizzle schema DDL for all master data tables -- see BB_PLATFORM_SCHEMA-v2.md v2.23
- CalExp5 working data schema -- see BB_CALEXP5_SCHEMA.md v1.2
- TS_Exp5 and ProjExp5 working data schemas -- design when those apps migrate (Phases 5-6)
- Cost optimization after initial deployment -- revisit after 2-3 billing cycles
- Load testing and performance benchmarks -- after Phase 1 deployed
- CI/CD pipeline configuration -- after GitHub integration set up
- Data Manager detailed UX design -- design during Phase 3

---

## 8. DATA MANAGER READINESS

### Overview

The Data Manager is a new React app providing a central admin UI for enrichment management, schema field management, master data viewing/editing, app settings, and sync controls. It is the primary interface for the superset enrichment model described in BB_DB_STRATEGY.md v1.4 Section 8.

### Prerequisites (must be complete before Data Manager work starts)

| Prerequisite | Source |
|-------------|--------|
| Bridge connected to Neon with master data tables | Bridge Phase 1 |
| QBO/QBT sync running on schedule | Bridge Phase 1 |
| Master data CRUD API endpoints live | Bridge Phase 1 |
| Enrichment registry tables created | Bridge Phase 2 |
| Enrichment registry API live | Bridge Phase 2 |
| Clerk auth on Bridge | Bridge Phase 1 |

### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Server | Express.js on localhost | Matches BB pattern (DocEngine, PorjExp5) |
| Frontend | Vanilla HTML/CSS/JS | BB UI System pattern — no build step, matches BB_DATA_MANAGER_SPEC.md v1.1 and BB_DataManager_Mockup.html |
| Auth | Clerk (admin role required) | Consistent auth across platform |
| State | Minimal — grid data fetched on tab switch, cached in memory | No state library needed for admin tool |
| Styling | BB UI System (#C8102E, #1A1A1A) | Consistent BB theme |
| Deployment | Railway (own service) | Same project as other BB apps |

> **Note:** Unlike CalExp5 (React + Vite), Data Manager follows BB's vanilla stack pattern used by DocEngine and PorjExp5. The mockup (BB_DataManager_Mockup.html) validates this approach — full grid, sidebar, enrichment editing in a single HTML file with no build tooling.

### Phased Delivery

**Data Manager v1 (Phase 3 of overall plan):**
- Master data grid views (table per entity type)
- Click-to-edit form with enrichment fields rendered from registry
- Schema field manager: list, create, archive fields
- App subscription list (read-only view of which apps use which fields)
- Sync status display + manual trigger button
- Basic app settings management

**Data Manager v2 (Phase 8 of overall plan):**
- Inline grid editing (edit directly in the table)
- Bulk operations (select multiple rows, set field value)
- Working data read-only views (browse CalExp5 schedules, TS_Exp5 timesheets, etc.)
- Audit log viewer with filters (entity, user, action, date range)
- "Filled %" dashboard showing enrichment data quality per field
- CSV/Excel export for reporting

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Large UI build | v1 is 5 core views. TanStack Table handles grid complexity. |
| Admin-only access | Clerk role check. Only `admin` role can access Data Manager. |
| Bridge API surface must be complete | Data Manager waits for Bridge Phase 2. No shortcuts. |

---

*Report generated 2026-03-13 from 5 research agents. Updated 2026-03-14 (v1.2): reconciled with BB_DB_STRATEGY.md v1.3. Updated 2026-03-14 (v1.3): cross-doc audit -- fixed driver contradiction, phase sequencing, added dependency map, composite QBT endpoints, rollback procedures, initial load strategy, bulk-upsert endpoints.*
