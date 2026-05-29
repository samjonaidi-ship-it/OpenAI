# ControlTower v2 — Standalone App Scope
## 2026-04-11

> **Forward reference (2026-04-11):** An execution plan now exists: [`CACHE_STRATEGY_IMPLEMENTATION_PLAN.md`](CACHE_STRATEGY_IMPLEMENTATION_PLAN.md) Phases 3a and 3b. Read the plan for per-file sequencing. This scope doc is the architectural source of truth; the plan is the execution document.

**This document describes the new standalone ControlTower app that replaces the current ControlTower view inside CalExp5.**

**This is a peer document to `PROJECTION_CACHE_STRATEGY_PROPOSAL.md` v3 and `DATA_MANAGER_MERGER_PROPOSAL.md` v1. Read all three together.**

---

## 0. The scope in one paragraph

**ControlTower v2 is a new standalone web app, deployed to Railway as its own service, accessed by admins at its own URL. It is NOT a tab inside CalExp5; CalExp5's current ControlTower view is deprecated and removed after cutover. ControlTower v2 is the single operator interface for BB's entire backend: bridge observability (webhooks, crons, CDC, freshness latency), bridge operational controls (token injection, emergency recovery, job replay), freshness diagnostics (entity lookup, drift detection, conflict log), and master data enrichment (the Data Manager tab absorbing BB_Data_Manager's admin UI). The stack is React + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query + TanStack Router + Zustand — modern, desktop-first but responsive, minimal ceremony. Authentication is via the bridge's existing admin session system. It lives in its own repo (`BB_ControlTower`) and has its own deployment lifecycle, independent of CalExp5's release cadence. The v2 app launches alongside the cache strategy and Data Manager merger initiatives in a phased rollout over ~12 weeks.**

---

## 1. Why a standalone app

### 1.1 The problem with ControlTower inside CalExp5

CalExp5 is a field crew PWA. Its users are ~10 crew members scanning receipts, clocking in/out, checking timesheets on phones. Its UX is mobile-first, touch-optimized, offline-capable, and lightweight.

ControlTower is an admin operator console. Its users are 2-5 back-office admins monitoring the bridge, resolving master data conflicts, running diagnostics, replaying failed webhooks, approving enrichments. Its UX is desktop-first, keyboard-friendly, data-dense, and depends on real-time updates.

**These are two completely different user populations with completely different UX needs.** Trying to host both in one React app:
- Bloats the CalExp5 bundle with admin-only code that crew members never touch
- Mixes two authentication/authorization models (crew sessions vs admin sessions)
- Couples two deployment cadences that shouldn't be coupled (crew app updates daily, operator console updates when new observability panels are built)
- Makes CalExp5's testing surface much larger
- Complicates mobile performance optimization

Separating them is the correct long-term split.

### 1.2 What Sam explicitly confirmed (D15'b)

*"Im thinking that we are burdening CalExp5 with too much and ControlTower needs now to become its own app running online- a full re-write is ok."*

Plus Sam's D22 answer: ControlTower absorbs new responsibilities (Data Manager tab, freshness diagnostics, operational controls). That doubles its scope. Trying to fit the expanded responsibility inside CalExp5 is not viable.

### 1.3 What this doesn't change

ControlTower v2 still talks to the same bridge. All its data comes from bridge endpoints. It doesn't query Neon directly. It doesn't bypass the projection layer. It's a consumer like any other consumer, just with admin-scoped access.

---

## 2. Stack choice

Per Sam's Q5 answer ("ControlTower stack can be anything that is modern and lends itself to mobile as well as desktop") and my earlier recommendation:

### 2.1 Recommended stack

**Framework:** React 19 with TypeScript
**Build:** Vite 6+
**Styling:** Tailwind CSS 4 + shadcn/ui components
**Routing:** TanStack Router (file-based, type-safe)
**Data fetching:** TanStack Query v5
**State management:** Zustand (minimal global state for auth and active session)
**Charts:** Recharts or Tremor (both work well with Tailwind + shadcn)
**Forms:** React Hook Form + Zod for validation
**Date/time:** date-fns + native Intl for timezone handling
**Testing:** Vitest + React Testing Library + Playwright for E2E

### 2.2 Why this stack

**React + TypeScript** matches CalExp5 and enables utility sharing (date helpers, API client base, authentication patterns). Skills transfer from CalExp5 development; no new language or paradigm for the team.

**Vite** is the modern default. Fast dev server, zero configuration for most cases, minimal ceremony. Beats Create React App (deprecated) and avoids Next.js's SSR complexity (which ControlTower doesn't need).

