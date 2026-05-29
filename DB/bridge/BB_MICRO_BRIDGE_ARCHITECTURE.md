# BB Micro-Bridge Architecture | v1.1 | 2026-03-02 | BB

> A lean, cloud-native API bridge designed from scratch to replace the 27,057-line Mini_API_Bridge.
> Serves all 8 BB consumer apps. Built on best-of-breed patterns. ~1,500 lines of code.
>
> **Companion docs:**
> - See: BB_API_BRIDGE_CLOUD_MIGRATION v1.3 (migration plan for current bridge)
> - See: BB_API_CALLING_MATRIX v1.2 (full route analysis)
> - See: BB_API_BRIDGE_CONSUMER_CATALOGUE v1.0 (per-project inventories)

---

## Table of Contents

1. [Why a Micro-Bridge (Not a Migration)](#1-why-a-micro-bridge-not-a-migration)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Route Consolidation: 184 → 44](#4-route-consolidation-184--44)
5. [Module Structure](#5-module-structure)
6. [Authentication & Security](#6-authentication--security)
7. [Upstream API Clients](#7-upstream-api-clients)
8. [Resilience Patterns](#8-resilience-patterns)
9. [Observability](#9-observability)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Consumer Migration Guide](#11-consumer-migration-guide)
12. [What the Micro-Bridge Does NOT Do](#12-what-the-micro-bridge-does-not-do)
13. [Cost & Performance](#13-cost--performance)
14. [Implementation Roadmap](#14-implementation-roadmap)
15. [Risk Register](#15-risk-register)
16. [Mini-Bridge vs. Micro-Bridge Comparison](#16-mini-bridge-vs-micro-bridge-comparison)

---

## 1. Why a Micro-Bridge (Not a Migration)

The Cloud Migration doc (v1.3) outlines moving the existing Mini_API_Bridge to Railway with ~150 lines changed. That's the **safe path** — but it moves 27,057 lines of code when only 32% of routes have active consumers.

The Micro-Bridge is the **superior path**: build a lean, purpose-built API gateway from scratch that:

| Dimension | Mini_API_Bridge (migrate) | Micro-Bridge (rebuild) |
|-----------|--------------------------|------------------------|
| **Codebase** | 27,057 lines | ~1,500 lines |
| **Routes** | 184 (68% unused) | 44 (100% consumed) |
| **Framework** | Raw `http.createServer` + manual routing | Fastify v5 (2× throughput, built-in validation) |
| **Resilience** | Custom circuit breaker (~150 lines) | Cockatiel (composable retry + breaker + timeout) |
| **Logging** | Manual `console.log` + file append (368MB log!) | Pino (structured JSON, cloud-native) |
| **Rate limiting** | Custom in-memory counter | `rate-limiter-flexible` (sliding window, Redis-ready) |
| **HTTP client** | Node `http` module | Undici (connection pooling, 2-4× faster) |
| **Validation** | 15 custom validators (~256 lines) | JSON Schema (Fastify built-in, zero-cost) |
| **Auth** | None (localhost-only) | Per-app API keys + CORS whitelist |
| **Cold start** | ~3-5s (27K lines to load) | <1s (1.5K lines, Fastify tree-shaking) |
| **Dependencies** | 20+ packages | 7 packages |
| **Cloud-native** | Retrofitted (env var fallbacks) | Born for cloud (env-first, no file paths) |

**The Micro-Bridge is not a rewrite of Mini_API_Bridge. It's a new, purpose-built service that does only what the 8 consumer apps actually need.**

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMER APPS                             │
│                                                             │
│  TS_Latest  ProjExp  DocEngine  RevExp5  InvV2  CalExp5     │
│  Binder    Chase                                            │
│     │         │         │         │       │       │         │
│     └─────────┴─────────┴────┬────┴───────┴───────┘         │
│                              │                               │
│                    X-API-Key + HTTPS                         │
└──────────────────────────────┼───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    MICRO-BRIDGE                               │
│                    (Railway)                                  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Auth    │→ │  Rate    │→ │  Route   │→ │  Circuit │    │
│  │  Guard   │  │  Limiter │  │  Handler │  │  Breaker │    │
│  └──────────┘  └──────────┘  └──────────┘  └────┬─────┘    │
│                                                  │           │
│  ┌───────────────────────────────────────────────┤           │
│  │              UPSTREAM CLIENTS                  │           │
│  │                                               │           │
│  │  ┌─────────┐  ┌─────────┐  ┌──────┐  ┌────┐ │           │
│  │  │  QBO    │  │  QBT    │  │ Geo  │  │ AI │ │           │
│  │  │  Client │  │  Client │  │Client│  │Fwd │ │           │
│  │  └────┬────┘  └────┬────┘  └──┬───┘  └─┬──┘ │           │
│  └───────┼─────────────┼─────────┼─────────┼────┘           │
│          │             │         │         │                 │
│  ┌───────┴─────────────┴─────────┴─────────┴────┐           │
│  │            Undici Connection Pools             │           │
│  │   QBO pool (10)  QBT pool (5)  Geo/AI (5)    │           │
│  └───────────────────────────────────────────────┘           │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │  Pino    │  │  Health  │  │  Token   │                  │
│  │  Logger  │  │  Probes  │  │  Store   │                  │
│  └──────────┘  └──────────┘  └──────────┘                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌──────────────┐  ┌────────────┐  ┌──────────────┐
     │ Intuit QBO   │  │ TSheets    │  │ Google/AI    │
     │ (OAuth2)     │  │ (Bearer)   │  │ (API Key)    │
     └──────────────┘  └────────────┘  └──────────────┘
```

**Request flow:** Consumer → HTTPS → Auth Guard → Rate Limiter → Route Handler → Circuit Breaker + Retry → Upstream API → Response

---

## 3. Technology Stack

### Core Framework

| Component | Library | Version | Why This One |
|-----------|---------|---------|-------------|
| **HTTP framework** | Fastify | 5.7.4 | 2× Express throughput, built-in JSON Schema validation, plugin architecture, Pino logger native. Mature ecosystem (3,980 dependents, 35K+ stars). Node 20+ |
| **HTTP client** | Undici | 7.22.0 | Node.js team's HTTP client. Connection pooling, keep-alive, pipelining. 2-4× faster than legacy `http` module. Powers Node's built-in `fetch()` |
| **Resilience** | Cockatiel | 3.2.1 | Circuit breaker + retry + timeout + bulkhead in one library. Zero dependencies. TypeScript-first. Policy composition via `wrap()`. Inspired by .NET Polly |
| **Logging** | Pino | 10.3.1 | Fastest JSON logger for Node.js. Native Fastify integration. Railway captures structured JSON automatically. No file I/O needed |
| **Rate limiting** | rate-limiter-flexible | 9.1.1 | In-memory (no Redis needed for 5-10 users). Sliding window. Can upgrade to Redis-backed if needed. Per-key limiting (per consumer app) |
| **Validation** | @sinclair/typebox | — | Fastify's native JSON Schema. Compiles to AJV validators at startup. Zero runtime cost. TypeScript type inference from schema |
| **Env config** | env-schema | — | Fastify plugin. Validates all env vars at startup (fail fast, not at first request) |

### Production Dependencies (7 packages)

```json
{
  "dependencies": {
    "fastify": "^5.7.4",
    "cockatiel": "^3.2.1",
    "pino": "^10.3.1",
    "rate-limiter-flexible": "^9.1.1",
    "undici": "^7.22.0",
    "@sinclair/typebox": "^0.34.0",
    "@fastify/env": "^5.0.0"
  }
}
```

**Total dependency tree: ~15 packages** (vs. Mini_API_Bridge's 20+ direct + 100+ transitive).

### Why NOT These Alternatives

| Rejected | Reason |
|----------|--------|
| **Express** | 2× slower than Fastify, no built-in validation, manual everything |
| **Hono** | Great for edge/serverless, but BB runs a single long-lived container — Fastify's plugin architecture and ecosystem are better suited |
| **NestJS** | Enterprise overhead — decorators, DI container, 50+ files for what we need in 10 |
| **Opossum** | Circuit breaker only. Cockatiel gives retry + timeout + bulkhead + breaker in one composable library |
| **Winston** | 5-10× slower than Pino. JSON logging is an afterthought, not native |
| **Zod** | Great for app validation, but Fastify's JSON Schema is zero-cost (compiled to AJV at startup) and auto-generates OpenAPI docs |
| **Redis** | Not needed for 5-10 users. In-memory rate limiting is sufficient. Redis only if we ever need the batch session system |

---

## 4. Route Consolidation: 184 → 44

### The Cut

```
MINI_API_BRIDGE                           MICRO-BRIDGE
═══════════════                           ════════════
184 total routes                          44 routes

REMOVED (140 routes):
  68% unused (zero consumers)     = 125 routes removed
  Prefix duplicates (/api/*)      =   6 routes merged
  Entity list duplicates          =   6 routes merged
  Legacy superseded               =   3 routes removed

KEPT (44 consolidated routes):
  Health/status                   =   3 routes
  QBO entity operations           =  18 routes
  QBT operations                  =   8 routes
  Batch operations                =   6 routes
  Geo (Maps/Places)               =   3 routes
  AI forwarding                   =   2 routes
  Token management                =   2 routes
  WebSocket                       =   1 route
  Admin                           =   1 route
```

### Complete Route Map

All routes use the `/api/` prefix (standardized). Legacy non-prefixed paths get a redirect middleware during transition.

#### Health & Status (3 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `GET /api/health` | GET | Health probe (Railway) | All apps, Railway |
| `GET /api/status` | GET | Upstream connectivity check | TS_Latest, PExp, DocE |
| `GET /api/metrics` | GET | Request counts, latencies, circuit states | Admin |

#### QBO Operations (18 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `GET /api/qbo/customers` | GET | All active customers | TS, PExp, DocE, Binder |
| `GET /api/qbo/customers/search` | GET | Filtered by name | PExp, DocE, Binder |
| `GET /api/qbo/customers/:id` | GET | Single customer | PExp (5×), DocE (6×) |
| `POST /api/qbo/customers` | POST | Create customer | PExp, DocE |
| `PUT /api/qbo/customers/:id` | PUT | Update customer | PExp (3×), DocE (3×) |
| `GET /api/qbo/list/:entityType` | GET | Generic entity list (Employee, Vendor, Invoice, etc.) | TS, PExp, DocE |
| `POST /api/qbo/query` | POST | Raw QBO query | TS, PExp, DocE, RevExp5 |
| `GET /api/qbo/reference-data` | GET | Combined reference data | PExp, DocE |
| `GET /api/qbo/timeactivity` | GET | Time activities list | TS |
| `POST /api/qbo/timeactivity` | POST | Create time activity | TS |
| `PUT /api/qbo/timeactivity/:id` | PUT | Update time activity | TS |
| `DELETE /api/qbo/timeactivity/:id` | DELETE | Delete time activity | TS |
| `POST /api/qbo/timeactivity/query` | POST | Query time activities | TS |
| `GET /api/qbo/timeactivity/all` | GET | All time activities | RevExp5 |
| `POST /api/qbo/invoices-enriched` | POST | Enriched invoice data | RevExp5 |
| `POST /api/qbo/invoices/batch-in` | POST | Batch invoice fetch | RevExp5 |
| `GET /api/qbo/invoice/by-docnumber` | GET | Invoice by doc number | RevExp5 |
| `GET /api/qbo/invoice/pdf` | GET | Invoice PDF download | RevExp5 |

#### QBO Token Management (2 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `POST /api/qbo/refresh` | POST | Force token refresh | TS (consolidated from 3 routes) |
| `GET /api/qbo/token-status` | GET | Token expiry info | TS |

#### QBT Operations (8 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `GET /api/qbt/users` | GET | All TSheets users | TS, CalExp5 |
| `GET /api/qbt/timesheets` | GET | Timesheets list | TS, CalExp5 |
| `POST /api/qbt/timesheet` | POST | Create timesheet | TS, CalExp5 |
| `PUT /api/qbt/timesheet/:id` | PUT | Update timesheet | TS, CalExp5 |
| `DELETE /api/qbt/timesheet/:id` | DELETE | Delete timesheet | CalExp5 |
| `GET /api/qbt/jobcodes` | GET | All jobcodes | TS, CalExp5 |
| `GET /api/qbt/validate-labor-exact` | GET | Labor validation | RevExp5, InvV2 |
| `POST /api/qbt/time-off-request` | POST | Submit time off | CalExp5 |

#### QBO Batch Operations (6 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `POST /api/batch/sessions` | POST | Create batch session | TS |
| `GET /api/batch/sessions/:id` | GET | Get session status | TS |
| `POST /api/batch/sessions/:id/command` | POST | Queue batch command | TS |
| `GET /api/batch/sessions/:id/results` | GET | Get batch results | TS |
| `GET /api/batch/sessions/:id/audit` | GET | Batch audit log | TS |
| `GET /api/batch/health` | GET | Batch system health | TS |

> **Note:** Batch sessions require in-memory state (or Redis). For the initial Micro-Bridge, use in-memory Map with TTL. Upgrade to Redis only if TS_Latest needs persistent batch sessions across restarts.

#### Geo Routes (3 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `GET /api/geo/places/autocomplete` | GET | Google Places autocomplete | Binder |
| `GET /api/geo/places/details` | GET | Google Places details | Binder |
| `GET /api/geo/geocode` | GET | Address → lat/lng | Binder |

#### AI Forwarding (2 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `POST /api/ai/claude/extract-json` | POST | Claude JSON extraction | RevExp5 |
| `POST /api/ai/claude/chat` | POST | Claude chat proxy | (future) |

#### QBO Reconciliation (2 routes)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `GET /api/qbo/recon-enhanced` | GET | Enhanced reconciliation | InvV2 |
| `GET /api/qbo/attachment-fetch` | GET | Fetch QBO attachment | RevExp5, Chase |

#### WebSocket (1 route)

| Route | Method | Handler | Consumers |
|-------|--------|---------|-----------|
| `WS /ws/batch/:id` | WS | Batch progress stream | TS |

### Legacy Compatibility Middleware

During migration, a thin redirect layer maps old paths to new:

```javascript
// legacy-compat.js — remove after all consumers migrated
const LEGACY_MAP = {
  '/health': '/api/health',
  '/qbo/status': '/api/status',
  '/qbo/customers': '/api/qbo/customers',
  '/qbo/employees': '/api/qbo/list/Employee',
  '/qbo/invoices': '/api/qbo/list/Invoice',
  '/qbo/list/vendors': '/api/qbo/list/Vendor',
  '/qbo/refresh': '/api/qbo/refresh',
  '/qbo/refresh-token': '/api/qbo/refresh',
  '/qbt/validate-labor-segments': null, // stub — return 410 Gone
};
```

---

## 5. Module Structure

```
bb-micro-bridge/
├── package.json                    # 7 dependencies
├── railway.json                    # Deploy config
├── .env.example                    # All env vars documented
├── Dockerfile                      # Optional (Railway auto-detects Node)
│
├── src/
│   ├── index.js                    # Fastify server bootstrap (~80 lines)
│   ├── config.js                   # env-schema validation (~40 lines)
│   │
│   ├── plugins/
│   │   ├── auth.js                 # API key guard (~30 lines)
│   │   ├── rate-limit.js           # Per-app rate limiting (~25 lines)
│   │   ├── cors.js                 # Origin whitelist (~15 lines)
│   │   ├── legacy-compat.js        # Old path redirects (~30 lines)
│   │   └── request-id.js           # X-Request-Id (~10 lines)
│   │
│   ├── clients/
│   │   ├── qbo.js                  # QBO client + OAuth token rotation (~200 lines)
│   │   ├── qbt.js                  # QBT client + static token (~80 lines)
│   │   ├── geo.js                  # Google Maps/Places client (~60 lines)
│   │   ├── ai.js                   # Claude/OpenAI forwarder (~40 lines)
│   │   └── resilience.js           # Shared circuit breaker + retry policies (~50 lines)
│   │
│   ├── routes/
│   │   ├── health.js               # /api/health, /api/status, /api/metrics (~40 lines)
│   │   ├── qbo-customers.js        # /api/qbo/customers/* (~100 lines)
│   │   ├── qbo-entities.js         # /api/qbo/list/:type, /api/qbo/query, etc. (~80 lines)
│   │   ├── qbo-timeactivity.js     # /api/qbo/timeactivity/* (~80 lines)
│   │   ├── qbo-invoices.js         # /api/qbo/invoices*, attachment, recon (~80 lines)
│   │   ├── qbo-tokens.js           # /api/qbo/refresh, token-status (~40 lines)
│   │   ├── qbt.js                  # /api/qbt/* (~120 lines)
│   │   ├── batch.js                # /api/batch/* + WebSocket (~150 lines)
│   │   ├── geo.js                  # /api/geo/* (~50 lines)
│   │   └── ai.js                   # /api/ai/* (~40 lines)
│   │
│   └── utils/
│       ├── token-store.js          # QBO token persistence (volume or env) (~60 lines)
│       └── sanitize.js             # Input sanitization (~30 lines)
│
└── test/
    ├── health.test.js
    ├── qbo.test.js
    ├── qbt.test.js
    └── smoke.test.js               # Hit all 44 routes, verify 2xx or expected error
```

**Total: ~1,500 lines of application code** across ~25 files.

**Line count comparison:**

```
COMPONENT                    MINI-BRIDGE     MICRO-BRIDGE    SAVINGS
═════════                    ═══════════     ════════════    ═══════
Route handlers               ~8,000          ~780            -90%
Middleware                   ~1,500          ~110            -93%
Upstream clients             ~1,500          ~430            -71%
Config/utils                 ~2,000          ~130            -94%
Unused routes                ~14,000         0               -100%
                             ───────         ─────
TOTAL                        ~27,000         ~1,450          -95%
```

---

## 6. Authentication & Security

### Consumer API Keys

Each consumer app gets its own API key. This enables per-app rate limiting, usage tracking, and instant revocation.

```
CONSUMER APP               API KEY PREFIX     RATE LIMIT
════════════               ══════════════     ══════════
TS_Latest                  ts_xxxxxxxxxxxx   200 req/min (heaviest user)
Project_Exp                pe_xxxxxxxxxxxx   100 req/min
BB-DocEngine               de_xxxxxxxxxxxx   100 req/min
RevExp5                    re_xxxxxxxxxxxx   100 req/min
Invoice_Validate2          iv_xxxxxxxxxxxx   50 req/min
CalExp5                    ce_xxxxxxxxxxxx   50 req/min
Binder_Exp                 bi_xxxxxxxxxxxx   50 req/min
Chase_Expense_Validator    ch_xxxxxxxxxxxx   50 req/min
```

### Auth Guard Implementation

```javascript
// plugins/auth.js
async function authGuard(fastify) {
  const apiKeys = JSON.parse(process.env.API_KEYS || '{}');
  // Format: { "ts_abc123": "TS_Latest", "pe_def456": "Project_Exp", ... }

  fastify.addHook('onRequest', async (request, reply) => {
    // Skip health check (Railway needs unauthenticated access)
    if (request.url === '/api/health') return;

    const key = request.headers['x-api-key'];
    const app = apiKeys[key];
    if (!app) {
      reply.code(401).send({ error: 'Invalid API key' });
      return;
    }
    request.consumerApp = app; // Available in route handlers
  });
}
```

### Security Layers

| Layer | Implementation | Purpose |
|-------|---------------|---------|
| **HTTPS** | Railway auto-TLS | Encrypt all traffic |
| **API keys** | `X-API-Key` header per consumer | Authentication + tracking |
| **CORS** | `@fastify/cors` with origin whitelist | Prevent unauthorized browser calls |
| **Rate limiting** | Per-key sliding window | Prevent abuse, fair usage |
| **Input validation** | JSON Schema on every route | Reject malformed requests |
| **Request sanitization** | Query string + body sanitization | Prevent injection |
| **Security headers** | `@fastify/helmet` | HSTS, CSP, X-Frame-Options |
| **Request ID** | UUID per request | Audit trail |
| **No file system access** | Zero file-read/write routes | No path traversal possible |

### What's MORE Secure Than Mini-Bridge

1. **No file system routes at all** — Mini-Bridge has 20 file I/O routes (biggest attack surface). Micro-Bridge has zero
2. **Per-app API keys** — Mini-Bridge has no auth. Micro-Bridge tracks every request by consumer
3. **HTTPS only** — Mini-Bridge runs HTTP on localhost. Micro-Bridge is TLS-everywhere
4. **Validated inputs** — Mini-Bridge validates 15 routes. Micro-Bridge validates all 44 with JSON Schema
5. **No credentials on disk** — All secrets in Railway encrypted env vars
6. **Structured audit log** — Every request logged with consumer ID, latency, upstream status

---

## 7. Upstream API Clients

### QBO Client (OAuth2 Token Rotation)

The most complex piece. QBO uses rotating refresh tokens — each refresh invalidates the previous token.

```javascript
// clients/qbo.js — ~200 lines
class QBOClient {
  #accessToken;
  #refreshToken;
  #expiresAt;
  #pool;         // Undici connection pool to QBO
  #refreshLock;  // Prevent concurrent refresh

  constructor(config) {
    this.realmId = config.QBO_REALM_ID;
    this.#pool = new Pool('https://quickbooks.api.intuit.com', {
      connections: 10,           // QBO allows 10 concurrent per realmId
      keepAliveTimeout: 30_000,
      pipelining: 1,
    });
  }

  async request(method, path, body) {
    await this.#ensureValidToken();
    // Circuit breaker wraps this call (see resilience.js)
    const response = await this.#pool.request({
      method,
      path: `/v3/company/${this.realmId}${path}`,
      headers: {
        'Authorization': `Bearer ${this.#accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response;
  }

  async #ensureValidToken() {
    if (Date.now() < this.#expiresAt - 300_000) return; // 5min buffer
    await this.#refresh();
  }

  async #refresh() {
    // Mutex: only one refresh at a time
    if (this.#refreshLock) return this.#refreshLock;
    this.#refreshLock = this.#doRefresh();
    try { await this.#refreshLock; } finally { this.#refreshLock = null; }
  }

  async #doRefresh() {
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(config.QBO_CLIENT_ID + ':' + config.QBO_CLIENT_SECRET)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=refresh_token&refresh_token=${this.#refreshToken}`,
    });
    const tokens = await response.json();
    this.#accessToken = tokens.access_token;
    this.#refreshToken = tokens.refresh_token;
    this.#expiresAt = Date.now() + (tokens.expires_in * 1000);
    await this.#persistTokens(); // Write to Railway volume
  }

  async #persistTokens() {
    // Atomic write: temp file → rename (survives crash mid-write)
    const data = JSON.stringify({
      access_token: this.#accessToken,
      refresh_token: this.#refreshToken,
      expires_at: this.#expiresAt,
    });
    const tmpPath = process.env.QBO_TOKENS_PATH + '.tmp';
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, process.env.QBO_TOKENS_PATH);
  }
}
```

**Critical constraint:** `numReplicas: 1` — NEVER scale to 2+ replicas. Two instances would race on token refresh and invalidate each other.

### QBT Client (Static Bearer Token)

Simple — QBT uses a non-rotating bearer token.

```javascript
// clients/qbt.js — ~80 lines
class QBTClient {
  #pool;
  #token;

  constructor(config) {
    this.#token = config.QBT_ACCESS_TOKEN;
    this.#pool = new Pool('https://rest.tsheets.com', {
      connections: 5,
      keepAliveTimeout: 30_000,
    });
  }

  async request(method, path, params) {
    const url = `/api/v1${path}`;
    const headers = {
      'Authorization': `Bearer ${this.#token}`,
      'Content-Type': 'application/json',
    };
    // Circuit breaker wraps this (see resilience.js)
    return this.#pool.request({ method, path: url, headers, body: params ? JSON.stringify(params) : undefined });
  }
}
```

### Geo Client (Google API Key)

```javascript
// clients/geo.js — ~60 lines
class GeoClient {
  #apiKey;
  #pool;

  constructor(config) {
    this.#apiKey = config.GOOGLE_MAPS_API_KEY;
    this.#pool = new Pool('https://maps.googleapis.com', {
      connections: 5,
      keepAliveTimeout: 30_000,
    });
  }

  async autocomplete(input, sessionToken) { /* ... */ }
  async placeDetails(placeId) { /* ... */ }
  async geocode(address) { /* ... */ }
}
```

### AI Forwarder (Claude)

```javascript
// clients/ai.js — ~40 lines
// Pure proxy — forwards request to Claude API, returns response
// No transformation, no caching, no state
```

### Connection Pool Summary

```
UPSTREAM HOST                    POOL SIZE    KEEP-ALIVE    RATIONALE
═════════════                    ═════════    ══════════    ═════════
quickbooks.api.intuit.com        10           30s           QBO 10 concurrent limit
oauth.platform.intuit.com        2            60s           Token refresh only
rest.tsheets.com                 5            30s           QBT 300/5min limit
maps.googleapis.com              5            30s           Geo calls (Binder only)
api.anthropic.com                3            30s           AI proxy (low volume)
```

---

## 8. Resilience Patterns

### Cockatiel Policy Composition

Each upstream API gets a composed policy: **Retry → Circuit Breaker → Timeout**

```javascript
// clients/resilience.js — ~50 lines
import { circuitBreaker, retry, timeout, wrap, handleAll, ConsecutiveBreaker, ExponentialBackoff } from 'cockatiel';

// QBO policy: retry 2× with exponential backoff, circuit breaks after 5 consecutive failures, 30s timeout
export const qboPolicy = wrap(
  retry(handleAll, { maxAttempts: 2, backoff: new ExponentialBackoff({ initialDelay: 500 }) }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(30_000),
);

// QBT policy: retry 2×, circuit breaks after 3 consecutive failures, 15s timeout
export const qbtPolicy = wrap(
  retry(handleAll, { maxAttempts: 2, backoff: new ExponentialBackoff({ initialDelay: 300 }) }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 15_000,
    breaker: new ConsecutiveBreaker(3),
  }),
  timeout(15_000),
);

// Geo policy: retry 1×, circuit breaks after 5 failures, 10s timeout
export const geoPolicy = wrap(
  retry(handleAll, { maxAttempts: 1, backoff: new ExponentialBackoff({ initialDelay: 200 }) }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 20_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(10_000),
);
```

### Usage in Route Handlers

```javascript
// routes/qbo-customers.js
fastify.get('/api/qbo/customers', async (request) => {
  return qboPolicy.execute(() => qboClient.request('POST', '/query', {
    query: "SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000"
  }));
});
```

### Rate Limiting Strategy

```javascript
// plugins/rate-limit.js
import { RateLimiterMemory } from 'rate-limiter-flexible';

const limiters = {
  heavy:    new RateLimiterMemory({ points: 200, duration: 60 }), // 200/min
  standard: new RateLimiterMemory({ points: 100, duration: 60 }), // 100/min
  light:    new RateLimiterMemory({ points: 50,  duration: 60 }), // 50/min
};

// Tier assignment based on consumer app (from auth guard)
const appTiers = {
  'TS_Latest': 'heavy',
  'Project_Exp': 'standard', 'BB-DocEngine': 'standard',
  'RevExp5': 'standard',
  'Invoice_V2': 'light', 'CalExp5': 'light',
  'Binder_Exp': 'light', 'Chase_Exp': 'light',
};
```

### Resilience Summary

| Pattern | Library | Config | Effect |
|---------|---------|--------|--------|
| **Circuit Breaker** | Cockatiel `ConsecutiveBreaker` | 3-5 consecutive failures → open for 15-30s | Fail fast when upstream is down |
| **Retry** | Cockatiel `retry` | 1-2 attempts, exponential backoff 200-500ms | Survive transient errors |
| **Timeout** | Cockatiel `timeout` | 10-30s per upstream | Don't hang on slow responses |
| **Rate Limit (inbound)** | rate-limiter-flexible | 50-200 req/min per app | Protect bridge from consumer abuse |
| **Rate Limit (outbound)** | Manual counter | QBO: 500/min, QBT: 300/5min | Respect upstream API limits |
| **Connection Pooling** | Undici `Pool` | 2-10 connections per upstream | Reuse TCP/TLS, reduce latency |
| **Graceful Shutdown** | Fastify built-in | SIGTERM → drain connections → exit | Zero dropped requests on deploy |
| **Health Checks** | Custom `/api/health` | Tests all upstream connections | Railway auto-restart on failure |

---

## 9. Observability

### Structured Logging (Pino)

Every request produces a structured JSON log entry:

```json
{
  "level": 30,
  "time": 1709337600000,
  "reqId": "a1b2c3d4",
  "consumer": "TS_Latest",
  "method": "POST",
  "url": "/api/qbo/query",
  "statusCode": 200,
  "upstream": "quickbooks.api.intuit.com",
  "upstreamLatency": 342,
  "totalLatency": 355,
  "circuitState": "closed"
}
```

Railway captures this automatically — searchable, filterable, no file I/O needed.

### Health Probes

```javascript
// GET /api/health — Railway readiness probe
{
  "status": "ok",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "qbo": { "status": "ok", "tokenExpiresIn": "47m" },
    "qbt": { "status": "ok", "lastCall": "2m ago" },
    "geo": { "status": "ok" }
  }
}
```

```javascript
// GET /api/metrics — operational dashboard
{
  "requests": { "total": 12450, "last5min": 23 },
  "byConsumer": {
    "TS_Latest": { "total": 8200, "errors": 3 },
    "CalExp5": { "total": 1100, "errors": 0 }
  },
  "circuits": {
    "qbo": "closed",
    "qbt": "closed",
    "geo": "closed"
  },
  "upstreams": {
    "qbo": { "avgLatency": 320, "p95": 780 },
    "qbt": { "avgLatency": 180, "p95": 450 }
  }
}
```

### Alerting

Railway supports webhook alerts. Configure:

| Condition | Alert |
|-----------|-------|
| Health check fails 3× | Restart container + notify |
| Memory > 400MB | Warn (of 512MB limit) |
| Circuit open > 5 min | QBO/QBT may be down |
| Error rate > 10/hour | Something broken |
| QBO token refresh fails | CRITICAL — manual intervention needed |

---

## 10. Deployment Architecture

### Railway Configuration

```json
// railway.json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node src/index.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE",
    "numReplicas": 1
  }
}
```

**`numReplicas: 1` is non-negotiable** — QBO token rotation breaks with multiple instances.

### Environment Variables

```bash
# Core
PORT=3100
NODE_ENV=production

# QBO OAuth
QBO_CLIENT_ID=ABUgapEhNvhcHMPaZOhZ9Co2SLY9KVPkK8qOrrYhxbmAntjwUy
QBO_CLIENT_SECRET=<secret>
QBO_REALM_ID=9130351993370046
QBO_TOKENS_PATH=/app/data/qbo-tokens.json

# QBT
QBT_ACCESS_TOKEN=S.14__1a0894249929608432522b8d807f4eb76afd8ab2
QBT_BASE_URL=https://rest.tsheets.com/api/v1

# Google
GOOGLE_MAPS_API_KEY=<key>

# AI
CLAUDE_API_KEY=<key>

# Security
API_KEYS={"ts_xxx":"TS_Latest","pe_xxx":"Project_Exp","de_xxx":"BB-DocEngine","re_xxx":"RevExp5","iv_xxx":"Invoice_V2","ce_xxx":"CalExp5","bi_xxx":"Binder_Exp","ch_xxx":"Chase_Exp"}
ALLOWED_ORIGINS=https://bb-micro.up.railway.app,http://localhost:3035,http://localhost:3460,http://localhost:3450,http://localhost:3200,http://localhost:3015

# Token persistence
VOLUME_PATH=/app/data
```

### Railway Volume

```
Mount path: /app/data
Size: 1 GB
Contents:
  /app/data/qbo-tokens.json    # Auto-managed by QBO client
```

### Container Size

```
MINI-BRIDGE CONTAINER          MICRO-BRIDGE CONTAINER
══════════════════════         ════════════════════════
Node 20 base     ~150 MB      Node 20 base     ~150 MB
node_modules     ~80 MB       node_modules     ~15 MB
Application      ~27K lines   Application      ~1.5K lines
Startup time     ~3-5s        Startup time     <1s
Memory (idle)    ~120 MB      Memory (idle)    ~40 MB
Memory (peak)    ~250 MB      Memory (peak)    ~80 MB
```

### Keep-Alive (Prevent Cold Starts)

```javascript
// Any consumer app's server startup:
setInterval(() => fetch('https://bb-micro.up.railway.app/api/health').catch(() => {}), 5 * 60 * 1000);
```

Or: Railway cron job (free), UptimeRobot (free), or Railway Pro ($20/mo, no sleep).

---

## 11. Consumer Migration Guide

### Migration Order (lowest risk → highest)

```
PHASE    APP              ROUTES    RISK     EFFORT
═════    ═══              ══════    ════     ══════
  1      CalExp5           5        LOW      15 min — change 1 URL in server.js + add X-API-Key
  2      Binder_Exp        4        LOW      15 min — change VITE_MINI_API_BRIDGE_URL + add header
  3      Chase_Exp         4        LOW      15 min — change settings URL + add header
  4      Invoice_V2        7        LOW      20 min — change settings URL + add header
  5      RevExp5          12        MED      30 min — change settings port + add header
  6      Project_Exp      13        MED      1 hr — centralize 14 hardcoded URLs + add header
  7      BB-DocEngine     12        MED      1 hr — centralize 10 hardcoded URLs + add header
  8      TS_Latest        16+       HIGH     2 hrs — update config + add header to all fetch calls
```

### Per-App Changes

#### CalExp5 (Simplest — 15 minutes)

```javascript
// server.js line ~54 — change target URL
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://bb-micro.up.railway.app';

// Add to proxy config:
headers: { ...req.headers, 'X-API-Key': process.env.BRIDGE_API_KEY }
```

#### Binder_Exp (15 minutes)

```bash
# .env
VITE_MINI_API_BRIDGE_URL=https://bb-micro.up.railway.app
VITE_BRIDGE_API_KEY=bi_xxxxxxxxxxxx
```

```typescript
// src/client/src/utils/api.ts — add header to fetchJson
headers: { 'X-API-Key': import.meta.env.VITE_BRIDGE_API_KEY }
```

#### TS_Latest (Most Complex — 2 hours)

```javascript
// server/config/constants.js
API_BRIDGE_URL: process.env.API_BRIDGE_URL || 'https://bb-micro.up.railway.app'

// Add X-API-Key header to:
// - server/services/* (server-side proxy calls)
// - public/js/settings-module.js (client-side via window.API_BASE)
```

### Route Mapping Cheat Sheet

Consumer apps using old paths need to update to new `/api/` prefix paths:

| Old Path | New Path | Used By |
|----------|----------|---------|
| `/health` | `/api/health` | PExp, DocE |
| `/qbo/status` | `/api/status` | TS, PExp, DocE |
| `/qbo/customers` | `/api/qbo/customers` | TS, PExp, DocE |
| `/qbo/employees` | `/api/qbo/list/Employee` | TS |
| `/qbo/invoices` | `/api/qbo/list/Invoice` | TS |
| `/qbo/refresh` | `/api/qbo/refresh` | TS |
| `/qbo/refresh-token` | `/api/qbo/refresh` | TS |
| `/qbt/validate-labor-segments` | **Removed (410 Gone)** | InvV2 |

> **The legacy-compat middleware handles these redirects during migration.** Remove it once all consumers are updated.

---

## 12. What the Micro-Bridge Does NOT Do

These were Mini_API_Bridge features that have zero active consumers or are local-only admin ops:

| Feature | Routes | Reason for Exclusion |
|---------|--------|---------------------|
| **File read/write** | 10 routes | Zero cloud consumers. Local-only admin. Path traversal risk |
| **Settings file I/O** | 3 routes | Local persistence only. Apps handle their own settings |
| **Receipt scanning** | 6 routes | Requires local folder access. Never used by consumers |
| **Excel COM export** | 2 routes | Requires Windows COM. Use ExcelJS in consumer apps |
| **Geocode legacy** | 9 routes | Superseded by `/api/geo/*` |
| **Mileage calc** | 3 routes | Superseded by OSRM |
| **AI (most routes)** | 11 routes | Only 1 consumed (Claude extract-json). Others unused |
| **Vision/OSRM (most)** | 9 routes | Only 3 consumed (Places + geocode). Others unused |
| **Batch invoice variants** | 4 routes | Benchmarking variants. Keep `batch-hybrid` only |
| **Lunch audit** | 1 route | Moved to TS_Latest local server |

**If any of these are ever needed, they can be added as new Fastify plugins in ~30 minutes each.**

---

## 13. Cost & Performance

### Monthly Cost

| Service | Plan | Cost |
|---------|------|------|
| Railway Hobby | 512 MB RAM, 0.5 vCPU | **$5/mo** |
| Railway execution | ~720 hrs/mo | Included in $5 credit |
| Railway volume | 1 GB | Included |
| Domain | `.up.railway.app` | $0 |
| SSL/TLS | Auto-managed | $0 |
| **Total** | | **$5/mo** |

Same cost as migrating the Mini-Bridge — but 95% less code, 3× less memory, faster cold starts.

### Performance Comparison

```
METRIC                    MINI-BRIDGE     MICRO-BRIDGE     IMPROVEMENT
══════                    ═══════════     ════════════     ═══════════
Cold start                3-5 seconds     <1 second        3-5× faster
Memory (idle)             ~120 MB         ~40 MB           3× less
Memory (peak)             ~250 MB         ~80 MB           3× less
Requests/sec capacity     ~500            ~2,000           4× more (Fastify)
Dependencies              20+ packages    7 packages       65% fewer
Attack surface            20 file routes  0 file routes    100% removed
Container image size      ~230 MB         ~165 MB          28% smaller
```

### Latency Comparison

```
REQUEST TYPE              LOCAL BRIDGE    MINI ON CLOUD    MICRO ON CLOUD
════════════              ════════════    ═════════════    ══════════════
Health check              <5ms            100ms            80ms (Fastify faster)
QBO customer search       200-400ms       300-500ms        280-480ms
QBT timesheet list        200-300ms       300-400ms        280-380ms
Google Places autocomplete 50-150ms       150-250ms        130-230ms
Claude AI chat            2-10s           2-10s            2-10s
```

The Micro-Bridge is ~20ms faster than migrated Mini-Bridge on every request because Fastify's request parsing is faster and there's less middleware to traverse.

---

## 14. Implementation Roadmap

### Phase 1: Core Build — COMPLETED 2026-03-02

> **Status:** Built and tested end-to-end with CalExp5 as first consumer.
> **Location:** `C:\Users\samjo\Desktop\BB_Micro_Bridge\` | Port 3105
> **Dependencies:** 70 packages, 0 vulnerabilities
> **Tested routes:** users, timesheets (auto-paginated), jobcodes, timesheet CRUD, time-off-request, status, test, health

| Task | Hours | Output |
|------|-------|--------|
| Fastify bootstrap + config + empty-body parser | 1 | `src/index.js`, `src/config.js` |
| Auth guard + rate limiting plugins | 1 | `src/plugins/auth.js`, `rate-limit.js` |
| QBT client + Undici pool + auto-pagination | 1.5 | `src/clients/qbt.js` |
| Resilience policies (Cockatiel v3) | 0.5 | `src/clients/resilience.js` |
| Health/status routes | 0.5 | `src/routes/health.js` |
| QBT routes (all CalExp5 routes) | 1.5 | `src/routes/qbt.js` |
| Response envelope (matches Mini_API_Bridge) | 0.5 | `src/utils/response.js` |
| Error handler + 404 handler | 0.5 | `src/plugins/error-handler.js` |
| Run.bat + railway.json + .env | 0.5 | Root files |
| CalExp5 server.js migration (v4.2.0 → v4.3.0) | 0.5 | Changed API_TARGET to :3105 |

### Phase 2: Complete Routes (1 day, ~6 hours)

| Task | Hours | Output |
|------|-------|--------|
| QBT routes | 1.5 | `src/routes/qbt.js` |
| Batch routes + in-memory session store | 2 | `src/routes/batch.js` |
| Geo + AI routes | 1 | `src/routes/geo.js`, `ai.js` |
| Legacy compatibility middleware | 0.5 | `src/plugins/legacy-compat.js` |
| CORS + security headers | 0.5 | `src/plugins/cors.js` |
| Metrics endpoint | 0.5 | Added to `health.js` |

### Phase 3: Deploy + Test (0.5 day, ~4 hours)

| Task | Hours | Output |
|------|-------|--------|
| Railway project setup (volume, env vars, deploy) | 1 | Running service |
| Upload QBO tokens to volume | 0.25 | Token persistence verified |
| Smoke test all 44 routes | 1.5 | All routes returning expected responses |
| Token refresh cycle test | 0.5 | QBO refresh works on Railway |
| Load test (50 concurrent requests) | 0.75 | Performance baseline |

### Phase 4: Consumer Migration (1-2 days, ~6 hours)

| Task | Hours | Output |
|------|-------|--------|
| Phase 1 apps (CalExp5, Binder, Chase, InvV2) | 1 | 4 apps pointing to Micro-Bridge |
| Monitor 24 hours | — | Verify stability |
| Phase 2 apps (RevExp5, PExp, DocEngine) | 2.5 | 7 apps pointing to Micro-Bridge |
| Monitor 24 hours | — | Verify stability |
| Phase 3: TS_Latest | 2 | All 8 apps on Micro-Bridge |
| Monitor 1 week | — | Full stability verification |

### Phase 5: Decommission Mini-Bridge (0.5 day)

| Task | Hours | Output |
|------|-------|--------|
| Remove Mini-Bridge from Run.bat files | 0.5 | Local Mini-Bridge retired |
| Remove legacy-compat middleware | 0.5 | Clean routes, no redirects |
| Remove `localhost:3100` references from all apps | 1 | Zero hardcoded local URLs |
| Archive Mini-Bridge repo | 0.5 | Preserved but not running |

### Grand Total

```
PHASE                    HOURS     CALENDAR
═════                    ═════     ════════
Core build               8         Day 1
Complete routes          6         Day 2
Deploy + test            4         Day 3 morning
Consumer migration       6         Day 3-5 (with monitoring gaps)
Decommission             2.5       Day 6
                         ────
TOTAL                    ~26.5 hours (~4-5 working days)
```

**Compare:** Migrating Mini-Bridge = ~17 hours. Building Micro-Bridge = ~26.5 hours.
**The extra ~10 hours buys:** 95% less code, 3× less memory, 4× throughput, zero file-system attack surface, per-app auth, structured logging, composable resilience, and a codebase anyone can understand in an afternoon.

---

## 15. Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|------------|--------|-----------|
| 1 | **QBO token race (multi-instance)** | HIGH if >1 replica | CRITICAL | `numReplicas: 1`, Railway enforces |
| 2 | **Route parity gaps** | MEDIUM | MEDIUM | Smoke test all 44 routes + legacy compat middleware |
| 3 | **Consumer apps break during migration** | LOW | MEDIUM | Phase migration (1 app at a time), instant rollback to localhost |
| 4 | **Cold start latency** | MEDIUM | LOW | Keep-alive ping every 5 min |
| 5 | **Missing edge case in QBO queries** | LOW | MEDIUM | Port query logic from Mini-Bridge, not rewrite from scratch |
| 6 | **Batch session state lost on restart** | MEDIUM | LOW | In-memory is acceptable for TS_Latest's usage pattern. Redis upgrade path exists |
| 7 | **Railway pricing change** | LOW | LOW | Code is portable (Render, Fly.io, any Docker host) |
| 8 | **New consumer app needs removed route** | LOW | LOW | Add as Fastify plugin in ~30 min |
| 9 | **QBO token corruption** | LOW | HIGH | Atomic write pattern + backup file. Re-auth as last resort |
| 10 | **WebSocket support on Railway** | LOW | MEDIUM | Railway supports WS natively. Test in Phase 3 |

### Rollback Plan

At any point during migration:
1. Change consumer app URLs back to `http://localhost:3100`
2. Start Mini-Bridge locally via Run.bat
3. Everything works as before in <5 minutes

The Mini-Bridge code is untouched throughout this entire process. Zero risk of losing the current system.

---

## 16. Mini-Bridge vs. Micro-Bridge Comparison

```
DIMENSION                MINI-BRIDGE              MICRO-BRIDGE             VERDICT
═════════                ═══════════              ════════════             ═══════
Lines of code            27,057                   ~1,500                   MICRO (18× less)
Routes                   184 (68% unused)         44 (100% consumed)       MICRO (no dead weight)
Dependencies             20+ direct               7 direct                 MICRO (65% fewer)
Framework                Raw http.createServer     Fastify v5               MICRO (2× throughput)
HTTP client              Node http module          Undici v7                MICRO (2-4× faster)
Validation               15 custom validators      JSON Schema (all 44)     MICRO (100% coverage)
Circuit breaker          Custom ~150 lines         Cockatiel (composable)   MICRO (retry+timeout too)
Logging                  console.log + file        Pino (structured JSON)   MICRO (searchable, no 368MB files)
Authentication           None                      Per-app API keys         MICRO (audit trail)
File system routes       20 routes                 0 routes                 MICRO (no attack surface)
Cold start               3-5 seconds               <1 second                MICRO (3-5× faster)
Memory usage             120-250 MB                40-80 MB                 MICRO (3× less)
Cloud-native             Retrofitted               Born for cloud           MICRO (env-first)
Deploy effort            ~17 hours                 ~26.5 hours              MINI (10 hrs less)
Ongoing maintenance      Hard (27K lines)          Easy (1.5K lines)        MICRO (much less surface)
Time to understand       Days                      Hours                    MICRO (anyone can grok it)
Monthly cost             $5/mo                     $5/mo                    TIE
```

**Bottom line:** The Micro-Bridge costs 10 extra hours to build but delivers a system that is 18× smaller, 3× faster, fully secured, fully observable, and maintainable by anyone. The Mini-Bridge migration is a shortcut that carries 27,000 lines of technical debt to the cloud.

---

*End of architecture spec. This document should be read alongside:*
*- BB_API_BRIDGE_CLOUD_MIGRATION v1.3 (original migration plan)*
*- BB_API_CALLING_MATRIX v1.2 (route analysis source data)*
*- BB_API_BRIDGE_CONSUMER_CATALOGUE v1.0 (per-project inventories)*
