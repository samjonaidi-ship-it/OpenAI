# BB Tool Tracker Feature Spec | v1.5 | 2026-03-30 | BB

> **Companion to:** `UNIVERSAL_ASSET_SYSTEM_SPEC.md` (v1.0)
> This document covers **tool-specific UX, scanner, audits, and dashboard**.
> The universal spec covers **shared schema, API, storage, and caching** that all asset classes use.
> Tools are `asset_class = 'tool'` in the universal `cal_assets` table.

## Summary

Tool Tracker adds construction tool inventory management to CalExp5. Crew members use their phone
camera to catalog tools (Claude vision identifies brand/model/features) and perform weekly on-site
audits via a continuous scanning loop. Tools are assigned to jobsites and tracked through the
existing JobsitesView property detail panel under the new universal "Assets" tab. The system
supports offline audits with a cached "Tool Crib" on each device that syncs when connectivity
returns.

Tools are the first asset class implemented on the Universal Asset System. The database schema
(`cal_assets`, `cal_asset_media`, `cal_asset_events`), API foundation (`/api/assets/*`), storage
(Google Drive `BB_Assets/tools/`), and caching (LRU + IndexedDB Tool Crib) are all defined in
the universal spec. This document focuses on tool-specific behavior built on that foundation.

---

## Decisions (from Sam)

| # | Question | Answer |
|---|----------|--------|
| 1 | Tool count | ~200 tools across ~10 active job sites |
| 2 | Users | All crew members (mix of company + personal phones) |
| 3 | Platform | Phone-first (same CalExp5 PWA), cataloging also on iPad |
| 4 | Physical labels/QR codes | No — tools take too much abuse; rely on visual identification |
| 5 | Identical tools (~50) | Track as pools with count per site, not individual units |
| 6 | Tool movement pattern | Tools stay at jobsite for days/weeks, not daily checkout |
| 7 | Primary workflow | Weekly audit: crew walks site, camera identifies tools, checks off list |
| 8 | Camera flow | Continuous scanning loop — point, identify, accept, next tool. No interruption |
| 9 | Edge detection | No — tools are 3D irregular shapes, not flat documents. Claude vision only |
| 10 | Offline mode | Cache full tool catalog (Tool Crib) on device; crew matches visually + manual check-off; evidence photos queue for sync |
| 11 | Cataloging | Online only — Claude generates fingerprint. Done at shop with WiFi |
| 12 | Entry point | 5th button on ActionFAB (Tool scan) + Assets tab in JobsitesView property detail |
| 13 | Dashboard | Sam sees all sites, tool counts, last audit date, missing tool alerts |
| 14 | Photo storage | Google Drive (reuse existing receipt infrastructure) |
| 15 | Feature gating | `tools.view`, `tools.catalog`, `tools.audit`, `tools.admin` |
| 16 | Auto-enrichment | When make/model confirmed, Claude uses world knowledge + web search to fetch manuals, pro images, specs. All cached to Drive + device |
| 17 | Receipt → Tool | When receipt line items contain tool purchases, offer to auto-initiate into Tool Crib. Purchase date, price, vendor from receipt |
| 18 | Offline manuals | Operating manuals cached on device for tools at crew's assigned sites (~50-100MB budget) |
| 19 | Vault rename | "Vault" → "All Receipts" in MenuDrawer. New "Tool Crib" MenuDrawer item for global tool catalog |
| 20 | Pro thumbnails | Auto-enrichment fetches professional product photos from manufacturer. Replaces crew's catalog photo as primary thumbnail |

---

## UX Design

### ActionFAB — 5th Button (Tool Scan)

```
  ┌───┐
  │ ⚙️│  Timesheet (disabled)
  └───┘
  ┌───┐
  │ 🗓️│  PTO
  └───┘
  ┌───┐
  │ ✍️│  Manual Hours
  └───┘
  ┌───┐
  │ 📷│  Receipt Scan
  └───┘
  ┌───┐
  │ 🔧│  Tool Scan        ← NEW
  └───┘
  ┌───┐
  │ ✕ │  FAB (expanded)
  └───┘
```

### Continuous Scanner (ToolScanModal)

```
┌──────────────────────────────────┐
│ [X]              Tool Scan   3   │  ← Close + mode label + count
│                                  │
│                                  │
│                                  │
│        (live camera feed)        │
│        rear camera, no overlay   │
│                                  │
│                                  │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│   │ ● Identifying...         │   │  ← Pulse animation (Phase: IDENTIFYING)
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                  │
│                                  │
│                                  │
│                                  │
│                                  │
└──────────────────────────────────┘

        After Claude responds:

┌──────────────────────────────────┐
│ [X]              Tool Scan   3   │
│                                  │
│        (live camera feed         │
│         continues running)       │
│                                  │
│                                  │
│   ┌──────────────────────────┐   │
│   │  Milwaukee M18            │   │  ← Result card (slides up)
│   │  Circular Saw 2781-20     │   │
│   │  Power Tool · 7¼"         │   │
│   │                           │   │
│   │  ┌─────────┐ ┌─────────┐ │   │
│   │  │ ✓ Accept│ │ ✗ Wrong │ │   │  ← Thumb-friendly buttons
│   │  └─────────┘ └─────────┘ │   │
│   └──────────────────────────┘   │
└──────────────────────────────────┘

        After Accept (green flash, card slides away):

┌──────────────────────────────────┐
│ [X]              Tool Scan   4   │  ← Count incremented
│                                  │
│        (live camera feed)        │
│                                  │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐   │
│     Point at next tool...        │  ← Ready for next
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘   │
│                                  │
└──────────────────────────────────┘
```

### Two Scanner Modes

**Catalog Mode** (from FAB, no site context):
- Claude prompt: identify tool (brand, model, category, fingerprint)
- Accept → tool added to master catalog
- Counter: "4 cataloged"
- Available to: `tools.catalog` permission

**Audit Mode** (from JobsitesView → Start Audit):
- Claude prompt: match against site's expected tool list
- Accept → tool checked off audit checklist
- Counter: "12/30 found"
- Unmatched tool → "Not on this site's list — assign here?"
- Available to: `tools.audit` permission

### Manual Entry Mode (No Camera)

When the camera can't identify a tool, or user prefers typing:

```
┌──────────────────────────────────┐
│ [X]              Add Tool        │
├──────────────────────────────────┤
│ [📷 Camera] [✍️ Manual] [🔗 URL]│  ← Input method tabs
├──────────────────────────────────┤
│                                  │
│ Name *     [Circular Saw       ] │
│ Brand      [Milwaukee          ] │
│ Model      [2781-20            ] │
│ Category * [Power Tool     ▾   ] │
│ Size       [7¼"                ] │
│ Serial #   [                   ] │
│                                  │
│ [📷 Add Photo]  (optional)      │
│                                  │
│ [🔗 Add Reference URL]          │
│   ┌────────────────────────────┐ │
│   │ URL: https://milwaukee...  │ │
│   │ Type: [Product Page    ▾ ] │ │
│   │ [+ Add]                    │ │
│   └────────────────────────────┘ │
│                                  │
│ Attached URLs:                   │
│ 🔗 Product Page - milwaukee...  │
│ 🔗 Operating Manual - ...pdf    │
│                                  │
│ [Save to Catalog]                │
└──────────────────────────────────┘
```

**Input method tabs** at the top of ToolScanModal:
- **Camera** (default): Continuous scanning loop as designed
- **Manual**: Text form — type brand + model → Claude auto-fills via world knowledge
- **URL**: Paste a product URL → Claude extracts tool info from the page

**Manual entry → Auto-enrichment flow:**
1. User types brand + model (e.g., "Milwaukee 2781-20") — minimum required
2. On blur/submit: Claude uses world knowledge to identify the tool instantly
3. Auto-fills: full name, category, size, specs, approximate value, description
4. User confirms/corrects → saved to catalog
5. Background: web enrichment fetches manufacturer page, operating manual PDF, professional product photo, spec sheet
6. Pro product photo replaces crew's photo as primary thumbnail
7. All PDFs/resources stored in Drive, cached to device for offline access
8. Enrichment status shown on tool card: "Enriching... 3/5 resources found"

**URL → Auto-fill flow:**
1. User pastes manufacturer URL (e.g., milwaukeetool.com/Products/2781-20)
2. Bridge fetches page → sends to Claude: "Extract tool name, brand, model, specs from this page"
3. Claude returns structured data → auto-fills form fields
4. User confirms/corrects → saved to catalog
5. URL stored as `url/reference` media on the asset
6. Same background enrichment pipeline runs (manual, images, etc.)

**Camera → Enrichment flow:**
1. Camera identifies tool (existing flow) → user accepts
2. Claude already provided brand + model in identification
3. Same enrichment pipeline runs automatically after accept
4. Professional thumbnail downloaded → replaces captured frame as primary

> **Full enrichment pipeline details:** See `UNIVERSAL_ASSET_SYSTEM_SPEC.md` §Auto-Enrichment Pipeline

### Receipt → Tool Detection (Real-Time, In BB Scan)

During the existing receipt scan flow, the system detects tool purchases inline — no extra
step for the crew member. Detection happens after Claude extracts line items, before filing.

**Detection signals (weighted):**

| Signal | Weight | Example |
|--------|--------|---------|
| Known tool brand in line item | High | "Milwaukee", "DeWalt", "Makita" in item text |
| Item price ≥ $20 | Medium | Screws are $12, drills are $199 |
| Tool vendor | Medium | Home Depot, Lowe's, Grainger, Harbor Freight |
| BBInc-assigned receipt | Medium | Company card = likely company inventory |
| Category keywords | Medium | "saw", "drill", "grinder", "level", "hammer" |
| NOT consumable keywords | Low | Absence of "box of", "pack", "bundle", "bag" |

**UX — subtle, not intrusive:**

The tool detection icon appears on the receipt result card ONLY if a tool is detected.
It does not block filing. Crew can file the receipt and ignore the icon entirely.

```
Receipt result card (existing flow, tool detected):
┌──────────────────────────────────┐
│ R   Home Depot           ###     │
│     BBInc               ##       │
│     $547.83             ###      │
│     Mar 30, 2026        ##    🔧 │  ← Subtle wrench icon (pulsing once)
└──────────────────────────────────┘

Crew taps 🔧 icon:
┌──────────────────────────────────┐
│ Tool Detected on Receipt         │
├──────────────────────────────────┤
│                                  │
│ [pro thumbnail from enrichment]  │
│                                  │
│ Milwaukee M18 FUEL               │
│ 7-1/4" Circular Saw              │
│ Model: 2781-20                   │
│ $299.00 · Home Depot · Mar 30   │
│                                  │
│ [Add to Tool Crib]    [Dismiss]  │
│                                  │
│ Multiple tools? 2 detected:      │  ← If receipt has multiple tools
│ ☑ Milwaukee M18 Circ Saw $299   │
│ ☑ DeWalt 20V Impact     $179    │
│ ☐ 2x4 Lumber (not a tool)       │  ← AI correctly excluded
│                                  │
│ [Add Selected to Crib] [Dismiss] │
└──────────────────────────────────┘
```

**After crew taps "Add to Tool Crib":**
- Tool created with purchase date, price, vendor from receipt
- Receipt linked as child asset (birth certificate)
- Status: `cataloged` (lifecycle initialized at point of purchase)
- Auto-enrichment runs in background (manual, pro photo, specs)
- If crew is at a jobsite: "Assign to [current site]?"
- Crew continues with receipt filing — no workflow interruption

**When the 🔧 icon does NOT appear:**
- No line items extracted (receipt too blurry)
- All items are consumables (lumber, screws, paint)
- Receipt is a personal expense (reimbursable B-doc from personal card)

### Retroactive Receipt Scan (Batch Utility)

A back-office utility that scans historical BBInc receipts to discover tool purchases that
were never cataloged. Run once to bootstrap the Tool Crib, then periodically as a sweep.