**Tailwind + shadcn/ui** gives a component library that's desktop-first but responsive. shadcn/ui is copy-into-project (not an npm dependency), so components are editable and don't bloat bundle size. Matches CalExp5's existing Tailwind usage.

**TanStack Query** is the single most important choice for this app. It handles:
- Caching API responses with automatic deduplication across components
- Stale-while-revalidate patterns (the UI shows cached data instantly while refetching)
- Polling on intervals (for the auto-refresh toggle per view)
- Optimistic updates for edits
- Automatic retry on network errors
- Request cancellation when components unmount

This is **exactly what ControlTower needs**: multiple panels polling the same bridge endpoint should dedupe to one request; auto-refresh toggles should start/stop polling cleanly; admin edits should feel instant via optimistic updates. TanStack Query does all of this out of the box, eliminating 80% of the state management code that would otherwise live in Zustand or reducers.

**TanStack Router** gives type-safe file-based routing — URLs like `/data-manager/employees/1234` become first-class routes with typed params, making deep-linking trivial. Admin can bookmark specific entity detail views or share links with other admins.

**Zustand** handles the small amount of global state that isn't server data: current authenticated user, UI preferences (sidebar collapsed?, theme?), active session token. Everything else lives in TanStack Query's cache.

**shadcn/ui components** give desktop-dense grid views, dialogs, toasts, tabs, dropdowns, data tables — the primitives needed for an operator console — without fighting Material or Ant Design's opinions about how they should look.

### 2.3 Alternatives considered

- **Next.js / Remix** — rejected. SSR buys nothing for an SPA that reads from a single API, and adds deployment complexity.
- **Vue / Svelte / Solid** — rejected. Perfectly fine stacks, but split skills from CalExp5 and require learning a new ecosystem.
- **Electron** — rejected. Browser is enough; Electron adds install friction and updates overhead.
- **Custom vanilla JS** — rejected. Current BB_Data_Manager uses this approach, and rebuilding in vanilla JS sacrifices TanStack Query's benefits and the shadcn component library.

---

## 3. App structure

### 3.1 Repository layout

