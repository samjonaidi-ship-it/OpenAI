# BB Buddy V2 — Gap Analysis | v1.0 | 2026-04-01 | BB

**Audit scope:** BB_Micro_Bridge (v2.8.0, 150+ endpoints), CalExp5 (v4.16.0, React 19 PWA), Neon DB (49 tables)
**Measured against:** BB Buddy Architecture V2 spec (v1.1, 1,975 lines)

---

## Executive Summary

The existing BB ecosystem has **strong foundations** — 49 Neon tables, production-grade receipt scanning, GPS fleet management, universal asset system, and BB Buddy v3.17 with voice+vision. But the V2 architecture requires capabilities that **do not exist today**: multi-tenant RAG, MCP server, property-centric knowledge, customer authentication, and home asset lifecycle management.

**Overall readiness: ~35-40% of V2 exists today.**

| Layer | Exists | Needs Building | Needs Extending |
|-------|--------|---------------|----------------|
| Voice + Orchestration (OpenAI Realtime) | 90% | Agents SDK migration | MCP tool connection |
| MCP Server (Bridge) | 0% | Full implementation | — |
| RAG + pgvector | 0% | Full implementation | — |
| Multi-Tenant Auth | 10% | JWT + tenant roles | Extend PIN auth |
| Property Knowledge | 30% | 6 new tables | Extend `properties` |
| Home Asset Inventory | 15% | `bb_home_assets` | Extend `cal_assets` pattern |
| Ingestion Pipeline | 10% | Queue + OCR + embed | Extend receipt scan pattern |
| Customer Portal | 5% | New app or CalExp5 extension | Extend CalExp5 |
| Scheduling | 0% | Jobber API integration | — |
| Acquisition Channels | 5% | Email relay, SMS, connected APIs | Extend sendBeacon pattern |
| Spatial/3D | 0% | Full implementation | — |

---

## CRITICAL GAPS (must build before any V2 feature works)

### GAP-C1: MCP Server on Bridge
**Severity: CRITICAL | Effort: Medium | Phase: 1**

| What Exists | What's Needed |
|-------------|---------------|
| No MCP infrastructure at all | `@modelcontextprotocol/server` + `@modelcontextprotocol/node` |
| No `/mcp` route | Fastify route handling JSON-RPC via `request.raw`/`reply.raw` |
| Tools defined in HTML client | Tools registered on MCP server, auto-discovered by OpenAI |
| API keys sent to browser | All AI calls server-side, only OpenAI key to client |

**Why critical:** Every V2 feature routes through MCP. Without it, we can't move tools server-side, can't add audience gating, can't add new agents.

