# BB Universal Asset System — Sizing & Feasibility Study | v1.0 | 2026-03-30 | BB

## Executive Summary

**The current infrastructure handles all 24 phases without architectural changes.**
The only required upgrade is Neon storage (free tier → Launch at $19/mo) by Year 2.
Total annual cost: ~$1,200-1,500. Less than one lost power tool per month.

---

## Current State (Baseline Measurements)

### CalExp5 (Frontend PWA)

| Metric | Value |
|--------|-------|
| Source files | 90 (JS/JSX in src/) |
| Lines of code | 30,392 |
| Production bundle | 821 KB JS + 77 KB CSS = **898 KB** |
| Prod dependencies | 7 (react, react-dom, zustand, express, hammerjs, compression, webauthn) |
| Dev dependencies | 13 |
| Largest component | ReceiptScanModal (2,007 LOC) |
| Tests | 426 across 29 files |
| Build tool | Vite 6.0 + React 19 + Zustand 5 + Tailwind 4 |

### BB_Micro_Bridge (Backend API)

| Metric | Value |
|--------|-------|
| Source files | 83 (JS in src/) |
| Lines of code | 24,872 |
| Route files | 24 |
| Client/util files | 36 |
| Prod dependencies | 27 |
| Railway memory limit | **420 MB** (`--max-old-space-size=420`) |
| Railway replicas | 1 |
| Framework | Fastify 5 |

### Neon Database (Free Tier)

| Metric | Value |
|--------|-------|
| Tables | ~35 |
| Estimated rows | ~5,000-10,000 |
| Estimated storage | ~50-100 MB |
| Plan | Free ($0/mo) |
| Compute | Up to 2 CU (8 GB RAM), 100 CU-hours/mo |
| Storage limit | **0.5 GB** |
| Connections (pooled) | Up to 10,000 via PgBouncer |
| Scale to zero | After 5 min (mandatory on free) |

---

## Service Limits (Verified 2026-03-30)

### Neon PostgreSQL

| Limit | Free Tier | Launch ($19/mo) | Scale |
|-------|-----------|-----------------|-------|
| Storage | **0.5 GB** | Pay-per-GB ($0.35/GB/mo) | Same |
| Compute hours | 100 CU-hours/mo | Pay-per-use ($0.106/CU-hr) | Same |
| Max compute | 2 CU (8 GB RAM) | 16 CU (64 GB RAM) | 56 CU (224 GB RAM) |
| Branches | 10 | 10 (+$1.50/extra) | 25 |
| Connections (PgBouncer) | 10,000 | 10,000 | 10,000 |
| Direct connections (2 CU) | 839 | 839 | 839 |
| Egress | 5 GB included | 100 GB included | 100 GB |
| Scale to zero | 5 min (mandatory) | 5 min (can disable) | Configurable |
| Cold start | ~200-500ms | Same (or always-on) | Same |

### Railway

| Limit | Hobby ($5/mo) | Pro ($20/mo) |
|-------|---------------|--------------|
| vCPU per service | Up to 48 | Up to 1,000 |
| RAM per service | Up to 48 GB | Up to 1 TB |
| RAM per replica | 8 GB | 24 GB |
| Replicas per service | 6 | 42 |
| Custom domains | 2 | 20 |
| Services per project | 50 | 100 |
| Memory pricing | $10.04/GB/month | Same |
| CPU pricing | $20.08/vCPU/month | Same |
| Egress | $0.05/GB | Same |

### Google Drive API

| Limit | Value |
|-------|-------|
| Queries per 60 seconds | 12,000 (per user and per project) |
| Daily upload | 750 GB/day |
| Max file size | 5 TB |
| Files per folder (performance) | ~400,000 before degradation |
| Business Starter storage | 30 GB per user ($7.20/user/mo) |
| Business Standard storage | 2 TB per user ($14.40/user/mo) |

### Claude API (Sonnet 4.6)

| Limit | Value |
|-------|-------|
| Input tokens | $3/M tokens |
| Output tokens | $15/M tokens |
| Batch discount | 50% off |
| Image pricing | ~$0.0048/image (1092×1092) |
| Cache read | $0.30/M tokens (10x cheaper than uncached) |
| Tier 1 RPM | 50 req/min |
| Tier 2 RPM | 1,000 req/min ($40 deposit) |
| Tier 3 RPM | 2,000 req/min ($200 deposit) |