```
BB_ControlTower/                    (new repo alongside BB_Micro_Bridge and CalExp5)
├── .github/
│   └── workflows/
│       └── ci.yml                  (same Vitest + Playwright pattern as CalExp5)
├── public/
│   ├── favicon.ico
│   └── logo.svg
├── src/
│   ├── main.tsx                    (entry point)
│   ├── App.tsx                     (root + router mount)
│   ├── router.ts                   (TanStack Router config)
│   ├── routes/                     (file-based routes)
│   │   ├── __root.tsx              (layout: sidebar + header + outlet)
│   │   ├── index.tsx               (/ → overview dashboard)
│   │   ├── bridge-health/
│   │   │   └── index.tsx           (/bridge-health)
│   │   ├── freshness/
│   │   │   ├── index.tsx           (/freshness)
│   │   │   ├── latency.tsx         (/freshness/latency)
│   │   │   ├── drift.tsx           (/freshness/drift)
│   │   │   ├── conflicts.tsx       (/freshness/conflicts)
│   │   │   └── entity/
│   │   │       └── $entityId.tsx   (/freshness/entity/:entityId)
│   │   ├── data-manager/
│   │   │   ├── index.tsx           (/data-manager)
│   │   │   ├── employees/
│   │   │   │   ├── index.tsx       (/data-manager/employees)
│   │   │   │   └── $employeeId.tsx (/data-manager/employees/:employeeId)
│   │   │   ├── vendors/
│   │   │   │   ├── index.tsx
│   │   │   │   └── $vendorId.tsx
│   │   │   ├── customers/
│   │   │   ├── jobcodes/
│   │   │   ├── items/
│   │   │   ├── trades/
│   │   │   ├── review-queue.tsx    (/data-manager/review-queue)
│   │   │   └── matching.tsx        (/data-manager/matching)
│   │   ├── observability/
│   │   │   ├── index.tsx
│   │   │   ├── events.tsx
│   │   │   ├── replicas.tsx
│   │   │   └── rate-limits.tsx
│   │   ├── operations/             (operator controls)
│   │   │   ├── index.tsx
│   │   │   ├── webhooks.tsx        (replay)
│   │   │   ├── jobs.tsx            (queue management)
│   │   │   ├── tokens.tsx          (token injection, emergency recovery)
│   │   │   └── sync.tsx            (full resync, drift detection)
│   │   ├── settings/
│   │   │   ├── index.tsx
│   │   │   └── entity-config.tsx   (bridge_entity_sync_config editor)
│   │   └── login.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── AppHeader.tsx
│   │   │   └── PageContainer.tsx
│   │   ├── ui/                     (shadcn/ui components — copied in as needed)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── table.tsx
│   │   │   ├── toast.tsx
│   │   │   └── ...
│   │   ├── panels/
│   │   │   ├── StatCard.tsx
│   │   │   ├── LatencyHistogram.tsx
│   │   │   ├── DriftList.tsx
│   │   │   ├── ConflictLogTable.tsx
│   │   │   ├── EntityFreshnessLookup.tsx
│   │   │   ├── ReplicaActivitySplit.tsx
│   │   │   ├── CircuitBreakerStatus.tsx
│   │   │   └── ReviewQueueList.tsx
│   │   └── forms/
│   │       ├── MasterDataEditor.tsx
│   │       ├── ReviewResolutionForm.tsx
│   │       └── EntityConfigForm.tsx
│   ├── hooks/
│   │   ├── useAutoRefresh.ts       (dashboard auto-refresh hook)
│   │   ├── useBridgeWrite.ts       (write-through response handling)
│   │   ├── useAdminSession.ts      (auth session management)
│   │   └── useFreshnessLatency.ts  (specific queries)
│   ├── lib/
│   │   ├── api.ts                  (bridge API client — shared with CalExp5 pattern)
│   │   ├── auth.ts                 (authentication helpers)
│   │   ├── cache-keys.ts           (TanStack Query key constants)
│   │   └── utils.ts                (shadcn/ui utils + app-specific helpers)
│   ├── store/
│   │   └── app-store.ts            (Zustand — current user, UI prefs)
│   └── styles/
│       └── globals.css             (Tailwind base)
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── .env.example
├── README.md
├── Run.bat                         (local dev launcher per BB convention)
└── railway.json                    (Railway deploy config)
```

### 3.2 Deployment

