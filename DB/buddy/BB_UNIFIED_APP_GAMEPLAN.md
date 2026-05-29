# BB Field Suite — Unified App Gameplan | v5 | 2026-03-01

## Executive Summary

**Objective:** Merge Project_Exp, Adobe eSigner, and Binder_Exp into a single unified application ("BB Field Suite") that runs on both desktop (Windows) and iPad (field use).

**Overall Risk:** LOW — The 3 apps already have clean separation of concerns, zero API conflicts, compatible dependencies, and an established proxy architecture. The contract folder is already the single source of truth.

**Recommended Approach:** React migration (phased), starting with the app shell + Binder_Exp (already React), then eSigner, then Project_Exp last.

---

## 1. What Each App Does Today

| App | Port | Tech | Role | Lines of Code |
|-----|------|------|------|---------------|
| **Project_Exp** | 3460 | Vanilla JS + Express | Project hub: CRM, estimates, scope, Gantt, agreements | ~18K (8K client, 10K server) |
| **Adobe eSigner** | 3090 | Vanilla JS + Express | PDF signature field placement + Adobe Sign API | ~6K (5K client, 1K server) |
| **Binder_Exp** | 3015/3010 | React+Vite+TS+Tailwind | PDF merging, watermarks, cover pages, overlay editor | ~4K (2K client, 2K server) |

### Current Data Flow (Already Working)

```
Project_Exp (3460) ──proxy──► Binder_Exp (3015) ──assembly──► PDF
       │                                                        │
       └────────────proxy────────────► eSigner (3090) ──tag─────┘
                                            │
                                            └──► Adobe Sign API
       │
       └──► Mini_API_Bridge (3100) ──► QuickBooks Online
```

**Key insight:** Project_Exp already orchestrates the other two via binder-proxy.js. The merge is about collapsing what's already connected.

---

## 2. The Business Workflow (End-to-End)

This is the full lifecycle of a BB construction project:

```
PHASE 1: Lead Intake (Project_Exp)
  └─ Create client → sync with QBO → create property → geocode + enrich

PHASE 2: Scope & Estimation (Project_Exp)
  └─ Select template → add line items → calculate costs → generate estimate PDF

PHASE 3: Agreement (Project_Exp)
  └─ Auto-fill agreement form → generate agreement PDF → generate exhibit PDFs

PHASE 4: Binder Assembly (Binder_Exp via proxy)
  └─ Scan contract folder → merge all PDFs → watermark → cover page → metadata

PHASE 5: Signature Tagging (eSigner via proxy)
  └─ Smart field detection → place signature/date/initials fields → tagged PDF

PHASE 6: E-Signature (eSigner → Adobe Sign)
  └─ Send to Adobe Sign → track status → download signed PDF → update manifest
```

**In the unified app**, these become 6 steps in a single contract workflow wizard.

---

## 3. What We Found (Two-Pass Analysis)

### 3.1 Code Overlap (Minimal)

| Shared Code | Project_Exp | eSigner | Binder_Exp | Action |
|-------------|-------------|---------|-----------|--------|
| `pdf-metadata-v1.js` | 301 lines | 438 lines (superset) | N/A | Consolidate to eSigner version |
| `cover-page-parser.js` | N/A | 282 lines (parser) | 489 lines (generator) | Keep both — different purposes |
| Company profiles | Hardcoded in forms | contractors.json | settings.json | Unify to single source |
| Settings schemas | Empty (uses db/) | 3 path configs | Full watermark+company | Adopt Binder schema |

### 3.2 API Endpoint Conflicts

**Zero conflicts.** Each app owns distinct namespaces:
- Project_Exp: `/api/clients`, `/api/properties`, `/api/contracts`, `/api/estimate-templates`
- Binder_Exp: `/api/binder/*`, `/api/estimate/generate`, `/api/pdf/*`
- eSigner: `/api/overlays`, `/api/tag-pdf`, `/api/auto-tag`, `/api/adobe-sign/*`

Common endpoints (`/api/settings`, `/api/health`) exist in all 3 but with different schemas — would need namespacing in unified app.

### 3.3 Dependency Compatibility

**All compatible.** Key shared dependency: `pdf-lib@^1.17.1` (identical across all projects). No version conflicts found.

### 3.4 Mobile/iPad Readiness

| App | Viewport Meta | Media Queries | Touch Support | Mobile Rating |
|-----|---------------|---------------|---------------|---------------|
| Project_Exp | Yes | 0 breakpoints | None | 1/10 |
| eSigner | Yes | 0 breakpoints | PDF.js has touch, app doesn't | 2/10 |
| Binder_Exp | Yes | Tailwind responsive + `@media (pointer: coarse)` | dnd-kit + Fabric.js | 6/10 |

**Binder_Exp is the only one with any mobile consideration.**

---

## 4. Architecture Decision: React + Phased Migration

### Why React (Not Vanilla JS Unification)

1. **Binder_Exp is already React** — 2K lines of battle-tested React+TypeScript+Zustand
2. **Touch-first libraries** — dnd-kit (drag-drop), Fabric.js (canvas), react-pdf all handle touch natively
3. **Tailwind CSS** — responsive utilities (sm:, md:, lg:) are built for desktop+tablet
4. **Component reuse** — modals, forms, settings panels become shared components
5. **Zustand** — lightweight state management, no Redux boilerplate
6. **Vite** — fast builds, HMR, proxy config already working
7. **TypeScript** — catches bugs at compile time, critical for a larger merged codebase

### Why Phased (Not Big-Bang Rewrite)

1. **Project_Exp has 18,000 lines** of vanilla JS — rewriting all at once risks feature loss
2. **Each phase produces a working app** — no 6-week blackout period
3. **Sam can start using the unified app** before everything is migrated
4. **Lower risk** — if any phase has issues, the other apps still work standalone

---

## 5. The Unified App Architecture

### 5.1 Frontend Structure

```
bb-field-suite/
├── src/
│   ├── client/                     # React + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── App.tsx             # Root: router + providers
│   │   │   ├── main.tsx            # Entry point
│   │   │   │
│   │   │   ├── layouts/
│   │   │   │   ├── AppShell.tsx    # Sidebar nav + content area
│   │   │   │   └── MobileShell.tsx # Bottom tab nav (iPad/mobile)
│   │   │   │
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx           # Home: recent projects, quick actions
│   │   │   │   ├── clients/                # Client CRM (from Project_Exp)
│   │   │   │   │   ├── ClientList.tsx
│   │   │   │   │   ├── ClientDetail.tsx
│   │   │   │   │   └── QboSync.tsx
│   │   │   │   ├── properties/             # Property management
│   │   │   │   │   ├── PropertyList.tsx
│   │   │   │   │   ├── PropertyDetail.tsx
│   │   │   │   │   └── PropertyMap.tsx
│   │   │   │   ├── contracts/              # Contract workflow wizard
│   │   │   │   │   ├── ContractHub.tsx     # Master view
│   │   │   │   │   ├── ScopeEditor.tsx     # Line items + phases
│   │   │   │   │   ├── GanttView.tsx       # Timeline scheduling
│   │   │   │   │   ├── EstimateView.tsx    # Cost breakdown
│   │   │   │   │   ├── AgreementView.tsx   # Form fill + PDF gen
│   │   │   │   │   ├── BinderView.tsx      # Assembly (from Binder_Exp)
│   │   │   │   │   ├── TaggerView.tsx      # Sig field placement (from eSigner)
│   │   │   │   │   └── SigningView.tsx     # Adobe Sign tracking
│   │   │   │   ├── overlay-editor/         # Overlay editor (from Binder_Exp)
│   │   │   │   │   ├── EditorShell.tsx
│   │   │   │   │   ├── DocumentViewer.tsx
│   │   │   │   │   ├── CanvasOverlay.tsx
│   │   │   │   │   └── ...
│   │   │   │   └── Settings.tsx            # Unified settings
│   │   │   │
│   │   │   ├── components/                 # Shared UI components
│   │   │   │   ├── Layout.tsx
│   │   │   │   ├── Toast.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   ├── OfflineBanner.tsx
│   │   │   │   └── FileDropZone.tsx
│   │   │   │
│   │   │   ├── store/                      # Zustand stores
│   │   │   │   ├── appStore.ts             # Global: user, settings, offline queue
│   │   │   │   ├── contractStore.ts        # Contract workflow state
│   │   │   │   ├── editorStore.ts          # Overlay editor (from Binder_Exp)
│   │   │   │   └── syncStore.ts            # QBO + offline sync status
│   │   │   │
│   │   │   ├── services/                   # API client layer
│   │   │   │   ├── api.ts                  # Base fetch wrapper + offline queue
│   │   │   │   ├── clientsApi.ts
│   │   │   │   ├── propertiesApi.ts
│   │   │   │   ├── contractsApi.ts
│   │   │   │   ├── binderApi.ts
│   │   │   │   ├── taggerApi.ts
│   │   │   │   └── qboApi.ts
│   │   │   │
│   │   │   ├── types/                      # TypeScript types
│   │   │   │   ├── client.ts
│   │   │   │   ├── property.ts
│   │   │   │   ├── contract.ts
│   │   │   │   ├── estimate.ts
│   │   │   │   ├── overlay.ts
│   │   │   │   └── settings.ts
│   │   │   │
│   │   │   └── utils/
│   │   │       ├── offline.ts              # Service worker registration
│   │   │       ├── touch.ts                # Touch event helpers
│   │   │       └── pdf-metadata.ts         # Shared PDF metadata (from eSigner)
│   │   │
│   │   ├── tailwind.config.js              # BB theme
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── server/                             # Unified Express backend
│       ├── server.js                       # Single entry point
│       ├── routes/
│       │   ├── clients.js                  # From Project_Exp
│       │   ├── properties.js               # From Project_Exp
│       │   ├── contracts.js                # From Project_Exp
│       │   ├── estimates.js                # From Project_Exp
│       │   ├── agreements.js               # From Project_Exp
│       │   ├── binder.js                   # From Binder_Exp
│       │   ├── tagger.js                   # From eSigner
│       │   ├── signing.js                  # From eSigner (Adobe Sign)
│       │   ├── overlays.js                 # From eSigner + Binder_Exp
│       │   ├── settings.js                 # Unified
│       │   └── health.js                   # Unified health/status
│       ├── services/                       # Consolidated service layer
│       │   ├── clients-service.js
│       │   ├── properties-service.js
│       │   ├── contracts-service.js
│       │   ├── qbo-service.js
│       │   ├── binder-service.js           # From Binder_Exp
│       │   ├── pdf-merger.js               # From Binder_Exp
│       │   ├── watermark-service.js        # From Binder_Exp
│       │   ├── cover-page-generator.js     # From Binder_Exp
│       │   ├── pdf-tagger.js               # From eSigner
│       │   ├── adobe-sign-client.js        # From eSigner
│       │   ├── smart-overlay.js            # From eSigner
│       │   ├── geocode-service.js          # From Project_Exp
│       │   └── json-db.js                  # From Project_Exp
│       └── lib/
│           ├── pdf-metadata.js             # Consolidated (eSigner superset)
│           ├── cover-page-parser.js        # From eSigner
│           └── excel-com-wrapper.js        # From Project_Exp
│
├── data/
│   ├── settings/
│   │   └── settings.json                   # Unified schema (Binder_Exp base)
│   └── db/                                 # JSON file database
│       ├── clients.json
│       ├── properties.json
│       ├── contracts.json
│       ├── estimate-templates.json
│       ├── master-items.json
│       ├── subs.json
│       ├── vendors-dir.json
│       └── suppliers.json
│
├── templates/                              # All templates unified
│   ├── pdf-forms/                          # From Project_Exp
│   ├── word/                               # From Project_Exp
│   ├── excel/                              # From Binder_Exp
│   ├── overlays/                           # From eSigner + Binder_Exp
│   └── sections/                           # From eSigner (binder sections)
│
├── workspace/
│   ├── output/
│   ├── input/
│   └── exports/
│
├── Run.bat                                 # Single launcher
└── package.json
```