---

## Projected Growth (All 24 Phases)

### Database — Row Count Projection

| Table / Group | Year 1 | Year 2 | Year 3 |
|---------------|--------|--------|--------|
| `cal_assets` (all classes) | 6,000 | 15,000 | 30,000 |
| `cal_asset_media` | 8,000 | 20,000 | 40,000 |
| `cal_asset_events` | 15,000 | 40,000 | 80,000 |
| `cal_asset_audit_sessions` | 500 | 1,200 | 2,500 |
| `cal_auth_users` | 70 | 120 | 200 |
| `cal_crew_tasks` | 5,000 | 12,000 | 20,000 |
| `cal_crew_notes` | 3,000 | 8,000 | 15,000 |
| `cal_asset_corrections` | 1,000 | 2,500 | 5,000 |
| **New tables total** | **38,500** | **99,000** | **193,000** |
| **Existing tables** | 10,000 | 15,000 | 20,000 |
| **Grand total** | **48,500** | **114,000** | **213,000** |

### Database — Storage Projection

| Component | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| Existing tables | 100 MB | 120 MB | 140 MB |
| New table rows | 30 MB | 75 MB | 150 MB |
| GIN indexes (JSONB) | 15 MB | 40 MB | 80 MB |
| B-tree indexes | 10 MB | 25 MB | 50 MB |
| **Total storage** | **155 MB** | **260 MB** | **420 MB** |

| | Year 1 | Year 2 | Year 3 |
|---|--------|--------|--------|
| **Free tier (0.5 GB)** | OK (155 MB) | **TIGHT (260 MB)** | **EXCEEDS** |
| **Launch tier (10+ GB)** | — | OK | OK |

**Decision: Stay on free tier Year 1. Upgrade to Launch ($19/mo) when storage approaches 400 MB (likely mid-Year 2).**

### Database — Query Performance

| Row Count | Indexed Query (GIN/B-tree) | Sequential Scan | Cold Start Penalty |
|-----------|---------------------------|-----------------|-------------------|
| 50K | 1-5 ms | 50-200 ms | +200-500 ms |
| 100K | 1-10 ms | 100-500 ms | +200-500 ms |
| 200K | 5-15 ms | 200ms-1s | +200-500 ms |

At 200K rows (Year 3), indexed queries remain sub-15ms. **No performance concern at any projected scale.** Sequential scans (full table scans without WHERE clause) are the only risk — avoid them with proper indexes, which we've already designed.

**Cold start:** Neon free tier scales to zero after 5 min idle. First query after idle takes 200-500ms extra. With 10+ crew using the app daily, the database will rarely be cold. On Launch tier, scale-to-zero can be disabled ($0.106/CU-hour for always-on).

---

## CalExp5 (Frontend) — Impact Analysis

### Bundle Size

| Component | Estimated Size |
|-----------|---------------|
| Current bundle | 898 KB |
| Tool scanner + scanner components | +18 KB |
| Home screen (map + cards) | +28 KB |
| Bottom bar + splash screens | +9 KB |
| Assets tab + audit checklist | +18 KB |
| My Notes + composer | +9 KB |
| Dashboards (tool, ticket, compliance) | +30 KB |
| Portal views (customer + sub) | +18 KB (lazy-loaded) |
| Ticket views | +11 KB |
| Subscription + scheduling calendar | +18 KB |
| Store slices + utilities | +11 KB |
| **Total new** | **+170 KB** |
| **Projected bundle** | **~1,068 KB** |

**Bundle growth: +19%.** Still under 1.1 MB — excellent for a PWA. For comparison, typical React apps are 2-5 MB. Portal views can be lazy-loaded to keep the crew bundle even leaner.

### Source Code

| Metric | Current | Projected | Growth |
|--------|---------|-----------|--------|
| Files | 90 | ~135 | +50% |
| Lines of code | 30,392 | ~48,000 | +58% |
| Components | 49 | ~75 | +53% |
| Tests | 426 | ~650 | +53% |

**Codebase approximately doubles.** The existing architecture (Zustand slices, modal system, feature flags, API layer) scales cleanly to this size. No refactoring needed.

---

## BB_Micro_Bridge (Backend) — Impact Analysis

### Code Growth