- **Railway service:** new project/service `bb-controltower-production`
- **Build command:** `npm run build`
- **Start command:** `npm run preview` or a static file server (Vite's build output is static SPA; serve via a minimal Node server or Railway's static hosting)
- **Environment variables:** `VITE_BRIDGE_URL`, `VITE_BRIDGE_API_KEY` (public, embedded at build time), plus any auth config
- **Domain:** `controltower.bainbridgebuilders.com` (or similar — Sam's call on the exact URL)
- **SSL:** Railway-managed certificate
- **Build-time only:** no SSR, no backend in ControlTower itself — it's a static SPA that calls the bridge for everything

### 3.3 Authentication

**ControlTower authenticates against the bridge's existing admin session system.** No new auth infrastructure.

Flow:
1. User opens ControlTower, sees login page
2. Enters admin credentials (email + password, matching CalExp5 admin login)
3. ControlTower calls `POST /api/auth/login` on the bridge
4. Bridge validates against `cal_sessions` table, returns session token
5. ControlTower stores token in memory (Zustand) and sets it as `Authorization: Bearer <token>` on all subsequent API calls
6. Bridge's existing session middleware authorizes each request
7. Session expires per bridge's existing rules; ControlTower prompts for re-login

**Admin role check:** the bridge's `requireAdmin()` middleware (at `src/routes/admin-v1.js`) already gates admin endpoints. ControlTower only needs to call admin endpoints; the bridge enforces.

**Sam's existing login flow (per the handoff doc)** works for CalExp5 admin users. ControlTower piggybacks on it.

---

## 4. The panels

Detailed specifications for every panel in ControlTower v2, grouped by tab.

### 4.1 Overview tab

Landing page when admin opens the app. High-level health summary.

**Panels:**

1. **Bridge status card**
   - Overall status: healthy / degraded / critical
   - Last self-test run time
   - Number of open incidents (from `bridge_incident_acknowledgements`)
   - Circuit breaker states (Neon, QBO, QBT, Anthropic, OpenAI, Google) — colored dots

2. **Freshness summary**
   - Webhook-to-fresh p95 over last hour
   - CDC poll success rate last hour
   - QBT poll success rate last hour
   - Drift count last 24 hours

3. **Data Manager summary**
   - Pending review queue count (per entity type)
   - Recent auto-applied changes (last hour)
   - Unlinked entities needing matching (count)

4. **Active crons**
   - List of running cron types, last run, next scheduled run, last result

5. **Recent alerts**
   - Last 5 alerts or warnings from `bridge_observability_snapshots`

**Auto-refresh:** ON by default at 10-second interval (per D13 — ControlTower defaults to on). Admin can toggle off or change interval.

### 4.2 Bridge Health tab

Existing ControlTower content, ported as-is with styling updates. Covers:
- Bridge operational status, uptime, version info
- Neon connection health
- Token status for QBO, QBT, and QBO Payroll
- Recent self-test results
- Operator job queue state

### 4.3 Freshness tab

New, from cache strategy v3 section 4.3. Subtabs:

**4.3.1 Latency** (`/freshness/latency`)

Histogram of webhook-to-fresh, CDC-poll-to-fresh, and write-to-response latencies over configurable time windows (1h, 6h, 24h). p50, p95, p99 markers. Breakdown by entity type. Breakdown by source (QBO webhook / QBO CDC / QBT / consumer write).

Data source: `bridge_freshness_events` with aggregation queries.

**4.3.2 Drift** (`/freshness/drift`)

List of unresolved `bridge_drift_observations`. Columns: detected_at, detector (cdc_backup / self_test), entity_type, entity_id, drift_type, resolution status. Clickable to drill into the specific entity.

Filter by resolved/unresolved, by entity type, by detection time. Bulk actions: mark resolved, trigger manual reconcile.

**4.3.3 Conflicts** (`/freshness/conflicts`)

Recent `bridge_conflict_log` entries. Columns: detected_at, conflict type, entity, losing user, winning user, affected domains. Click to see the full conflict details (what was submitted, what was current).

Admins can use this to identify workflow patterns that cause repeated conflicts (e.g., "two admins keep editing the same invoice list every morning — maybe the workflow needs adjustment").

**4.3.4 Entity Lookup** (`/freshness/entity/:entityId`)

Paste or navigate to an entity (e.g., Invoice #1234) and see:
- Current projection state (all fields)
- `projected_at`, `verified_at`
- Last webhook that touched it (time, delivery_hash)
- Last CDC poll that touched it (time, rows affected in the same batch)
- Last consumer write that touched it (who, when)
- Last conflict involving this entity (if any)
- Current cache epoch for the entity's domain

This is the diagnostic panel that turns "a user complained about Invoice 1234" into a clear answer within seconds.

### 4.4 Data Manager tab

Per `DATA_MANAGER_MERGER_PROPOSAL.md` section 4. Subtabs:

**4.4.1 Employees** (`/data-manager/employees`)

Entity list view with TanStack Table. Columns per DM proposal section 4.2. Filter, search, sort. Click row → detail panel at `/data-manager/employees/:employeeId`.

**4.4.2 Employee detail** (`/data-manager/employees/:employeeId`)

Field-by-field editor per DM proposal section 4.3. Provenance tooltips. Proposal history sidebar. Save via `useBridgeWrite` hook.

**4.4.3 Vendors, Customers, Jobcodes, Items, Trades** — same pattern as Employees, with entity-specific field columns.

**4.4.4 Review queue** (`/data-manager/review-queue`)

Per DM proposal section 4.4. Left pane: list of pending proposals. Right pane: selected proposal with side-by-side field comparison. Accept / keep current / edit actions.

Badge on the Data Manager tab in the sidebar showing pending count — refreshed every 10 seconds.

**4.4.5 Matching assistance** (`/data-manager/matching`)

Per DM proposal section 4.6. Lists of unlinked QBO entities and unlinked QBT entities. Fuzzy match suggestions. Admin links or marks as source-specific.

### 4.5 Observability tab

Admin-visible raw data for deep debugging.

**4.5.1 Events stream** (`/observability/events`)

Live-updating list of `bridge_freshness_events`. Filterable by source, entity type, event type, time range. Click to see full event detail (all timestamps, metadata, error message if any).

Useful for watching a webhook delivery in real time ("I just triggered an invoice edit in QBO web, is the bridge seeing it?").

**4.5.2 Replica activity** (`/observability/replicas`)

Shows both Railway replicas, which one is running which cron, heartbeat timestamps, current job they're processing. Helps diagnose "why isn't the CDC poll advancing" (answer: worker replica is down, Railway is replacing it).

**4.5.3 Rate limits** (`/observability/rate-limits`)

Current usage and limits for QBO API, QBT API, Anthropic, OpenAI, Google. Shown as progress bars with alerts if usage crosses 80% of limit.

### 4.6 Operations tab

Operator controls — the place where admins take direct action on the bridge.

**4.6.1 Webhook replay** (`/operations/webhooks`)

List of `qbo_webhook_events` with delivery state. Admin can replay a specific webhook by delivery_hash (existing capability in CalExp5's ControlTower — ported directly).

**4.6.2 Job queue** (`/operations/jobs`)

View of `bridge_operator_jobs`. Filter by status (queued / running / retry / failed). Cancel a job, force-retry a failed job, see job result.

**4.6.3 Token operations** (`/operations/tokens`)

- Token status for QBO, QBT, QBO Payroll
- Manual token injection form (paste JSON from Intuit OAuth Playground, verify, save) — existing capability from Sprint 2 S2-7
- Emergency recovery form (uses `EMERGENCY_INJECT_KEY` for auth when normal admin session is broken)
- Force token refresh
- Reload tokens from Neon

**4.6.4 Sync operations** (`/operations/sync`)

- Full resync from QBO (bulk operation)
- Full resync from QBT
- Drift detection pass
- CDC replay (specific entity type, specific time range)

Each operation triggers an operator job and shows progress via the events stream.

### 4.7 Settings tab

**4.7.1 Entity sync config** (`/settings/entity-config`)

Editor for `bridge_entity_sync_config` table. Admin can change an entity's classification (webhook_primary / cdc_primary / poll_only), adjust cadences, upgrade confidence levels.

**4.7.2 App preferences**

ControlTower-local preferences: auto-refresh default interval, dark/light mode, sidebar collapsed state, which panels to show on overview dashboard.

---

## 5. Implementation plan

### 5.1 Phase CT0 — Repo bootstrap (Week 1)

- Create new GitHub repo `BB_ControlTower`
- `npm create vite@latest bb-controltower -- --template react-ts`
- Install dependencies: TanStack Query, TanStack Router, Zustand, Tailwind, shadcn/ui init, React Hook Form, Zod, date-fns
- Configure Vite, TypeScript, Tailwind, ESLint
- Create basic app shell: sidebar + header + content area with routing scaffold
- Implement authentication: login page, session storage, API client with bearer token
- Deploy a "Hello ControlTower" SPA to Railway at the chosen domain
- Verify login flow works against the bridge

Time: ~8 hours.

### 5.2 Phase CT1 — Port existing ControlTower panels (Weeks 1-3)

- Re-implement Overview tab panels from `CalExp5/src/components/views/ControlTower.jsx` in React + shadcn/ui
- Port Bridge Health tab content
- Port Operations tab content (webhook replay, job queue, token operations — existing capabilities, just moved)
- Verify feature parity with CalExp5's current ControlTower view
- Keep CalExp5's internal view alive in parallel during this phase

Time: ~16 hours.

### 5.3 Phase CT2 — Freshness tab (Weeks 3-5)

Depends on cache strategy v3 Phase 1 landing first (the observability tables need to exist and be populated).

- Build Latency histogram panel reading from `bridge_freshness_events`
- Build Drift panel reading from `bridge_drift_observations`
- Build Conflicts panel reading from `bridge_conflict_log`
- Build Entity Lookup panel
- Wire new bridge admin endpoints: `/api/admin/observability/freshness/*`

Time: ~12 hours.

### 5.4 Phase CT3 — Data Manager tab (Weeks 5-8)

Depends on Data Manager merger Phase B1-B5 landing first.

- Build entity list views for each master data type (employees, vendors, customers, jobcodes, items, trades, master_items)
- Build entity detail views with field-by-field editor
- Build Review Queue view with side-by-side conflict display
- Build Matching Assistance view
- Integrate with `useBridgeWrite` hook for admin edit write-through
- Full UX polish: keyboard shortcuts, bulk actions, filter preservation across navigation

Time: ~20 hours.

### 5.5 Phase CT4 — Observability tab (Weeks 6-7, parallel with CT3)

- Events stream with live updating
- Replica activity panel
- Rate limits panel
- New bridge endpoints for each

Time: ~8 hours.

### 5.6 Phase CT5 — Cutover (Week 9)

- Verify feature completeness against CalExp5's existing ControlTower and local BB_Data_Manager
- Update `CalExp5/src/components/views/ControlTower.jsx` to redirect admins to the new ControlTower URL
- Announce cutover
- Archive CalExp5's ControlTower view after 2 weeks of stable operation

Time: ~4 hours.

### 5.7 Total time

~68 engineering hours across 9 weeks, heavily overlapped with cache strategy and Data Manager phases.

---

## 6. Mobile responsiveness

Per Sam's requirement ("lends itself to mobile as well as desktop"), ControlTower v2 must work on mobile browsers as well as desktop.

**Approach:** desktop-first design, but every panel has a mobile layout breakpoint.

**Mobile behavior:**
- Sidebar collapses to hamburger menu
- Data tables become card lists (one card per row) on screens < 768px
- Dense information panels reflow to single-column layout
- Toast notifications stack at bottom of screen
- Modals take full screen on mobile
- Auto-refresh is disabled by default on mobile to preserve battery (admin can still enable per view)

**Not mobile-native:** no PWA installability, no service worker for offline support, no push notifications (CalExp5 has these; ControlTower doesn't need them — admins use their desktops primarily and check their phones occasionally).

**Testing:** Playwright tests run against Chrome desktop AND Chrome mobile emulation. Visual regression screenshots for key pages at both viewports.

---

## 7. Auth and authorization

### 7.1 Admin login

ControlTower uses the bridge's existing admin session system:

1. User enters email + password
2. ControlTower sends `POST /api/auth/login` with credentials
3. Bridge validates against `cal_sessions` table, returns session token (existing flow)
4. ControlTower stores token in memory (Zustand store)
5. All subsequent API calls include `Authorization: Bearer <token>` header
6. Bridge's session middleware validates the token on every request
7. If token expires, ControlTower catches the 401 and redirects to login

### 7.2 Admin role enforcement

The bridge's existing admin routes (`/api/admin/*`) require admin role, enforced by `requireAdmin()` middleware. ControlTower only calls admin routes, so the bridge handles authorization transparently.

### 7.3 Session lifetime

- Normal session: 24 hours, auto-refreshed on activity
- Idle timeout: 2 hours of no network activity → force re-login
- Token rotation: per existing bridge rules

### 7.4 Forward-compat for domain-based auth

Per cache strategy v3 D17 decision: all API calls include an optional `domain` parameter, defaulting to `"default"`. When real domain auth is implemented later, ControlTower will populate `user_domains` from the session and pass them to the bridge. For now, all admins have access to everything (single `"default"` domain).

### 7.5 Emergency access

The existing emergency recovery endpoint (`/emergency-inject` and friends, from Sprint 2 S2-7) is NOT exposed in ControlTower. Emergency access is a separate HTML page served directly by the bridge, protected by `EMERGENCY_INJECT_KEY`, used only when the normal ControlTower session system is broken (e.g., Neon is down and the session table is unreachable). This stays as-is.

---

## 8. Cutover strategy

### 8.1 Parallel operation

During the migration period (Phases CT1-CT4), BOTH the existing CalExp5 ControlTower view AND the new standalone ControlTower v2 are alive:

- Existing view: feature-complete for what it currently does; used by admins who haven't migrated
- New standalone: gaining features as phases complete
- Admins choose which to use based on which features they need

### 8.2 Cutover event

When ControlTower v2 has feature parity + new features (after Phase CT4):

1. Announce cutover date to admin(s)
2. On cutover day: update `CalExp5/src/components/views/ControlTower.jsx` to show a banner: "ControlTower has moved — click here to access the new version." Redirect on click.
3. Admins bookmark the new URL
4. After 2 weeks of stable operation, remove the old view entirely from CalExp5 (delete the file, remove the route, update CalExp5 menu)

### 8.3 Rollback plan

If ControlTower v2 has critical issues after cutover:
1. Restore the CalExp5 ControlTower view from git history (it was removed cleanly, so restore is a revert)
2. Redeploy CalExp5
3. Admins go back to the old view while v2 is fixed
4. No data loss (ControlTower is read-mostly; admin writes via the bridge go to Neon and are not tied to UI state)

---

## 9. Cost

> **⚠ Note (2026-04-11):** the hours in this table reflect ControlTower v2 work in isolation. The authoritative consolidated estimate across all four v3 architectural proposals is ~399h / 13 weeks — see `CACHE_STRATEGY_IMPLEMENTATION_PLAN.md` Phases 3a + 3b for the ControlTower work within the combined plan.

| Phase | Hours |
|---|---|
| CT0 bootstrap | 8 |
| CT1 existing panel port | 16 |
| CT2 freshness tab | 12 |
| CT3 data manager tab | 20 |
| CT4 observability tab | 8 |
| CT5 cutover | 4 |
| **Total** | **68** |

Calendar: ~9 weeks overlapping with cache strategy and Data Manager phases.

---

## 10. What this doc does NOT specify

1. **Exact visual design.** Panel layouts are described functionally; actual pixel-level design happens during implementation with shadcn/ui as the starting point.
2. **Animation and transitions.** Out of scope; keep it simple and direct for v1.
3. **Dark mode.** Supported via Tailwind but default to light. User preference stored in Zustand.
4. **Internationalization.** English only for v1. I18n is future work.
5. **Accessibility audit.** Baseline WCAG AA via shadcn/ui's built-in a11y, but no formal audit in v1.
6. **Real-time multi-admin collaboration.** Two admins editing the same master row rely on the SyncToken conflict handling from cache strategy v3. No operational-transform CRDT.

---

## 11. Open questions (zero architectural)

Implementation-time questions (exact panel layouts, column definitions, keyboard shortcut bindings) belong in a follow-up design spec. At the architectural level, this document is complete.

---

## 12. What the next Claude instance should do with this doc

1. Read sections 1 and 2 — the why and the stack choice.
2. Read section 3 — the app structure — before writing any code.
3. Read section 4 — the panels — to understand what gets built and in what order.
4. Cross-reference `PROJECTION_CACHE_STRATEGY_PROPOSAL.md` v3 (for the observability data model) and `DATA_MANAGER_MERGER_PROPOSAL.md` v1 (for the data manager tab behavior).
5. When ready to implement, write an `IMPLEMENTATION_PLAN.md` that sequences the work. Do NOT start coding without the plan approved.

---

**End of ControlTower v2 Standalone Scope.**