**Depends on:** npm packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/node`)
**Files to create:** `src/mcp/mcp-server.js`, `src/mcp/tools/*.js` (one per tool)
**Files to modify:** `src/index-v2.js` (register `/mcp` route), `src/plugins/auth-v2.js` (MCP bearer auth)

---

### GAP-C2: pgvector Extension + RAG Table
**Severity: CRITICAL | Effort: Medium | Phase: 2**

| What Exists | What's Needed |
|-------------|---------------|
| Neon Postgres with 49 tables | `CREATE EXTENSION vector` (not yet enabled) |
| No vector search capability | `bb_knowledge_chunks` table with `vector(1536)` column |
| No text search infrastructure | HNSW index + tsvector/GIN index for hybrid search |
| No tenant isolation (RLS) | Row-Level Security policies on all `bb_*` tables |
| No embedding pipeline | OpenAI embedding calls + storage |

**Why critical:** RAG is the foundation for property knowledge, document intelligence, and customer-uploaded content. Every "ask about my home" query needs this.

**Depends on:** GAP-C1 (MCP tool to expose search), Neon plan check (may need Launch for storage)
**Migration file:** `migrations/004_bb_knowledge_rag.sql`

---

### GAP-C3: Multi-Tenant Authentication
**Severity: CRITICAL | Effort: Large | Phase: 3**

| What Exists | What's Needed |
|-------------|---------------|
| Employee PIN auth only | JWT with `tenant_id`, `audience` (crew/customer/provider) claims |
| Roles: employee, manager, admin | New roles: customer, homeowner, contractor |
| CalExp5 `authStore.js` — employee-only | Customer login flow (email/password or OAuth) |
| Bridge `auth-v2.js` — API key + session token | JWT verification with tenant extraction for RLS |
| No tenant concept | `SET app.tenant_id = '{id}'` before every query for RLS |

**Why critical:** Without tenant auth, customers can't be isolated. One customer could see another's data. This is a legal/compliance requirement, not just a feature.

**Options:** Clerk ($25/mo managed), Auth.js (free, self-hosted), custom JWT on Bridge
**Depends on:** Architecture decision on auth provider

---

## HIGH GAPS (needed for home services platform, not for Phase 0-1)

### GAP-H1: Property Knowledge Tables
**Severity: HIGH | Effort: Medium | Phase: 2-3**

| What Exists | What's Needed |
|-------------|---------------|
| `properties` table (C1 master data) — address, lat/lng, beds/baths/sqft, yearBuilt, enrichment | `bb_properties` — tenant_id, roof_type, gutter_lf, irrigation_zones, lot_sqft, special_notes, RLS |
| No tree inventory | `bb_property_trees` — species, DBH, health_score, near_structures, photos |
| No appliance tracking | `bb_home_assets` — make, model, serial, warranty, maintenance schedule, age_years computed |
| No service history with line items | `bb_service_projects` + `bb_service_line_items` — project costs, installed assets |
| No room inventory | `bb_rooms` — dimensions, materials, fixtures, condition (schema TBD in spec) |
| No tenant-provider mapping | `tenant_providers` — which providers serve which customers (schema TBD) |

**Note:** Existing `properties` table could be extended OR a parallel `bb_properties` could be created. The V2 spec designed `bb_properties` as separate because it has different fields (homeowner-facing vs BB-internal) and needs RLS.

**Note:** Existing `cal_assets` universal asset system has the right patterns (asset_class, metadata JSONB, events, media) but is designed for BB crew tools, not homeowner appliances with warranties and maintenance schedules. Could be extended with new asset_classes or `bb_home_assets` could be a dedicated table.

---

### GAP-H2: Document Ingestion Pipeline
**Severity: HIGH | Effort: Large | Phase: 2**

| What Exists | What's Needed |
|-------------|---------------|
| Receipt scanning (camera → Claude Vision → structured data) | General document ingestion (PDF/image/doc → OCR → chunk → embed) |
| `pdf-parse` in package.json? | TBD — need to check Bridge audit |
| No job queue | pg-boss or BullMQ for background processing |
| No OCR pipeline | Google Vision API or Claude Vision for scanned PDFs |
| No chunking system | Recursive text splitter (512 tokens, 64 overlap) |
| No contextual enrichment | Claude Haiku to add document context per chunk |
| Google Drive read/upload exists | Drive polling for change detection (15-30 min) |

**CalExp5 reusable:** DocumentCamera component, receipt scan workflow patterns, offline queue pattern.

---

### GAP-H3: Agents SDK Migration
**Severity: HIGH | Effort: Small-Medium | Phase: 0**

| What Exists | What's Needed |
|-------------|---------------|
| Raw WebRTC + data channel (~400 lines) | `@openai/agents-realtime` SDK |
| Manual `pendingFnCalls` lifecycle | SDK `ResponseCreateSequencer` (automatic) |
| Manual `buddySpeaking` echo tracking | SDK `audio_start`/`audio_stopped` events |
| Single HTML file (base64-served) | Vite build (SDK requires npm + Zod v4) |
| `gpt-realtime-mini` hardcoded | SDK `model` parameter (mini or full) |

**Risk:** iOS Safari compatibility (no known issues, but untested). Build system change (single HTML → Vite bundle).
**This is Phase 0** — validation before committing to the SDK.

---

### GAP-H4: Audience-Gated Tool Registry
**Severity: HIGH | Effort: Small | Phase: 1**

| What Exists | What's Needed |
|-------------|---------------|
| 5 tools defined in HTML, available to everyone | Tool list filtered by `audience` claim from JWT |
| No concept of audience | `crew` sees all tools, `customer` sees property tools only, `provider` sees catalog tools |
| No tool-level permission checks | Per-tool `audiences[]` array + ownership verification |

**Depends on:** GAP-C1 (MCP server), GAP-C3 (auth with audience claims)

---

## MEDIUM GAPS (needed for full platform, can be phased)

### GAP-M1: Customer Portal / CalExp5 Extension
**Severity: MEDIUM | Effort: Large | Phase: 6**

| CalExp5 Has | V2 Needs |
|-------------|----------|
| Employee PIN login | Customer email/password login |
| Property cards (crew view) | Property dashboard (homeowner view — their property only) |
| Receipt scanning | Document upload (PDF, image, doc) |
| Tool asset tracking | Appliance inventory with warranty status |
| No scheduling | Service scheduling + appointment management |
| No subscription management | Tier selection, billing, payment |
| Timesheet grid | Service history timeline |
| Feature flags | Audience-based feature gates (customer vs crew) |

**CalExp5 reusable (50-60%):** API client, Zustand patterns, push notifications, GPS/location, DocumentCamera, asset model, toast notifications, offline queue.
**Estimated effort:** 10-13 weeks to extend CalExp5 for customer use (vs 20+ from scratch).

---

### GAP-M2: Scheduling Integration
**Severity: MEDIUM | Effort: Medium | Phase: 3**

| What Exists | What's Needed |
|-------------|---------------|
| CalExp5 timesheet calendar (hours entry) | Jobber API integration for service scheduling |
| No appointment system | Customer-facing appointment browser |
| No crew dispatch | Service request → assignment → completion workflow |
| No route optimization | Geographic clustering for service days |

**Recommendation:** Don't build scheduling from scratch. Integrate Jobber ($49-149/mo) via API. New MCP tool: `schedule_service`.

---

### GAP-M3: Zero-Friction Acquisition Channels
**Severity: MEDIUM | Effort: Medium | Phase: 2+**

| What Exists | What's Needed |
|-------------|---------------|
| sendBeacon for transcripts (fire-and-forget) | Inbound email processing (SendGrid/Mailgun webhook) |
| No inbound email | Per-property email address (`prop247@buddy.bb`) |
| No SMS/MMS | Twilio webhook for photo ingestion |
| Google Drive upload exists | Drive change polling for auto-ingestion |
| BB Buddy voice capture (crew memory) | Extend to homeowner RAG entries |
| No connected account sync | Green Button API (PG&E), solar monitoring APIs |

---

### GAP-M4: Design & Estimation Agents
**Severity: MEDIUM | Effort: Medium | Phase: 3**

| What Exists | What's Needed |
|-------------|---------------|
| Claude Vision for identification | `analyze_space` tool — room dimensions from video/LiDAR |
| No cost estimation | `estimate_project` tool — tiered costs from room analysis + BB cost tables |
| No image generation | `generate_design` tool — DALL-E 3 inpainting for remodel visualization |
| SerpAPI for product search | `find_products` tool — supplier APIs for specific fixtures/materials |
| No permit checking | `check_permits` tool — RAG on local building codes |

---

## LOW GAPS (future phases, nice-to-have)

### GAP-L1: Spatial/3D Processing Pipeline
**Severity: LOW | Effort: Large | Phase: future**

| What Exists | What's Needed |
|-------------|---------------|
| Nothing | Video walkthrough processing (Gemini 2.5 Flash, $0.27/30 min) |
| Nothing | Polycam/LiDAR integration for floor plans |
| Nothing | Hover API for exterior measurements |
| Nothing | Temporal video indexing (Twelve Labs or custom) |

---

### GAP-L2: Retail Product Cross-Reference
**Severity: LOW | Effort: Small | Phase: 2+**

| What Exists | What's Needed |
|-------------|---------------|
| SerpAPI web search | Cross-reference installed asset → compatible products → live pricing |
| Claude web_search | BB's curated product recommendations in RAG |
| No product compatibility data | Manufacturer filter/part compatibility in RAG knowledge |

---

### GAP-L3: Voice Model Abstraction
**Severity: LOW | Effort: Large | Phase: 4**

| What Exists | What's Needed |
|-------------|---------------|
| OpenAI Realtime Mini (hardcoded) | Abstract transport for multi-provider (Gemini Live, future Claude Realtime) |
| Gemini fallback exists (`scan-live.html`) | Settings: crew picks voice provider, not just voice name |

---

## NEON DATABASE GAP SUMMARY

### Current: 49 tables + 5 views across 6 domains
### V2 needs: 9 new tables + 1 extension + indexes + RLS policies

| New Table | Columns | Indexes | RLS | Priority |
|-----------|---------|---------|-----|----------|
| `CREATE EXTENSION vector` | — | — | — | CRITICAL |
| `bb_knowledge_chunks` | ~15 + vector(1536) | HNSW, GIN, B-tree x3 | Yes | CRITICAL |
| `bb_properties` | ~20 | B-tree x3 | Yes | HIGH |
| `bb_property_trees` | ~15 | B-tree x2 | Yes | HIGH |
| `bb_home_assets` | ~25 + generated col | B-tree x4 | Yes | HIGH |
| `bb_service_projects` | ~15 | B-tree x3 | Yes | HIGH |
| `bb_service_line_items` | ~15 | B-tree x3 | Yes | HIGH |
| `bb_rooms` | ~15 (TBD) | TBD | Yes | MEDIUM |
| `tenant_providers` | ~5 (TBD) | TBD | — | MEDIUM |
| RLS policies | — | — | 6 tables | CRITICAL |

### Tables That Can Be Reused/Extended

| Existing Table | V2 Use | Extension Needed |
|---------------|--------|-----------------|
| `cal_scan_sessions` | BB Buddy session tracking | Add `tenant_id`, `audience` columns |
| `cal_scan_transcripts` | Transcript storage | Add `tenant_id` column |
| `cal_crew_memory` | Per-employee/customer memory | Add `tenant_id`, rename to support customers |
| `cal_notifications` | Reports, alerts, reminders | Add `tenant_id` column |
| `properties` | Property master data | Either extend with V2 fields OR create parallel `bb_properties` |
| `cal_assets` | Asset patterns/events | Either extend with appliance classes OR create `bb_home_assets` |
| `cal_push_subscriptions` | Push notifications | Add `tenant_id` column for customer push |

---

## CalExp5 GAP SUMMARY

### Reusable (50-60% of V2 frontend exists)

| Component | Reuse Level | Notes |
|-----------|-------------|-------|
| DocumentCamera | HIGH | Adapt for inspections, damage reports, document scan |
| Receipt scan workflow | HIGH | Pattern for quotes, estimates, work completion |
| API client (`apiCall`) | HIGH | Token injection, retry, idempotency — rock solid |
| Zustand state slices | HIGH | Pattern proven, add new slices for jobs/quotes |
| Push notifications | HIGH | VAPID infrastructure ready, just needs customer endpoints |
| GPS fleet system | HIGH | Track technician to customer, proximity sorting |
| Asset model | HIGH | Foundation for home assets, just need new metadata schemas |
| Property cards/views | MEDIUM | Reuse for customer property dashboard |
| Feature flags | MEDIUM | Extend for customer features |
| Offline queue | MEDIUM | Pattern for offline job updates |

### Needs Building (new for V2)

| Feature | Effort | Notes |
|---------|--------|-------|
| Customer auth flow | 2 weeks | Email/password or OAuth, customer roles |
| Service scheduling UI | 3-4 weeks | Appointment browser, service requests |
| Document upload (general) | 1-2 weeks | PDF viewer, multi-page, not just camera |
| Appliance inventory UI | 1-2 weeks | Gallery view with warranty/maintenance status |
| Service history timeline | 1 week | Project history with line-item drill-down |
| Subscription management | 2 weeks | Tier selection, billing integration |
| Property knowledge score | 1 week | Completeness indicator with guided prompts |
| Multi-tenant data filtering | 1-2 weeks | Customer sees only their property |

**Total estimated frontend effort:** 10-13 weeks

---

## BRIDGE GAP SUMMARY — COMPLETE AUDIT

### Bridge Scorecard (v2.8.0)

| Category | Score | Notes |
|----------|-------|-------|
| Routes & Endpoints | 10/10 | 150+ endpoints across 41 route files |
| Database | 9/10 | Solid schema, missing vector indexes |
| Auth | 8/10 | 3-tier API key + WebAuthn + PIN. Fragmented identity model. |
| AI Integrations | 9/10 | Claude Sonnet 4.6 + Haiku 4.5 + OpenAI Whisper + Gemini Live + SerpAPI |
| File Processing | 9/10 | pdf-lib, sharp (image), Google Drive OAuth2, no standalone OCR |
| Background Jobs | 6/10 | 5 crons via setTimeout — not distributed, no queue abstraction |
| Security | 9/10 | Helmet CSP, rate limiting, CORS lockdown, session validation |
| **V2 Readiness** | **5/10** | **Missing MCP + vector search** |

### What Exists (strong foundation)

| Capability | Details | Files |
|-----------|---------|-------|
| **150+ REST endpoints** | QBO, QBT, GPS, receipts, assets, scan, push, auth, admin | 41 route files in `src/routes/` |
| **4 AI providers configured** | Anthropic (Claude Sonnet+Haiku), OpenAI (Whisper), Gemini (Live), SerpAPI | `src/clients/receipt-ai.js`, `tool-ai.js`, `scan-ai.js`, `whisper.js` |
| **Google Drive (comprehensive)** | Upload, download, move, search, metadata, auto-folder by month, OAuth2 | `src/clients/google-drive.js`, `asset-storage.js` |
| **Gmail sending** | RFC 2822 raw email, inline JPEG, HTML tables | `src/clients/receipt-email.js` |
| **PDF generation** | pdf-lib for receipt PDFs with embedded metadata | `src/clients/receipt-pdf.js` |
| **Image processing** | sharp — EXIF rotation, resize, thumbnails, Street View proxy | `src/clients/receipt-image.js` |
| **5 cron jobs** | GPS reconstruction (daily), GPS retention (monthly), push (hourly), compliance (daily), receipt sync (daily) | `src/utils/gps-cron.js`, `gps-retention.js`, `push-scheduler.js`, `compliance-cron.js`, `receipt-sync.js` |
| **Auth (3 tiers)** | API key (X-API-Key), WebAuthn + PIN (CalExp5 crew), Extension key (recon) | `src/plugins/auth-v2.js`, `src/routes/cal-auth.js` |
| **Clerk auth stub** | Commented out, ready for activation | `src/plugins/auth-v2.js` lines 12-18 |
| **VAPID push** | Web push notifications with device management | `web-push` package, `push-v1.js` |
| **Resend email** | Package installed (v6.9.4) but not yet used in routes | `package.json` |
| **Neon serverless** | Lazy singleton, connection reset on error, tagged SQL | `src/utils/neon-sql.js` |
| **Graceful shutdown** | `close-with-grace`, all crons stopped before Fastify close | `src/index-v2.js` lines 390-413 |

### What's Missing for V2

| Gap | Severity | What to Build | Effort |
|-----|----------|--------------|--------|
| **MCP server** | CRITICAL | `/mcp` route + `@modelcontextprotocol/server` + tool registration | 2-3 days |
| **pgvector search** | CRITICAL | `CREATE EXTENSION vector`, embedding pipeline, hybrid search endpoint | 3-5 days |
| **Agent wrapper modules** | CRITICAL | `src/agents/vision-agent.js`, `knowledge-agent.js`, etc. with config-driven model selection | 2-3 days |
| **JWT tenant auth** | CRITICAL | Extend auth-v2.js for JWT with tenant_id/audience claims. Activate Clerk stub or custom. | 3-5 days |
| **Job queue** | HIGH | pg-boss for document ingestion pipeline (current crons use setTimeout — not distributed) | 2-3 days |
| **Document ingestion** | HIGH | OCR pipeline (Google Vision or Claude Vision), chunking, contextual enrichment, embedding | 5-7 days |
| **Property CRUD** | HIGH | Extend `properties-v1.js` or new `bb-properties-v1.js` with tenant_id + RLS | 2-3 days |
| **Home asset endpoints** | HIGH | New routes for appliance inventory, warranty, maintenance schedule | 3-4 days |
| **Service project/line-item endpoints** | HIGH | New routes for project history with line-item granularity | 2-3 days |
| **Inbound email webhook** | MEDIUM | SendGrid/Mailgun webhook → classify attachment → ingest pipeline | 2-3 days |
| **SMS/MMS webhook** | MEDIUM | Twilio webhook → extract image → OCR → ingest pipeline | 1-2 days |
| **RLS enforcement** | CRITICAL | `SET app.tenant_id` before every query, RLS policies on all bb_* tables | 2-3 days |

### Key Architecture Findings

**1. Clerk Auth Stub Exists**
```javascript
// src/plugins/auth-v2.js lines 12-18 — ready for activation
```
This de-risks GAP-C3 (multi-tenant auth). Clerk is already in the code, just commented out. When activated, it provides JWT with custom claims (tenant_id, audience).

**2. No Distributed Cron Safety**
Current crons use `setTimeout` — if deployed multi-instance on Railway, all crons fire on all instances. Risk: GPS reconstruction runs 5x in parallel. Solution: pg-boss replaces setTimeout crons with distributed locking.

**3. No OCR Library — Claude Vision Is the OCR**
The codebase has no Tesseract or dedicated OCR. All text extraction uses Claude Vision directly. This works but costs more per image than dedicated OCR ($0.004/image Sonnet vs $0.0015/image Google Vision). For bulk ingestion, adding Google Vision OCR as primary with Claude Vision fallback saves ~60%.

**4. Resend Email Package Installed but Unused**
`resend` v6.9.4 is in package.json but no routes use it. Could be activated for customer-facing notifications (cleaner than Gmail API for transactional email).

**5. SSE Exists in One Place**
`tools-v1.js` POST `/enrich-all` uses Server-Sent Events for streaming progress. This pattern is reusable for document ingestion progress tracking.

---

## IMPLEMENTATION PRIORITY MAP

```
PHASE 0 (Agents SDK)          ← CURRENT PRIORITY
  ├── Install @openai/agents-realtime + zod v4
  ├── Vite build setup for HTML client
  ├── Rewrite bb-scan-openai.html to use RealtimeAgent
  ├── Test on iOS Safari
  └── No backend changes

PHASE 1 (MCP Tools)           ← Unblocks everything
  ├── GAP-C1: MCP server on Bridge (/mcp route)
  ├── GAP-H4: Audience-gated tool registry
  ├── Move 5 existing tools to MCP
  ├── Remove API keys from client
  └── Per-agent cost tracking

PHASE 2 (RAG)                 ← Enables property knowledge
  ├── GAP-C2: pgvector + bb_knowledge_chunks
  ├── GAP-H1: Property tables (partial)
  ├── GAP-H2: Ingestion pipeline
  ├── GAP-M3: Acquisition channels (Drive polling)
  └── Test with 970 Huntington data

PHASE 3 (Financial + Actions + Auth) ← Enables customer-facing
  ├── GAP-C3: Multi-tenant authentication
  ├── GAP-H1: Remaining property tables
  ├── GAP-M2: Scheduling integration (Jobber)
  ├── GAP-M4: Design & estimation agents
  └── Home asset inventory + warranty tracking

PHASE 4-6 (Scale)             ← Full platform
  ├── GAP-M1: Customer portal
  ├── GAP-L1: Spatial/3D processing
  ├── GAP-L2: Retail product cross-reference
  ├── GAP-L3: Voice model abstraction
  └── Subscription management + billing
```

---

## RISK REGISTER

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Agents SDK doesn't work on iOS Safari | HIGH | Phase 0 is explicitly a test. Fallback: keep raw WebRTC + add MCP tools. |
| Neon free tier too small for pgvector | LOW | Launch plan is $5/mo. Trivial cost. |
| MCP connection latency to Railway | MEDIUM | Measure in Phase 1. OpenAI async function calls mask latency. |
| Multi-tenant RLS misconfiguration → data leak | CRITICAL | 5-layer defense (RLS + app filter + JWT + audit). Integration tests on every deploy. |
| Document ingestion quality for scanned PDFs | MEDIUM | OCR quality checks, manual review flag (~10-15% need review). |
| Parallel `bb_properties` vs extending `properties` | MEDIUM | Design decision needed before Phase 2. Affects migration complexity. |
| CalExp5 customer auth → breaks employee flows | HIGH | Feature flag all customer features. Separate auth routes. Progressive rollout. |

---

*Measured against: BB_BUDDY_ARCHITECTURE_V2.md v1.1 (1,975 lines)*
*Branch: bb-buddy-v4-agents*
*Audited: 2026-04-01*