```
Tool Dashboard → [🔍 Scan Historical Receipts]  (admin only)
  │
  GET /api/assets/tools/receipt-scan?scope=all&since=2025-01-01
  │
  Bridge queries all BBInc receipts with line items:
    SELECT r.id, r.vendor, r.amount, r.receipt_date, r.items, r.crew_name
    FROM cal_receipts r
    WHERE r.is_receipt = false           -- B-docs (company purchases)
      AND r.items IS NOT NULL            -- has extracted line items
      AND r.receipt_date >= '2025-01-01'
      AND r.status IN ('filed', 'posted')
  │
  For each receipt: classify line items with Claude
  │
  Results screen:
  ┌──────────────────────────────────┐
  │ Historical Tool Scan             │
  │ Scanned: 312 BBInc receipts      │
  │ Found: 47 potential tools         │
  │ Across: 23 receipts              │
  ├──────────────────────────────────┤
  │                                  │
  │ ─── High Confidence (32) ──────  │
  │ ☑ [thumb] Milwaukee M18 Circ Saw │
  │   $299 · Home Depot · Jan 15    │
  │ ☑ [thumb] DeWalt 20V Drill      │
  │   $179 · Home Depot · Jan 22    │
  │ ☑ [thumb] Hilti TE 60 Hammer    │
  │   $899 · Grainger · Feb 3       │
  │   ... (29 more)                  │
  │                                  │
  │ ─── Review Needed (15) ────────  │
  │ ☐ [?] "Klein digital multimeter" │
  │   $89 · Home Depot · Mar 1      │
  │   Is this a tool? [Yes] [No]    │
  │   ... (14 more)                  │
  │                                  │
  │ [Commission Selected (32)]       │
  │ [Export CSV]                      │
  └──────────────────────────────────┘
```

**"Commission Selected"** → batch-creates tool assets:
- Each tool gets purchase provenance from receipt
- Each receipt linked as child asset
- Auto-enrichment pipeline runs for all (queued, not simultaneous)
- Progress bar: "Enriching 32 tools... 12/32 complete"

**Periodic sweep** (optional cron):
- Run monthly or on-demand from Tool Dashboard
- Only scans receipts filed since last scan
- Surfaces newly detected tools for admin review
- Tracks which receipts have been scanned via `metadata.tool_scan_checked: true`

> **Full detection logic and classifier prompt:** See `UNIVERSAL_ASSET_SYSTEM_SPEC.md` §Receipt → Tool Bridge

### Supporting Resources per Tool

Every cataloged tool can have child assets and URL references.
Resources are auto-populated by the enrichment pipeline and can also be added manually.

```
Tool Detail View:
┌──────────────────────────────────┐
│ ← Back   Milwaukee M18 Circ Saw │
├──────────────────────────────────┤
│ [pro photo]  [crew photo] [side]│  ← Pro thumbnail first (from enrichment)
│                                  │
│ Brand: Milwaukee                 │
│ Model: 2781-20                   │
│ Category: Power Tool · 7¼"      │
│ Status: Deployed                 │
│ Location: Smith Residence        │
│ Serial: SN-2024-1234            │
│ Purchased: Mar 1 · $299 · HD    │  ← From receipt (if receipt-bridged)
│                                  │
│ ─── Resources ────────────────  │
│ 🔗 Product Page (milwaukee.com) │  ← URL (auto-enriched)
│ 📄 Operating Manual (PDF) 📱    │  ← 📱 = cached on device for offline
│ 📄 Maintenance Schedule (PDF)    │  ← Child asset (auto-enriched)
│ 📄 Spec Sheet (PDF)              │  ← Child asset (auto-enriched)
│ 📄 Warranty (expires 2027-06)    │  ← Child asset (manual or auto)
│ 🧾 Purchase: HD $299 (Mar 1)    │  ← Linked receipt (birth certificate)
│ 🧾 Blade replacement $45.99     │  ← Linked receipt (maintenance)
│                                  │
│ ─── History ──────────────────  │
│ Mar 29 · Audit found (Mike) ✓   │  ← Events timeline
│ Mar 15 · Deployed to Smith       │
│ Mar 10 · Assigned by Sam         │
│ Mar 1  · Cataloged (from receipt)│
│ Mar 1  · Purchased at Home Depot │  ← Lifecycle starts at purchase
│                                  │
│ [+ Add Resource]  [Edit]         │
└──────────────────────────────────┘

📱 = Cached on device (available offline)
    Shown for manuals at crew's assigned sites
```

### Scanner State Machine

```
┌──────────┐     phone stops      ┌──────────────┐    Claude     ┌──────────────┐
│ WAITING  │────  moving (~1s) ──>│ IDENTIFYING  │──  responds ─>│   MATCHED    │
│          │     stability gate   │  send frame  │               │  show card   │
└──────────┘                      └──────────────┘               └──────┬───────┘
     ^                                  │                               │
     │                                  │ user moves                    │ Accept
     │                                  │ away (frame                   │ or Wrong
     │                                  │ changes)                      │ or timeout
     │                                  v                               │
     │                            ┌──────────┐                          │
     └────────────────────────────│ DISCARD  │<─────────────────────────┘
                                  └──────────┘
```

### Smart Frame Strategy (Cost Control)

```
Camera runs at native FPS (display only)
  │
  Every 200ms: compute pixel-diff on 100×100 downscaled canvas
  │
  ├── Diff > threshold → "MOVING" — do nothing, wait
  │
  └── Diff < threshold for 5 consecutive checks (~1 second still) → "STABLE"
        │
        Capture frame → resize to 512px wide → JPEG 80% → base64
        │
        Send to /api/tools/scan with context (mode, site tool list if audit)
        │
        Show "Identifying..." pulse
        │
        Claude responds in ~1-2 seconds
        │
        ├── Confidence ≥ 0.85 → Show solid result card + Accept/Wrong
        │
        ├── Confidence 0.50-0.84 → Show ghost suggestion: "Circular saw? Hold steady..."
        │                           Wait for next stable frame, retry with context
        │
        └── Confidence < 0.50 → Show "Can't identify — try another angle"
                                 Wait for next stable frame
```

**Cost estimate per audit:**
- 30 tools × ~2-3 frames each (including retries) = ~60-90 Claude calls
- At ~$0.01-0.03 per call = $1-3 per audit
- 10 sites × weekly = $10-30/week

### Assets Tab in JobsitesView Property Detail

```
┌─────────────────────────────────┐
│ ← Back    Smith Residence       │
│ 123 Oak St, Bainbridge Island   │
├─────────────────────────────────┤
│ Client: John Smith  📞          │
│ 3bd/2ba | 1,850 sqft            │
├─────────────────────────────────┤
│ [Map section - existing]        │
├─────────────────────────────────┤
│ ┌──────────┬───────────┐        │
│ │  Tools   │ Receipts  │        │  ← Tab toggle (new)
│ └──────────┴───────────┘        │
│                                 │
│ Last audit: Mar 28, 2026   ✓   │
│ Audited by: Mike               │
│ 28/30 tools found  ⚠️ 2 missing │
│                                 │
│ [▶ Start Audit]  [+ Assign]    │
│                                 │
│ ─── Found (28) ───────────────  │
│ ☑ [thumb] Milwaukee M18 Circ   │
│ ☑ [thumb] DeWalt 20V Drill ×3  │
│ ☑ [thumb] 4ft Stanley Level    │
│ ☑ [thumb] Makita 4½" Grinder   │
│   ... (scrollable)              │
│                                 │
│ ─── Missing (2) ──────────────  │
│ ⚠️ [thumb] Hilti TE 60 Hammer   │
│     Last seen: Mar 21 · Status: │
│     Can't find                  │
│ ⚠️ [thumb] Makita 9" Grinder    │
│     Last seen: Mar 14 · Status: │
│     Lent to Johnson Kitchen     │
│                                 │
└─────────────────────────────────┘
```