### 5.2 Backend: Single Express Server

```
Port: 3460 (keep Project_Exp's port — it's the hub)

Routes consolidated under one server:
  /api/health              ← unified health (checks QBO bridge + all services)
  /api/settings            ← unified settings (Binder schema as base)
  /api/clients/*           ← from Project_Exp (clients-v4.js)
  /api/properties/*        ← from Project_Exp (properties-v6.js)
  /api/contracts/*         ← from Project_Exp (contracts.js)
  /api/estimates/*         ← from Project_Exp (estimate-templates.js)
  /api/agreements/*        ← from Project_Exp (agreements, Puppeteer PDF)
  /api/binder/*            ← from Binder_Exp (merge, watermark, cover page)
  /api/tagger/*            ← from eSigner (pdf-tagger, smart-overlay)
  /api/signing/*           ← from eSigner (adobe-sign-client)
  /api/overlays/*          ← from eSigner + Binder_Exp (overlay templates)
  /api/exhibits/*          ← from Project_Exp (exhibit generation)
  /api/qbo/*               ← from Project_Exp (QBO sync via Mini_API_Bridge)
```

**No more proxy routes.** Since all services live in one process, binder-proxy.js is eliminated — direct function calls instead of HTTP round-trips.

### 5.3 Unified Navigation (Desktop + iPad)

**Desktop (>1024px):**
```
┌──────────────────────────────────────────────────────┐
│  BB Field Suite                    [Sync] [Settings] │
├───────────┬──────────────────────────────────────────┤
│           │                                          │
│ Dashboard │  [Active Page Content]                   │
│ Clients   │                                          │
│ Properties│  Desktop: full sidebar always visible    │
│ Contracts │  iPad landscape: collapsible sidebar     │
│ Templates │  iPad portrait: bottom tabs              │
│ Settings  │                                          │
│           │                                          │
├───────────┴──────────────────────────────────────────┤
│  [Offline: 3 items queued]           [Sync Now]      │
└──────────────────────────────────────────────────────┘
```

**iPad Portrait (<768px):**
```
┌──────────────────────────┐
│  BB Field Suite    [≡]   │
├──────────────────────────┤
│                          │
│  [Full-width content]    │
│                          │
│  Single column layout    │
│  Stacked forms           │
│  44px touch targets      │
│                          │
├──────────────────────────┤
│ [Home] [Clients] [Jobs]  │
│     [Binder] [Settings]  │
└──────────────────────────┘
```

### 5.4 Contract Workflow Wizard

The heart of the unified app — a **step-by-step contract workflow**:

```
Contract C26001: Alcantar Kitchen Remodel
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1. Scope ✓] → [2. Estimate ✓] → [3. Agreement ✓] → [4. Binder ●] → [5. Tag] → [6. Sign]

Step 4: Binder Assembly
┌──────────────────────────────────────────┐
│ Documents Found:                          │
│ ✓ Home Improvement Agreement (4 pages)    │
│ ✓ Estimate (2 pages)                      │
│ ✓ Mechanics Lien Notice (1 page)          │
│ ✓ Insurance Certificate (1 page)          │
│ ✓ 3-Day Right to Cancel (1 page)          │
│                                           │
│ Options:                                  │
│ [✓] Apply watermarks                      │
│ [✓] Include cover page                    │
│                                           │
│ [Build Binder →]                          │
└──────────────────────────────────────────┘
```

Each step feeds into the next. The manifest.json in the contract folder tracks exactly where the project is in this pipeline.

---

## 6. iPad / Field Use Strategy

### 6.1 The "Ride Alongside Intuit" Principle

The crew already runs **QBO Mobile** and **Workforce (TSheets)** on their iPads. These apps already handle customer lookup, invoice status, time tracking, and job scheduling — authenticated, optimized, and maintained by Intuit.

**Don't compete with Intuit. Complement them.**

| Field Task | Who Handles It | Why |
|------------|---------------|-----|
| Look up customer phone/address | **QBO Mobile** (already installed) | Intuit's app, Intuit's auth, Intuit's problem |
| Check invoice status | **QBO Mobile** | Already works |
| Log time on a job | **Workforce** (already installed) | Already works |
| View job schedule | **Workforce** | Already works |
| Fill out an estimate | **BB Field Suite** | QBO Mobile can't do BB-style estimates |
| View/sign a contract binder | **BB Field Suite** | Unique to BB workflow |
| Scope planning + line items | **BB Field Suite** | Unique to BB workflow |
| Property details + photos | **BB Field Suite** | Enriched data QBO doesn't have |
| Create a new lead on-site | **BB Field Suite** (sync later) | Richer form than QBO Mobile |
| Check Adobe Sign status | **BB Field Suite** | Not in QBO at all |

**Result:** The iPad app needs ZERO live QBO access in the field. The heavy QBO integration (sync, reconciliation, batch invoicing) stays on the desktop where Mini_API_Bridge already runs.

### 6.2 Mini_API_Bridge: VS Code Tunnel

For the sync moments when the iPad app DOES need Mini_API_Bridge (pushing new leads, pulling latest client data), use **VS Code's built-in port forwarding**:

```
iPad (field)
    │
    │  HTTPS (Microsoft-authenticated)
    ▼
VS Code Dev Tunnel (devtunnels.ms)
    │
    │  localhost forwarding
    ▼
Sam's Desktop → Mini_API_Bridge (port 3100)
```

**Setup (one-time, ~5 minutes):**
1. VS Code → Ports panel → Forward Port → `3100`
2. Set visibility to "Private" (requires GitHub/Microsoft login)
3. Copy the `https://*.devtunnels.ms` URL → save in BB Field Suite settings
4. iPad hits that URL for sync operations

**Why this works:**
- Zero changes to Mini_API_Bridge (hands-off rule respected)
- HTTPS + Microsoft auth built-in (secure)
- Free tier: 2GB/month bandwidth (plenty for JSON sync payloads)
- Sam's laptop just needs to be on + VS Code open (already is during work hours)
- Tunnel persists across VS Code sessions if configured

**When the tunnel isn't available** (laptop off, no internet):
- iPad works fully offline with cached data
- Sync queue holds pending operations
- Syncs automatically when tunnel reconnects

### 6.3 What Needs to Work on iPad

| Feature | Priority | Touch Difficulty | Offline Need | Needs Bridge? |
|---------|----------|-----------------|--------------|---------------|
| View cached client/property info | HIGH | Easy (read-only) | Yes (cached) | No |
| Create/edit estimates | HIGH | Medium (forms) | Yes (local save) | No |
| Fill agreement forms | HIGH | Medium (forms) | Yes (local save) | No |
| View PDF binders | HIGH | Easy (pinch/zoom) | Yes (cached) | No |
| Create new lead | HIGH | Easy (form) | Yes (queued) | Sync only |
| Check Adobe Sign status | MEDIUM | Easy (read-only) | No | Yes (tunnel) |
| Build binder | LOW | Easy (button) | No (needs server) | No (desktop op) |
| Tag signature fields | LOW | Hard (drag-drop) | No | No (desktop op) |
| QBO sync (pull latest) | LOW | Easy (button) | No | Yes (tunnel) |
| Gantt chart viewing | LOW | Medium (scroll) | Yes (cached) | No |

**Key insight:** Only 2 out of 10 field tasks need the tunnel. Everything else is local/cached.

### 6.4 Touch Adaptation Plan

**Already Touch-Ready (from Binder_Exp):**
- dnd-kit — pointer-agnostic drag-drop
- Fabric.js — touch-compatible canvas
- Tailwind — `@media (pointer: coarse)` for 44px targets
- react-pdf — touch zoom/pan

**Needs Touch Adaptation:**
- **eSigner field placement** — Convert mouse events to pointer events
- **Gantt chart** — Add touch scroll + pinch zoom
- **Context menus** — Convert right-click to long-press

**CSS Changes (Tailwind makes this straightforward):**
```css
/* Already in Binder_Exp index.css */
@media (pointer: coarse) {
  .touch-target { min-width: 44px; min-height: 44px; }
}
```

### 6.5 Offline / PWA Strategy

**Tier 1 (MVP — covers 80% of field use):**
- Service worker caches app shell + static assets
- IndexedDB stores recently-viewed clients, properties, estimates
- Forms save to localStorage → sync when online
- Offline banner shows queued item count
- Sync queue: new leads, updated estimates → pushed via tunnel when available

