# BB Field Estimate PWA | Feature Spec + Implementation Plan | v1.0 | 2026-03-01 | BB

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Source Code Inventory](#2-source-code-inventory)
3. [Feature Inventory — What Gets Ported](#3-feature-inventory--what-gets-ported)
4. [Feature Inventory — What Gets Dropped](#4-feature-inventory--what-gets-dropped)
5. [Feature Inventory — New for PWA](#5-feature-inventory--new-for-pwa)
6. [Data Structures](#6-data-structures)
7. [Calculation Engine Spec](#7-calculation-engine-spec)
8. [UI Screens & Components](#8-ui-screens--components)
9. [IndexedDB Schema](#9-indexeddb-schema)
10. [Offline / PWA Behavior](#10-offline--pwa-behavior)
11. [Send to Office Protocol](#11-send-to-office-protocol)
12. [Office Watcher Spec](#12-office-watcher-spec)
13. [Google Maps / Places Integration](#13-google-maps--places-integration)
14. [Photo Capture](#14-photo-capture)
15. [Settings](#15-settings)
16. [Tech Stack](#16-tech-stack)
17. [Implementation Plan](#17-implementation-plan)
18. [Risk Register](#18-risk-register)
19. [Success Criteria](#19-success-criteria)

---

## 1. Executive Summary

**What:** Extract Tab4 (Estimate Generator) from Project_Exp into a standalone Progressive Web App for iPad field use.

**Why:** Field crew currently cannot create estimates on-site. They must return to the office, boot Project_Exp on the desktop, and manually enter everything. A PWA lets them build estimates on the jobsite, capture photos, select clients/properties, and send the finished estimate back to the office with one tap.

**Key constraints:**
- Fully offline-capable (construction sites have spotty connectivity)
- No QBO integration (field tool — office handles accounting)
- No Excel COM export (iPad has no Excel COM — office handles export)
- No Puppeteer PDF (iPad has no Puppeteer — office handles PDF)
- Own IndexedDB for clients, properties, master items, templates
- Google Maps/Places for new property geocoding
- "Send to Office" transmits estimate JSON → Office Watcher ingests it

---

## 2. Source Code Inventory

Every feature in this spec traces back to these source files:

| # | Source File | Lines | What It Does | Ported? |
|---|------------|-------|--------------|---------|
| 1 | `src/public/js/estimate.js` | 490 | Calc engine, table rendering, drag-drop, sort, BY cycling | **YES** — core engine |
| 2 | `src/public/js/state.js` | 114 | Global state: SETTINGS, EST, MI, client/property vars | **YES** — constants + state |
| 3 | `src/public/js/templates.js` | 98 | Template load/save/delete, carousel, auto-save | **YES** — template management |
| 4 | `src/public/js/output.js` | 375 | Excel export, PDF export, file picker | **PARTIAL** — payload builder only |
| 5 | `src/public/js/import.js` | 587 | Excel import → match → template | **NO** — office-only |
| 6 | `src/public/js/settings.js` | 13 | Settings modal UI | **YES** — simplified |
| 7 | `src/public/js/supplier-dir.js` | 368 | Vendor directory UI | **NO** — office-only |
| 8 | `src/public/js/item-dir.js` | 327 | Master items directory UI | **NO** — office-only (read-only in PWA) |
| 9 | `src/public/js/api.js` | 383 | API client wrapper | **NO** — replaced by IndexedDB |
| 10 | `src/server/routes/estimate-templates.js` | 325 | REST API for templates | **NO** — no server |
| 11 | `src/server/services/estimate-templates-service-v3.js` | 452 | Template CRUD service | **NO** — IndexedDB replaces |
| 12 | `src/server/routes/master-items.js` | 97 | REST API for master items | **NO** — no server |
| 13 | `src/server/lib/excel/excel-com-wrapper-v2.js` | 362 | Excel COM persistent wrapper | **NO** — no Excel on iPad |
| 14 | `db/master-items.json` | 1,298 | Master item catalog (300+ items) | **YES** — seeded into IndexedDB |
| 15 | `db/estimate-templates.json` | 10,765 | 30+ reusable templates | **YES** — seeded into IndexedDB |
| 16 | `db/clients.json` | ~59KB | Client records | **YES** — seeded into IndexedDB |
| 17 | `db/properties.json` | ~157KB | Property records with geocoding | **YES** — seeded into IndexedDB |
| 18 | `index.html` (lines 640–1000+) | ~360 | Estimate tab HTML structure | **YES** — rebuilt as React |

---

## 3. Feature Inventory — What Gets Ported

### 3.1 Calculation Engine (estimate.js:17–86)

| Feature | Source | Detail |
|---------|--------|--------|
| `estSync()` — planner→estimate sync | estimate.js:17–86 | Core function. Builds estimate rows from enabled items. Preserves user-edited labor/materials. |
| Labor auto-calc | estimate.js:34–39 | `labor = hrs × laborRate × tierMult[tier]`. Only auto-fills if user hasn't manually edited. |
| Materials auto-calc | estimate.js:41–47 | `materials = nonLabor × tierMult[tier]`. Same auto-fill logic. |
| SUB cost pre-fill | estimate.js:73 | `total = avgCost × tierMult[tier]`. SUB items have single total, no labor/materials split. |
| BBI/OWN fallback | estimate.js:66–69 | When hrs=0 and nonLabor=0, pre-fill materials from avgCost. |
| Instance numbering | estimate.js:25–26 | `_ekey = itemId + '_' + instanceNum`. Handles duplicate items (e.g., two DRYWALL entries). |
| Display name suffixing | estimate.js:79–85 | Appends "(N)" when duplicate itemIds exist (e.g., "DRYWALL (1)", "DRYWALL (2)"). |
| Non-SUB total calc | estimate.js:71 | `total = labor + materials` for BBI/OWN items. |

### 3.2 Project Express Header (estimate.js:97–154)

| Feature | Source | Detail |
|---------|--------|--------|
| Client info display | estimate.js:100–104 | Name, email, phone, address from selected client |
| Jobsite info display | estimate.js:106–108 | Property address from selected property |
| Project name + timeline | estimate.js:107–113 | Project name, start→end date formatting, duration in weeks |
| Merit breakdown | estimate.js:115–131 | SUB count+$, Labor count+$, Non-Labor count+$, Margin (labor×35% + OH&INS) |
| Bid summary | estimate.js:132–153 | Sitework subtotal, Building subtotal, OH&INS (12%), EST TOTAL |
| Margin calculation | estimate.js:146–152 | `margin = (laborAmt × 0.35) + (swTotal+bldTotal) × 0.12`, display as % of total |

### 3.3 Estimate Table (estimate.js:242–347)

| Feature | Source | Detail |
|---------|--------|--------|
| Two-section layout | estimate.js:242–347 | Sitework (sw) table + Building (bld) table, each independently collapsible |
| Row rendering | estimate.js:250–296 | Line#, item name, BY badge, scope notes, labor, materials, total, delete |
| Inline currency editing | estimate.js:349–366 | Focus strips formatting, blur parses+recalculates, auto-updates total |
| Subtotal row | estimate.js:298–316 | Per-section: item count, BBI/SUB/OWN $ breakdown, labor/materials/total sums |
| Banner subtotals | estimate.js:326–330 | Top banners show Labor/Materials/Total for each section |
| Collapsed summary | estimate.js:332–334 | When collapsed, shows "SITEWORK Subtotal: $X · N items · BBI: $X · SUB: $X" |
| SUB vs BBI/OWN field disabling | estimate.js:252–258, 288–292 | SUB: labor+materials disabled, total editable. BBI/OWN: labor+materials editable, total disabled (auto-calc). |

### 3.4 BY Cycling (estimate.js:378–397)

| Feature | Source | Detail |
|---------|--------|--------|
| 3-way cycle | estimate.js:382–384 | BBI → SUB → OWN → BBI. Click BY badge to cycle. |
| SUB transition | estimate.js:386–389 | When switching TO SUB: total = labor+materials (or existing total), labor=0, materials=0 |
| Non-SUB transition | estimate.js:392–395 | When switching FROM SUB: labor = total, materials stays 0 |

### 3.5 Row Operations (estimate.js:400–474)

| Feature | Source | Detail |
|---------|--------|--------|
| Add item | estimate.js:400–410 | Push empty row `{name:'', by:'BBI', labor:0, materials:0, total:0}`, focus new input |
| Delete item | estimate.js:413–418 | Splice row, re-render |
| Insert below | estimate.js:421–426 | Splice empty row at idx+1, re-render |
| Drag-and-drop reorder | estimate.js:441–474 | HTML5 native drag. Within-section only (can't drag sw→bld). Snapshot before move. |

### 3.6 Column Sorting (estimate.js:206–239)

| Feature | Source | Detail |
|---------|--------|--------|
| 3-way sort cycle | estimate.js:206–216 | Click column header: none → asc → desc → none |
| Sortable columns | estimate.js:221–228 | name (alpha), by (alpha), labor ($), materials ($), total ($) |
| Sort arrow indicators | estimate.js:232–238 | ▲ (asc) / ▼ (desc) / empty (none) |
| Sorted view mapping | estimate.js:217–231 | Sort is display-only — `_origIdx` tracks real position for mutations |

### 3.7 Collapse/Expand (estimate.js:429–438)

| Feature | Source | Detail |
|---------|--------|--------|
| Section collapse | estimate.js:429–433 | Toggle entire sw/bld section |
| Banner collapse | estimate.js:434–438 | Collapse just the table, keep banner visible |

### 3.8 Timeline/Bid Panel (estimate.js:158–203)

| Feature | Source | Detail |
|---------|--------|--------|
| Duration unit cycling | estimate.js:160–182 | D → W → M → D button cycle |
| Auto-calc end date | estimate.js:184–202 | Start date + duration + unit = end date |
| Bid auto-save | estimate.js:179 | Debounced save on change |

### 3.9 Template Management (templates.js)

| Feature | Source | Detail |
|---------|--------|--------|
| Template carousel | templates.js:renderCarousel | Card grid: built-in + user-created templates, sorted by recency |
| Load template | templates.js:load(id) | Load template → populate items array → render all |
| Save as template | templates.js:doSave | Save current planner as new template (name + category) |
| Auto-save edits | templates.js:tplAutoSave | Debounced 1.5s save after any edit |
| Delete template | templates.js:delTemplate(id) | Delete user-created templates (built-in are protected) |

### 3.10 Currency Formatting (estimate.js:6–14)

| Feature | Source | Detail |
|---------|--------|--------|
| `estFmt(v)` | estimate.js:6–9 | Number → `$N` with locale thousands, no decimals. 0→"$0". |
| `estParse(s)` | estimate.js:11–14 | Strip `$`, commas, letters → number. Handles negatives. |

### 3.11 Client/Property Selection (state.js:81–88)

| Feature | Source | Detail |
|---------|--------|--------|
| Client list | state.js:81 | `CLI_CLIENTS[]` — all clients loaded from DB |
| Property lookup | state.js:82 | `CLI_PROPS{}` — clientId → [properties] |
| Selected client | state.js:83 | `CLI_SEL_CLIENT` — current client object |
| Selected property | state.js:84 | `CLI_SEL_PROP` — current property object |
| Add new client | state.js:85 | `CLI_ADD_CLIENT` — form mode toggle |
| Add new property | state.js:87 | `CLI_ADD_PROP` — form mode toggle |
| Google Places autocomplete | state.js:88–89 | Address autocomplete for billing + property addresses |

---

## 4. Feature Inventory — What Gets Dropped

| Feature | Source | Why Dropped |
|---------|--------|-------------|
| Excel COM export | output.js + excel-com-wrapper-v2.js | No Excel COM on iPad. Office Watcher handles export. |
| PDF generation (Puppeteer) | output.js:generateEstimatePDF | No Puppeteer on iPad. Office Watcher handles PDF. |
| Excel import | import.js (587 lines) | Office-only workflow. No file picker on iPad for .xlsx. |
| Planner/Scope link | gantt.js:renderAll→renderEstimate | PWA has no planner tabs. Estimate is standalone. |
| Timeline/Gantt | gantt.js, weeks.js | Office-only scheduling tool. |
| Vendor directory management | supplier-dir.js (368 lines) | Office-only vendor assignment. PWA shows read-only prefSource. |
| Master item editor | item-dir.js (327 lines) | Office-only catalog management. PWA uses items read-only. |
| QBO sync | api.js:loadQboVendors, client sync | No QBO on field tool. Office syncs, then pushes to PWA. |
| Server-side API | All routes + services | PWA is serverless. IndexedDB replaces server DB. |
| Undo/snapshot (estSnapshot) | gantt.js:416 | Simplify for v1. Can add later. |
| Project ID management | output.js:getDbPath | Office-only feature. |

---

## 5. Feature Inventory — New for PWA

| # | Feature | Priority | Detail |
|---|---------|----------|--------|
| 1 | **Offline-first IndexedDB** | P0 | All data stored locally. Works without network. |
| 2 | **Send to Office** | P0 | One-tap: package estimate JSON → POST to Office Watcher endpoint. Queue if offline. |
| 3 | **Photo capture** | P1 | Camera API → capture jobsite photos → attach to estimate. Stored as blobs in IndexedDB. |
| 4 | **Data sync (office→field)** | P1 | Bulk-pull clients, properties, master items, templates from office server. |
| 5 | **New client creation** | P1 | Add client on-site with name, phone, email, address (Google Places autocomplete). |
| 6 | **New property creation** | P1 | Add property with Google Maps geocoding, street view, beds/baths/sqft. |
| 7 | **Service Worker** | P0 | Cache app shell + static assets for instant offline load. |
| 8 | **Install prompt (A2HS)** | P1 | "Add to Home Screen" for iPad Safari / Chrome. |
| 9 | **Outbox queue** | P0 | Failed sends queued in IndexedDB, auto-retry when online. |
| 10 | **Touch-optimized UI** | P0 | Larger tap targets (44px min), swipe-to-delete, bottom-anchored actions. |
| 11 | **Estimate drafts** | P1 | Save multiple in-progress estimates, resume later. |

---

## 6. Data Structures

### 6.1 Estimate Row (ported from estimate.js:48–64)

```typescript
interface EstimateRow {
  name: string;           // Item name (uppercase)
  displayName: string;    // Name + "(N)" suffix for duplicates
  by: 'BBI' | 'SUB' | 'OWN';
  notes: string;          // Scope notes
  labor: number;          // $ — auto-calc or manual (0 for SUB)
  _autoLabor: number;     // Last auto-calculated labor (for dirty detection)
  materials: number;      // $ — auto-calc or manual (0 for SUB)
  _autoMat: number;       // Last auto-calculated materials (for dirty detection)
  total: number;          // $ — auto-calc for BBI/OWN, manual for SUB
  srcIdx: number;         // Index in source items array (-1 for manually added)
  sources: Source[];      // Vendor/sub source references
  prefSource: string;     // Preferred source ID
  keywords: string;       // Search keywords
  itemId: string;         // Master item ID (e.g., "item_PERMITS")
  instanceNum: number;    // Instance number for duplicate items
  _ekey: string;          // Dedup key: itemId + '_' + instanceNum
}

interface Source {
  id: string;             // e.g., "sub_qbo_370"
  type: 'SUB' | 'VEN';
}
```

### 6.2 Master Item (from master-items.json)

```typescript
interface MasterItem {
  name: string;           // "DUMP FEES"
  section: 'sitework' | 'building';
  phase: string;          // "pre_con", "demo_prep", "rough", "finish", "closeout"
  defaultBy: 'BBI' | 'SUB' | 'OWN';
  dur: number;            // Duration (days)
  seq: 'P' | 'S';        // Parallel or Sequential
  lead: number;           // Lead time (days)
  hrs: number;            // Man-hours
  nonLabor: number;       // Material cost ($)
  avgCost: number;        // Historical average ($)
  tiers: object | null;   // Tier-specific overrides
}
```

### 6.3 Template (from estimate-templates.json)

```typescript
interface Template {
  id: string;             // "tpl_kitchen_full"
  name: string;           // "Kitchen"
  description: string;    // "Complete tear-out & rebuild..."
  category: string;       // "Kitchen", "Bath", "ADU", etc.
  durationWeeks: number;
  userCreated?: boolean;  // false = built-in (protected)
  items: TemplateItem[];
}

interface TemplateItem {
  id: string;             // "item_PERMITS"
  name: string;           // "PERMITS"
  section: 'sitework' | 'building';
  phase: string;
  trade: string;
  order: number;
  ps: 'P' | 'S';
  by: 'BBI' | 'SUB' | 'OWN';
  dur: number;
  durVal: number;
  durUnit: 'D' | 'W' | 'M';
  schedDur: number;
  bufL: number;
  bufR: number;
  lead: number;
  crew: number;
  hrs: number;
  nonLabor: number;
  avgCost: number;
  tier: 'basic' | 'standard' | 'premium';
  tiers: object | null;
  scope: string;
  sources: Source[];
  prefSource: string;
  keywords: string;
}
```

### 6.4 Client (from clients.json)

```typescript
interface Client {
  id: string;             // "CLI-00001"
  name1: string;          // First name
  name2: string;          // Middle name
  lastName: string;
  displayName: string;
  companyName: string;
  email1: string;
  email2: string;
  phone1: string;
  phone2: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  isActive: boolean;
}
// QBO fields (qboId, syncSource, etc.) are NOT ported — field tool doesn't sync to QBO
```

### 6.5 Property (from properties.json)

```typescript
interface Property {
  id: string;             // "PROP-00001"
  clientId: string;       // "CLI-00001"
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  googleFormatted: string;
  lat: number;
  lng: number;
  placeId: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft: number;
  yearBuilt: number;
  garage: number;
  propertyType: string;   // "single_family", "condo", etc.
  status: string;         // "active"
  displayName: string;    // Short label: "Loyola Dr"
  photos: Photo[];
  streetView: StreetView;
}

interface Photo {
  url: string;
  type: 'streetview' | 'aerial' | 'field';  // 'field' = new for PWA
  source: 'google' | 'camera';
  date: string | null;
  blob?: Blob;           // Local camera photo (stored in IndexedDB)
}

interface StreetView {
  url: string;
  date: string;
  panoId: string;
  available: boolean;
}
```

### 6.6 Estimate Draft (NEW for PWA)

```typescript
interface EstimateDraft {
  id: string;             // UUID
  clientId: string | null;
  propertyId: string | null;
  projectName: string;
  templateId: string | null;  // Which template was loaded
  startDate: string | null;   // "2026-03-15"
  duration: number | null;
  durationUnit: 'days' | 'weeks' | 'months';
  endDate: string | null;
  items: TemplateItem[];  // Source items (planner-level)
  est: {                  // Estimate-level data
    sw: EstimateRow[];
    bld: EstimateRow[];
  };
  photos: string[];       // IndexedDB blob keys
  notes: string;          // General notes
  status: 'draft' | 'sent' | 'accepted';
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
  sentAt: string | null;  // When "Send to Office" was triggered
}
```

### 6.7 Settings (from state.js:62)

```typescript
interface Settings {
  laborRate: number;      // Default: 85 ($/hr)
  hrsPerDay: number;      // Default: 8
  tierMult: {
    basic: number;        // Default: 0.85
    standard: number;     // Default: 1.0
    premium: number;      // Default: 1.25
  };
  ohRate: number;         // Default: 0.12 (12%) — currently hardcoded in pePopulateHeader
  laborMarginRate: number; // Default: 0.35 (35%) — currently hardcoded in pePopulateHeader
  officeUrl: string;      // Office Watcher endpoint (e.g., "https://bb-office.example.com")
}
```

---

## 7. Calculation Engine Spec

The PWA calculation engine is a 1:1 port of `estSync()` + `pePopulateHeader()`. Every formula is documented below.

### 7.1 Item-Level Calculations

**Input:** Template items loaded into `items[]` array. Each has `hrs`, `nonLabor`, `avgCost`, `by`, `tier`.

**For BBI/OWN items:**
```
tierMult = SETTINGS.tierMult[item.tier] || 1.0

IF hrs > 0:
  autoLabor = ROUND(hrs × SETTINGS.laborRate × tierMult)
  labor = autoLabor (unless user manually edited → keep user value)

IF nonLabor > 0:
  autoMat = ROUND(nonLabor × tierMult)
  materials = autoMat (unless user manually edited → keep user value)

IF hrs == 0 AND nonLabor == 0 AND avgCost > 0:
  materials = ROUND(avgCost × tierMult)  // fallback pre-fill

total = labor + materials
```

**For SUB items:**
```
labor = 0 (always)
materials = 0 (always)

IF total == 0 AND avgCost > 0:
  total = ROUND(avgCost × tierMult)  // pre-fill from historical average
ELSE:
  total = user-entered value
```

### 7.2 Auto-Fill Dirty Detection

The engine tracks whether labor/materials were auto-calculated or user-edited:

```
IF item is new OR current labor == 0 OR current labor == _autoLabor:
  → OVERWRITE labor with auto-calculated value
ELSE:
  → KEEP user's manual edit
```

Same logic for materials via `_autoMat`.

### 7.3 Section Subtotals

```
swLabor  = SUM(sw[].labor)
swMat    = SUM(sw[].materials)
swTotal  = SUM(sw[].total)

bldLabor = SUM(bld[].labor)
bldMat   = SUM(bld[].materials)
bldTotal = SUM(bld[].total)
```

### 7.4 Grand Total (pePopulateHeader formula)

```
ohRate     = 0.12  (12%)
ohIns      = (swTotal + bldTotal) × ohRate
estTotal   = swTotal + bldTotal + ohIns
```

### 7.5 Margin Calculation

```
laborAmt        = SUM(all rows labor)
laborMarginRate = 0.35  (35%)
laborMargin     = laborAmt × laborMarginRate
totalMargin     = laborMargin + ohIns
marginPct       = (totalMargin / estTotal) × 100
```

### 7.6 Merit Breakdown

```
subCount  = COUNT(rows WHERE by == 'SUB')
subAmt    = SUM(rows WHERE by == 'SUB' → total)

laborCount = COUNT(rows WHERE labor > 0)
laborAmt   = SUM(all rows → labor)

matCount   = COUNT(rows WHERE materials > 0)
matAmt     = SUM(all rows → materials)
```

### 7.7 BY Cycle Transitions

```
BBI → SUB:
  total = labor + materials (or existing total if both 0)
  labor = 0
  materials = 0

SUB → OWN:
  IF labor == 0 AND materials == 0 AND total > 0:
    labor = total
    total = labor (unchanged)

OWN → BBI:
  (no special logic — just changes the badge)
```

---

## 8. UI Screens & Components

### Screen 1: Home / Drafts List

```
┌─────────────────────────────┐
│  BB Field Estimate     [⚙]  │
├─────────────────────────────┤
│ [+ New Estimate]            │
│                             │
│ ┌─────────────────────────┐ │
│ │ ★ Kitchen Reno          │ │
│ │   Alcantar · Loyola Dr  │ │
│ │   $42,500 · 3/1 draft   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ★ Bath Full             │ │
│ │   Baumgartner · Oak St  │ │
│ │   $18,200 · 2/28 sent   │ │
│ └─────────────────────────┘ │
│                             │
│ ─── Sent ──────────────── │
│ [3 previous estimates]      │
├─────────────────────────────┤
│ [Sync ↓]  [Outbox: 0]      │
└─────────────────────────────┘
```

**Components:** DraftCard, SyncButton, OutboxBadge

### Screen 2: Template Picker

```
┌─────────────────────────────┐
│  ← Pick Template            │
├─────────────────────────────┤
│ [Search templates...]       │
│                             │
│ ┌───────┐ ┌───────┐        │
│ │Kitchen│ │Bath   │        │
│ │Full   │ │Full   │        │
│ │32 itm │ │18 itm │        │
│ └───────┘ └───────┘        │
│ ┌───────┐ ┌───────┐        │
│ │ADU    │ │Deck   │        │
│ │Full   │ │ Basic │        │
│ │45 itm │ │12 itm │        │
│ └───────┘ └───────┘        │
│                             │
│ [Start Blank]               │
└─────────────────────────────┘
```

**Components:** TemplateCard (grid), SearchBar, BlankButton

### Screen 3: Client/Property Selection

```
┌─────────────────────────────┐
│  ← Select Client            │
├─────────────────────────────┤
│ [Search clients...]         │
│                             │
│  Alcantar, Ernesto          │
│    Loyola Dr, San Jose      │
│  Bainbridge                 │
│    Fairway Dr, Soquel       │
│  Baumgartner, Brian         │
│    (no property)            │
│                             │
│ [+ Add New Client]          │
├─────────────────────────────┤
│  ← Select Property          │
├─────────────────────────────┤
│  🏠 1864 Loyola Dr          │
│     San Jose, CA 95122      │
│     3bd/1ba · 960 sf        │
│                             │
│ [+ Add New Property]        │
└─────────────────────────────┘
```

**Components:** ClientList, ClientCard, PropertyCard, AddClientForm, AddPropertyForm

### Screen 4: Estimate Editor (Main Screen)

```
┌─────────────────────────────────────────┐
│ ← Alcantar · Kitchen Reno        [📷]  │
├─────────────────────────────────────────┤
│ PROJECT EXPRESS HEADER                  │
│ ┌────────┬────────┬────────┬──────────┐ │
│ │Client  │Jobsite │Merits  │Bid Total │ │
│ │Alcantar│Loyola  │L: $12k │EST $42.5k│ │
│ │408-891 │San Jose│M: $8k  │SW  $15k  │ │
│ │email.. │Mar-May │SUB $22k│BLD $27k  │ │
│ │        │8 weeks │Mrg 18% │OH  $5k   │ │
│ └────────┴────────┴────────┴──────────┘ │
├─────────────────────────────────────────┤
│ ── SITEWORK ──── L:$4k M:$3k T:$15k    │
│ #│Item        │BY │Notes│ L   │ M  │ T  │
│ 1│PERMITS     │BBI│Apply│$680 │$2.5│$3.2│
│ 2│SITE TOILET │SUB│Order│ —   │ —  │$500│
│ 3│LANDFILL    │BBI│     │     │    │    │
│  │(+ Add Item)                          │
│ ── Subtotal: $15,200 · 12 items ──     │
├─────────────────────────────────────────┤
│ ── BUILDING ──── L:$8k M:$5k T:$27k    │
│ (collapsed — tap to expand)             │
│ ── Subtotal: $27,300 · 20 items ──     │
├─────────────────────────────────────────┤
│ [Save Draft]  [Send to Office →]        │
└─────────────────────────────────────────┘
```

**Components:** ProjectExpressHeader, EstimateSection (×2), EstimateRow, BYBadge, CurrencyInput, ActionBar

### Screen 5: Bid Panel (side drawer or modal)

```
┌──────────────────────────┐
│ Bid Details         [×]  │
├──────────────────────────┤
│ Project Name             │
│ [Kitchen Renovation    ] │
│                          │
│ Start Date               │
│ [2026-03-15]             │
│                          │
│ Duration    [30] [D▼]    │
│                          │
│ End Date (auto)          │
│ [2026-04-14] (readonly)  │
│                          │
│ Tier                     │
│ ○ Basic  ● Standard      │
│ ○ Premium                │
│                          │
│ [Apply]                  │
└──────────────────────────┘
```

### Screen 6: Photo Capture

```
┌──────────────────────────┐
│ Photos (3)          [×]  │
├──────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ │
│ │ 📸  │ │ 📸  │ │ 📸  │ │
│ │img1 │ │img2 │ │img3 │ │
│ └─────┘ └─────┘ └─────┘ │
│                          │
│ [📷 Take Photo]          │
│ [📁 Choose File]         │
│                          │
│ Note for photos:         │
│ [Kitchen before demo   ] │
└──────────────────────────┘
```

### Screen 7: Settings

```
┌──────────────────────────┐
│ Settings            [×]  │
├──────────────────────────┤
│ Labor Rate: [$85 /hr]    │
│ Hours/Day:  [8]          │
│                          │
│ Tier Multipliers:        │
│  Basic:    [0.85]        │
│  Standard: [1.00]        │
│  Premium:  [1.25]        │
│                          │
│ OH & INS Rate: [12%]     │
│ Labor Margin:  [35%]     │
│                          │
│ Office Server:           │
│ [https://bb-office...]   │
│                          │
│ Data:                    │
│ Clients: 45  Properties: 62 │
│ Templates: 30  Items: 300+   │
│ Last sync: 2026-03-01 2pm│
│                          │
│ [Sync Now]  [Clear Data] │
└──────────────────────────┘
```

---

## 9. IndexedDB Schema

**Database name:** `bb-field-estimate`
**Version:** 1

### Object Stores

| Store | Key | Indexes | Seed Source |
|-------|-----|---------|-------------|
| `clients` | `id` (CLI-XXXXX) | `displayName`, `lastName`, `isActive` | clients.json |
| `properties` | `id` (PROP-XXXXX) | `clientId`, `address`, `status` | properties.json |
| `masterItems` | itemId (string key) | `section`, `phase`, `name` | master-items.json |
| `templates` | `id` | `category`, `name`, `userCreated` | estimate-templates.json |
| `drafts` | `id` (UUID) | `status`, `clientId`, `updatedAt` | — (user-created) |
| `photos` | `id` (UUID) | `draftId` | — (camera captures) |
| `outbox` | `id` (UUID) | `status`, `createdAt` | — (pending sends) |
| `settings` | `key` | — | Defaults from SETTINGS constant |
| `syncMeta` | `key` | — | Tracks last sync timestamp per store |

### Seeding Strategy

On first launch (or after "Clear Data"):
1. Fetch seed bundles from office server: `GET /api/field-sync/bundle`
2. Response contains: `{ clients[], properties[], masterItems{}, templates[] }`
3. Bulk-insert into IndexedDB stores using transactions
4. Record sync timestamp in `syncMeta`

**Bundle size estimate:** clients (~59KB) + properties (~157KB) + masterItems (~80KB) + templates (~500KB compressed) ≈ **~800KB total** (well within cellular limits)

### ID Generation (New Records)

- New client: `CLI-F-{UUID-short}` (F = field-created, distinguishes from office CLI-XXXXX)
- New property: `PROP-F-{UUID-short}`
- New draft: UUID v4
- New photo: UUID v4

---

## 10. Offline / PWA Behavior

### Service Worker Strategy

**Precache (install event):**
- App shell: index.html, CSS, JS bundles, icons
- Manifest file
- Font files

**Runtime cache (fetch event):**
- Google Maps tiles: Cache-first, 7-day TTL
- Google Places API: Network-first, cache fallback
- All other network: Network-first

### Offline Capabilities

| Feature | Offline? | How |
|---------|----------|-----|
| View/edit estimates | ✅ | All data in IndexedDB |
| Create new estimate | ✅ | Templates + master items in IndexedDB |
| Select existing client/property | ✅ | Clients + properties in IndexedDB |
| Add new client | ✅ | Save to IndexedDB, sync later |
| Add new property (manual) | ✅ | Save to IndexedDB, sync later |
| Add new property (geocode) | ❌ | Requires Google Maps API |
| Take photos | ✅ | Camera API + IndexedDB blob storage |
| Send to Office | ⚠️ | Queued in outbox, auto-sends when online |
| Sync data from office | ❌ | Requires network |

### Network Status Indicator

```
[🟢 Online]  or  [🔴 Offline — changes saved locally]
```

Displayed in top bar. Uses `navigator.onLine` + periodic ping to office server.

---

## 11. Send to Office Protocol

### Payload Structure

When user taps "Send to Office", the PWA builds this JSON payload:

```typescript
interface FieldEstimatePayload {
  version: '1.0';
  source: 'bb-field-estimate';
  deviceId: string;           // Unique device identifier (generated on install)
  sentAt: string;             // ISO timestamp
  draftId: string;            // UUID of the draft

  client: {
    id: string;               // CLI-XXXXX or CLI-F-XXXXX (field-created)
    displayName: string;
    phone: string;
    email: string;
    address: string;
    isNew: boolean;           // true if created in field
    fullRecord?: Client;      // Full client object if isNew
  };

  property: {
    id: string;               // PROP-XXXXX or PROP-F-XXXXX
    address: string;
    city: string;
    state: string;
    zip: string;
    lat: number | null;
    lng: number | null;
    isNew: boolean;
    fullRecord?: Property;    // Full property object if isNew
  };

  estimate: {
    projectName: string;
    templateId: string | null;
    startDate: string | null;
    endDate: string | null;
    duration: number | null;
    durationUnit: 'days' | 'weeks' | 'months';
    tier: 'basic' | 'standard' | 'premium';
    items: {
      sw: EstimateRow[];      // Sitework rows
      bld: EstimateRow[];     // Building rows
    };
    totals: {
      swTotal: number;
      bldTotal: number;
      ohIns: number;
      estTotal: number;
      laborAmt: number;
      matAmt: number;
      subAmt: number;
      margin: number;
      marginPct: number;
    };
  };

  settings: {
    laborRate: number;
    ohRate: number;
    laborMarginRate: number;
    tierMult: { basic: number; standard: number; premium: number };
  };

  photos: {
    id: string;
    filename: string;
    mimeType: string;
    base64: string;           // Base64-encoded image data
    note: string;
  }[];

  notes: string;              // General field notes
}
```

### Transport

```
POST {officeUrl}/api/field-estimates/ingest
Content-Type: application/json
X-Device-Id: {deviceId}
X-Draft-Id: {draftId}

Body: FieldEstimatePayload (JSON)
```

**Photo size limit:** Each photo resized to max 1920px wide, JPEG quality 0.8 before base64 encoding. Estimated ~200-400KB per photo.

**Total payload estimate:** ~50-100KB estimate data + ~200-400KB per photo × 3-5 photos ≈ **~1-2MB typical**.

### Retry Logic (Outbox)

1. Attempt POST immediately
2. If network error → save to `outbox` store with `status: 'pending'`
3. When `navigator.onLine` fires → process outbox queue (FIFO)
4. Retry up to 5 times with exponential backoff (5s, 15s, 45s, 135s, 405s)
5. After 5 failures → `status: 'failed'`, show alert badge
6. On success → `status: 'sent'`, update draft `sentAt`, remove from outbox

---

## 12. Office Watcher Spec

The Office Watcher is a lightweight Express.js service running on the office machine (or Railway) that receives field estimates and processes them.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/field-estimates/ingest` | Receive field estimate payload |
| GET | `/api/field-estimates` | List received estimates (status filter) |
| GET | `/api/field-estimates/:id` | Get single estimate |
| PUT | `/api/field-estimates/:id/status` | Update status (reviewed/accepted/rejected) |
| GET | `/api/field-sync/bundle` | Serve seed data bundle for PWA sync |
| GET | `/api/field-sync/delta?since={timestamp}` | Serve incremental updates |

### Ingest Processing

When `/api/field-estimates/ingest` receives a payload:

1. **Validate** — Check required fields, version compatibility
2. **Store** — Save to `data/field-estimates/{draftId}.json`
3. **New client check** — If `client.isNew`, create in clients.json (with `CLI-F-` prefix preserved)
4. **New property check** — If `property.isNew`, create in properties.json (with `PROP-F-` prefix preserved)
5. **Photo extract** — Decode base64 photos → save to `data/field-photos/{draftId}/`
6. **Notify** — Log receipt, optionally trigger desktop notification
7. **Respond** — `{ success: true, id: draftId, processedAt: timestamp }`

### Future: Auto-Export Pipeline

When Sam reviews and approves a field estimate in the office UI:
1. Load the field estimate JSON
2. Transform to Project_Exp export payload format (same as output.js builds)
3. Call Excel COM wrapper → generate .xlsx
4. Call PDF export → generate .pdf
5. File to project folder

*This is Phase 2 — not in initial PWA build.*

---

## 13. Google Maps / Places Integration

### APIs Used

| API | Purpose | Offline Fallback |
|-----|---------|-----------------|
| Places Autocomplete | Address autocomplete when adding new property | Manual entry |
| Geocoding | Address → lat/lng | Skip geocoding, save address only |
| Static Maps | Aerial view thumbnail for property card | Cached or placeholder |
| Street View | Street-level photo for property card | Cached or placeholder |

### Google Maps API Key

Same key used in Project_Exp: `{{GMAPS_KEY}}` pattern. Key injected at build time via environment variable.

**iPad restriction:** API key must have HTTP referrer restriction updated to include the PWA's domain (e.g., `bb-field-estimate.railway.app`).

### New Property Flow

1. User taps "Add New Property"
2. Address field with Google Places Autocomplete
3. On place selection → auto-fill: address, city, state, zip, lat, lng, placeId, county
4. Fetch Street View thumbnail → display preview
5. User adds: beds, baths, sqft, propertyType
6. Save to IndexedDB → available immediately for estimate

---

## 14. Photo Capture

### Camera Integration

```typescript
// Using HTML5 input capture for maximum iPad compatibility
<input type="file" accept="image/*" capture="environment" />
```

**Why `capture="environment"`:** Opens rear camera directly on iPad. User can switch to front if needed.

### Photo Processing Pipeline

1. User taps "Take Photo" → camera opens
2. On capture → create thumbnail (320px) + full (1920px max)
3. Convert to JPEG, quality 0.8
4. Store blob in IndexedDB `photos` store with `draftId` reference
5. Display thumbnail in photo grid
6. On "Send to Office" → base64-encode for payload

### Photo Metadata

```typescript
interface FieldPhoto {
  id: string;           // UUID
  draftId: string;      // Which estimate draft
  filename: string;     // "photo-{timestamp}.jpg"
  mimeType: 'image/jpeg';
  blob: Blob;           // Full-size image
  thumbnail: Blob;      // 320px thumbnail
  note: string;         // User annotation
  capturedAt: string;   // ISO
  gpsLat?: number;      // From EXIF if available
  gpsLng?: number;
}
```

### Storage Estimate

- Average field photo after resize: ~300KB
- Thumbnail: ~15KB
- 5 photos per estimate: ~1.6MB
- IndexedDB limit on Safari/iPad: ~500MB (sufficient for hundreds of estimates)

---

## 15. Settings

### Configurable Values

| Setting | Default | Where Used |
|---------|---------|-----------|
| `laborRate` | 85 | estSync labor calc |
| `hrsPerDay` | 8 | Duration conversions |
| `tierMult.basic` | 0.85 | All tier calculations |
| `tierMult.standard` | 1.00 | All tier calculations |
| `tierMult.premium` | 1.25 | All tier calculations |
| `ohRate` | 0.12 | OH&INS in header |
| `laborMarginRate` | 0.35 | Margin in header |
| `officeUrl` | (required) | Send to Office endpoint |
| `deviceName` | (auto) | Device identification |

### Persistence

Settings stored in IndexedDB `settings` store. Also backed up to localStorage as fallback.

Settings are **per-device** — each iPad can have different rates if needed (though defaults should match office).

---

## 16. Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | React 18 + TypeScript | Component reuse, strong typing, ecosystem |
| Build | Vite | Fast builds, PWA plugin, asset optimization |
| Styling | Tailwind CSS | Rapid UI, responsive, iPad touch targets |
| State | Zustand | Lightweight, no boilerplate, persists to IndexedDB |
| Local DB | IndexedDB (via idb wrapper) | Offline storage, blob support, 500MB+ capacity |
| PWA | vite-plugin-pwa (Workbox) | Service worker generation, precaching, update flow |
| Maps | @react-google-maps/api | Google Maps React wrapper |
| Camera | Native HTML5 `<input capture>` | Maximum iPad compatibility |
| Icons | Lucide React | Lightweight, tree-shakable |
| Testing | Vitest + Playwright | Unit + E2E |

### Build Output

Single-page app → `dist/` folder → deployable to any static host or Railway.

**Estimated bundle size:** ~150KB JS (gzipped) + ~30KB CSS (gzipped) = ~180KB total (fast on cellular).

---

## 17. Implementation Plan

### Phase 0: Project Setup (~4 hrs)

| # | Task | Est |
|---|------|-----|
| 0.1 | Create project: `npx create-vite bb-field-estimate --template react-ts` | 15m |
| 0.2 | Install dependencies: tailwind, zustand, idb, vite-plugin-pwa, lucide-react | 15m |
| 0.3 | Configure Tailwind with BB colors (#C8102E, #1A1A1A) | 30m |
| 0.4 | Configure PWA manifest (icons, theme color, display: standalone) | 30m |
| 0.5 | Set up Vite config (PWA plugin, env vars, build output) | 30m |
| 0.6 | Create Run.bat (dev server, port assignment) | 30m |
| 0.7 | Set up project structure (src/components, src/stores, src/db, src/utils) | 30m |
| 0.8 | Create IndexedDB schema + migration framework | 45m |

### Phase 1: Core Data Layer (~6 hrs)

| # | Task | Est |
|---|------|-----|
| 1.1 | IndexedDB stores: clients, properties, masterItems, templates | 1h |
| 1.2 | Seed data loader (fetch bundle from office OR load from embedded JSON) | 1h |
| 1.3 | Zustand stores: clientStore, propertyStore, masterItemStore, templateStore | 1.5h |
| 1.4 | Draft store with auto-persist to IndexedDB | 1h |
| 1.5 | Settings store with defaults + IndexedDB persist | 30m |
| 1.6 | Outbox store (queue + retry logic) | 1h |

### Phase 2: Calculation Engine (~4 hrs)

| # | Task | Est |
|---|------|-----|
| 2.1 | Port `estSync()` to TypeScript module | 1.5h |
| 2.2 | Port `pePopulateHeader()` calculations to TypeScript | 1h |
| 2.3 | Port `estCycleBy()` with SUB/BBI/OWN transition logic | 30m |
| 2.4 | Port currency formatting (`estFmt`, `estParse`) | 15m |
| 2.5 | Unit tests for every calculation path | 45m |

### Phase 3: Template & Client Screens (~6 hrs)

| # | Task | Est |
|---|------|-----|
| 3.1 | Home screen: draft list with status badges | 1h |
| 3.2 | Template picker: card grid with search filter | 1.5h |
| 3.3 | Client list: searchable, with property sub-list | 1.5h |
| 3.4 | Client/property selection flow (pick → populate header) | 1h |
| 3.5 | "New Estimate" flow: template → client → property → editor | 1h |

### Phase 4: Estimate Editor (~10 hrs)

| # | Task | Est |
|---|------|-----|
| 4.1 | Project Express Header component (4-column layout) | 1.5h |
| 4.2 | EstimateSection component (sw + bld) with collapse/expand | 1.5h |
| 4.3 | EstimateRow component with inline currency editing | 2h |
| 4.4 | BY badge with cycle animation (BBI→SUB→OWN) | 30m |
| 4.5 | Add/delete/insert row operations | 1h |
| 4.6 | Drag-and-drop reorder (touch-compatible!) | 1.5h |
| 4.7 | Column sorting (3-way: none→asc→desc→none) | 45m |
| 4.8 | Bid panel (project name, dates, duration unit cycle) | 1h |
| 4.9 | Auto-save draft on every change (debounced) | 30m |

### Phase 5: Send to Office (~4 hrs)

| # | Task | Est |
|---|------|-----|
| 5.1 | Build payload from draft state | 1h |
| 5.2 | Photo base64 encoding + resize pipeline | 1h |
| 5.3 | POST to office watcher with retry | 1h |
| 5.4 | Outbox UI (pending count badge, retry button, failure alert) | 1h |

### Phase 6: Photo Capture (~3 hrs)

| # | Task | Est |
|---|------|-----|
| 6.1 | Camera input component (rear camera default) | 45m |
| 6.2 | Photo resize pipeline (1920px max, JPEG 0.8) | 45m |
| 6.3 | Thumbnail generation (320px) | 30m |
| 6.4 | Photo grid display with delete | 30m |
| 6.5 | Photo notes annotation | 30m |

### Phase 7: Client/Property Creation (~5 hrs)

| # | Task | Est |
|---|------|-----|
| 7.1 | Add Client form (name, phone, email, address) | 1h |
| 7.2 | Google Places autocomplete for address fields | 1h |
| 7.3 | Add Property form (address, beds/baths/sqft, type) | 1h |
| 7.4 | Google Maps geocoding on property save | 1h |
| 7.5 | Street View preview on property card | 1h |

### Phase 8: Office Watcher Service (~4 hrs)

| # | Task | Est |
|---|------|-----|
| 8.1 | Express.js service scaffold + Run.bat | 30m |
| 8.2 | POST `/api/field-estimates/ingest` endpoint | 1h |
| 8.3 | Photo extraction + file storage | 45m |
| 8.4 | New client/property creation in office DB | 1h |
| 8.5 | GET `/api/field-sync/bundle` endpoint (seed data) | 45m |

### Phase 9: PWA & Offline (~3 hrs)

| # | Task | Est |
|---|------|-----|
| 9.1 | Service worker configuration (precache + runtime cache) | 1h |
| 9.2 | Offline indicator + graceful degradation | 30m |
| 9.3 | Install prompt (Add to Home Screen) | 30m |
| 9.4 | App update flow (new version detected → prompt refresh) | 30m |
| 9.5 | Test offline scenarios on iPad Safari | 30m |

### Phase 10: Touch Optimization & Polish (~3 hrs)

| # | Task | Est |
|---|------|-----|
| 10.1 | 44px minimum touch targets throughout | 45m |
| 10.2 | Swipe-to-delete on estimate rows | 45m |
| 10.3 | Bottom-anchored action buttons (thumb-friendly) | 30m |
| 10.4 | Viewport meta tag + safe area insets for iPad | 30m |
| 10.5 | Haptic feedback on BY cycle + drag-drop | 30m |

### Phase 11: Testing & Deploy (~4 hrs)

| # | Task | Est |
|---|------|-----|
| 11.1 | Unit tests for calculation engine (all paths) | 1h |
| 11.2 | E2E tests: create estimate flow, send to office flow | 1.5h |
| 11.3 | iPad Safari testing (camera, offline, install) | 1h |
| 11.4 | Deploy to Railway (or static host) | 30m |

---

### Summary

| Phase | Description | Hours |
|-------|------------|-------|
| 0 | Project Setup | 4 |
| 1 | Core Data Layer | 6 |
| 2 | Calculation Engine | 4 |
| 3 | Template & Client Screens | 6 |
| 4 | Estimate Editor | 10 |
| 5 | Send to Office | 4 |
| 6 | Photo Capture | 3 |
| 7 | Client/Property Creation | 5 |
| 8 | Office Watcher Service | 4 |
| 9 | PWA & Offline | 3 |
| 10 | Touch Optimization | 3 |
| 11 | Testing & Deploy | 4 |
| **TOTAL** | | **~56 hrs** |

**Estimated calendar time:** ~7-8 working days at focused pace.

**MVP (Phases 0-5):** ~34 hrs / ~4-5 days — enough to create estimates, select clients, and send to office.

---

## 18. Risk Register

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | iPad Safari IndexedDB quota limits | Data loss if storage full | Monitor quota, warn at 80%, purge sent drafts |
| 2 | Offline photo storage fills device | Can't take more photos | Auto-purge sent photos after 30 days, show storage usage |
| 3 | Google Maps API cost overrun | Unexpected bills | Set daily quota limit, cache aggressively, show manual fallback |
| 4 | Touch drag-and-drop unreliable on iPad | Can't reorder items | Fall back to move-up/move-down buttons |
| 5 | Office Watcher downtime loses estimates | Field crew can't send | Outbox queues indefinitely, send button shows "will retry" |
| 6 | Stale client/property data on iPad | Wrong contact info | Show "last synced" timestamp, prompt sync on app open |
| 7 | Large estimates (50+ items) slow on iPad | UI lag | Virtualized list (react-window), debounced renders |
| 8 | Safari PWA doesn't persist IndexedDB | Data wiped after 7 days inactive | Warn user to open app weekly, or store critical data in localStorage backup |

---

## 19. Success Criteria

### Must-Have (v1.0 launch)

- [ ] Field crew can create estimate from template on iPad
- [ ] Existing clients + properties selectable offline
- [ ] Calculation engine matches Project_Exp output to the dollar
- [ ] "Send to Office" delivers complete estimate JSON
- [ ] Office Watcher receives and stores estimate
- [ ] Works offline (create + save draft)
- [ ] Photos attached to estimates
- [ ] Installable as home screen app

### Nice-to-Have (v1.1)

- [ ] New client/property creation with Google Maps
- [ ] Delta sync (only changed records since last sync)
- [ ] Office Watcher auto-creates Project_Exp export
- [ ] Push notification when office processes estimate
- [ ] Multi-device sync (two iPads, same data)

### Validation Test

The acid test: Sam creates a Kitchen Full estimate in Project_Exp on the desktop. A crew member creates the same Kitchen Full estimate on the iPad PWA. **Both should produce identical dollar amounts** for:
- Every line item (labor, materials, total)
- Sitework subtotal
- Building subtotal
- OH & INS
- EST TOTAL
- Margin %

---

*End of spec. This document is the single source of truth for the BB Field Estimate PWA build.*