### Audit Checklist (during audit)

```
┌──────────────────────────────────┐
│ [X]  Smith Residence      12/30  │
│      Audit in progress           │
├──────────────────────────────────┤
│ 🟢 Online — AI scan active      │
│                                  │  ← or "📴 Offline mode"
│ [📷 Open Scanner]               │
│                                  │
│ ─── Found ✓ ────────────────── │
│ ☑ [thumb] Milwaukee M18 Circ   │
│ ☑ [thumb] DeWalt 20V Drill 1/3 │
│ ☑ [thumb] DeWalt 20V Drill 2/3 │
│                                  │
│ ─── Not Found Yet ────────────  │
│ ☐ [thumb] Hilti TE 60 Hammer   │  ← Tap to manually check off
│ ☐ [thumb] DeWalt 20V Drill 3/3 │     (opens camera for evidence
│ ☐ [thumb] Makita 9" Grinder    │      photo, or just check off)
│ ☐ [thumb] 4ft Stanley Level    │
│   ... (27 remaining)            │
│                                  │
│ [Complete Audit]                 │
└──────────────────────────────────┘

        After "Complete Audit":

┌──────────────────────────────────┐
│      Audit Summary               │
│      Smith Residence             │
│      Mar 29, 2026                │
├──────────────────────────────────┤
│                                  │
│   28/30 tools accounted for      │
│                                  │
│   ⚠️ 2 tools not found:          │
│                                  │
│   Hilti TE 60 Hammer             │
│   [Stolen] [Broken] [Lent] [?]  │  ← Status picker per item
│                                  │
│   Makita 9" Grinder              │
│   [Stolen] [Broken] [Lent] [?]  │
│                                  │
│   [Submit Audit]                 │
│                                  │
└──────────────────────────────────┘
```

### Dashboard (Admin/Manager — MenuDrawer)

```
┌──────────────────────────────────┐
│ Tool Dashboard           🔍     │
├──────────────────────────────────┤
│ ⚠️ 3 tools missing across 2 sites│
│ ⏰ 2 sites overdue for audit     │
├──────────────────────────────────┤
│ 200 tools · 10 sites            │
│ 185 accounted · 12 at shop · 3 ?│
├──────────────────────────────────┤
│                                  │
│ Smith Residence                  │
│ 28/30  ·  Last audit: Mar 28 ✓  │
│ ⚠️ 2 missing                     │
│                                  │
│ Johnson Kitchen                  │
│ 15/15  ·  Last audit: Mar 28 ✓  │
│                                  │
│ Oak St Remodel                   │
│ 22/24  ·  Last audit: Mar 21 ⚠️  │
│ ⏰ Overdue · ⚠️ 2 missing         │
│                                  │
│ Harbor Condo                     │
│ 18/18  ·  Last audit: Mar 27 ✓  │
│                                  │
│ (more sites...)                  │
├──────────────────────────────────┤
│ 🔍 "Where is the Hilti TE 60?"  │
│ → Last seen: Oak St, Mar 21     │
│   Status: Can't find (Mike)      │
│ → Previously: Shop, assigned     │
│   Mar 3 by Sam                   │
└──────────────────────────────────┘
```

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CalExp5 (Phone/Tablet)                       │
│                                                                      │
│  ActionFAB ──→ ToolScanModal (continuous camera loop)                │
│       │              │                                               │
│       │         ToolScanner.jsx (stability detect → frame capture)   │
│       │              │                                               │
│  JobsitesView        │         ┌──────────────────────────────┐     │
│    └─ PropertyDetail  │         │  Tool Crib Cache (IndexedDB) │     │
│       └─ AssetsTab ──┘         │  - tool catalog + thumbnails  │     │
│          └─ AuditChecklist     │  - site assignments           │     │
│             └─ AuditSummary    │  - pending audit queue        │     │
│                                │  - evidence photo queue       │     │
│                                └──────────────────────────────┘     │
│                                                                      │
│  toolSlice.js (Zustand)  ←──→  tool-api.js  ←──→  tool-queue.js    │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                          HTTPS (online) or
                          IndexedDB (offline)
                                   │
