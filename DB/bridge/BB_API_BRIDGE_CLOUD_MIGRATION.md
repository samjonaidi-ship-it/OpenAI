# Mini_API_Bridge Cloud Migration Plan | v1.4 | 2026-03-01 | BB

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State](#2-current-state)
3. [Route Classification & Cloud Impact](#3-route-classification--cloud-impact)
4. [API Calling Patterns — QBO & QBT](#4-api-calling-patterns--qbo--qbt)
5. [Consumer Dependency Map](#5-consumer-dependency-map)
6. [Consumed Routes × Speed Classification](#6-consumed-routes--speed-classification)
7. [Route Duplication & Consolidation Opportunities](#7-route-duplication--consolidation-opportunities)
8. [Standardization Roadmap](#8-standardization-roadmap)
9. [What Changes vs. What Stays](#9-what-changes-vs-what-stays)
10. [Detailed Migration Steps](#10-detailed-migration-steps)
11. [Consumer Impact Analysis](#11-consumer-impact-analysis)
12. [User Experience Differences](#12-user-experience-differences)
13. [Performance Analysis](#13-performance-analysis)
14. [Security Changes](#14-security-changes)
15. [Backward Compatibility](#15-backward-compatibility)
16. [Rollback Plan](#16-rollback-plan)
17. [Cost Analysis](#17-cost-analysis)
18. [Risk Register](#18-risk-register)
19. [Timeline](#19-timeline)
20. [Post-Migration Monitoring](#20-post-migration-monitoring)
21. [API Optimization Roadmap](#21-api-optimization-roadmap)

---

## 1. Executive Summary

**What:** Move Mini_API_Bridge from Sam's desktop (`localhost:3100`) to Railway cloud hosting.

**Alternative:** See: BB_MICRO_BRIDGE_ARCHITECTURE v1.0 for the **rebuild path** — a lean, cloud-native replacement (~1,500 lines) built from scratch with Fastify, Cockatiel, Pino, and Undici. Consolidates 184 routes → 44. Same $5/mo cost, 95% less code.

**Why:**
- Every BB app currently dies when Sam's laptop is off or offline
- iPad/MacBook field tools need a permanent, always-on API gateway
- Future apps should be able to hit one URL instead of relying on tunnels
- Eliminates the "is Sam's laptop on?" problem forever

**Effort:** ~17 hours across 3 days

**Risk:** LOW — Changes are all configuration (paths, credentials, logging). Zero logic changes to the 184 API routes, OAuth refresh, middleware, or health checks.

**Key decision:** The same codebase runs locally AND in the cloud. `Run.bat` for local, `git push` for cloud. No separate versions.

**Post-cleanup codebase:** 27,057 lines across 84 files (dead code removed 2026-03-01).

---

## 2. Current State

### 2.1 What Mini_API_Bridge Is

A pure Node.js API gateway (v4.4.0, "High Uptime Edition") with **184 registered routes** (27,057 lines across 84 files post-cleanup) and only 2 npm dependencies (`ws`, `ioredis`). Custom HTTP server, middleware chain, rate limiting, circuit breakers. No Express.

### 2.2 What It Wraps

| External API | Routes | Speed Class | Actively Used By (9 projects scanned) |
|-------------|--------|-------------|---------------------------------------|
| **QuickBooks Online** | 72 (39%) | SINGLE/BATCH | TS_Latest (16), Project_Exp (12), BB-DocEngine (12), RevExp5 (9), Invoice_V2 (3), Binder_Exp (2), Chase_Exp (3) |
| **QuickBooks Time** | 28 (15%) | SINGLE/BATCH | TS_Latest (10), CalExp5 (5), RevExp5 (2), Invoice_V2 (3) |
| **Google Maps** | 18 (10%) | SINGLE | Binder_Exp (2) |
| **Google Vision** | 7 (4%) | SINGLE | **No active consumer** |
| **Claude AI** | 8 (4%) | SINGLE (2s+) | RevExp5 (1) |
| **OpenAI** | 7 (4%) | SINGLE (2s+) | **No active consumer** |
| **OSRM** | 6 (3%) | SINGLE | **No active consumer** |
| **Settings/Files** | 20 (11%) | SUPER FAST | TS_Latest, Project_Exp |
| **Health/Monitoring** | 12 (7%) | SUPER FAST | Project_Exp, BB-DocEngine, Invoice_V2, Chase_Exp |
| **Batch/WebSocket** | 8 (4%) | BATCH | TS_Latest only |
| **Estimator** | 2 (1%) | BATCH | **No active consumer** |

### 2.3 Who Uses It Today

| Consumer App | How It References Bridge | Routes Used | Route Breakdown |
|-------------|-------------------------|-------------|-----------------|
| **TS_Latest** | `process.env.API_BRIDGE_URL \|\| 'http://localhost:3100'` + `window.API_BASE` | **16+** (heaviest) | QBO 13, QBT 6, Batch 7, WebSocket 1 |
| **Project_Exp** | `process.env.MINI_API_URL \|\| 'http://localhost:3100'` + 9 hardcoded in JS | **13** | QBO 12 (Customer-only), Health 1 |
| **BB-DocEngine** | `process.env.MINI_API_URL \|\| 'http://localhost:3100'` + 10 hardcoded in HTML | **12** | QBO 12 (same pattern as Project_Exp) |
| **RevExp5** | `settings.apiPort` (configurable, default 3100) | **12** | QBO 9, QBT 2, AI 1 |
| **Invoice_Validate2** | `SETTINGS.bridgeUrl` (Chrome ext, configurable) | **7** | QBO 3 (recon), QBT 3 (labor), Health 1 |
| **CalExp5** | `API_TARGET = 'http://localhost:3100'` (server proxy) | **5** | QBT 5 (users, timesheets, jobcodes, PTO) |
| **Binder_Exp** | `import.meta.env.VITE_MINI_API_BRIDGE_URL \|\| 'http://localhost:3100'` | **4** (lightest active) | QBO 2 (customer search), Geo 2 (Places) |
| **Chase_Expense_Validator** | `SETTINGS.bridgeUrl` (Chrome ext, configurable) | **4** | QBO 3 (recon, bills, attachments), Health 1 |
| **Adobe eSigner** | No references | **0** | Standalone (Adobe Sign direct API) |
| **None** | ~125 routes (68%) have no active consumer | **~125** | AI 12, Vision 7, OSRM 6, legacy 17, etc. |

### 2.4 The Four Blockers

| # | Blocker | Locations | Impact |
|---|---------|-----------|--------|
| 1 | **Hardcoded `C:\` paths** | `config/defaults.js` (7 paths), `utils/file-ops.js` (6 paths), `utils/sanitize.js` (2 paths), `index.js` (port) | Won't resolve on Linux |
| 2 | **File-based credentials** | 6 files in `Credentials\` folder (QBO tokens, QBT config, Claude key, OpenAI key, Maps key, Vision key) | Files don't exist on Railway |
| 3 | **QBO token persistence** | `qbo-client-v2.js` — atomic write (temp → rename) to `qbo-tokens.json` | Tokens lost on redeploy without volume |
| 4 | **Error log unbounded** | `index.js:415-424` — `fs.appendFileSync()` with no rotation | Fills Railway disk |

---

## 3. Route Classification & Cloud Impact

Every route classified by speed and what it means for cloud migration.

```
CATEGORY        COUNT   LOCAL            CLOUD (+100ms)     IMPACT
════════        ═════   ═════            ══════════════     ══════
SUPER FAST ⚡    68      <50ms            100-150ms          +100ms (still imperceptible)
SINGLE 🎯        76      200-500ms        300-600ms          +100ms (minor, API latency dominates)
BATCH 📦         40      500ms-8s+        600ms-8s+          +100ms (negligible, lost in API time)
```

### Cloud Blockers: 20 Filesystem Routes

These routes assume local disk access and **will break in cloud**:

| # | Route | What It Does | Cloud Impact |
|---|-------|-------------|-------------|
| 1-3 | `/settings/load-file`, `/save-file`, `/validate-path` | Read/write arbitrary files | **BREAKS** — no local disk |
| 4-6 | `/file/read`, `/file/write`, `/read-file` | Read/write arbitrary files | **BREAKS** |
| 7-10 | `/load-file`, `/save-file`, `/validate-path`, `/load-aliases` | Legacy aliases (same ops) | **BREAKS** |
| 11-13 | `/load-settings`, `/save-settings`, `/list-settings` | JSON in data/ dir | **WORKS** if data/ on Railway volume |
| 14 | `/lunch-audit` | Read specific JSON file | **WORKS** if on volume |
| 15-17 | `/receipts/scan`, `/rename`, `/preview` | Local folder scanning | **BREAKS** — no local image folder |
| 18-19 | `/estimator/status`, `/export-excel` | Child process + .xlsx | **BREAKS** — no Windows COM |
| 20 | `/mapping/account-item` (POST) | In-memory Map (lost on restart) | **DATA LOSS** on redeploy |

**Resolution strategy:**
- 11 routes: Add Railway volume mount → works identically
- 7 routes: Local-only admin operations → disable in cloud with clear 503 message
- 2 routes (estimator): Replace COM with ExcelJS or keep local Bridge for this one task

### Routes That Just Work in Cloud (164 of 184 = 89%)

All routes that only call external APIs (QBO, QBT, Google, Claude, OpenAI, OSRM) work identically in cloud. They make outbound HTTPS calls — the bridge is just a proxy.

---

## 4. API Calling Patterns — QBO & QBT

### QBO — 8 Patterns, Fastest to Slowest

| Rank | Pattern | 1 HTTP Call Gets You | Rate Limit | We Use It? |
|------|---------|---------------------|------------|------------|
| 1 | **Webhooks** (push) | Instant change notification (ID only) | None (Intuit sends) | **NO** |
| 2 | **CDC** (Change Data Capture) | ALL changes across N entity types | 500/min | **NO** |
| 3 | **Batch API** (30 ops/call) | 30 mixed CRUD operations | **40/min** | YES (5 routes) |
| 4 | **Query + IN clause** | Up to 1,000 specific records | 500/min | YES (4 routes) |
| 5 | **Query + STARTPOSITION** | Up to 1,000 filtered records/page | 500/min | YES (most routes) |
| 6 | **Single GET by ID** | 1 record | 500/min, 10 concurrent | YES |
| 7 | **Single POST** (create/update) | 1 mutation | 500/min, 10 concurrent | YES |
| 8 | **Reports API** | 1 computed report (400K cell max) | **200/min** | YES (3 routes) |

**Key QBO facts:**
- Rate limit: 500 req/min per realmId (Batch: 40/min, Reports: 200/min)
- IN clause has undocumented string-length limit — chunk large lists
- CDC lookback: 30 days max, 1,000 objects max (no pagination — shorten window if exceeded)
- Webhooks: CloudEvents migration deadline **May 2026**. Aggregation interval configurable (was 5min default)
- Token refresh: Access token 1hr, refresh token 100-day rolling (5yr max). Refresh proactively every 55min

### QBT — 5 Patterns, Fastest to Slowest

| Rank | Pattern | 1 HTTP Call Gets You | Rate Limit | We Use It? |
|------|---------|---------------------|------------|------------|
| 1 | **last_modified_timestamps** | "Did anything change?" (timestamps only) | 300/5min | **NO** |
| 2 | **Batch POST/PUT** (200 objs) | 200 creates or updates | 300/5min | **NO** |
| 3 | **modified_since filter** | Only changed records since timestamp | 300/5min | Partially |
| 4 | **Standard GET + filters** | Up to 200 records/page | 300/5min | YES |
| 5 | **Supplemental data** | Free joined reference data on every response | 0 extra calls | Implicitly |

**Key QBT facts:**
- Rate limit: 300 req per 5-minute window per access token
- `last_modified_timestamps` = 1 lightweight call tells you if ANYTHING changed. Skip all other calls if no changes
- Standard endpoints accept arrays (up to 200 objects) — no separate batch endpoint needed
- Supplemental data (users, jobcodes) auto-included — disable with `supplemental_data=no` once cached
- No QBT-specific webhooks available — poll `last_modified_timestamps` on short interval instead

### What We're NOT Using (Biggest Opportunities)

| Pattern | Current Approach | Improvement | Effort |
|---------|-----------------|-------------|--------|
| **QBT `last_modified_timestamps`** | Every sync fetches full data regardless | 1 call first → skip everything if unchanged. Could eliminate 90%+ of QBT calls | ~2 hrs |
| **QBO CDC** | Each entity type queried separately (3-5 calls) | 1 CDC call returns ALL changes across ALL types | ~4 hrs |
| **QBT Batch writes** | Create/update timesheets 1 at a time | 1 call = 200 timesheets | ~3 hrs |
| **QBO Webhooks** | All sync is poll-based | Real-time push → follow-up read. Eliminates polling lag | ~8 hrs |

---

## 5. Consumer Dependency Map

> **v1.1 update:** Expanded from 3 → 9 projects scanned. Full per-project inventories in BB_API_BRIDGE_CONSUMER_CATALOGUE v1.0.

### Consumer Overview (All 9 Projects)

| Project | Routes | Services | Dependency | Architecture | Cloud Ready? |
|---------|--------|----------|------------|-------------|-------------|
| **TS_Latest** | 16+ | QBO+QBT+Batch+WS | HEAVY | Server proxy + direct client | Partial (configurable URL) |
| **Project_Exp** | 13 | QBO | HEAVY | Server proxy + hardcoded client | **NO** (9 hardcoded localhost) |
| **BB-DocEngine** | 12 | QBO | HEAVY | Server proxy + hardcoded client | **NO** (10 hardcoded localhost) |
| **RevExp5** | 12 | QBO+QBT+AI | HEAVY | Configurable port in Settings | YES |
| **Invoice_Validate2** | 7 | QBO+QBT | TIGHT | Chrome ext, configurable URL | YES |
| **CalExp5** | 5 | QBT only | FULL | Express proxy (cleanest) | YES (change 1 variable) |
| **Binder_Exp** | 4 | QBO+Geo | MODERATE | Env var `VITE_MINI_API_BRIDGE_URL` | YES (build-time config) |
| **Chase_Expense_Validator** | 4 | QBO | MODERATE | Chrome ext, configurable URL | YES |
| **Adobe eSigner** | 0 | None | NONE | Standalone | N/A |

### Hardcoded `localhost:3100` — Cloud Blockers in Consumer Code

| Project | File | Hardcoded Calls | Fix Required |
|---------|------|----------------|--------------|
| Project_Exp | `property.js` | 7 direct `fetch('http://localhost:3100/...')` | Route through `/api` proxy |
| Project_Exp | `client.js` | 2 direct `fetch('http://localhost:3100/...')` | Route through `/api` proxy |
| BB-DocEngine | `estimate-templates/index.html` | 9 direct `fetch('http://localhost:3100/...')` | Route through `/api` proxy |
| BB-DocEngine | `TM_agreement-V5.html` | 1 direct `fetch('http://localhost:3100/...')` | Route through `/api` proxy |
| BB-DocEngine | 22 debug scripts | Direct bridge calls | Low priority (dev-only) |

### Route Coverage (Updated)

```
CONSUMER COVERAGE                           ROUTES
════════════════                            ══════
Active (called by ≥1 app)   ████████████    ~59  (32%)
Unused (zero consumers)     ████████████████████████  ~125 (68%)
```

**68% of routes have no active consumer** (down from 75% after scanning 6 additional projects). Categories of unused routes:
- AI (Claude + OpenAI): 12 routes — only 1 now has a consumer (RevExp5 `/ai/claude/extract-json`)
- Geo (Vision + OSRM): 11 routes — only 2 now consumed (Binder_Exp places/autocomplete + details)
- QBO Advanced/Recon: ~15 routes — several now consumed (Chase, RevExp5, Invoice_V2 recon routes)
- Legacy (geocode, mileage): 9 routes — superseded by `/geo/*`
- Batch invoice variants: 4 routes — benchmarking variants (keep 1)
- Settings/File ops: ~20 routes — legacy aliases

---

## 6. Consumed Routes × Speed Classification

> See: BB_API_CALLING_MATRIX v1.2 § 9 for full route-by-route detail.

### 6.1 Speed Breakdown of Active Routes

```
CONSUMED ROUTES BY SPEED CLASS        COUNT    % OF CONSUMED
════════════════════════════════      ═════    ═════════════
SUPER FAST ⚡  (health, status, stubs)   7       12%
SINGLE 🎯     (one external API call)  31       53%
BATCH 📦      (multi-call, loops)      21       36%
                                       ──       ───
TOTAL CONSUMED                         59      100%
```

**Compare to the full bridge:**

```
CLASS          ALL 184 ROUTES    59 CONSUMED    CONSUMPTION RATE
═══════════    ══════════════    ═══════════    ════════════════
SUPER FAST       68 (37%)         7 (12%)       10% consumed
SINGLE           76 (41%)        31 (53%)       41% consumed
BATCH            40 (22%)        21 (36%)       53% consumed
```

**Key insight:** BATCH routes are consumed at 5× the rate of SUPER FAST (53% vs 10%). The complex multi-call routes that took the most effort to build are the ones most actively used.

### 6.2 Migration Impact by Speed Class

| Speed Class | Cloud Latency Hit | User-Noticeable? | Action Required |
|-------------|------------------|-------------------|-----------------|
| **SUPER FAST** (7 routes) | +100ms (was <10ms) | No — health/status only | None |
| **SINGLE** (31 routes) | +100ms (was 200-500ms) | No — still sub-second | None |
| **BATCH** (21 routes) | +100ms (was 500ms-10s+) | No — external API dominates | None |

BATCH routes (53% consumption rate) are where apps spend the most time — and they're LEAST affected by the ~100ms cloud hop because external API latency (500ms-10s+) dominates.

### 6.3 Redis Dependency (Batch Session System)

Of 21 consumed BATCH routes, only **6 use Redis** — all `/batch/sessions/*` routes + WebSocket, consumed exclusively by TS_Latest:

| Route | Redis Usage | Consumer |
|-------|------------|----------|
| `/batch/sessions` | Session CRUD | TS_Latest |
| `/batch/sessions/{id}` | Session lookup | TS_Latest |
| `/batch/sessions/{id}/command` | Command queue | TS_Latest |
| `/batch/sessions/{id}/results` | Result storage | TS_Latest |
| `/batch/sessions/{id}/audit` | Audit log | TS_Latest |
| `/ws/batch/{id}` | Pub/sub | TS_Latest |

**Cloud impact:** Railway Redis add-on ($5/mo) required ONLY if TS_Latest batch operations need cloud access. The other 15 BATCH routes are stateless multi-step HTTP calls — no Redis needed.

### 6.4 Misclassified Routes (Watch List)

| Route | Classified As | Actually Behaves Like | Consumers |
|-------|--------------|----------------------|-----------|
| `/qbo/test` | SUPER FAST | SINGLE (hits QBO API) | TS_Latest |
| `/qbt/test` | SUPER FAST | SINGLE (hits QBT API) | TS_Latest |
| `/qbt/validate-labor-segments` | SUPER FAST | **STUB** (returns redirect) | InvV2 (auto-fires every 600ms!) |

**InvV2 stub issue:** `content-v58.js` hits the stub endpoint on every modal open. After cloud migration, each hit costs ~100ms round-trip instead of <5ms. Fix: implement the handler or remove the call.

---

## 7. Route Duplication & Consolidation Opportunities

> See: BB_API_CALLING_MATRIX v1.2 § 10 for full analysis.

### 7.1 Duplication Summary

```
DUPLICATION TYPE                   ROUTE PAIRS    WASTED ROUTES    EFFORT TO FIX
═══════════════                    ═══════════    ═════════════    ═════════════
/api/ prefix inconsistency         6 pairs        6 extra routes   LOW (alias)
GET/POST alias inflation           12+ pairs      12+ routes       NONE (leave)
Same data, different routes        4 groups       8-10 wasted      MEDIUM
Legacy → current superseded        3 pairs        3 dead routes    LOW (remove)
                                                  ──────────
                                                  ~29 routes could consolidate to ~15
```

### 7.2 `/api/` Prefix Split (Cloud Migration Consideration)

The bridge mounts routes BOTH with and without `/api/` prefix. Different consumers use different prefixes for the **same handler**:

| Without `/api/` | With `/api/` | Who Uses Which |
|-----------------|-------------|----------------|
| `/health` | `/api/health` | PExp,DocE vs InvV2,Chase |
| `/qbo/customers` | `/api/qbo/customers` | TS,PExp,DocE vs Binder |
| `/qbo/customers/search` | `/api/qbo/customers/search` | PExp,DocE vs Binder |
| `/qbo/query` | `/api/qbo/query` | TS,PExp,DocE vs RevExp5 |
| `/qbo/attachment-fetch` | `/api/qbo/attachment-fetch` | — vs RevExp5,Chase |
| `/qbt/validate-labor-exact` | `/api/qbt/validate-labor-exact` | — vs RevExp5,InvV2 |

**Migration impact:** Both prefix variants must continue working after cloud deploy. Standardize on `/api/` prefix post-migration.

### 7.3 Customer Data: 7 Routes → 2

| Route | Consumers | Notes |
|-------|-----------|-------|
| `/qbo/customers` | TS, PExp, DocE | All active customers |
| `/api/qbo/customers` | PExp*, DocE*, Binder | Same handler, `/api/` alias |
| `/qbo/customers/search` | PExp, DocE | Filtered by name |
| `/api/qbo/customers/search` | Binder | Same handler, `/api/` alias |
| `/qbo/list/Customer` | TS | Generic entity route |
| `/qbo/list/{entityType}` | PExp, TS, DocE | Same when type=Customer |
| `/qbo/Customer/{id}` | PExp (5×), DocE (6×) | Single by ID |

**Post-migration target:** Consolidate to 2 routes (`/api/qbo/customers` + `/api/qbo/customers/search`).

### 7.4 Entity List & Token Refresh Duplication

**Entity lists (TS_Latest):** Uses BOTH dedicated (`/qbo/employees`) AND generic (`/qbo/list/Employee`) for identical results. 6 routes → 1 (`/qbo/list/:entityType`).

**Token refresh:** 3 routes (`/qbo/refresh` GET, `/qbo/refresh` POST, `/qbo/refresh-token` POST), all called by different TS_Latest files, all identical. Consolidate to 1: `POST /api/qbo/refresh`.

### 7.5 Legacy Routes Still Active

| Legacy Route | Superseded By | Still Used By |
|-------------|--------------|---------------|
| `/qbo/reconciliation-status` | `/qbo/recon-enhanced` | InvV2 (archive only) |
| `/qbt/validate-labor` | `/qbt/validate-labor-exact` | InvV2 (archive only) |
| `/qbt/validate-labor-segments` | N/A (**stub**) | InvV2 (active — auto-fires!) |

**Migration decision:** Leave legacy routes in cloud deployment for now. Flag for post-migration cleanup (Phase 1 of Standardization Roadmap).

---

## 8. Standardization Roadmap

> See: BB_API_CALLING_MATRIX v1.2 § 11 for implementation details.

### Pre-Migration (Before Cloud Deploy)

| Phase | Action | Effort | Impact |
|-------|--------|--------|--------|
| **1. Zero-Risk Cleanup** | Remove 3 legacy stubs, fix InvV2 auto-fire | 1-2 hrs | -3 dead routes |

### Post-Migration (After Cloud Is Stable)

| Phase | Action | Effort | Impact |
|-------|--------|--------|--------|
| **2. Prefix Standardization** | All new code uses `/api/`, deprecation log for non-prefixed | 3-4 hrs | -6 alias routes |
| **3. TS_Latest Consolidation** | Generic `/qbo/list/:entityType` + single refresh route | 4-6 hrs | -8 routes |
| **4. Customer Route Consolidation** | Standardize across all projects | 6-8 hrs | -5 routes |
| **5. Shared Client Package** (optional) | `bb-bridge-client` npm package with typed methods | 8-12 hrs | Central config + typed API |

### Consolidation Impact

```
                    BEFORE          AFTER PHASE 4     SAVINGS
                    ═══════         ═══════════════   ═══════
Unique consumed      59 routes       ~44 routes        -25%
Customer routes       7               2                -71%
Entity list routes    7               1 (generic)      -86%
Refresh routes        3               1                -67%
Legacy dead routes    3               0                -100%
Hardcoded localhost  19 calls         0                -100%
```

**Phases 2-5 are EASIER after cloud migration** because all consumers will already have centralized URL config (the cloud URL), and hardcoded `localhost:3100` calls will already be removed.

---

## 9. What Changes vs. What Stays

### 3.1 What STAYS (Zero Changes)

| Component | Lines | Why It's Already Cloud-Ready |
|-----------|-------|------------------------------|
| All 184 API route handlers | ~8,000 | Pure HTTP proxy — request in, transform, forward to external API, return response |
| QBO OAuth2 refresh logic | ~250 | Pure HTTPS to `oauth.platform.intuit.com` — no OS dependency |
| QBT API calls | ~380 | Pure HTTPS to `rest.tsheets.com` |
| AI proxying (Claude + OpenAI) | ~500 | Pure HTTPS forwarding |
| Google Maps/Vision | ~400 | Pure HTTPS calls |
| OSRM routing | ~100 | Calls external public API |
| Rate limiter (600 req/min) | ~100 | In-memory, works anywhere |
| Circuit breaker | ~150 | In-memory state |
| Input validation (15+ validators) | ~256 | Pure JavaScript |
| Query sanitization | ~319 | Pure JavaScript |
| Security headers (HSTS, CSP, etc.) | ~100 | Standard HTTP headers |
| Request ID middleware | ~50 | UUID generation |
| Body parser | ~80 | Standard JSON/form parsing |
| WebSocket server (diagnostic) | ~138 | `ws` library, works on Linux |
| Health/status/metrics endpoints | ~200 | Already implemented |
| Graceful shutdown (SIGTERM) | ~40 | Already handles signals |
| In-memory log buffer (1000 entries) | ~200 | In-memory circular buffer |

**Total unchanged: ~11,000 lines (>95% of codebase)**

### 3.2 What CHANGES

| Component | Current | After | Lines Changed |
|-----------|---------|-------|---------------|
| `config/defaults.js` | 7 hardcoded `C:\` paths | `process.env.X \|\| 'C:\...'` fallback | ~30 |
| `config/index.js` | `loadApiKey(filePath)` reads .txt | `process.env.X \|\| loadApiKey(filePath)` | ~20 |
| `server/index.js` | `PORT = 3100` | `process.env.PORT \|\| 3100` | 1 |
| `server/index.js` | `fs.appendFileSync` error log | `console.error` (Railway captures) + env flag | ~15 |
| `services/qbo-client-v2.js` | Hardcoded TOKEN_PATH | `process.env.QBO_TOKENS_PATH \|\| local` | ~5 |
| `services/qbt-client.js` | Hardcoded CONFIG_PATH | `process.env.QBT_CONFIG_PATH \|\| local` | ~5 |
| `utils/file-ops.js` | 6 hardcoded ALLOWED_DIRS | `process.env.BASE_DIR`-based | ~15 |
| `utils/sanitize.js` | 2 hardcoded allowed paths | `process.env.BASE_DIR`-based | ~10 |
| `middleware/cors.js` | `Allow-Origin: *` | `process.env.ALLOWED_ORIGINS \|\| '*'` | ~10 |
| New: `railway.json` | — | Build + deploy config | ~10 |
| New: `.env.example` | — | Documents all env vars | ~30 |
| **Total changed** | | | **~150 lines** |

---

## 10. Detailed Migration Steps

### Step 1: Path Abstraction (3 hours)

**File: `server/config/defaults.js`**

```javascript
// BEFORE (7 hardcoded paths):
qbt: { configPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\QB_\\qbt-config.json' }
qbo: { tokensPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\QB_\\qbo-tokens.json' }
claude: { keyPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\Claude API.txt' }
openai: { keyPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\OpenAI API.txt' }
maps: { keyPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\GoogleMap_API.txt' }
vision: { keyPath: 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\Google Vision API.txt' }
geocode: { cachePath: './data/geocode-cache.json' }
logs: { dir: './logs' }

// AFTER (env var with local fallback):
qbt: { configPath: process.env.QBT_CONFIG_PATH || 'C:\\Users\\samjo\\...\\qbt-config.json' }
qbo: { tokensPath: process.env.QBO_TOKENS_PATH || 'C:\\Users\\samjo\\...\\qbo-tokens.json' }
claude: { keyPath: process.env.CLAUDE_API_KEY ? null : 'C:\\Users\\samjo\\...\\Claude API.txt' }
// (null = key comes from env, not file)
```

**File: `server/config/index.js`**

```javascript
// BEFORE:
function loadApiKey(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim();
}

// AFTER:
function loadApiKey(envVar, filePath) {
  if (process.env[envVar]) return process.env[envVar];
  if (filePath && fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8').trim();
  return null;
}
```

**File: `utils/file-ops.js`**

```javascript
// BEFORE:
const ALLOWED_DIRS = [
  'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge',
  'C:\\Users\\samjo\\Desktop\\Project_Exp',
  // ... 4 more hardcoded paths
];

// AFTER:
const ALLOWED_DIRS = process.env.ALLOWED_DIRS
  ? process.env.ALLOWED_DIRS.split(',')
  : [
      'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge',
      'C:\\Users\\samjo\\Desktop\\Project_Exp',
      // ... local fallbacks preserved
    ];
```

### Step 2: API Key Migration (1 hour)

| Key | Env Var Name | Current Source |
|-----|-------------|----------------|
| Claude | `CLAUDE_API_KEY` | `Credentials/Claude API.txt` |
| OpenAI | `OPENAI_API_KEY` | `Credentials/OpenAI API.txt` |
| Google Maps | `GOOGLE_MAPS_API_KEY` | `Credentials/GoogleMap_API.txt` |
| Google Vision | `GOOGLE_VISION_API_KEY` | `Credentials/Google Vision API.txt` |

Simple pattern in `config/index.js`:
```javascript
claude: { apiKey: loadApiKey('CLAUDE_API_KEY', defaults.claude.keyPath) }
```

### Step 3: Port Configuration (15 minutes)

```javascript
// server/index.js line 45
// BEFORE:
const PORT = 3100;

// AFTER:
const PORT = parseInt(process.env.PORT, 10) || 3100;
```

### Step 4: QBO Token Persistence (2 hours)

The hardest change. QBO uses rotating refresh tokens — each refresh invalidates the previous one.

**Current flow:**
1. Load tokens from file on startup
2. Every 60 seconds, check if access token expires within 10 minutes
3. If yes, POST to Intuit, get new access + refresh tokens
4. Atomic write: temp file → `fs.renameSync()` → `qbo-tokens.json`

**Cloud flow (Railway persistent volume):**
- Mount volume at `/app/data`
- Change `TOKEN_PATH` to `process.env.QBO_TOKENS_PATH || '/app/data/qbo-tokens.json'`
- Atomic write pattern (`temp → rename`) already works on Linux
- Volume survives container restarts and redeploys

```javascript
// services/qbo-client-v2.js
// BEFORE:
const TOKEN_PATH = 'C:\\Users\\samjo\\...\\qbo-tokens.json';

// AFTER:
const TOKEN_PATH = process.env.QBO_TOKENS_PATH
  || path.join(__dirname, '..', '..', 'Credentials', 'QB_', 'qbo-tokens.json');
```

**Same change for QBT** in `services/qbt-client.js`.

**Initial token seeding:**
1. Copy current `qbo-tokens.json` from desktop to Railway volume (one-time)
2. After that, the cloud instance self-manages token refresh
3. Desktop instance continues with its own local file

**CRITICAL:** Only ONE instance can run against QBO production at a time. See Section 9.

### Step 5: Error Logging (2 hours)

```javascript
// server/index.js lines 415-453
// BEFORE:
const logPath = path.join(__dirname, '..', 'logs', 'errors.log');
fs.appendFileSync(logPath, `[${ts}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n\n`);

// AFTER:
if (process.env.LOG_TO_FILE === 'true') {
  const logPath = path.join(process.env.LOG_DIR || './logs', 'errors.log');
  fs.appendFileSync(logPath, `[${ts}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}\n\n`);
} else {
  console.error(`[${ts}] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`);
}
```

Railway automatically captures stdout/stderr with timestamps, searchable in the dashboard. No need for file logging in cloud.

### Step 6: CORS Hardening (1 hour)

```javascript
// middleware/cors.js
// BEFORE:
res.setHeader('Access-Control-Allow-Origin', '*');

// AFTER:
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
const origin = req.headers.origin;
if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
}
```

### Step 7: Railway Configuration (30 minutes)

**`railway.json`:**
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1
  }
}
```

**IMPORTANT: `numReplicas: 1`** — NEVER scale to 2+ replicas. QBO rotating tokens mean two instances would fight over token refresh and break each other.

### Step 8: Persistent Volume (30 minutes)

```
Railway Dashboard → Project → Volume → Add
  Mount path: /app/data
  Size: 1 GB (plenty — tokens are <10KB)
```

### Step 9: Environment Variables (30 minutes)

Set in Railway dashboard:

```
# Core
PORT=3100
NODE_ENV=production
LOG_TO_FILE=false

# Token persistence (Railway volume)
QBO_TOKENS_PATH=/app/data/qbo-tokens.json
QBT_CONFIG_PATH=/app/data/qbt-config.json

# API Keys (values, not file paths)
CLAUDE_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_MAPS_API_KEY=AIzaSy...
GOOGLE_VISION_API_KEY=AIzaSy...

# QBO OAuth (for token refresh)
QBO_CLIENT_ID=ABUgapEhNvhcHMPaZOhZ9Co2SLY9KVPkK8qOrrYhxbmAntjwUy
QBO_CLIENT_SECRET=8UoxO76RNAsjq7eLm4MrnaA2tzWRzXXoCkouRQVL
QBO_REALM_ID=9130351993370046
QBO_ENVIRONMENT=production

# QBT (static token)
QBT_ACCESS_TOKEN=S.14__1a0894249929608432522b8d807f4eb76afd8ab2
QBT_BASE_URL=https://rest.tsheets.com/api/v1

# Security
ALLOWED_ORIGINS=https://bb-bridge.up.railway.app,http://localhost:3460,http://localhost:3035
API_KEY=<generate-a-random-key-for-auth>

# File ops (Railway has no local project dirs)
ALLOWED_DIRS=/app/data
BASE_DIR=/app
```

### Step 10: Upload Initial Tokens (15 minutes)

```bash
# One-time: copy current tokens to Railway volume
railway volume cp ./Credentials/QB_/qbo-tokens.json /app/data/qbo-tokens.json
railway volume cp ./Credentials/QB_/qbt-config.json /app/data/qbt-config.json
```

### Step 11: Add API Key Auth Middleware (30 minutes — NEW)

Currently the bridge has no authentication (relies on localhost-only access). On the internet, it needs a gate:

```javascript
// middleware/api-auth.js
module.exports = function apiAuth(req, res) {
  // Skip health endpoints (monitoring)
  if (req.url === '/health' || req.url === '/status') return true;

  // Skip if no API_KEY configured (backward compat for local)
  const requiredKey = process.env.API_KEY;
  if (!requiredKey) return true;

  const providedKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (providedKey === requiredKey) return true;

  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid API key required' }));
  return false;
};
```

Consumer apps add the key to their requests:
```javascript
// In Project_Exp, TS_Latest, Binder_Exp:
headers: { 'X-API-Key': process.env.BRIDGE_API_KEY || '' }
```

### Step 12: Test All Endpoints (4 hours)

Run the built-in test suite:
```
GET https://bb-bridge.up.railway.app/test
```
This already tests QBO, QBT, Claude, OpenAI, Maps, Vision, OSRM connections. Then manually verify the critical paths used by consumer apps.

---

## 11. Consumer Impact Analysis

### 5.1 What Each App Needs to Change

#### Project_Exp

| File | Current | After | Effort |
|------|---------|-------|--------|
| `server/server.js:54` | `process.env.MINI_API_URL \|\| 'http://localhost:3100'` | Set `MINI_API_URL=https://bb-bridge.up.railway.app` in `.env` | 0 code changes |
| `services/qbo-service-v3.js:9` | `'http://localhost:3100'` default | Already uses constructor param from server.js | 0 code changes |
| `public/js/property.js` (12 refs) | Hardcoded `http://localhost:3100` | Change to use `window.API_BASE` or centralized config | **~30 min** |
| `public/js/client.js` (2 refs) | Hardcoded `http://localhost:3100` | Same centralization | **~10 min** |
| **Add API key header** | Not present | Add `X-API-Key` header to fetch calls | **~30 min** |
| **Total** | | | **~1 hour** |

#### TS_Latest

| File | Current | After | Effort |
|------|---------|-------|--------|
| `server/config/constants.js:19` | `process.env.API_BRIDGE_URL \|\| 'http://localhost:3100'` | Set `API_BRIDGE_URL=https://bb-bridge.up.railway.app` in `.env` | 0 code changes |
| `public/js/settings-module.js` | Uses `window.API_BASE` | Set `API_BASE` to cloud URL in settings or init | **~15 min** |
| `server/utils/validators.js` | References `Mini_API_Bridge` in path validation | No change needed (server-side path, not API URL) | 0 |
| **Add API key header** | Not present | Add to all `window.API_BASE` fetch calls | **~30 min** |
| **Total** | | | **~45 min** |

#### Binder_Exp

| File | Current | After | Effort |
|------|---------|-------|--------|
| `src/client/src/utils/api.ts:4` | `import.meta.env.VITE_MINI_API_BRIDGE_URL \|\| 'http://localhost:3100'` | Set `VITE_MINI_API_BRIDGE_URL=https://bb-bridge.up.railway.app` in `.env` | 0 code changes |
| **Add API key header** | Not present | Add `X-API-Key` to `fetchJson` helper | **~15 min** |
| **Total** | | | **~15 min** |

#### Adobe eSigner

No direct references to Mini_API_Bridge found. **Zero changes needed.**

### 5.2 Summary: Consumer Updates

| App | Code Changes | Config Changes | Total Effort |
|-----|-------------|----------------|-------------|
| Project_Exp | Centralize 14 hardcoded URLs + add auth header | Set env var | ~1 hour |
| TS_Latest | Add auth header to fetches | Set env var | ~45 min |
| Binder_Exp | Add auth header to fetchJson | Set env var | ~15 min |
| Adobe eSigner | None | None | 0 |
| **Total** | | | **~2 hours** |

---

## 12. User Experience Differences

### 6.1 What Sam Sees

| Scenario | Before (Local) | After (Cloud) | Better/Worse/Same |
|----------|---------------|---------------|-------------------|
| **Normal daily use** | Open Run.bat → Bridge starts → apps work | Apps work immediately (cloud always on) | **BETTER** — no startup ritual |
| **App startup speed** | Instant (localhost) | ~100-300ms per API call (network hop) | **Slightly slower** — see Section 7 |
| **QBO customer search** | Instant response | +100-200ms | Same feel (still <500ms total) |
| **Timesheet loading** | Instant response | +100-200ms | Same feel |
| **Google Maps geocode** | ~200ms (via bridge) | ~200ms (same external API latency) | **SAME** — network hop is noise vs Google's latency |
| **AI calls (Claude/OpenAI)** | 2-10 seconds (AI thinking) | 2-10 seconds (same) | **SAME** — AI latency dominates |
| **Excel COM export** | Works (uses Bridge estimator route) | **File route disabled** (no Windows) | **DIFFERENT** — see 6.3 |
| **Laptop off, crew needs data** | Nothing works | Everything works | **MUCH BETTER** |
| **Laptop sleeping/closed** | Tunnel dies, crew blocked | Everything works | **MUCH BETTER** |
| **Power outage at office** | All BB apps dead | Everything works (cloud) | **MUCH BETTER** |
| **Deploying updates** | Restart Run.bat | `git push` → auto-deploy ~60s | **BETTER** |
| **Error debugging** | Read `logs/errors.log` (368MB!) | Railway dashboard (searchable, timestamped) | **MUCH BETTER** |
| **Token refresh monitoring** | Check console output or log file | Railway dashboard metrics | **BETTER** |

### 6.2 What Crew Sees (iPad / MacBook / Phone)

| Scenario | Before (Tunnel) | After (Cloud) | Better/Worse/Same |
|----------|----------------|---------------|-------------------|
| **First-time access** | Need tunnel URL, Sam must configure | Open permanent URL | **MUCH BETTER** |
| **Sam's laptop is off** | Nothing works, wait for Sam | Everything works | **MUCH BETTER** |
| **On a construction site** | Pray the tunnel connects | Same URL, always available | **MUCH BETTER** |
| **Switching WiFi/cellular** | Tunnel might drop | Cloud URL reconnects naturally | **BETTER** |
| **API response time** | ~50ms tunnel overhead | ~100-200ms cloud | **Slightly slower** but still fast |

### 6.3 Features That Change

| Feature | Local Behavior | Cloud Behavior | Workaround |
|---------|---------------|----------------|-----------|
| **Excel COM export** (`/estimator/export-excel`) | Calls PowerShell COM → pixel-perfect .xlsx | Route returns 503 (no Windows COM on Linux) | ExcelJS fallback (already exists in Binder), or keep local Bridge for this one route |
| **File read/write** (`/file/read`, `/file/write`) | Reads/writes Sam's local files | Limited to Railway volume only | These routes are admin-only; Sam uses locally |
| **Settings file I/O** (`/settings`) | Reads from local disk | Reads from Railway volume | Copy settings to volume on deploy |
| **Receipt/doc scanning** | Scans local folder, previews local images | Only works with uploaded files | Already not used by crew |
| **Geocode cache** | File-based, persistent across restarts | File-based on volume, same behavior | **SAME** |

### 6.4 The "Feel" Summary

For **95% of daily use** (QBO queries, timesheet operations, geocoding, AI calls), the experience is **identical or better**. The cloud URL is always available, requires no startup ritual, and works from any device.

The **5% that changes** is Windows-specific operations (Excel COM, local file access) which are desktop-only admin tasks anyway. These can either stay on the local Bridge instance or get ExcelJS fallbacks.

---

## 13. Performance Analysis

### 7.1 Latency Comparison

```
LOCAL (current):
  Browser → localhost:3100 → Intuit API → response
  [~1ms]      [~0ms]        [~200ms]     = ~201ms total

CLOUD:
  Browser → Railway → Intuit API → response
  [~1ms]   [~100ms]   [~200ms]    = ~301ms total
                ↑
          Network hop to Railway datacenter
```

**The extra ~100ms is the cost of cloud.** But context matters:

| API Call Type | External API Latency | Extra Cloud Hop | % Increase | Noticeable? |
|--------------|---------------------|-----------------|-----------|-------------|
| QBO Customer search | 200-400ms | +100ms | 25-50% | No — still sub-second |
| QBO Customer create | 300-500ms | +100ms | 20-33% | No |
| QBT Timesheet list | 200-300ms | +100ms | 33-50% | No — still sub-second |
| Google Geocode | 100-300ms | +100ms | 33-100% | No — still sub-second |
| Google Places autocomplete | 50-150ms | +100ms | 67-200% | **Maybe** — autocomplete is latency-sensitive |
| Claude AI chat | 2,000-10,000ms | +100ms | 1-5% | No — AI latency dominates |
| OpenAI chat | 1,000-5,000ms | +100ms | 2-10% | No |
| Health check | 1-5ms | +100ms | 2000-10000% | No — not user-facing |

**Bottom line:** The only call where the extra hop *might* be noticeable is Google Places autocomplete (typing address and expecting instant suggestions). Mitigation: add client-side debounce (300ms), which already exists in most implementations.

### 7.2 Throughput

| Metric | Local | Railway ($5 plan) |
|--------|-------|-------------------|
| Concurrent requests | Unlimited (Sam's machine) | 512 MB RAM, ~200 concurrent |
| Rate limit | 600 req/min (code-enforced) | Same (code-enforced) |
| CPU | Full laptop CPU | 0.5 vCPU (shared) |
| Peak users | 1 (Sam) | 5-10 (Sam + crew) |

**BB's 5-10 users will never stress even the cheapest Railway plan.** The 600 req/min rate limit is more than enough — peak usage is probably 10 req/min.

### 7.3 Cold Start

Railway containers sleep after 10 minutes of inactivity on the Hobby plan:

| Scenario | Response Time |
|----------|-------------|
| Warm (container running) | Normal (~100-300ms) |
| Cold start (first request after idle) | **~3-5 seconds** (container boots, tokens load, API tests run) |

**Mitigation options:**
1. **Keep-alive ping** — cron job hits `/health` every 5 minutes (free, prevents sleep)
2. **Railway Pro plan** ($20/mo) — containers never sleep
3. **Accept it** — first request of the day takes 3-5 seconds, all subsequent are instant

**Recommendation:** Add a keep-alive ping. Free and solves the problem completely.

```javascript
// Add to any consumer app's server startup:
setInterval(() => fetch('https://bb-bridge.up.railway.app/health').catch(() => {}), 5 * 60 * 1000);
```

### 7.4 Availability

| Concern | Local | Railway |
|---------|-------|---------|
| Uptime | Depends on Sam's laptop | 99.9% SLA (Railway) |
| Auto-restart on crash | Run.bat restarts | Railway auto-restarts |
| Blue-green deploys | Not possible | Default (zero-downtime) |
| Monitoring | Check console | Dashboard + alerts |
| Backup | Manual | Auto (persistent volume snapshots) |

---

## 14. Security Changes

### 8.1 Before vs. After

| Aspect | Local (Current) | Cloud (After) |
|--------|----------------|---------------|
| **Network exposure** | localhost only — invisible to internet | Public URL — visible to internet |
| **Authentication** | None (trusted network) | API key middleware (`X-API-Key` header) |
| **Transport** | HTTP (plaintext, localhost) | HTTPS (TLS, Railway auto-cert) |
| **CORS** | `Allow-Origin: *` (fine for localhost) | Whitelist specific origins |
| **Credentials storage** | Plain text files on disk | Railway encrypted env vars |
| **Token files** | Read/write permission on disk | Railway volume (container-isolated) |
| **Rate limiting** | 600 req/min (code-enforced) | Same + Railway DDoS protection |
| **Security headers** | HSTS, CSP, X-Frame-Options | Same (already in middleware) |

### 8.2 New Threat Surface

| Threat | Risk | Mitigation |
|--------|------|-----------|
| **Unauthorized API access** | MEDIUM — public URL | API key auth middleware (Step 11) |
| **API key leaked in client JS** | LOW — internal tool, 5 users | Key rotation if compromised, rate limiting |
| **QBO token theft** | LOW — in Railway env vars, encrypted | Railway encrypts at rest, not in logs |
| **DDoS** | LOW — nobody knows the URL | Railway DDoS protection + rate limiting |
| **MITM** | NONE — TLS everywhere | Railway auto-TLS |

### 8.3 What's Actually MORE Secure

- **Credentials no longer in plain text files** on a laptop that could be stolen
- **HTTPS instead of HTTP** — even for internal traffic
- **Encrypted env vars** instead of readable .txt files
- **CORS whitelist** instead of wildcard
- **API key auth** instead of none
- **Railway access controls** — only Sam can access dashboard/env vars

---

## 15. Backward Compatibility

### 9.1 The Golden Rule: Same Codebase, Two Modes

```javascript
// Every changed line follows this pattern:
const TOKEN_PATH = process.env.QBO_TOKENS_PATH
  || 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\QB_\\qbo-tokens.json';
```

- **Cloud:** env var is set → uses Railway volume path
- **Local:** env var not set → uses existing Windows path
- **Same code, same git repo, same behavior**

### 9.2 Running Both Simultaneously — THE QBO PROBLEM

**You CANNOT run both local and cloud against QBO production at the same time.**

QBO uses rotating refresh tokens. When Instance A refreshes:
```
Instance A: refresh → gets Token-v2 (Token-v1 is now DEAD)
Instance B: still has Token-v1 → next API call → 401 UNAUTHORIZED
Instance B: tries to refresh with its old refresh token → FAILS (already revoked)
```

**Options:**

| Strategy | Pros | Cons |
|----------|------|------|
| **A. Cloud only (kill local)** | Simple, no conflicts | Local Bridge for TS_Latest etc. stops working |
| **B. Cloud for prod, local for sandbox** | Both run safely | Sandbox data is stale/fake |
| **C. Cloud primary, local proxies through cloud** | Local apps work via cloud | Local apps now have 100ms+ latency |
| **D. Migrate all consumers to cloud, then kill local** | Clean cutover | Requires all apps updated simultaneously |

**Recommendation: D (phased cutover)**

1. Deploy cloud Bridge
2. Update Project_Exp → point to cloud Bridge
3. Update TS_Latest → point to cloud Bridge
4. Update Binder_Exp → point to cloud Bridge
5. Verify all working for 1 week
6. Decommission local Bridge (or keep for sandbox testing only)

### 9.3 Consumer Migration Timeline

```
Week 1:  Deploy cloud Bridge, run /test to verify
Week 1:  Point ONE app (Binder_Exp, lowest risk) to cloud Bridge
Week 1:  Monitor for 2-3 days
Week 2:  Point Project_Exp to cloud Bridge
Week 2:  Point TS_Latest to cloud Bridge
Week 2:  Monitor for 2-3 days
Week 3:  Decommission local Bridge (keep code, remove from Run.bat)
```

---

## 16. Rollback Plan

### 10.1 If Cloud Bridge Fails

```
1. Point consumer apps back to localhost:3100 (revert env vars)
2. Start local Bridge via Run.bat
3. Everything is back to how it was in <5 minutes
```

The local Bridge code is untouched. The fallback paths still work. Rolling back is just changing URLs.

### 10.2 If QBO Tokens Get Corrupted

```
1. Copy qbo-tokens.json.backup from Railway volume (atomic write creates backup)
2. If no backup: manually re-authenticate via Intuit OAuth flow
3. Upload fresh tokens to Railway volume
```

### 10.3 If Railway Goes Down

Railway has a 99.9% SLA, but if it does go down:

```
1. Start local Bridge (Run.bat)
2. Point consumer apps to localhost:3100 (env var change)
3. Works immediately — no data migration needed
```

---

## 17. Cost Analysis

### 11.1 Monthly Costs

| Service | Plan | Cost |
|---------|------|------|
| Railway Hobby | 512 MB RAM, 0.5 vCPU, 1 GB volume | **$5/mo** |
| Railway execution | ~720 hrs/mo at $0.000231/min | ~$10/mo (included in Hobby $5 credit) |
| Domain (optional) | Custom domain via Railway | $0 (use `.up.railway.app`) |
| SSL/TLS | Auto via Railway | $0 |
| **Total** | | **$5/mo** |

### 11.2 What You Get for $5

- Always-on API gateway (no laptop dependency)
- HTTPS + auto-TLS
- Persistent storage for tokens
- Auto-restarts on crash
- Zero-downtime deploys
- Log dashboard with search
- Health monitoring

### 11.3 If You Need More

| Upgrade | Cost | When |
|---------|------|------|
| Pro plan (no cold starts) | $20/mo | If 3-5 second first-request latency bothers you |
| Redis add-on (batch sessions) | $5/mo | If batch QBO operations needed from cloud |
| Second region (redundancy) | $5/mo | Not needed for 5 users |

---

## 18. Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|-----------|
| 1 | **QBO token race condition** (two instances) | HIGH if both run | CRITICAL — all QBO calls fail | Phase cutover: migrate consumers one at a time, then kill local |
| 2 | **Cold start latency** (3-5s after idle) | MEDIUM | LOW — first request only | Keep-alive ping every 5 min |
| 3 | **Railway outage** | LOW (99.9% SLA) | MEDIUM | Instant rollback to local Bridge |
| 4 | **Token corruption on deploy** | LOW (volume persists) | HIGH | Atomic write creates `.backup` file; re-auth as last resort |
| 5 | **API key leaked** | LOW (internal tool) | MEDIUM | Key rotation, rate limiting already in place |
| 6 | **Excel COM route unavailable** | CERTAIN (Linux) | LOW — admin-only feature | Keep local Bridge for this, or add ExcelJS fallback |
| 7 | **File read/write routes limited** | CERTAIN (no local disk) | LOW — admin-only | These routes are only for local dev/admin use |
| 8 | **Google Places autocomplete feels slower** | LOW-MEDIUM | LOW | Client-side debounce (300ms) masks the network hop |
| 9 | **Railway pricing changes** | LOW | MEDIUM | Code is portable to any Node.js host (Render, Fly.io, VPS) |
| 10 | **QBO OAuth re-auth required** | LOW (tokens auto-refresh) | MEDIUM — ~15 min downtime | Keep Intuit Developer Portal bookmarked, re-auth flow documented |

---

## 19. Timeline

### Day 1: Code Changes (7 hours)

| Task | Effort |
|------|--------|
| Path abstraction (`defaults.js`, `file-ops.js`, `sanitize.js`) | 3 hrs |
| API key migration (`config/index.js`) | 1 hr |
| Port + logging changes (`index.js`) | 2 hrs |
| CORS hardening (`cors.js`) | 1 hr |

### Day 2: Token Persistence + Deploy (6 hours)

| Task | Effort |
|------|--------|
| QBO token path → env var, test atomic write on Linux | 2 hrs |
| QBT config path → env var | 1 hr |
| API key auth middleware (new) | 30 min |
| Railway config (`railway.json`, env vars, volume) | 1 hr |
| Upload initial tokens to volume | 15 min |
| Deploy to Railway + smoke test | 1 hr |

### Day 3: Test + Consumer Migration (4 hours)

| Task | Effort |
|------|--------|
| Run `/test` endpoint, verify all 7 APIs connect | 1 hr |
| Test QBO CRUD operations (create/read/update customer) | 1 hr |
| Test token auto-refresh (wait for timer or force) | 30 min |
| Update Binder_Exp to point to cloud Bridge | 15 min |
| Update Project_Exp to point to cloud Bridge | 1 hr (centralize 14 URLs) |
| Update TS_Latest to point to cloud Bridge | 45 min |

### Post-Launch (Week 1-2)

| Task | Effort |
|------|--------|
| Monitor token refresh cycles (should happen every ~50 min) | Ongoing |
| Monitor Railway logs for errors | Ongoing |
| Verify all consumer apps working correctly | 2-3 days of observation |
| Decommission local Bridge (remove from Run.bat) | 15 min |
| Add keep-alive ping to prevent cold starts | 15 min |

### Grand Total

| Phase | Hours |
|-------|-------|
| Bridge code changes | 11 hrs |
| Railway setup + deploy | 2 hrs |
| Testing | 2 hrs |
| Consumer app updates | 2 hrs |
| **Total** | **~17 hours (~3 days)** |

---

## 20. Post-Migration Monitoring

### 20.1 What to Watch (First 2 Weeks)

| Metric | How to Check | Alert If |
|--------|-------------|----------|
| QBO token refresh | Railway logs: `[QBO] Token refreshed` | No refresh in 2+ hours |
| API response times | `/metrics` endpoint | Avg >1 second |
| Error rate | Railway dashboard | >5 errors/hour |
| Memory usage | Railway dashboard | >400 MB (of 512 MB) |
| Volume usage | Railway dashboard | >500 MB (of 1 GB) |
| Consumer connectivity | Each app's health check | Bridge connection failed |

### 20.2 Railway Dashboard URL

```
https://railway.app/project/{project-id}/service/{service-id}
```

Bookmark this. Shows: logs (searchable), metrics (CPU, RAM, network), deploys, env vars.

### 20.3 Emergency Contacts

- **Railway status:** https://status.railway.app
- **Intuit Developer Portal:** https://developer.intuit.com (QBO re-auth)
- **Rollback:** Change consumer env vars back to `http://localhost:3100`, start local Bridge

---

## 21. API Optimization Roadmap (Post-Migration)

Once cloud migration is stable, these API-level optimizations reduce external API calls and improve responsiveness.

### Phase 1: Quick Wins (Week 3-4 post-migration)

#### 1A. QBT `last_modified_timestamps` (~2 hours)

**Problem:** TS_Latest fetches timesheets/users/jobcodes every sync cycle regardless of whether anything changed.

**Solution:** Add bridge route `GET /qbt/last-modified`. Call it first in every sync. If no timestamps advanced, skip all data fetches.

**Impact:** Eliminates 90%+ of QBT API calls during idle periods.

```javascript
// TS_Latest sync loop (before):
const users = await fetch('/qbt/users');        // 1 call (always)
const timesheets = await fetch('/qbt/timesheets'); // 1 call (always)

// TS_Latest sync loop (after):
const timestamps = await fetch('/qbt/last-modified');
if (timestamps.timesheets > lastSync) {
  const timesheets = await fetch('/qbt/timesheets?modified_since=' + lastSync);
}
// 0 calls if nothing changed, 1 targeted call if something did
```

#### 1B. QBT Batch Timesheet Writes (~3 hours)

**Problem:** Creating timesheets one at a time (1 API call per record).

**Solution:** QBT standard endpoints accept arrays. Modify bridge to accept `{data: [...]}` with up to 200 objects.

**Impact:** For crew time entry (10 workers x 5 days = 50 timesheets): 50 calls → 1 call.

### Phase 2: CDC Integration (Week 5-6)

#### 2A. QBO Change Data Capture (~4 hours)

**Problem:** TS_Latest queries employees, customers, invoices as separate calls (3-5 per sync).

**Solution:** Add bridge route `GET /qbo/cdc?entities=Customer,Employee,Invoice&changedSince=...`. One call returns all changes across all entity types.

**Impact:** 3-5 calls → 1 call per sync cycle. Especially valuable for periodic refresh.

**Constraints:** 30-day lookback max, 1,000 objects max (no pagination). If >1,000, shorten time window.

### Phase 3: Webhooks (Month 2)

#### 3A. QBO Webhooks (~8 hours)

**Problem:** All QBO sync is poll-based. Consumer apps can't know about changes in real-time.

**Solution:**
1. Register webhook endpoint at bridge: `POST /webhooks/qbo`
2. HMAC-SHA256 signature verification
3. On event receipt → fan-out via existing WebSocket to connected consumers
4. Follow-up CDC or single-read to get full record

**Impact:** Near-real-time sync instead of periodic polling. Eliminates unnecessary API calls during idle periods.

**Deadline:** CloudEvents migration by **May 2026**. New format:
```json
[{"specversion":"1.0", "type":"qbo.invoice.created.v1", "intuitentityid":"1234", "time":"..."}]
```

### Phase 4: Route Pruning (Month 2-3)

#### 4A. Prune Unused Routes

75% of routes have no active consumer. During cloud migration, consider:

| Action | Routes Removed | Lines Saved |
|--------|---------------|-------------|
| Remove 4 batch-invoice benchmarking variants (keep `batch-hybrid`) | 4 | ~200 |
| Remove geocode/mileage legacy routes (replaced by `/geo/*`) | 9 | ~770 |
| Gate AI routes behind feature flag (no consumer) | 13 | 0 (gated) |
| Gate Vision/OSRM routes behind feature flag | 13 | 0 (gated) |
| Remove receipt scanning routes (never used) | 6 | ~300 |
| **Total** | **45 routes** | **~1,270 lines** |

After pruning: **184 → ~139 routes** (all with active consumers or actively planned features).

### Optimization Impact Summary

```
                    CURRENT              AFTER ALL OPTIMIZATIONS
                    ═══════              ═══════════════════════
QBT calls/sync      3-5 (always)         0-1 (only if changed)
QBO calls/sync      3-5 (separate)       1 (CDC)
Timesheet writes    N calls (1 per)      1 call (batch 200)
Change detection    Polling (minutes)     Webhooks (seconds)
Active routes       184                  ~139 (pruned)
Codebase            27,057 lines         ~25,787 lines
```

---

## Summary: The One-Slide Version

```
BEFORE                              AFTER
──────                              ─────
Sam's Laptop (must be on)           Railway Cloud ($5/mo, always on)
  │                                   │
  ├── Mini_API_Bridge :3100           ├── Mini_API_Bridge
  │     │                             │     │
  │     ├── QBO (72 routes)           │     ├── QBO ✓ + CDC + Webhooks
  │     ├── QBT (28 routes)           │     ├── QBT ✓ + last_modified_timestamps
  │     ├── Claude AI (8)             │     ├── Claude AI ✓
  │     ├── OpenAI (7)                │     ├── OpenAI ✓
  │     ├── Google Maps (18)          │     ├── Google Maps ✓
  │     ├── Google Vision (7)         │     ├── Google Vision ✓
  │     ├── OSRM (6)                  │     └── OSRM ✓
  │     ├── Settings (20)             │
  │     └── 184 routes total          │  https://bb-bridge.up.railway.app
  │                                   │       ↑
  ├── Project_Exp  (14 routes)        │   ANY device, ANY network
  ├── TS_Latest    (28 routes)        │   iPad ✓ MacBook ✓ Phone ✓
  ├── Binder_Exp   (4 routes)         │
  └── eSigner      (0 routes)         │   75% of routes have no consumer
                                      │   → prune to ~139 active routes
PROBLEMS:
• Laptop off = everything dead        WINS:
• 75% routes unused                   • Always on — laptop can be off
• No CDC/Webhooks/Batch               • HTTPS + API key auth
• QBT polls blindly (no timestamps)   • CDC + Webhooks + last_modified
• 368MB error log                     • Proper logging (Railway dashboard)
• Credentials in plain text           • Encrypted env vars + volume
• 20 filesystem routes break cloud    • 164 routes work as-is (89%)

EFFORT: ~17 hours (3 days)
COST: $5/month
RISK: LOW (config changes only, zero logic changes)
ROLLBACK: <5 minutes (point URLs back to localhost)
```

---

*End of migration plan. Companion documents:*
- *`BB_API_BRIDGE_AUDIT.md` — Code distribution + dead file cleanup*
- *`BB_API_BRIDGE_ROUTE_CLASSIFICATION.md` — Full route-by-route classification*
- *`BB_API_CALLING_MATRIX.md` — Every route x calling pattern x consumer app*
- *Section 20 of `BB_UNIFIED_APP_GAMEPLAN.md` — Original deep-dive analysis*