| Metric | Current | Projected | Growth |
|--------|---------|-----------|--------|
| Files | 83 | ~100 | +20% |
| Lines of code | 24,872 | ~30,000 | +21% |
| Route files | 24 | 28 | +4 |
| Client/util files | 36 | 47 | +11 |

**Backend grows only ~20%.** The new route files follow existing patterns exactly (same Fastify plugin structure, same Neon query patterns, same error handling).

### Memory (Railway 420 MB Limit)

| Component | Current | Added | Total |
|-----------|---------|-------|-------|
| Node.js base + Fastify | 80 MB | — | 80 MB |
| Sharp (image processing) | 50 MB | — | 50 MB |
| LRU image cache (2,000 entries) | 130 MB | +25 MB (tool thumbs) | 155 MB |
| Route handlers + cached data | 30 MB | +10 MB | 40 MB |
| In-memory scan store | 5 MB | +5 MB (tool scans) | 10 MB |
| Rate limiter | 5 MB | — | 5 MB |
| **Total** | **~300 MB** | **+40 MB** | **~340 MB** |

**Headroom: 80 MB within 420 MB limit.** If needed, increase to 512 MB (Railway config change, no cost difference on usage-based pricing).

### Throughput

| Scenario | Requests/sec | Fastify Capacity | Utilization |
|----------|-------------|-----------------|-------------|
| Current (crew only, ~10 users) | 5-10 | 10,000+ | 0.1% |
| All phases (55 users: crew + customers + subs) | 15-25 | 10,000+ | 0.25% |
| Peak (audit day + service scheduling) | 40-50 | 10,000+ | 0.5% |

**Single instance handles everything.** Node.js/Fastify's async I/O model means Claude API calls, Drive uploads, and Neon queries don't block the event loop. Even at 50 req/sec peak, we're at 0.5% of theoretical capacity.

---

## Google Drive — Impact Analysis

### File Growth

| Asset Class | Files/Year | Avg Size | Annual Storage |
|-------------|-----------|----------|----------------|
| Tool photos (catalog) | 600 | 150 KB | 90 MB |
| Tool audit evidence | 3,000 | 100 KB | 300 MB |
| Tool wrapper PDFs | 400 | 200 KB | 80 MB |
| Sidecar manifests | 3,000 | 2 KB | 6 MB |
| Daily reports (mixed media) | 2,500 | 1 MB | 2,500 MB |
| Progress photos | 500 | 1 MB | 500 MB |
| Site docs | 1,000 | 500 KB | 500 MB |
| Design files | 100 | 5 MB | 500 MB |
| Enrichment (manuals, product photos) | 200 | 3 MB | 600 MB |
| Service visit photos | 1,000 | 200 KB | 200 MB |
| **Annual total** | **~12,300 files** | | **~5.3 GB** |

| | Year 1 | Year 3 | Year 5 |
|---|--------|--------|--------|
| Cumulative files | 12,300 | 37,000 | 62,000 |
| Cumulative storage | 5.3 GB | 16 GB | 27 GB |
| Business Starter limit (30 GB) | 18% | 53% | 90% |

**Decision: Business Starter ($7.20/user/mo, 30 GB) is sufficient through Year 5.** If daily report video becomes heavy, upgrade to Business Standard ($14.40, 2 TB).

### API Usage

| Operation | Daily Peak | Per-Minute Peak | Drive Limit (12K/min) | Utilization |
|-----------|-----------|----------------|----------------------|-------------|
| Thumbnail retrieval (LRU miss) | 100 | 10 | 12,000 | 0.08% |
| File upload (deposits) | 50 | 5 | 12,000 | 0.04% |
| Manifest write | 30 | 3 | 12,000 | 0.025% |
| **Combined peak** | **180** | **18** | **12,000** | **0.15%** |

**Drive API is not even remotely a bottleneck.**

---

## Claude API — Impact Analysis

### Monthly Call Volume

| Use Case | Calls/Mo | Avg Input Tokens | Avg Output Tokens | Monthly Cost |
|----------|----------|-----------------|-------------------|-------------|
| Tool catalog (vision scan) | 50 | 2,000 | 500 | $0.68 |
| Tool audit (vision match) | 900 | 3,000 | 300 | $12.15 |
| Tool enrichment (world knowledge) | 20 | 500 | 800 | $0.27 |
| Receipt → tool detection | 100 | 1,500 | 300 | $0.90 |
| Daily report summarization | 200 | 2,000 | 500 | $2.70 |
| Compliance doc extraction | 50 | 2,000 | 300 | $0.53 |
| Ticket categorization | 20 | 500 | 300 | $0.12 |
| **Monthly total** | **1,340** | | | **$17.35** |