┌──────────────────────────────────┴───────────────────────────────────┐
│                       BB_Micro_Bridge (port 3105)                     │
│                                                                       │
│  /api/assets/tools/scan ──→ tool-ai.js ──→ Claude Sonnet 4.6 (vision)│
│  /api/assets (universal) ──→ asset-storage.js ──→ Google Drive       │
│  /api/assets/*           ──→ Neon (cal_assets, cal_asset_media, etc.)│
│                                                                       │
│  Image Cache (LRU) ── tool thumbnails (key: tool-{id})               │
└───────────────────────────────────────────────────────────────────────┘
```

### Claude Vision Integration

#### Catalog Prompt (new tool identification)

```
Identify this construction tool from the photo.

Return JSON:
{
  "brand": "manufacturer name (Milwaukee, DeWalt, Makita, Hilti, etc.)",
  "model": "model number if visible, or null",
  "name": "common name (e.g., 'Circular Saw', 'Rotary Hammer')",
  "category": "power_tool | hand_tool | measuring | safety | fastening | cutting | demolition | other",
  "subcategory": "drill | saw | grinder | hammer | level | tape | wrench | pliers | etc.",
  "size": "size descriptor if applicable (7¼\", 4½\", 4ft, etc.) or null",
  "fingerprint": "Detailed visual description for future identification. Include: primary color scheme, brand color (red=Milwaukee, yellow=DeWalt, teal=Makita, orange=Hilti), body shape, handle style, distinguishing marks, visible wear, stickers, tape, scratches, modifications, cord/cordless, battery style. Be specific enough to distinguish from similar tools.",
  "estimatedValue": 0,
  "confidence": 0.95
}

Notes:
- If multiple tools visible, identify the primary/centered one
- Franchise colors: Milwaukee=red/black, DeWalt=yellow/black, Makita=teal/black, Hilti=red/white, Bosch=blue, Ridgid=orange
- Construction tools may be dirty, dusty, or paint-splattered — look past surface grime
- "fingerprint" is critical — this description will be used to match the tool in future photos
```

#### Audit Match Prompt (identify against known list)

```
Match the tool in this photo against the expected tools at this job site.

Expected tools:
{tools_json_array}

Return JSON:
{
  "matched_tool_id": "id from the list, or null if no match",
  "matched_tool_name": "name for display",
  "confidence": 0.95,
  "notes": "any observations (e.g., 'visible damage to handle', 'different battery than catalog photo')"
}

If the tool doesn't match any in the list, return:
{
  "matched_tool_id": null,
  "matched_tool_name": null,
  "confidence": 0,
  "unmatched_description": "what the tool appears to be",
  "notes": "Not on this site's expected tool list"
}

Context from previous frame (if any): {previous_context}
The user said the previous guess was wrong: {wrong_feedback}
```

#### Multi-Angle Accumulation

When the user holds steady on the same tool but a previous low-confidence result exists:

```
Previous angle suggested: {previous_guess}
Confidence was: {previous_confidence}
Here is another angle of the same tool. Confirm, correct, or provide more detail.
```

---

## API Endpoints (BB_Micro_Bridge)

> Universal CRUD endpoints (`/api/assets/*`) are defined in `UNIVERSAL_ASSET_SYSTEM_SPEC.md`.
> Below are **tool-specific endpoints** that extend the universal foundation.

### Tool-Specific Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/assets/tools/scan` | Send frame to Claude for identification | `tools.catalog` or `tools.audit` |
| GET | `/api/assets/tools/dashboard` | All sites: tool counts, audit status, alerts | `tools.admin` |
| POST | `/api/assets/tools/assign` | Assign tool(s) to site (creates events) | `tools.catalog` |
| POST | `/api/assets/tools/transfer` | Move tool(s) between sites (creates events) | `tools.catalog` |
| POST | `/api/assets/tools/return` | Return tool(s) to shop (creates events) | `tools.catalog` |

### Audit Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/assets/tools/audit/start` | Begin audit for a site | `tools.audit` |
| POST | `/api/assets/tools/audit/check` | Submit photo match or manual check during audit | `tools.audit` |
| POST | `/api/assets/tools/audit/complete` | Finalize audit with missing item statuses | `tools.audit` |
| GET | `/api/assets/tools/audit/:auditId` | Single audit detail with all items | `tools.view` |
| GET | `/api/assets/tools/audit/site/:propertyId` | Audit history for a site | `tools.view` |

### Leveraged Universal Endpoints (no tool-specific code needed)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/assets` | Create tool (`asset_class: 'tool'`) |
| GET | `/api/assets?class=tool` | List all tools |
| GET | `/api/assets/:id` | Single tool detail |
| PUT | `/api/assets/:id` | Update tool metadata |
| DELETE | `/api/assets/:id` | Retire tool (soft delete) |
| GET | `/api/assets/:id/media/:mediaId/thumb` | Tool thumbnail |
| GET | `/api/assets/property/:propertyId?class=tool` | Tools at a jobsite |
| GET | `/api/assets/sync?since=` | Delta sync for Tool Crib cache |
| POST | `/api/assets/bulk-deposit` | Sync offline audit results |
| GET | `/api/assets/search?q=hilti&class=tool` | "Where is the Hilti?" |

---

## Neon Schema

> **See `UNIVERSAL_ASSET_SYSTEM_SPEC.md` for full schema.**
> Tools use the universal tables: `cal_assets`, `cal_asset_media`, `cal_asset_events`,
> `cal_asset_audit_sessions`, `cal_asset_corrections`.

### Tool-Specific Metadata Shape (stored in `cal_assets.metadata` JSONB)

```json
{
  "name": "Circular Saw",
  "brand": "Milwaukee",
  "model": "2781-20",
  "category": "power_tool",
  "subcategory": "saw",
  "size": "7¼\"",
  "fingerprint": "Red and black cordless circular saw with...",
  "pool_size": 1,
  "serial_number": "SN12345",
  "purchase_date": "2025-06-15",
  "purchase_price": 299.99,
  "estimated_value": 250.00
}
```

### Tool-Specific Event Types (stored in `cal_asset_events`)

| event_type | details JSONB |
|------------|---------------|
| `assigned` | `{from_property_id, to_property_id, quantity}` |
| `transferred` | `{from_property_id, to_property_id}` |
| `returned` | `{from_property_id}` |
| `audit_found` | `{audit_id, confidence, match_method, evidence_media_id}` |
| `audit_missing` | `{audit_id, status: "stolen"\|"broken"\|"lent"\|"unknown", notes}` |
| `status_changed` | `{from, to, reason}` |

### Tool Location View

Uses universal `cal_tool_last_seen` view defined in the universal spec.

---

## Tool Wrapper PDF (Audit Trail)

Every tool gets a wrapper PDF — same audit trail approach as receipts. The PDF contains the
primary photo, all metadata, and full lifecycle history in searchable PDF properties.
If the database is lost, tools can be reconstructed from Drive PDFs alone.

> **Hybrid audit trail strategy:** See `UNIVERSAL_ASSET_SYSTEM_SPEC.md` §Audit Trail Architecture

### PDF Generation (`tool-pdf.js` — mirrors `receipt-pdf.js`)

```javascript
async function generateToolPDF(toolAsset, primaryPhotoBuffer) {
  const pdfDoc = await PDFDocument.create();

  // Page sizing: Letter portrait (612×792 points)
  const page = pdfDoc.addPage([612, 792]);

  // Embed primary photo (centered, scaled to fit)
  const photo = await pdfDoc.embedJpg(primaryPhotoBuffer);
  const photoScale = Math.min(400 / photo.width, 300 / photo.height);
  page.drawImage(photo, {
    x: (612 - photo.width * photoScale) / 2,
    y: 792 - 380,
    width: photo.width * photoScale,
    height: photo.height * photoScale,
  });

  // Draw text fields below photo
  // ... (BB header, tool name, brand/model, status, location, purchase info, lifecycle)

  // Embed searchable metadata (same pattern as receipt-pdf.js)
  pdfDoc.setTitle(`Tool - ${toolAsset.metadata.brand} ${toolAsset.metadata.name}`);
  pdfDoc.setAuthor(`${toolAsset.created_by_name} (${toolAsset.created_by}) | Bainbridge Builders Inc.`);
  pdfDoc.setSubject(
    `${toolAsset.metadata.brand} ${toolAsset.metadata.model} | ` +
    `${toolAsset.status} @ ${toolAsset.property_name || 'Shop'} | ` +
    `$${toolAsset.metadata.purchase_price || 'N/A'}`
  );
  pdfDoc.setCreator(
    `BB Tool Tracker v1.0 | ${JSON.stringify({
      asset_id: toolAsset.id,
      lifecycle: toolAsset.events.map(e => ({
        event: e.event_type,
        date: e.performed_at,
        by: e.performed_by_name,
        details: e.details,
      })),
    })}`
  );
  pdfDoc.setKeywords([
    'tool', toolAsset.metadata.brand, toolAsset.metadata.model,
    toolAsset.metadata.name, toolAsset.metadata.category,
    toolAsset.property_name, toolAsset.status,
    toolAsset.created_by_name, toolAsset.created_by,
    `$${toolAsset.metadata.purchase_price}`,
    toolAsset.metadata.purchased_at,
    toolAsset.metadata.serial_number,
  ].filter(Boolean));
  pdfDoc.setCreationDate(new Date(toolAsset.metadata.purchase_date || toolAsset.created_at));
  pdfDoc.setModificationDate(new Date(toolAsset.updated_at));

  return await pdfDoc.save();
}
```

### When PDF is Generated/Regenerated

| Event | Regenerate PDF? | Why |
|-------|----------------|-----|
| Tool created (cataloged) | YES | Initial PDF |
| Assigned to site | YES | Location changed |
| Deployed | YES | Status changed |
| Transferred between sites | YES | Location changed |
| Audit found | YES | Last audit date updated |
| Audit missing/stolen | YES | Status changed |
| Sent for repair | YES | Status changed |
| Retired | YES | Terminal state recorded |
| Metadata edited (serial #, notes) | YES | Metadata changed |
| Every audit check (same status) | NO | Too frequent, no meaningful change |
| Enrichment complete | YES | Pro thumbnail now available |

### Drive Filename Convention

```
tool_{assetId}_{Brand}_{Name}.pdf

Examples:
tool_042_Milwaukee_M18CircSaw.pdf
tool_043_DeWalt_20VImpactDrill.pdf
tool_044_Hilti_TE60RotaryHammer.pdf
```

### Drive File Description (Searchable)

```
BBInc Tool | Milwaukee M18 FUEL 7-1/4" Circular Saw | Model: 2781-20 |
Serial: SN-2024-1234 | Status: Deployed | Site: Smith Residence |
Purchased: 3/30/26 $299 Home Depot | Cataloged: Mike (emp_123) |
Last Audit: 4/5/26 Found
```

### New Files

| File | Purpose |
|------|---------|
| `BB_Micro_Bridge/src/clients/tool-pdf.js` | Tool wrapper PDF generation (mirrors receipt-pdf.js) |

### Modified Files

| File | Change |
|------|--------|
| `BB_Micro_Bridge/src/clients/asset-storage.js` | Call `generateToolPDF()` on tool creation + lifecycle events |

---

## Offline Architecture — Tool Crib Cache

### IndexedDB Schema

```javascript
const DB_NAME = 'bb-tool-crib';
const DB_VERSION = 1;

// Object stores:
{
  // Full tool catalog with thumbnails
  'catalog': {
    keyPath: 'id',
    // Each record:
    {
      id: 42,
      name: 'Circular Saw',
      brand: 'Milwaukee',
      model: '2781-20',
      category: 'power_tool',
      subcategory: 'saw',
      size: '7¼"',
      fingerprint: 'Red and black cordless circular saw...',
      pool_size: 1,
      status: 'active',
      thumbBlob: Blob,              // ~50KB primary thumbnail
      photo_drive_ids: [...],
      updated_at: '2026-03-29T...'
    }
  },

  // Site assignments (which tools at which site)
  'assignments': {
    keyPath: 'id',
    indexes: ['property_id', 'tool_id'],
    // Each record:
    {
      id: 101,
      tool_id: 42,
      property_id: 'prop_789',
      quantity: 1,
      status: 'assigned'
    }
  },

  // Pending offline audits (not yet synced)
  'pending_audits': {
    keyPath: 'localId',
    // Each record:
    {
      localId: 'audit_20260329_143022_smith',
      property_id: 'prop_789',
      started_at: '2026-03-29T14:30:22Z',
      completed_at: '2026-03-29T15:15:00Z',
      gps_lat: 47.6205,
      gps_lng: -122.3212,
      gps_accuracy: 15,
      items: [
        { tool_id: 42, found: true, match_method: 'offline_checkoff', photoBlob: Blob|null },
        { tool_id: 43, found: false, status: 'missing', notes: 'Can\'t find' },
      ],
      synced: false
    }
  },

  // Evidence photo queue (photos waiting to upload to Drive)
  'photo_queue': {
    keyPath: 'localId',
    // Each record:
    {
      localId: 'photo_20260329_143055',
      tool_id: 42,
      audit_local_id: 'audit_20260329_143022_smith',
      photoBlob: Blob,              // full-size evidence photo
      timestamp: '2026-03-29T14:30:55Z',
      synced: false
    }
  },

  // Operating manuals (Tier B — only for tools at crew's assigned sites)
  'manuals': {
    keyPath: 'tool_id',
    // Each record:
    {
      tool_id: 42,
      pdfBlob: Blob,                // operating manual PDF (~2-5MB)
      file_name: 'Milwaukee_2781-20_Manual.pdf',
      size_bytes: 2340000,
      cached_at: '2026-03-30T...',
      source_media_id: 789          // cal_asset_media.id for sync reference
    }
  },

  // Sync metadata
  'meta': {
    keyPath: 'key',
    // Records:
    { key: 'last_sync', value: '2026-03-30T08:00:00Z' },
    { key: 'catalog_count', value: 200 },
    { key: 'tierA_bytes', value: 12582912 },   // ~12MB (catalog + thumbs)
    { key: 'tierB_bytes', value: 45000000 },   // ~45MB (manuals for my sites)
    { key: 'my_site_ids', value: ['prop_789', 'prop_456', 'prop_123'] }
  }
}
```

### Tiered Cache Size Estimate

> **Full tiered cache strategy:** See `UNIVERSAL_ASSET_SYSTEM_SPEC.md` §Tiered Offline Cache Strategy

| Tier | Data | Per Tool | Budget | Purpose |
|------|------|----------|--------|---------|
| A (always) | Catalog metadata (JSON) | ~500 bytes | ~100KB | Audit checklists |
| A (always) | Pro thumbnail (JPEG) | ~50KB | ~10MB | Visual identification |
| A (always) | Assignments (JSON) | ~100 bytes | ~20KB | Site tool lists |
| **A total** | | | **~12MB** | |
| B (my sites) | Operating manual (PDF) | ~2-5MB | **80MB cap** | Offline reference |
| **Combined** | | | **~50-100MB** | |

**Tier A** (~12MB): Always cached, every device. All 200 tools.
**Tier B** (~30-80MB): Manuals only for tools at crew's assigned sites. LRU eviction when budget exceeded. Manuals evicted when tool leaves crew's sites.
**Wrapper PDFs: NOT cached on device.** Audit trail PDFs are a back-office/compliance artifact. Crew on-site never needs "when was this tool cataloged" — they need the thumbnail (Tier A) and the operating manual (Tier B). Wrapper PDFs are fetched on-demand from Drive when viewed in the Tool Detail screen (online only).

Phone storage is typically 64-256GB — 100MB is negligible.

### Sync Strategy

```
App opens or resumes from background
  │
  Check: navigator.onLine?
  │
  ├── YES (online)
  │     │
  │     GET /api/tools/sync?since={last_sync}
  │     │
  │     Response: { tools: [...changed], assignments: [...changed], deletedToolIds: [...] }
  │     │
  │     ├── Update/insert changed tools in IndexedDB 'catalog'
  │     ├── Download new thumbnails for new/changed tools
  │     ├── Update assignments
  │     ├── Remove deleted tools
  │     ├── Update meta.last_sync
  │     │
  │     Then: check for pending offline audits
  │     │
  │     ├── pending_audits with synced=false?
  │     │     │
  │     │     POST /api/tools/audit/bulk-sync (audit records + evidence photos)
  │     │     │
  │     │     Mark synced=true on success
  │     │
  │     └── photo_queue with synced=false?
  │           │
  │           Upload photos to Drive one at a time
  │           Mark synced=true on success
  │
  └── NO (offline)
        │
        Serve everything from IndexedDB
        Queue all changes locally
```

### Background Sync (when online)

```
Every 15 minutes (while app is open + online):
  │
  GET /api/tools/sync?since={last_sync}
  │
  Update catalog + assignments silently
  │
  No UI notification unless new tools added (subtle badge update)
```

---

## Offline Audit Flow (Tier 2)

When offline, the audit works without Claude:

```
Crew opens JobsitesView (cached) → taps site → Assets tab → Start Audit
  │
  Checklist loads from IndexedDB (cached assignments + tool thumbnails)
  │
  Status bar: "📴 Offline — manual check-off mode"
  │
  Crew walks site, finds tool
  │
  Option A: Tap tool in checklist → mark found ✓
  │         Optional: tap 📷 to snap evidence photo (saved to IndexedDB)
  │
  Option B: Open camera → snap photo → manually pick matching tool from list
  │         Photo queued for later Claude verification
  │
  Option C: Tap tool → view detail → tap "📄 Operating Manual" → opens cached PDF
  │         (available offline for tools at crew's assigned sites — Tier B cache)
  │
  Complete Audit → mark missing items with status
  │
  Audit saved to IndexedDB 'pending_audits'
  │
  Toast: "Audit saved locally. Will sync when connected."
  │
  Later (online): auto-sync uploads audit + evidence photos
                   Claude optionally verifies photo matches server-side
```

### Offline Resource Access

Beyond audits, crew can access cached resources offline:
- **Tool thumbnails** (Tier A): Always available for all 200 tools
- **Operating manuals** (Tier B): Available for tools at crew's assigned sites
- **Tool detail** (metadata): Always available from IndexedDB
- **History/events**: Cached from last sync, may be stale

Resources NOT available offline:
- Spec sheets, maintenance guides (Tier C — on-demand only)
- URL references (require internet)
- Design assets, LIDAR, CAD files

---

## New Files

### BB_Micro_Bridge (tool-specific files only)

> Universal files (`assets-v1.js`, `asset-classes.js`, `asset-storage.js`, `asset-ai.js`)
> are listed in `UNIVERSAL_ASSET_SYSTEM_SPEC.md`.

| File | Purpose |
|------|---------|
| `src/routes/tools-v1.js` | Tool-specific endpoints (scan, audit, dashboard, assign/transfer) |
| `src/clients/tool-ai.js` | Claude vision prompts for tool catalog + audit matching |

### CalExp5

| File | Purpose |
|------|---------|
| `src/components/modals/ToolScanModal.jsx` | Continuous scanning camera loop + result overlay |
| `src/components/shared/ToolScanner.jsx` | Camera viewfinder with stability detection (no edge detection) |
| `src/components/views/AssetsTab.jsx` | Universal assets view in property detail (tools + receipts + future) |
| `src/components/views/AssetTimeline.jsx` | Chronological "All" view across asset classes |
| `src/components/views/AuditChecklist.jsx` | Interactive checklist during tool audit |
| `src/components/views/AuditSummary.jsx` | Post-audit summary with missing item status picker |
| `src/components/views/ToolDashboard.jsx` | Admin dashboard (MenuDrawer item) |
| `src/store/slices/toolSlice.js` | Zustand slice for tool scanner + audit state |
| `src/store/slices/assetSlice.js` | Zustand slice for universal asset state |
| `src/utils/asset-api.js` | API calls for universal `/api/assets/*` endpoints |
| `src/utils/tool-api.js` | API calls for tool-specific endpoints |
| `src/utils/tool-crib.js` | IndexedDB Tool Crib cache manager |
| `src/utils/asset-deposit-queue.js` | Offline deposit queue (all asset classes) |

### Modified Files

| File | Changes |
|------|---------|
| `ActionFAB.jsx` | Add 5th radial button (Tool Scan) |
| `MenuDrawer-v2.jsx` | Add "Tool Dashboard" (gated: `tools.admin`) |
| `JobsitesView.jsx` | Add Assets tab in property detail panel |
| `src/store/slices/uiSlice.js` | Add `toolScanOpen`, `toolDashboardOpen`, `auditInProgress` states |
| `BB_Micro_Bridge/src/utils/feature-defaults.js` | Add `tools.*` + `assets.*` feature flags |
| `BB_Micro_Bridge/src/index-v2.js` | Register `/api/assets` + `/api/assets/tools` prefixes |
| `BB_Micro_Bridge/src/clients/image-cache.js` | Add `asset-{id}` key prefix support |

---

## Feature Flags

> Full flag list in `UNIVERSAL_ASSET_SYSTEM_SPEC.md`. Tool-specific flags:

```javascript
'tools.view':    'View tool inventory and site assignments',
'tools.catalog': 'Catalog new tools via camera',
'tools.audit':   'Conduct tool audits on jobsites',
'tools.admin':   'Tool dashboard, assign/transfer, manage inventory',

// Crew members get tools.view + tools.audit assigned individually
// Admin gets all tools.* + assets.* automatically
```

---

## Google Drive Storage

> Uses universal `BB_Assets/` folder structure defined in `UNIVERSAL_ASSET_SYSTEM_SPEC.md`.

### Tool-Specific Folders

```
BB_Assets/
├── tools/
│   ├── catalog/
│   │   ├── {asset_id}_front.jpg
│   │   ├── {asset_id}_side.jpg
│   │   └── {asset_id}_back.jpg
│   └── audits/
│       └── {YYYY-MM}/
│           └── {property}_{date}_{asset_id}_evidence.jpg
```

### Drive File Description (searchable)

```
BBInc Tool | Name: Milwaukee M18 Circular Saw | Brand: Milwaukee | Model: 2781-20 |
Category: Power Tool | Cataloged by: Mike (emp_123) | Date: 3/29/26
```

For audit evidence photos:
```
BBInc Tool Audit | Site: Smith Residence | Tool: Milwaukee M18 Circular Saw |
Audit: 3/29/26 | Found: Yes | Auditor: Mike (emp_123)
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Scanner frame capture to Claude response | < 2 seconds (LTE) |
| Scanner frame capture to Claude response | < 4 seconds (3G fallback) |
| Tool Crib cache initial load (200 tools) | < 5 seconds |
| Tool Crib delta sync (typical) | < 1 second |
| Audit checklist render (30 tools) | < 200ms |
| Offline audit save to IndexedDB | < 500ms |
| Thumbnail from LRU cache | < 5ms |
| Dashboard load (10 sites) | < 1 second |

---

## Dependencies to Add

| Package | Where | Purpose |
|---------|-------|---------|
| (none new) | BB_Micro_Bridge | Reuses existing: @anthropic-ai/sdk, googleapis, sharp, pdf-lib |
| (none new) | CalExp5 | Reuses existing: idb (IndexedDB wrapper), zustand |

No new dependencies required — the receipt pipeline established all necessary packages.

---

## Build Order

> Full phased plan (all asset classes) in `UNIVERSAL_ASSET_SYSTEM_SPEC.md`.
> Below: tool-specific phases only (corresponds to UAS Phases 1-5).

| Phase | What | Effort | Delivers |
|-------|------|--------|----------|
| 1a | Universal Neon tables (`cal_assets`, `cal_asset_media`, `cal_asset_events`) | Medium | Schema foundation |
| 1b | `asset-classes.js` registry + `/api/assets` CRUD endpoints | Medium | Universal API |
| 1c | `cal_asset_audit_sessions` + receipt adapter view | Small | Audit foundation |
| 2a | `tool-ai.js` + `/api/assets/tools/scan` | Medium | Claude identifies tools |
| 2b | `ToolScanner.jsx` + `ToolScanModal.jsx` + FAB button | Large | Continuous scanning works |
| 2c | `tool-crib.js` (IndexedDB) + `/api/assets/sync` | Medium | Offline Tool Crib |
| 3a | `AssetsTab.jsx` + `AssetTimeline.jsx` in JobsitesView | Medium | Assets visible per site |
| 3b | Receipt adapter in Assets view | Small | Receipts alongside tools |
| 3c | Tool assign/transfer API + events | Medium | Move tools between sites |
| 4a | `AuditChecklist.jsx` + `AuditSummary.jsx` + audit API | Large | Full audit workflow |
| 4b | Offline audit queue + bulk-sync | Medium | Audits work offline |
| 5 | `ToolDashboard.jsx` + dashboard API + search | Medium | Sam's overview |

---

## Receipt System Leverage Map

| Receipt Component | Tool Equivalent | Reuse |
|-------------------|-----------------|-------|
| `DocumentCamera.jsx` | `ToolScanner.jsx` | Camera init + torch toggle reused; edge detection removed |
| `ReceiptScanModal.jsx` | `ToolScanModal.jsx` | Phase state machine pattern reused; different phases |
| `receipt-ai.js` | `tool-ai.js` | Same Anthropic SDK call structure; different prompts |
| `receipt-queue.js` | `tool-queue.js` | Same IndexedDB pattern; different stores |
| `receiptSlice.js` | `toolSlice.js` | Same Zustand slice pattern |
| `image-cache.js` | Shared (add `tool-` prefix) | Same LRU cache, different key namespace |
| `google-drive.js` | Shared (add tool folder) | Same upload logic, different folder |
| `receipt-v1.js` | `tools-v1.js` | Same Express route patterns; different domain |
| `thumb-store.js` | `tool-crib.js` | Similar IndexedDB caching; tool version is richer |
| Receipt confidence UX | Tool confidence UX | Same green/amber/red pattern |
| Receipt offline queue | Tool audit offline queue | Same queue + sync-on-reconnect pattern |

---

## Open Items for Future Versions

| Item | Version | Notes |
|------|---------|-------|
| Maintenance scheduling | v2 | Track service intervals, blade changes |
| Purchase history / cost tracking | v2 | Link to receipts (tools bought via receipt scan) |
| Tool transfer notifications | v2 | Push notification when tools moved to your site |
| Photo-based re-identification | v2 | Use catalog photos for on-device pre-filtering |
| Video scanning (live stream) | v3 | WebRTC stream to Claude for real-time identification |
| Fixed camera at shop | v3 | Auto-detect tools leaving/arriving |
| Equipment rental integration | v3 | Track rented vs owned tools |

---

*Ready to implement? Say "go" or request changes.*