**Tier 2 (Full offline — future):**
- Cache PDFs in IndexedDB (via Cache API)
- Queue binder builds for when back at office
- Background sync via Service Worker

**What stays desktop-only (and that's OK):**
- Binder assembly (needs file system access + server-side PDF merging)
- Signature field tagging (precision work, better with mouse/Apple Pencil at desk)
- QBO reconciliation (complex UI, bulk operations)
- Batch invoicing, Chase expense matching
- Excel COM exports

---

## 7. Phased Implementation Plan

### Phase 0: Foundation (1 week)

**Goal:** Create the unified project scaffold + app shell

- [ ] Create `bb-field-suite/` project directory
- [ ] Initialize React + Vite + TypeScript + Tailwind (clone from Binder_Exp)
- [ ] Set up Express backend with combined routes
- [ ] Create AppShell with sidebar navigation (Desktop + iPad layouts)
- [ ] Move Binder_Exp components into the new project (already React)
- [ ] Consolidate `pdf-metadata-v1.js` to eSigner superset version
- [ ] Create unified `settings.json` schema (extend Binder_Exp's)
- [ ] Unified `Run.bat` (single port: 3460)
- [ ] Verify: Binder features work in new shell

**Deliverable:** App shell running with working binder creation.

### Phase 1: eSigner Migration (1-2 weeks)

**Goal:** Convert eSigner from vanilla JS to React components

- [ ] Create `TaggerView.tsx` — PDF viewer with field placement
- [ ] Port PDF.js canvas rendering to react-pdf (already in Binder_Exp)
- [ ] Convert mouse-based field drag/resize to Pointer Events (touch-compatible)
- [ ] Port overlay template system (carousel, save/load)
- [ ] Port contractor management to unified settings
- [ ] Port Adobe Sign integration (signing.js route + client)
- [ ] Port smart overlay detection
- [ ] Add touch-friendly field placement (larger handles, snap-to-grid)
- [ ] Verify: Tag a PDF + send for signature from unified app

**Deliverable:** Full e-signing workflow works on desktop AND iPad.

### Phase 2: Project_Exp Core Migration (2-3 weeks)

**Goal:** Migrate the most-used Project_Exp features to React

- [ ] `ClientList.tsx` + `ClientDetail.tsx` — client CRUD + QBO sync
- [ ] `PropertyList.tsx` + `PropertyDetail.tsx` — property management
- [ ] `ContractHub.tsx` — contract master view with workflow steps
- [ ] `EstimateView.tsx` — cost breakdown tables (Sitework + Building)
- [ ] `ScopeEditor.tsx` — line item management with master items
- [ ] `AgreementView.tsx` — form fill + PDF generation
- [ ] Port QBO service + reconciliation UI
- [ ] Port Google Maps integration (embed, geocoding, street view)
- [ ] Port sub-contractor + vendor directory modals
- [ ] Move all JSON DB services to unified backend
- [ ] Verify: Full project lifecycle works end-to-end

**Deliverable:** Core BB project management works in unified app.

### Phase 3: Gantt + Advanced Features (1-2 weeks)

**Goal:** Migrate remaining advanced features

- [ ] `GanttView.tsx` — timeline visualization with touch scrolling
- [ ] Port import/export functionality
- [ ] Port agreement iframe (TM_agreement-V5.html) or convert to React form
- [ ] Port exhibit generation
- [ ] Port master items editor
- [ ] Port supplier pipeline

**Deliverable:** All Project_Exp features available in unified app.

### Phase 4: iPad Polish + Offline (1-2 weeks)

**Goal:** Production-quality iPad experience

- [ ] Service worker for offline caching
- [ ] IndexedDB for client/property/estimate offline storage
- [ ] Offline sync queue (queued actions shown in UI)
- [ ] iPad-specific layouts (bottom tabs in portrait, sidebar in landscape)
- [ ] Touch testing on real iPad (all workflows)
- [ ] Performance profiling (target 60fps scrolling)
- [ ] Lighthouse audit (target 80+ mobile score)
- [ ] Accessibility audit (axe: 0 critical/serious)
- [ ] Cache busting on all assets

**Deliverable:** Ship-ready unified app for desktop + iPad.

### Phase 5: Cleanup + Decommission (1 week)

**Goal:** Clean shutdown of old apps

- [ ] Verify ALL features from all 3 apps are present
- [ ] Side-by-side testing: old apps vs unified app
- [ ] Data migration: copy all db/*.json to unified project
- [ ] Update Run.bat to start only unified app
- [ ] Archive old Project_Exp, eSigner, Binder_Exp codebases
- [ ] Update CLAUDE.md with new project structure
- [ ] Update BAT_PORT_INVENTORY.csv

---

## 8. Unified Settings Schema

```json
{
  "version": "2.0.0",
  "company": {
    "name": "Bainbridge Builders Inc.",
    "license": "349328",
    "phone": "(408) 781-2364",
    "email": "info@bainbridgebuilders.com",
    "address": { "street": "", "city": "", "state": "CA", "zip": "" }
  },
  "contractors": [
    {
      "id": "evan",
      "firstName": "Evan",
      "lastName": "Bainbridge",
      "email": "evan@bainbridgebuilders.com",
      "phone": "",
      "title": "Owner",
      "isDefault": true
    }
  ],
  "coverPage": {
    "enabled": true,
    "title": "CONTRACT BINDER SUMMARY",
    "showThumbnails": true,
    "showFileSizes": true,
    "showDocumentTypes": true,
    "disclaimer": "..."
  },
  "watermark": {
    "enabled": true,
    "positions": { "bottom-left": {}, "bottom-center": {}, "bottom-right": {} },
    "font": { "name": "Helvetica", "size": 10, "color": "#e41111", "opacity": 0.8, "italic": true },
    "margins": { "top": 20, "bottom": 20, "left": 30, "right": 30 }
  },
  "documentOrder": {
    "default": [
      { "id": "home_improvement_agreement", "label": "Home Improvement Agreement", "keywords": ["agreement"], "required": true },
      { "id": "estimate", "label": "Estimate", "keywords": ["estimate", "budget"], "required": true },
      { "id": "mechanics_lien", "label": "Mechanics Lien Notice", "keywords": ["lien", "notice"], "required": true },
      { "id": "insurance", "label": "Proof of Insurance", "keywords": ["insurance"], "required": true },
      { "id": "3day_notice", "label": "3-Day Right to Cancel", "keywords": ["cancel", "3day"], "required": true }
    ]
  },
  "eSignature": {
    "platform": "adobeSign",
    "adobeSign": {
      "clientId": "",
      "clientSecret": "",
      "refreshToken": "",
      "baseUrl": "https://api.na4.adobesign.com/api/rest/v6"
    }
  },
  "paths": {
    "templates": "templates",
    "output": "workspace/output",
    "temp": "temp",
    "contractsRoot": ""
  },
  "offline": {
    "syncInterval": 300000,
    "maxCacheSize": 104857600,
    "cachePdfs": false
  }
}
```

---

## 9. Data Migration (Zero-Risk)

The merge is LOW RISK because:

1. **Contract folders don't change** — `I:\My Drive\Docs\Contracts\C26001\` stays exactly the same
2. **JSON databases just copy** — `db/clients.json`, `db/properties.json` etc. are portable
3. **Templates just copy** — PDF forms, Word templates, Excel templates
4. **No database migration** — everything is JSON files
5. **Manifest format stays identical** — contract state machine unchanged

```
Migration steps:
1. Copy Project_Exp/db/*.json → bb-field-suite/data/db/
2. Copy Project_Exp/templates/ → bb-field-suite/templates/
3. Copy eSigner/data/overlays/ → bb-field-suite/templates/overlays/
4. Copy Binder_Exp/templates/ → bb-field-suite/templates/ (merge, no conflicts)
5. Merge settings → unified settings.json
```

---

## 10. Port Strategy

| Service | Current Port | Unified Port | Notes |
|---------|-------------|-------------|-------|
| Project_Exp | 3460 | REMOVED | |
| Binder_Exp backend | 3015 | REMOVED | |
| Binder_Exp frontend | 3010 | REMOVED | |
| eSigner | 3090 | REMOVED | |
| **BB Field Suite backend** | — | **3460** | Keep existing port |
| **BB Field Suite frontend** | — | **3010** | Vite dev server |
| Mini_API_Bridge | 3100 | **3100** | UNCHANGED (shared infra) |

Production: Single port 3460 serves both API and static React build.

---

## 11. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Feature loss during migration | Medium | High | Phase-by-phase with side-by-side testing |
| iPad touch interactions feel clunky | Medium | Medium | Pointer Events + real iPad testing each phase |
| Gantt chart doesn't work on iPad | Low | Low | Horizontal scroll + pinch zoom; defer if needed |
| PDF field placement too imprecise on touch | Medium | Medium | Apple Pencil support + snap-to-grid |
| QBO sync breaks during migration | Low | High | QBO service is self-contained, copy as-is |
| Large codebase becomes hard to manage | Low | Medium | TypeScript + clear module boundaries |
| Performance regression | Low | Medium | Lazy-load pages, code splitting via Vite |
| Offline sync conflicts | Low | Medium | Last-write-wins for settings, queue for creates |

---

## 12. What NOT to Change

- **Mini_API_Bridge** — shared infrastructure, untouched
- **Contract folder structure** — `I:\My Drive\Docs\Contracts\C26001\`
- **Manifest format** — contract state machine works perfectly
- **QBO integration pattern** — Project_Exp → Mini_API_Bridge → QBO
- **Adobe Sign API wrapper** — `adobe-sign-client.js` works, just moves locations
- **PDF metadata embedding** — standard is established, just consolidate to one copy
- **BB color scheme** — `#C8102E` red, `#1A1A1A` dark, already in Tailwind config

---

## 13. Success Criteria

### Desktop
- [ ] All Project_Exp features work (clients, properties, estimates, agreements, Gantt)
- [ ] Binder creation works (merge, watermark, cover page)
- [ ] E-signature tagging works (smart overlay, manual placement)
- [ ] Adobe Sign integration works (send, track, download)
- [ ] QBO sync works (clients, properties, vendors)
- [ ] Single Run.bat starts everything

### iPad (Field Use)
- [ ] Touch-friendly navigation (44px targets, no hover dependencies)
- [ ] Client/property lookup works (including offline cache)
- [ ] Estimate form fill works (including offline)
- [ ] PDF viewing works (pinch zoom, scroll)
- [ ] Signature field placement works (Apple Pencil recommended)
- [ ] Offline indicator shows sync status
- [ ] Syncs cleanly when back online

### Performance
- [ ] Lighthouse mobile score: 80+
- [ ] axe accessibility: 0 critical/serious
- [ ] 60fps scrolling on iPad Air
- [ ] App loads in <3 seconds on LTE
- [ ] Bundle size: <2MB gzipped

---

## 14. Decision Points for Sam

Before starting, I need answers on a few things:

1. **App Name** — "BB Field Suite"? "BB Project Manager"? Something else?

2. **iPad Priority** — Is iPad a Day 1 requirement, or can we ship desktop-first and add iPad support in Phase 4?

3. **Offline Depth** — Basic (cached app shell + recent data) or full (queue operations + sync on reconnect)?

4. **Google Maps on iPad** — Do you need maps/street view on iPad, or is that desktop-only? (Saves complexity + API costs)

5. **Apple Pencil** — Will field crews have Apple Pencils? Signature field placement on iPad is much better with a stylus than fingers.

6. **Gantt on iPad** — Must-have or nice-to-have? It's the hardest component to make touch-friendly.

7. **Project Location** — Where should `bb-field-suite/` live? `C:\Users\samjo\Desktop\BB_Field_Suite\`?

---

## 15. Mini_API_Bridge Analysis (Port 3100)

### What It Is

Pure Node.js API gateway (v4.4.0) — **169 endpoints**, only 2 npm dependencies (ws, ioredis). Custom everything: HTTP server, middleware chain, rate limiting, CORS, security headers. No Express.

### What It Wraps

| Service | Endpoints | iPad Need |
|---------|-----------|-----------|
| **QuickBooks Online** | 64+ (CRUD, reconciliation, batch invoicing, Chase matching) | Sync only — crew uses QBO Mobile for reads |
| **QuickBooks Time** | 16+ (timesheets, payroll, labor validation) | None — crew uses Workforce app |
| **Claude AI** | 4 (chat, image analysis, JSON extraction) | None — desktop only |
| **OpenAI** | 4 (chat, vision, embeddings) | None — desktop only |
| **Google Maps** | 6 (geocode, reverse, directions, distance matrix) | Maybe — property address lookup |
| **Google Vision** | 3 (OCR, document detection, labels) | None — desktop only |
| **OSRM Routing** | 2 (route, distance table) | None — desktop only |

**Of 169 endpoints, iPad needs ~5-10 max** (customer search, customer create, geocode). The rest are office/desktop operations.

### Why It Can't Run on iPad

- Hardcoded Windows paths in 20+ files (`C:\Users\samjo\Desktop\...`)
- OAuth tokens stored as local JSON files with atomic disk writes
- API keys stored as plain text files in Credentials folder
- No HTTPS (relies on localhost-only access)
- CORS allows `*` (fine for localhost, dangerous on open internet)
- 368MB error log with no rotation

### iPad Access Strategy: VS Code Dev Tunnels

**Instead of moving or modifying Mini_API_Bridge, tunnel to it:**

```
VS Code Ports Panel → Forward Port 3100 → Private (GitHub auth)
→ https://{name}-3100.{region}.devtunnels.ms
```

- **Zero changes** to Mini_API_Bridge
- **HTTPS + auth** handled by Microsoft
- **Free tier** covers sync payloads easily
- **Fallback:** iPad works fully offline, syncs when tunnel available
- **Already familiar:** Sam uses VS Code daily

### Long-Term Option: Cloud Migration

If the tunnel proves limiting (laptop must be on), Mini_API_Bridge could move to a $5/mo VPS with these changes:
- `config/defaults.js` — hardcoded paths → environment variables (~20 files)
- Token storage → env vars or Redis instead of JSON files
- Add API key middleware for authentication (~20 lines)
- Add HTTPS via Caddy/nginx reverse proxy
- Estimated effort: 1-2 days

**Recommendation:** Start with VS Code tunnel. Upgrade to cloud only if needed.

---

## 16. iPad Field Estimate PWA (Tab4 Extraction)

### 16.1 Source: Tab4 in Project_Exp

The existing estimate system in Project_Exp is self-contained and extractable:

| Source File | Lines | What It Does |
|-------------|-------|--------------|
| `src/public/js/estimate.js` | 490 | Core calc engine: EST state, estSync(), render, drag-drop, sort, BY cycling |
| `src/public/js/output.js` | 376 | Export functions (Excel COM + PDF — **NOT needed for PWA**) |
| `src/public/js/client.js` | 700+ | Client/property picker, QBO sync — **strip QBO, keep picker** |
| `src/server/routes/estimate-templates.js` | 325 | 14 API endpoints for template CRUD |
| `src/server/services/estimate-templates-service-v3.js` | 452 | Template normalization, validation, storage |
| `src/server/routes/master-items.js` | 97 | Master item CRUD |
| `src/server/services/master-items-service.js` | 117 | Master item storage |
| `db/estimate-templates.json` | 10,765 | 30+ templates (Kitchen, Bath, ADU, etc.) |
| `db/master-items.json` | 1,298 | 300+ line items with rates/costs |
| `db/clients.json` | ~59KB | All clients (ported to IndexedDB) |
| `db/properties.json` | ~157KB | All properties (ported to IndexedDB) |

### 16.2 What Gets Kept vs. Dropped

| Feature | Keep | Drop | Why |
|---------|------|------|-----|
| Estimate calculation engine | YES | | Core functionality |
| Template selection (30+ templates) | YES | | Crew picks Kitchen, Bath, ADU, etc. |
| Master items (300+ line items) | YES | | Pre-populated costs/rates |
| Sitework + Building sections | YES | | Two-table estimate structure |
| Labor/Materials/Total per item | YES | | Core cost breakdown |
| BY cycling (BBI/SUB/OWN) | YES | | Who does the work |
| Tier multipliers (basic/standard/premium) | YES | | Cost scaling |
| OH&INS (12%) + Labor margin (35%) | YES | | Markup calculation |
| Client/Property picker | YES | | From local IndexedDB |
| Google Maps geocoding | YES | | New property address → lat/lng |
| Photo capture | YES | | Site photos with iPad camera |
| Drag-drop reordering | YES | | Touch-compatible via Pointer Events |
| 3-way column sort | YES | | Sort by name, cost, BY |
| Excel COM export | | DROP | No Excel on iPad |
| PDF via Puppeteer | | DROP | No server-side rendering needed |
| QBO sync/upload | | DROP | Office handles QBO |
| Planner/scope sync (Tab2 link) | | DROP | Standalone estimates in field |
| Timeline/Gantt integration | | DROP | Office feature |

### 16.3 The Calculation Engine (Preserved Exactly)

These hardcoded rates move to PWA settings (editable by Sam, synced from office):

```javascript
// Current hardcoded values in estimate.js
SETTINGS.laborRate = 85;          // $/hour
SETTINGS.tierMult = { basic: 0.85, standard: 1.0, premium: 1.25 };

// In pePopulateHeader()
const ohRate = 0.12;              // 12% overhead & insurance
const laborMarginRate = 0.35;     // 35% labor margin

// Item calculation (estSync):
// BBI/OWN: labor = hours × $85 × tierMult, materials = nonLabor × tierMult
// SUB: total = avgCost (single number, no labor/materials split)
// Fallback: if no hrs/nonLabor → use master item avgCost × tierMult
```

**Bid summary (preserved):**
```
Sitework Subtotal     $12,400
Building Subtotal     $45,600
OH & INS (12%)         $6,960
─────────────────────────────
ESTIMATE TOTAL        $64,960
Labor Margin (35%)    $11,200
Total Margin %          28.0%
```

### 16.4 PWA Architecture

```
BB Field Estimate (PWA)
├── React + Vite + TypeScript + Tailwind
├── Service Worker (offline-first)
├── IndexedDB stores:
│   ├── clients        ← ported from clients.json (~59KB)
│   ├── properties     ← ported from properties.json (~157KB)
│   ├── templates      ← ported from estimate-templates.json (30+ templates)
│   ├── masterItems    ← ported from master-items.json (300+ items)
│   ├── settings       ← laborRate, tierMult, ohRate, margins
│   ├── drafts         ← saved estimate drafts
│   └── outbox         ← "send to office" queue
├── Google Maps API (client-side geocoding for new properties)
└── Sync module (POST to office when online)
```

**No backend required on iPad.** The PWA runs entirely in the browser. The only server communication is "send to office" when online.

### 16.5 What the PWA Looks Like

```
┌──────────────────────────────────────┐
│  BB Field Estimate     [⟳ Sync] [⚙] │
├──────────────────────────────────────┤
│                                      │
│  Client: [Alcantar ▾]               │
│  Property: [123 Oak St ▾]           │
│  [+ New Client]  [+ New Property]    │
│                                      │
│  Template: [Kitchen Remodel ▾]       │
│  Tier: [○ Basic  ● Standard  ○ Prem]│
│                                      │
│  ┌─ SITEWORK ──────────────────────┐ │
│  │ # │ Item        │ By  │ $Total  │ │
│  │ 1 │ PERMITS     │ BBI │  $3,180 │ │
│  │ 2 │ DUMP FEES   │ BBI │  $2,227 │ │
│  │ 3 │ GRADING     │ SUB │  $4,500 │ │
│  │   │ [+ Add Item]│     │         │ │
│  │   │ Subtotal (3)│     │  $9,907 │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─ BUILDING ──────────────────────┐ │
│  │ # │ Item        │ By  │ $Total  │ │
│  │ 1 │ DEMO        │ BBI │  $2,400 │ │
│  │ 2 │ ROUGH PLUMB │ SUB │  $3,800 │ │
│  │ 3 │ ELECTRICAL  │ SUB │  $2,200 │ │
│  │ 4 │ CABINETS    │ SUB │ $12,500 │ │
│  │ 5 │ COUNTERTOPS │ SUB │  $4,200 │ │
│  │   │ [+ Add Item]│     │         │ │
│  │   │ Subtotal (5)│     │ $25,100 │ │
│  └─────────────────────────────────┘ │
│                                      │
│  SW + BLD:     $35,007               │
│  OH&INS (12%):  $4,201               │
│  TOTAL:        $39,208               │
│                                      │
│  Notes: ________________________     │
│  Photos: [📷 Camera] (3 attached)   │
│                                      │
│  [Save Draft]    [Send to Office →]  │
│                                      │
├──────────────────────────────────────┤
│  [📋 Estimates]  [👥 Clients]  [⚙]  │
└──────────────────────────────────────┘
```

**Expanded row (tap to expand on iPad):**
```
┌─────────────────────────────────────┐
│ 1 │ PERMITS              │ BBI     │
│   │ Labor:    $680  Materials: $2,500│
│   │ Total:    $3,180                │
│   │ Scope: Apply and pay for Permits│
│   │ [BBI ▸ SUB ▸ OWN]   [🗑 Delete]│
└─────────────────────────────────────┘
```

### 16.6 "Send to Office" Payload

Mirrors the actual EST data structure from `estimate.js`:

```json
{
  "type": "field_estimate",
  "version": "1.0",
  "createdAt": "2026-03-01T14:30:05Z",
  "createdBy": "evan",
  "device": "iPad",
  "status": "pending_review",
  "client": {
    "id": "cli_12345",
    "displayName": "John Doe",
    "phone1": "+1 (555) 123-4567",
    "email1": "john@example.com",
    "address": "123 Billing St, Los Gatos, CA 95031",
    "isNew": false
  },
  "property": {
    "id": "prop_67890",
    "address": "123 Main St, Los Gatos, CA 95031",
    "sqft": 2500,
    "lotSqft": 10000,
    "lat": 37.2234,
    "lng": -121.9834,
    "isNew": false
  },
  "templateId": "tpl_kitchen_full",
  "templateName": "Kitchen",
  "tier": "standard",
  "settings": {
    "laborRate": 85,
    "ohRate": 0.12,
    "laborMarginRate": 0.35,
    "tierMult": 1.0
  },
  "items": {
    "sw": [
      {
        "name": "PERMITS",
        "by": "BBI",
        "notes": "Apply and pay for Permits",
        "labor": 680,
        "materials": 2500,
        "total": 3180,
        "masterItemId": "item_PERMITS"
      }
    ],
    "bld": [
      {
        "name": "DEMO",
        "by": "BBI",
        "notes": "Demo existing cabinets and countertops",
        "labor": 1360,
        "materials": 400,
        "total": 1760,
        "masterItemId": "item_DEMO"
      }
    ]
  },
  "summary": {
    "swSubtotal": 9907,
    "bldSubtotal": 25100,
    "ohIns": 4201,
    "estTotal": 39208,
    "laborTotal": 8160,
    "laborMargin": 2856,
    "totalMarginPct": 18.0
  },
  "notes": "Homeowner wants white shaker cabinets. Existing layout stays.",
  "photos": ["photo_001.jpg", "photo_002.jpg", "photo_003.jpg"],
  "syncStatus": "queued"
}
```

### 16.7 New Client / New Property in the Field

**New Client form (minimal — just enough to start an estimate):**
- First Name, Last Name, Phone, Email, Address (optional)
- Saved to local IndexedDB with `isNew: true`
- Included in "send to office" payload for office to create in master DB + optional QBO sync

**New Property form:**
- Address (required) → **Google Maps Geocoding API** (works directly from browser, no Bridge needed)
- Auto-fills: formatted address, city, state, zip, lat/lng
- Optional: sqft, lot size, beds, baths
- Street View preview (Google Maps Static API, client-side)
- Saved to local IndexedDB with `isNew: true`

**Google Maps on iPad:** The Maps JavaScript API and Geocoding API work with a client-side API key. No Mini_API_Bridge needed. The API key is embedded in the PWA (restricted by HTTP referrer to the PWA's domain).

### 16.8 Photo Capture

```html
<input type="file" accept="image/*" capture="environment" multiple>
```

- Opens iPad camera directly
- Photos compressed to ~200KB JPEG via `<canvas>` resize
- Stored in IndexedDB as blobs (not URLs)
- Uploaded alongside estimate JSON when syncing to office
- Office watcher saves photos to contract folder

### 16.9 The Office Watcher

The back office runs a **watcher process** — a lightweight endpoint on the BB Field Suite server that receives field submissions and processes them:

```
Office Server (BB Field Suite on port 3460)
├── POST /api/field/inbox           ← receives estimate JSON + photos
├── GET  /api/field/inbox           ← lists pending submissions
├── PATCH /api/field/inbox/:id      ← approve/reject/modify
└── Watcher logic:
    ├── New client? → creates in clients.json, optional QBO sync
    ├── New property? → creates in properties.json, geocodes if needed
    ├── Creates contract folder: I:\My Drive\Docs\Contracts\C26XXX\
    ├── Saves estimate as draft in contracts.json
    ├── Saves photos to contract folder
    └── Notifies dashboard (WebSocket or polling)
```

**Field Inbox dashboard widget:**
```
┌─────────────────────────────────────────────────────┐
│  Field Inbox (3 new)                                 │
├─────────────────────────────────────────────────────┤
│  ● Alcantar - Kitchen Remodel    $39,208   2:30 PM  │
│    123 Main St · 3 photos · Evan                    │
│    [Review →]  [Quick Approve →]                    │
│                                                     │
│  ● Martinez - Bathroom Addition  $45,200   11:15 AM │
│    456 Elm Ave · 1 photo · Evan                     │
│    [Review →]  [Quick Approve →]                    │
│                                                     │
│  ○ Johnson - Deck Repair          $8,400   Yesterday│
│    789 Pine Rd · Evan                               │
│    [Approved] → Contract C26014                     │
└─────────────────────────────────────────────────────┘
```

**"Review"** opens the full Tab4 estimate view in the office app, pre-populated with the field data. Sam can adjust line items, change BY assignments, modify markup, then push into the contract pipeline.

**"Quick Approve"** auto-creates the contract folder, saves the estimate, and advances to agreement generation.

### 16.10 Offline → Sync Flow

```
OFFLINE (no internet)                    ONLINE (connected)
────────────────────                     ──────────────────
Crew opens PWA (cached)                  PWA detects connectivity
  ↓                                        ↓
Picks client from IndexedDB              Pulls latest data:
Picks/creates property                     GET /api/field/reference-data
Selects template                           → clients, properties, templates,
Edits line items                             master items, settings
  ↓                                        ↓
[Save Draft] → IndexedDB                 Updates IndexedDB stores
  ↓                                        ↓
[Send to Office] → IndexedDB outbox      Flushes outbox:
  (queued, shows badge count)              POST /api/field/inbox (for each)
                                           Uploads photos
                                           Marks as "sent"
                                           ↓
                                         Office watcher processes
```

**Reference data bundle (~475KB):**

| Data | Source | Size | Notes |
|------|--------|------|-------|
| Clients (name, phone, email, ID) | clients.json | ~15KB | Stripped to essentials |
| Properties (address, sqft, clientId) | properties.json | ~40KB | Stripped to essentials |
| Estimate templates | estimate-templates.json | ~250KB | All 30+ templates |
| Master items | master-items.json | ~150KB | 300+ items with rates |
| Settings (rates, margins) | settings.json | ~2KB | laborRate, ohRate, etc. |
| Last project number | contracts.json | ~1KB | For auto-generating C26XXX |

Refreshed on every sync. Cached indefinitely for offline use.

### 16.11 Implementation Breakdown

**PWA (runs on iPad):**

| Component | Lines (est.) | Source |
|-----------|-------------|--------|
| `EstimateForm.tsx` (main form with SW+BLD tables) | ~500 | Port from `estimate.js` (490 lines) |
| `ClientPicker.tsx` (search + new client form) | ~250 | Port from `client.js` (strip QBO) |
| `PropertyPicker.tsx` (search + new + Google Maps) | ~200 | Port from `client.js` + geocode |
| `TemplatePicker.tsx` (template selector + tier toggle) | ~100 | New |
| `DraftList.tsx` (saved drafts + outbox status) | ~150 | New |
| `estimateStore.ts` (Zustand: EST state + calc engine) | ~200 | Port from `estimate.js` estSync/calc |
| `syncStore.ts` (Zustand: IndexedDB + outbox + sync) | ~150 | New |
| `db.ts` (IndexedDB wrapper: clients, props, templates) | ~120 | New (idb library) |
| `sync.ts` (sync service: pull reference data, push outbox) | ~100 | New |
| `sw.ts` (service worker: cache app shell + assets) | ~80 | New (workbox) |
| `manifest.json` (PWA manifest) | ~20 | New |
| `App.tsx` + routing + layout | ~100 | New |
| `tailwind.config.js` + styles | ~50 | Clone from Binder_Exp (BB theme) |
| **PWA Total** | **~2,020** | |

**Office side (added to BB Field Suite server):**

| Component | Lines (est.) | Source |
|-----------|-------------|--------|
| `field-inbox-routes.js` (6 endpoints) | ~200 | New |
| `field-inbox-service.js` (watcher logic) | ~250 | New |
| `FieldInbox.tsx` (dashboard widget) | ~200 | New |
| **Office Total** | **~650** | |

**Grand Total: ~2,670 lines** — a self-contained, deployable PWA + office integration.

### 16.12 Deployment Options

| Option | How Crew Gets It | Backend Needed? | Sync Target |
|--------|------------------|-----------------|-------------|
| **A. Hosted PWA (Railway)** | Open URL → "Add to Home Screen" | YES (Railway $5/mo) | Railway server |
| **B. VS Code Tunnel PWA** | Open tunnel URL → "Add to Home Screen" | NO (Sam's desktop) | Sam's desktop server |
| **C. Static PWA (GitHub Pages)** | Open URL → "Add to Home Screen" | NO (for app itself) | Tunnel for sync only |

**Recommended: Option A (Railway).** The PWA is served from Railway. The office watcher also runs on Railway. Crew opens the URL, taps "Add to Home Screen", and it works like a native app — including offline. No tunnel dependency for serving the app; tunnel only needed if office server is local.

---

## 17. Platform Support: macOS / MacBook

### 17.1 The Question

Crew has access to MacBook laptops. Can they run the BB suite on macOS? Could a MacBook have its own API Bridge?

### 17.2 Compatibility Audit Results

**~85% of the codebase is already cross-platform.** Node.js + React + Vite + pdf-lib + Puppeteer all run on macOS. The blockers are Windows-specific system integrations.

#### Tier 1: Works Today (Zero Changes)

| Component | Why It Works |
|-----------|-------------|
| All React frontend code | Browser-based, platform-agnostic |
| All Express backend routes | Pure Node.js |
| pdf-lib (merge, watermark, metadata) | Pure JavaScript |
| PDF.js (rendering) | Browser-based |
| Zustand, Tailwind, Vite | Platform-agnostic |
| Adobe Sign API client | Pure HTTP/REST |
| JSON file database | fs module, cross-platform |
| Mini_API_Bridge core logic | Pure Node.js (ws, ioredis) |

#### Tier 2: Easy Fixes (~1-2 days)

| Component | Windows-Only Code | macOS Fix | Effort |
|-----------|-------------------|-----------|--------|
| **Puppeteer PDF export** | Hardcoded Edge path: `C:\Program Files...msedge.exe` | `process.platform` check → use Chrome on macOS | 30 min |
| **Font path resolution** | `C:\Windows\Fonts\` | `/System/Library/Fonts/` or `/Library/Fonts/` | 30 min |
| **Windows .lnk shortcuts** | `contracts-path.js` resolves `.lnk` files | macOS uses symlinks natively — skip .lnk resolution | 1 hour |
| **Mini_API_Bridge paths** | 20+ files with `C:\Users\samjo\Desktop\...` | Refactor to `path.join(process.env.HOME, ...)` or env vars | 4 hours |
| **Word COM fallback** | `word-com-wrapper.js` for DOCX→PDF | Already has XML-based fallback (no COM needed) | Already done |

#### Tier 3: Significant Blocker (Excel COM)

| Component | Problem | Impact |
|-----------|---------|--------|
| **Excel COM automation** | `excel-com-wrapper-v2.js` uses Windows COM to drive Excel | Estimates, financial exports, batch reporting |

**Excel COM is the biggest blocker.** It's used for:
- Estimate spreadsheet generation
- Financial report exports
- Batch cost analysis

**Solution: ExcelJS (already exists)**

Binder_Exp's `estimate-generator.js` already uses **ExcelJS** (pure JavaScript, cross-platform) to generate estimate spreadsheets. This is the field-ready alternative:

| Feature | Excel COM (Windows) | ExcelJS (Cross-Platform) |
|---------|---------------------|--------------------------|
| Generate estimate XLSX | ✓ (pixel-perfect) | ✓ (95% fidelity) |
| Apply formatting | ✓ (full Office formatting) | ✓ (fonts, colors, borders, merges) |
| Charts | ✓ (native Excel charts) | ✗ (no chart support) |
| Print layout | ✓ (PageSetup, headers/footers) | Limited (basic page setup) |
| Performance | 2.2-3.2s (optimized COM) | <1s (no COM overhead) |
| macOS | ✗ | ✓ |
| Dependencies | Microsoft Office installed | None (pure JS) |

**Recommendation:** MacBooks use ExcelJS for field estimates. Desktop keeps Excel COM for pixel-perfect office output. Both produce valid .xlsx files.

### 17.3 MacBook Deployment Architecture

```
MacBook (field / remote)                  Sam's Desktop (office)
────────────────────────                  ─────────────────────
BB Field Suite (React+Express)            BB Field Suite (full)
  ├── Full UI (all pages)                   ├── Full UI (all pages)
  ├── ExcelJS estimates                     ├── Excel COM estimates
  ├── pdf-lib (merge/tag)                   ├── pdf-lib (merge/tag)
  ├── Puppeteer (Chrome)                    ├── Puppeteer (Edge)
  └── Local JSON DB (cached)                └── Master JSON DB
        │                                         ↑
        │ VS Code Dev Tunnel                      │
        └──── HTTPS ──────────────────────────────┘
                                            Mini_API_Bridge (3100)
                                              └── QBO, Maps, AI
```

**Key principle: One API Bridge, one source of truth.**

The MacBook does NOT run its own Mini_API_Bridge. It connects to Sam's desktop via the same VS Code Dev Tunnel as the iPad. This avoids:
- Duplicate OAuth token management
- QBO token race conditions (see 17.4)
- Credential duplication on multiple machines
- Split-brain data issues

### 17.4 QBO Token Race Condition (Why One Bridge)

If two Mini_API_Bridges ran simultaneously (desktop + MacBook), both would try to refresh QBO OAuth tokens:

```
Desktop Bridge: Token refresh → writes qbo-tokens.json → Token A
MacBook Bridge: Token refresh → writes qbo-tokens.json → Token B
                                                  ↑
                            Token A is now INVALID (Intuit revokes old token)
Desktop Bridge: Next API call with Token A → 401 UNAUTHORIZED
```

QBO OAuth2 uses **rotating refresh tokens** — each refresh invalidates the previous token. Two bridges = guaranteed auth failures.

**Solution:** Single bridge on Sam's desktop. All other devices tunnel to it.

### 17.5 macOS Porting Effort Estimate

| Task | Effort | Priority |
|------|--------|----------|
| Platform-aware Puppeteer browser path | 30 min | Required |
| Platform-aware font path resolution | 30 min | Required |
| Skip .lnk resolution on macOS | 1 hour | Required |
| ExcelJS as default on macOS (COM on Windows) | 2 hours | Required |
| Mini_API_Bridge path refactor (env vars) | 4 hours | Only if MacBook needs local Bridge |
| Testing on macOS | 4 hours | Required |
| **Total** | **~1.5 days** | |

**Note:** If the MacBook just tunnels to Sam's desktop (recommended), the Mini_API_Bridge refactor is NOT needed — saving 4 hours. Total drops to ~1 day.

### 17.6 Platform Detection Pattern

```javascript
// utils/platform.ts
const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

export const config = {
  puppeteerBrowser: IS_WINDOWS
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',

  fontsDir: IS_WINDOWS
    ? 'C:\\Windows\\Fonts'
    : '/System/Library/Fonts',

  excelEngine: IS_WINDOWS ? 'com' : 'exceljs',

  resolveShortcuts: IS_WINDOWS,  // .lnk only on Windows
};
```

This single file gates all platform-specific behavior. Everything else in the codebase calls `config.*` instead of checking platform directly.

### 17.7 What Stays Windows-Only

Even with macOS support, some features remain desktop (Windows) only:

| Feature | Why |
|---------|-----|
| Excel COM pixel-perfect exports | Requires Microsoft Office |
| Word COM DOCX→PDF conversion | Requires Microsoft Office (XML fallback exists) |
| Windows .lnk shortcut resolution | macOS uses native symlinks |
| BAT_PORT_INVENTORY.csv management | Run.bat is Windows-only (macOS would use .sh) |

### 17.8 macOS Launcher (Run.sh)

If a MacBook runs BB Field Suite locally, it needs a shell equivalent of Run.bat:

```bash
#!/bin/bash
# BB Field Suite — macOS Launcher
# Kill orphan processes on project port
lsof -ti:3460 | xargs kill -9 2>/dev/null

# Start server
cd "$(dirname "$0")"
node src/server/server.js &

# Wait for server
sleep 2

# Open in browser
open "http://localhost:3460"
```

Much simpler than Run.bat because macOS doesn't have the CMD gotchas.

---

## 18. Cloud-Hosted Architecture (The "Drag and Drop" Option)

### 18.1 The Idea

Instead of running locally on each device with tunnels and porting, **host the entire app in the cloud**. Crew opens a URL on any device — iPad, MacBook, phone, desktop — and it just works.

### 18.2 Why This Changes Everything

| Problem | Local Architecture | Cloud Architecture |
|---------|-------------------|-------------------|
| iPad access | PWA + tunnel to desktop | Open URL |
| MacBook access | Port code + tunnel | Open URL |
| Phone access | Not planned | Open URL (same app) |
| Sam's laptop must be on | Yes (for tunnel) | No (cloud always on) |
| macOS porting | ~1.5 days of fixes | Not needed (Linux server) |
| Offline support | Complex (IndexedDB + sync) | Only for Field Estimate PWA |
| Run.bat / Run.sh | Windows + macOS launchers | Not needed |
| Excel COM | Windows-only, needs fallback | ExcelJS only (cross-platform) |
| Mini_API_Bridge | Tunnel or refactor | Embed QBO endpoints directly |

### 18.3 The Stack

| Layer | Service | Cost/mo | Deploy Method |
|-------|---------|---------|---------------|
| **Full-stack host** | Railway | **$5** | `git push` → auto-deploy |
| **PDF storage** | Cloudflare R2 | **$0** | S3-compatible API (10GB free) |
| **Database** | JSON files on Railway volume | **$0** | Included (persistent volume) |
| **PDF generation** | pdf-lib + Puppeteer on Railway | **$0** | Runs in Linux container |
| **Total** | | **$5/mo** | |

### 18.4 How It Works

```
Any Device (iPad, MacBook, Desktop, Phone)
    │
    │  HTTPS (Railway auto-TLS)
    ▼
Railway Container
├── React SPA (Vite build → static files)
├── Express API (all routes consolidated)
├── JSON DB (persistent volume at /app/data)
├── pdf-lib + Puppeteer (PDF generation)
├── QBO OAuth (env vars, not file-based tokens)
├── Adobe Sign API (direct, no bridge)
├── Google Maps API (server-side geocoding)
└── Field Inbox watcher (receives from PWA)
    │
    ├──► QuickBooks Online API (direct HTTPS)
    ├──► Adobe Sign API (direct HTTPS)
    ├──► Google Maps API (direct HTTPS)
    └──► Cloudflare R2 (PDF/photo storage)
```

**No Mini_API_Bridge needed.** The unified server talks directly to QBO, Adobe Sign, and Google Maps. The Bridge was needed when 3 separate apps shared one gateway — with one unified app, the gateway is built in.

**Note:** The existing Mini_API_Bridge on Sam's desktop stays untouched. Other tools that depend on it (if any) keep using it. This is a clean separation.

### 18.5 Railway Deployment (The "Drag and Drop" Part)

**Initial setup (~10 minutes):**
1. Push code to GitHub
2. Go to railway.com → New Project → Deploy from GitHub
3. Railway auto-detects Node.js, builds, deploys
4. Set environment variables (QBO tokens, API keys, Adobe Sign creds)
5. Add persistent volume at `/app/data` for JSON DB files
6. Get URL: `https://bb-suite.up.railway.app`

**Every update after that:**
```
Sam: "Claude, fix the estimate total calculation"
Claude: fixes code, pushes to GitHub
Railway: auto-deploys in ~60 seconds
Crew: refreshes browser → sees fix
```

**Rollback:** Click any previous deployment in Railway dashboard → instant rollback.

### 18.6 QBO Without the Bridge

The unified server embeds the ~10 QBO endpoints BB actually needs:

| Endpoint | What It Does | Bridge Equivalent |
|----------|-------------|-------------------|
| `GET /api/qbo/customers` | Search/list customers | `GET /qbo/Customer` |
| `POST /api/qbo/customers` | Create customer | `POST /qbo/Customer` |
| `GET /api/qbo/customers/:id` | Get customer detail | `GET /qbo/Customer/:id` |
| `PUT /api/qbo/customers/:id` | Update customer | `PUT /qbo/Customer/:id` |
| `GET /api/qbo/vendors` | List vendors | `GET /qbo/Vendor` |
| `POST /api/qbo/invoices` | Create invoice | `POST /qbo/Invoice` |
| `GET /api/qbo/invoices` | List invoices | `GET /qbo/Invoice` |
| `POST /api/qbo/token/refresh` | Refresh OAuth token | Internal bridge logic |

**Token management:** QBO OAuth2 tokens stored as Railway environment variables (encrypted at rest). The `qbo-client-v2.js` service from Mini_API_Bridge (~300 lines) is adapted to use env vars instead of file-based tokens. Proactive refresh (10 min before expiry) stays identical.

**Of Mini_API_Bridge's 169 endpoints, BB Field Suite needs ~10.** The other 159 (Claude AI, OpenAI, Vision, OSRM, bulk QBO ops) are desktop-only tools that stay on Sam's local Bridge.

### 18.7 File Storage: Cloudflare R2

PDFs and photos currently saved to local disk → move to R2 (S3-compatible object storage):

```javascript
// Before (local):
fs.writeFileSync(`workspace/output/${filename}`, pdfBuffer);

// After (R2):
await r2.putObject({ Key: `output/${filename}`, Body: pdfBuffer });
const url = await r2.getSignedUrl({ Key: `output/${filename}` });
```

- 10 GB free tier (enough for thousands of PDFs)
- Zero egress fees (unlike S3)
- S3-compatible API → existing AWS SDK code works with endpoint change
- Contract folder structure preserved as R2 key prefixes: `contracts/C26001/estimate.pdf`

### 18.8 What You Lose vs. Local

| Feature | Local | Cloud | Impact |
|---------|-------|-------|--------|
| Excel COM pixel-perfect exports | Yes | No (ExcelJS only) | 95% fidelity, no charts |
| Word COM DOCX→PDF | Yes | No (XML fallback) | Already has fallback |
| Contract folder on Google Drive | Direct `I:\` access | R2 storage (download to Drive) | Different workflow |
| Offline full app | No (needs server) | No (needs internet) | Field Estimate PWA still works offline |
| Startup time | Instant (local) | ~2s (HTTPS round-trip) | Negligible |
| Sam's laptop can be off | No (tunnel needs it) | Yes (cloud always on) | Major win |

**The big tradeoff:** Google Drive contract folders (`I:\My Drive\Docs\Contracts\C26001\`) are local filesystem. In the cloud, files live in R2. Sam can still download them to Drive, or set up rclone to auto-sync R2 → Google Drive.

### 18.9 Security

| Concern | Solution |
|---------|----------|
| App authentication | Railway private URL + simple password middleware (5 users, internal tool) |
| QBO tokens | Railway encrypted environment variables |
| API keys | Railway encrypted environment variables |
| HTTPS | Railway auto-TLS (included) |
| Data at rest | R2 encrypted by default |
| CORS | Locked to Railway domain only |

For a 5-user internal tool, a simple shared password or per-user login (stored in settings.json) is sufficient. No need for OAuth/SSO complexity.

### 18.10 Migration Path: Local → Cloud

| Step | Effort | Notes |
|------|--------|-------|
| 1. Add `Dockerfile` or let Railway auto-detect | 30 min | Nixpacks handles Node.js automatically |
| 2. Replace file paths with env vars | 2 hours | `process.env.DATA_DIR` instead of `C:\Users\samjo\...` |
| 3. Add R2 storage adapter | 2 hours | Swap `fs.writeFile` → R2 SDK for PDF/photo storage |
| 4. Extract QBO client from Bridge | 3 hours | Copy `qbo-client-v2.js`, adapt token storage to env vars |
| 5. Set Railway env vars (QBO, Adobe, Maps) | 30 min | One-time config in Railway dashboard |
| 6. Upload JSON DB files to persistent volume | 30 min | `railway volume upload` or copy via deploy |
| 7. Test all workflows | 4 hours | End-to-end: estimate → binder → sign |
| **Total** | **~1.5 days** | |

---

## 19. Summary: What Gets Built

| Deliverable | Platform | Lines (est.) | Phase |
|-------------|----------|-------------|-------|
| Unified React app shell | All | ~2,000 | 0 |
| Binder features (migrated) | All | ~4,000 (existing) | 0 |
| eSigner React migration | All | ~3,000 | 1 |
| Project_Exp React migration | All | ~10,000 | 2-3 |
| **Field Estimate PWA** | **iPad/any device** | **~2,020** | **1 (parallel)** |
| **Field Inbox + Watcher (office)** | **Server** | **~650** | **1 (parallel)** |
| Cloud deployment (Railway + R2) | Server | ~200 (config) | 0 |
| Platform detection (macOS) | MacBook | ~100 | 0 |
| **Total new/migrated code** | | **~22,000** | 7-11 weeks |

### Priority Order

1. **Phase 0:** App shell + Binder + cloud deployment + platform detection
2. **Phase 1:** eSigner migration + **Field Estimate PWA** (parallel tracks)
3. **Phase 2-3:** Project_Exp migration (largest effort)
4. **Phase 4:** iPad polish, remaining offline support
5. **Phase 5:** Cleanup + decommission old apps

### The Two Tracks

```
Track A: Full Unified App                Track B: Field Estimate PWA
─────────────────────────                ──────────────────────────
Phase 0-5 (7-11 weeks)                  Phase 1 (~1 week)
All features, all platforms              Standalone, iPad-first
Desktop + cloud hosted                   PWA, works offline
React migration of 3 apps               Extract Tab4 from Project_Exp
                                         Own IndexedDB, own sync
                                         Send to Office → Watcher
```

**Track B can ship independently** and immediately — it doesn't depend on the full unified app. Crew gets the Field Estimate PWA on their iPads within a week, while the full migration continues in the background.

---

## 20. Mini_API_Bridge Cloud Migration (Deep-Dive)

### 20.1 Current State Assessment

Mini_API_Bridge (v4.4.0) is **surprisingly cloud-ready**:
- Only 2 npm dependencies (`ws`, `ioredis`) — both cross-platform
- Zero Windows-only npm packages
- All Node.js built-ins (`http`, `https`, `fs`, `path`) work on Linux
- Health endpoints already exist (`/health`, `/status`, `/test`)
- Pure HTTP proxy for most routes — no filesystem dependency

**The blockers are all configuration, not code architecture:**

### 20.2 The Four Blockers

#### Blocker 1: Hardcoded Windows Paths (12+ locations)

| File | What's Hardcoded | Fix |
|------|-----------------|-----|
| `server/config/defaults.js` (7 paths) | `C:\Users\samjo\Desktop\Mini_API_Bridge\Credentials\...` for every API key + token file | `process.env.*` for each |
| `server/utils/file-ops.js` (6 paths) | `ALLOWED_DIRS` whitelist — 6 hardcoded `C:\` paths | `process.cwd()` based |
| `server/utils/sanitize.js` (2 paths) | `allowedExternalPaths` for file validation | `process.env.BASE_DIR` |
| `server/index.js` (1 path) | Port hardcoded as `3100` | `process.env.PORT \|\| 3100` |

**Effort: ~3 hours.** Straightforward find-and-replace with env var fallbacks.

#### Blocker 2: File-Based Credentials (6 files)

Currently reads API keys from plain text files on disk:

| Credential | Current Storage | Railway Storage |
|-----------|----------------|-----------------|
| QBO OAuth tokens | `Credentials/QB_/qbo-tokens.json` | Railway env var (JSON string) OR persistent volume |
| QBT config/tokens | `Credentials/QB_/qbt-config.json` | Railway env var (JSON string) OR persistent volume |
| Claude API key | `Credentials/Claude API.txt` | `CLAUDE_API_KEY` env var |
| OpenAI API key | `Credentials/OpenAI API.txt` | `OPENAI_API_KEY` env var |
| Google Maps key | `Credentials/GoogleMap_API.txt` | `GOOGLE_MAPS_API_KEY` env var |
| Google Vision key | `Credentials/Google Vision API.txt` | `GOOGLE_VISION_API_KEY` env var |

**The 4 simple API keys** (Claude, OpenAI, Maps, Vision): trivial — change `loadApiKey(filePath)` to `process.env.KEY_NAME`. ~30 minutes.

**The 2 OAuth token files** (QBO, QBT): harder — they're READ AND WRITTEN at runtime as tokens get refreshed. See Blocker 3.

**Effort: ~2 hours** (API keys) + see Blocker 3 for tokens.

#### Blocker 3: QBO Token Persistence (The Hard One)

QBO uses OAuth2 with **rotating refresh tokens** — each refresh invalidates the previous token. The current code:

1. `qbo-client-v2.js:loadTokens()` — reads `qbo-tokens.json` on startup
2. `qbo-client-v2.js:refreshToken()` — POSTs to Intuit, gets new access + refresh tokens
3. `qbo-client-v2.js:saveTokens()` — atomic write (temp file → rename) with backup
4. Proactive refresh: 10 minutes before expiry, automatically refreshes

**The problem:** Railway containers restart on every deploy. If tokens are only in memory, a deploy during an active session loses the current refresh token → QBO auth breaks.

**Three solutions:**

| Option | How It Works | Effort | Reliability |
|--------|-------------|--------|-------------|
| **A. Persistent Volume** | Mount Railway volume at `/app/data`, write tokens there. Survives redeploys. | 1 hour | High — same as current local approach |
| **B. Railway Postgres** | Store tokens in a `credentials` table. Read on startup, write after refresh. | 3 hours | Highest — survives volume loss |
| **C. Env Var + API** | Store initial tokens as env var. After refresh, update env var via Railway API. | 2 hours | Medium — env var update has lag |

**Recommended: Option A** (persistent volume). It's the closest to how it works today — just change the file path. The atomic write pattern (`temp → rename`) already works on Linux. QBT gets the same treatment.

```javascript
// Before:
const TOKEN_PATH = 'C:\\Users\\samjo\\...\\qbo-tokens.json';

// After:
const TOKEN_PATH = process.env.QBO_TOKENS_PATH || '/app/data/qbo-tokens.json';
```

**Effort: ~4 hours** (QBO + QBT token management adaptation + testing).

#### Blocker 4: 368MB Error Log (No Rotation)

The error log (`logs/errors.log`) grows unbounded — `fs.appendFileSync()` with zero rotation. This will fill Railway's disk within hours.

**Current code** (`server/index.js:415-424`):
```javascript
const logPath = path.join(__dirname, '..', 'logs', 'errors.log');
fs.appendFileSync(logPath, errorLog);  // Append forever
```

**Fix:** Railway captures stdout/stderr automatically. Replace file logging with console:

```javascript
// Replace fs.appendFileSync with:
console.error(`[FATAL ${new Date().toISOString()}] ${errorLog}`);
// Railway dashboard shows all logs, searchable, with retention
```

For local development, keep file logging behind an env flag:
```javascript
if (process.env.LOG_TO_FILE === 'true') {
  fs.appendFileSync(logPath, errorLog);  // local only
} else {
  console.error(errorLog);  // cloud (Railway captures this)
}
```

**Effort: ~2 hours** (replace all file-append calls + test).

### 20.3 What Doesn't Need to Change

| Component | Why It's Already Cloud-Ready |
|-----------|------------------------------|
| All 169 API routes | Pure HTTP proxying — no Windows dependency |
| Rate limiting | In-memory, works anywhere |
| Middleware chain | Custom but standard Node.js |
| QBO OAuth2 refresh logic | Pure HTTPS calls to Intuit |
| QBT API calls | Pure HTTPS calls to TSheets |
| AI API proxying (Claude, OpenAI) | Pure HTTPS forwarding |
| Google Maps/Vision | Pure HTTPS calls |
| OSRM routing | Calls external API |
| WebSocket server (diagnostic) | `ws` library, works on Railway |
| Health endpoints | Already implemented |
| Graceful shutdown | SIGTERM handler exists |

### 20.4 Redis (Optional)

Redis is used for **batch sessions only** (long-running multi-step operations). If Redis is unavailable, the server starts fine — batch endpoints return 503 but everything else works.

| Option | Cost | Effort |
|--------|------|--------|
| Skip Redis (disable batch) | $0 | 0 — it already gracefully degrades |
| Railway Redis add-on | $5/mo | 30 min — auto-injects `REDIS_URL` env var |
| External Redis (Upstash free tier) | $0 | 30 min — set `REDIS_URL` env var manually |

**Recommendation:** Skip Redis initially. Add later if batch operations are needed in the cloud.

### 20.5 CORS Hardening

Current: `Access-Control-Allow-Origin: *` (fully open — fine for localhost, dangerous on internet).

**Fix:**
```javascript
// server/middleware/cors.js
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
```

Set `ALLOWED_ORIGINS=https://bb-suite.up.railway.app,http://localhost:3460` in Railway env vars.

**Effort: ~1 hour.**

### 20.6 Complete Migration Checklist

| # | Task | Files | Effort | Priority |
|---|------|-------|--------|----------|
| 1 | Replace hardcoded `C:\` paths with env vars | `config/defaults.js`, `utils/file-ops.js`, `utils/sanitize.js` | 3 hrs | CRITICAL |
| 2 | API keys: file → env vars | `config/index.js` (loadApiKey function) | 1 hr | CRITICAL |
| 3 | Port: hardcoded → `process.env.PORT` | `server/index.js` line 45 | 15 min | CRITICAL |
| 4 | QBO token persistence: file → volume path | `services/qbo-client-v2.js` (TOKEN_PATH) | 2 hrs | CRITICAL |
| 5 | QBT token persistence: file → volume path | `services/qbt-client.js` (CONFIG_PATH) | 1 hr | CRITICAL |
| 6 | Error logging: file → console (Railway captures) | `server/index.js` lines 415-453 | 2 hrs | CRITICAL |
| 7 | CORS: wildcard → whitelist | `middleware/cors.js` | 1 hr | IMPORTANT |
| 8 | Railway config: Procfile + railway.json | New files | 30 min | REQUIRED |
| 9 | Persistent volume setup | Railway dashboard | 30 min | REQUIRED |
| 10 | Set all env vars in Railway | Railway dashboard | 30 min | REQUIRED |
| 11 | Upload initial token files to volume | Railway CLI | 15 min | REQUIRED |
| 12 | Test all 169 endpoints | Automated test script | 4 hrs | REQUIRED |
| 13 | QBT atomic write (currently not atomic) | `services/qbt-client.js` lines 45-59 | 1 hr | NICE-TO-HAVE |
| 14 | Redis add-on (batch sessions) | Railway dashboard | 30 min | OPTIONAL |
| | **TOTAL** | | **~17 hours** | |

### 20.7 Railway Configuration

**`railway.json`:**
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 10,
    "restartPolicyType": "ON_FAILURE"
  }
}
```

**Environment variables to set:**
```
PORT=3100
NODE_ENV=production

# Paths (persistent volume mounted at /app/data)
QBO_TOKENS_PATH=/app/data/qbo-tokens.json
QBT_CONFIG_PATH=/app/data/qbt-config.json
BASE_DIR=/app

# API Keys (direct values, not file paths)
CLAUDE_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=AIzaSy...
GOOGLE_VISION_API_KEY=AIzaSy...

# QBO OAuth (client ID/secret for token refresh)
QBO_CLIENT_ID=AB...
QBO_CLIENT_SECRET=...
QBO_REALM_ID=9341455569882853
QBO_ENVIRONMENT=production

# QBT OAuth
QBT_CLIENT_ID=...
QBT_CLIENT_SECRET=...

# Security
ALLOWED_ORIGINS=https://bb-suite.up.railway.app,http://localhost:3460
LOG_TO_FILE=false

# Optional
REDIS_URL=  (leave empty to disable batch)
```

### 20.8 Architecture: Cloud Bridge

```
BB Field Suite (Railway)          Mini_API_Bridge (Railway)
bb-suite.up.railway.app           bb-bridge.up.railway.app
        │                                   │
        │  Internal Railway network         │
        └──────────── /api/qbo/* ──────────►│
                      /api/maps/* ──────────►│── QuickBooks Online
                      /api/ai/*  ──────────►│── QuickBooks Time
                                            │── Claude / OpenAI
Other BB Apps ──────── HTTPS ──────────────►│── Google Maps / Vision
(TS_Latest, etc.)                           │── OSRM
                                            │
Sam's Desktop ─────── HTTPS ──────────────►│  (same URL, works locally too)
```

**Key benefit:** Moving the Bridge to cloud means ALL future BB apps get API access by hitting a single URL. No tunnels, no "is Sam's laptop on?", no per-machine setup.

### 20.9 Effort Summary

| Phase | Tasks | Hours |
|-------|-------|-------|
| **Day 1** | Paths → env vars, API keys → env vars, port config, logging fix | 7 hrs |
| **Day 2** | Token persistence (QBO + QBT), CORS, Railway config, volume setup | 6 hrs |
| **Day 3** | Test all 169 endpoints, fix edge cases, deploy | 4 hrs |
| **Total** | | **~17 hours (~2-3 days)** |

**Risk: LOW.** The code changes are all configuration, not logic. The QBO/QBT OAuth refresh logic, all API proxying, middleware chain, health checks — none of that changes. We're just swapping where it reads paths and credentials from.

### 20.10 Backward Compatibility

The changes are fully backward-compatible. If env vars aren't set, fallback to file paths:

```javascript
// config/defaults.js pattern:
qbo: {
  tokensPath: process.env.QBO_TOKENS_PATH
    || 'C:\\Users\\samjo\\Desktop\\Mini_API_Bridge\\Credentials\\QB_\\qbo-tokens.json'
}
```

This means the **same codebase** runs both locally on Sam's desktop AND on Railway. No branching, no separate versions. `git push` deploys to cloud; `Run.bat` runs locally.

---

## 21. Decision Points for Sam

1. **Cloud Bridge first or last?** — Deploy Mini_API_Bridge to Railway (~3 days) before the unified app? This unlocks ALL future BB apps immediately.

2. **Field Estimate PWA first?** — Ship the standalone Tab4 PWA (~1 week) while the full migration continues as Track A?

3. **Cloud vs. Local for the unified app?** — Railway ($5/mo, any device opens URL) or keep local (Run.bat, tunnel for field)?

4. **Google Drive sync?** — If cloud-hosted, auto-sync R2 → Google Drive for contract folders? Or change workflow?

5. **App Name** — "BB Field Suite"? "BB Project Manager"? PWA: "BB Field Estimate"?

6. **Authentication** — Simple shared password? Per-user login? Railway private URL?

7. **Redis for batch operations?** — Skip initially ($0) or add Railway Redis ($5/mo)?

---

*Generated by Claude | 10 agents, 2 passes + macOS audit + Tab4 deep-dive + hosting research + Bridge deep-dive | 2026-03-01*
*Sources: Project_Exp (18K lines, estimate.js 490 lines), Adobe eSigner (6K lines), Binder_Exp (4K lines), Mini_API_Bridge (169 endpoints, 12 hardcoded paths, 6 credential files)*