**With prompt caching** (80% cache hit on tool audit prompts where the tool list is repeated):
- Tool audit uncached: 180 calls × $0.0135 = $2.43
- Tool audit cached: 720 calls × $0.0019 = $1.37
- **Revised monthly total with caching: ~$10-12**

### Rate Limit Check

| Tier | RPM Limit | Our Peak RPM | Utilization |
|------|-----------|-------------|-------------|
| Tier 1 ($5 deposit) | 50 | ~5 (during audit) | 10% |
| Tier 2 ($40 deposit) | 1,000 | ~5 | 0.5% |

**Tier 1 is sufficient.** Even during a full 30-tool audit (one frame every 2 seconds), we peak at ~30 RPM — within Tier 1's 50 RPM limit. Upgrade to Tier 2 ($40 deposit) only if multiple crews audit simultaneously.

### Annual Cost

| Scenario | Monthly | Annual |
|----------|---------|--------|
| Current (receipts only) | ~$15 | $180 |
| All 24 phases (with caching) | ~$12 | $144 |
| Heavy month (full catalog + 10 audits) | ~$30 | — |
| Worst case (no caching, max audits) | ~$45 | $540 |

**Claude API cost actually DECREASES with prompt caching.** The tool audit prompt (which includes the site's tool list) caches for 5 minutes — covering an entire audit session at $0.30/M tokens instead of $3/M tokens.

---

## Concurrent Users — Capacity Check

### User Projections

| User Type | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| BB Employees | 10 | 12 | 15 |
| Subcontractors | 10 | 20 | 30 |
| Customers | 15 | 30 | 50 |
| **Total users** | **35** | **62** | **95** |
| **Peak concurrent** | **10-15** | **15-25** | **25-40** |

### Can the System Handle 40 Concurrent Users?

| Component | Capacity | At 40 Concurrent | Headroom |
|-----------|----------|------------------|----------|
| Fastify (req/sec) | 10,000+ | ~50 req/sec | 99.5% |
| Neon (connections) | 10,000 pooled | ~40 | 99.6% |
| Neon (query speed) | Sub-15ms indexed | Sub-15ms | No degradation |
| Railway (memory) | 420 MB | 340 MB | 19% |
| Google Drive (API/min) | 12,000 | ~20 | 99.8% |
| Claude (RPM Tier 1) | 50 | ~5 peak | 90% |

**The only tight spot is Claude Tier 1 RPM (50/min)** if multiple crews run tool audits simultaneously. Solution: upgrade to Tier 2 ($40 one-time deposit, 1,000 RPM). Everything else has 95%+ headroom.

---

## Google Maps API — Cost Impact

### Current Usage
- JobsitesView map loads: ~50/day (crew checking jobsites)
- Street View static images: cached by Bridge LRU, minimal API calls after warm

### Added Usage (Home Screen Map)
- Home screen map loads on every app open: ~10 crew × 5 opens/day = 50 loads/day
- Plus customers/subs viewing portals: ~30/day
- Store markers: use existing `cal_stores` data, no Places API calls needed

### Cost Estimate

| API | Monthly Loads | Free Tier | Cost After Free |
|-----|-------------|-----------|-----------------|
| Maps JavaScript | ~2,400 | 28,000/mo free | $0 (within free tier) |
| Static Street View | ~500 (cached) | 28,000/mo free | $0 |
| Geocoding (one-time) | ~50 | 40,000/mo free | $0 |
| **Monthly total** | | | **$0 (within free tiers)** |

**Google Maps is free at BB's scale.** The $200/month free credit covers everything. Only at 28,000+ map loads/month ($7/1000 after) would costs appear — that's 900 loads/day, far beyond BB's usage.

---

## Total Cost of Ownership

### Monthly Cost Breakdown

| Service | Year 1 | Year 2 | Year 3 |
|---------|--------|--------|--------|
| Railway (Bridge + CalExp5 + OSRM + Traccar) | $25 | $25 | $30 |
| Neon PostgreSQL | $0 (free) | $19 (Launch) | $19 |
| Claude API (Sonnet 4.6) | $12 | $15 | $20 |
| Google Workspace (Drive) | $7 | $7 | $14 |
| Google Maps API | $0 | $0 | $0 |
| Domain (BainbridgeBuilders.com) | $1 | $1 | $1 |
| **Monthly total** | **$45** | **$67** | **$84** |
| **Annual total** | **$540** | **$804** | **$1,008** |

### ROI Context

| Cost | Annual |
|------|--------|
| **System cost (Year 1)** | **$540** |
| Tool loss prevention (10 crew × $500-1,000/yr) | $5,000-10,000 saved |
| Time saved looking for tools (1hr/week × 10 crew × $50/hr × 50 weeks) | $25,000 saved |
| Subscription service revenue (Year 2: 10 customers × $600/yr) | $6,000 revenue |
| Reduced admin time (compliance tracking, scheduling) | $5,000-10,000 saved |
| **ROI** | **$36,000-51,000 value / $540 cost = 67-94x return** |

---

## Risk Matrix

| Risk | Severity | Likelihood | Impact | Mitigation | Cost |
|------|----------|-----------|--------|------------|------|
| Neon storage exceeds 0.5 GB | Low | High (Year 2) | Service degradation | Upgrade to Launch tier | $19/mo |
| Bridge memory exceeds 420 MB | Low | Low | Crash/restart | Increase to 512 MB in Railway config | $0 |
| Claude Tier 1 RPM hit (50/min) | Low | Medium (simultaneous audits) | Audit frames queued/delayed | Upgrade to Tier 2 ($40 deposit) | $0 ongoing |
| Neon cold start (scale-to-zero) | Low | Medium | 200-500ms first query | Disable on Launch tier ($0.106/CU-hr) | ~$3/mo |
| Google Drive file count | None | Very Low | No impact at 62K files | — | — |
| CalExp5 bundle bloat | None | Very Low | 1,068 KB is lean | Code split portals | — |
| iOS IndexedDB eviction | Low | Low | Lose cached tool crib | Call `navigator.storage.persist()` | $0 |
| Multi-crew audit Claude RPM | Medium | Low | Frame queuing | Queue + retry, or Tier 2 | $0-40 |

---

## Recommendations

### Immediate (Before Building Phase 1)

1. **No changes needed.** Current infrastructure handles Phase 1-5 (Tool Tracker) without any upgrades.

### Year 1 Upgrades

| When | What | Cost |
|------|------|------|
| Phase 1 start | Deposit $5 on Anthropic (Tier 1 if not already) | $5 (one-time) |
| Phase 12 (external users) | Register BainbridgeBuilders.com domain + wildcard DNS | ~$12/year |
| If simultaneous audits become common | Deposit $40 on Anthropic (Tier 2, 1,000 RPM) | $40 (one-time) |

### Year 2 Upgrades

| When | What | Cost |
|------|------|------|
| Storage approaching 400 MB | Neon Free → Launch tier | $19/mo |
| If daily report video is heavy | Google Workspace Starter → Standard | +$7/user/mo |

### NOT Needed (Confirmed)

| Upgrade | Why Not |
|---------|---------|
| Railway scale-up (more memory/CPU) | 420 MB is sufficient, 0.5% CPU utilization |
| Railway replicas | Single instance handles 40 concurrent users |
| Neon Scale tier | Launch tier is sufficient through Year 5+ |
| CDN for assets | Google Drive serves as CDN with browser caching |
| Redis/cache layer | In-memory LRU on Bridge is sufficient |
| Message queue (RabbitMQ, etc.) | In-memory job queues on Bridge are sufficient |
| Separate microservices | Monolith Bridge handles all 24 phases |

---

## Conclusion

**The BB Universal Asset System is fully feasible on current infrastructure.** The architecture
is designed for a small construction company (10-15 crew, 50-100 customers, 30 subs) and the
infrastructure scales linearly to that target without any breaking points.

The most expensive component is Sam's time designing and building it — not the infrastructure
to run it. Total system cost is less than one power tool per month.

---

*Study based on actual codebase measurements (2026-03-30), verified service pricing from
official documentation, and projected growth from 24-phase build order.*
