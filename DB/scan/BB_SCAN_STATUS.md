# BB Scan — Receipt Scanning System | v2.2.0 | 2026-03-31 | BB

## Overview

Replacement for Microsoft Lens (retired). Crew taps FAB in CalExp5 (daily-use PWA), snaps receipt photo, Claude Sonnet 4.6 reads it with 10-field extraction, resolves store name via aliases, matches jobcode via 5-level cascade, classifies R/B, generates PDF with embedded metadata, auto-files to Google Drive + emails corp Gmail. Works offline (IndexedDB queue, auto-uploads on reconnect). Point, shoot, walk away. 2 taps.

## v2.0.0 Changes (2026-03-18)

- Enhanced AI prompt: 10-field extraction (handwrittenName, storeName, invoiceNo, invoiceDate, txnTime, total, cc4, printedJobRef, allDatesFound, documentType) + per-field confidence
- Date guardrail: reject future dates, dates >13 months old, OCR year auto-correction
- R/B classification: Receipt vs Bill prefix based on documentType + cc4
- Supplier aliases: 30 seeded aliases in Neon (exact + partial matching)
- Jobcode resolution: 5-level cascade (exact, partial, word-in-alias, address, fuzzy)
- Cross-field contamination check: retries store name if it matches jobcode
- Filename convention: `{R_|B_}{Store}_{Job}_{DMMDDYY}{THHMM}{C{amount}}.pdf`
- PDF output: pdf-lib wraps receipt image with embedded metadata (title, author, keywords)
- Drive file description: searchable metadata string (vendor, job, date, crew, amount, cc4)
- Crew traceability: employeeId + crewName on every PDF and Drive file
- 4 hero fields in UX: R/B badge, Store/Vendor, Jobsite/Customer, Total Amount
- Confidence-coded borders: green (>=85%), amber (50-84%), red (<50%)
- Processed image display with green checkmark overlay
- Gallery sideload: separate "Choose from Gallery" button (no capture attribute)
- Offline queue: IndexedDB (max 5), auto-upload on reconnect with toast notifications
- Queue management: count badge on FAB, long-press opens queue list with delete
- Phone-side dedup: file hash prevents re-queuing same photo
- Server-side dedup: vendor + amount + date check against cal_receipts
- Drive-side dedup: invoice# search in month folder
- Client-side canvas processor: EXIF rotation, auto-contrast, sharpen (toggle vs server)
- Neon schema: 8 new columns on cal_receipts, 2 new tables (supplier_aliases, jobcode_aliases)

---

## Architecture

```
Phone Camera
     |
CalExp5 PWA (React 19 + Zustand + Tailwind 4)
  ReceiptFAB.jsx  ->  ReceiptScanModal.jsx
     |
  server.js (Express proxy, 10mb JSON limit, 45s timeout)
     |
BB Micro-Bridge (Fastify 5, Railway)
  POST /api/cal/receipt/scan
     |
     +-- receipt-image.js (Sharp: resize, normalize, sharpen -> JPEG)
     +-- receipt-ai.js (Claude Sonnet 4.6 vision -> structured JSON)
     +-- [background async after response]:
         +-- google-drive.js (upload to Drive, month subfolders)
         +-- receipt-email.js (Nodemailer -> corp Gmail)
         +-- Neon DB (cal_receipts table)
```

---

## What's Done (deployed + working)

### Backend (BB Micro-Bridge)

| File | Version | Purpose |
|------|---------|---------|
| `src/clients/receipt-ai.js` | v1.1.0 | Claude Sonnet 4.6 vision — structured JSON extraction with dateHint, 10-field extraction + per-field confidence |
| `src/clients/receipt-image.js` | v1.0.0 | Sharp — auto-rotate, resize (max 2000px), normalize contrast, sharpen, JPEG 85%. Thumbnail (400px, 70%) for email |
| `src/clients/google-drive.js` | v2.1.0 | OAuth2 upload to Drive. Month subfolders. trashDriveFile, downloadFileBuffer for thumb proxy, dedup check |
| `src/clients/receipt-email.js` | v1.0.0 | Nodemailer Gmail. Subject: `[BB Receipt] {vendor} ${amount} - {job} - {crew}`. HTML table + inline thumbnail. Fire-and-forget |
| `src/routes/receipt-v1.js` | v3.3.0 | POST `/scan`, GET `/history` (AND search, scope=all), GET `/:id/thumb` (600px), GET `/:id/image`, DELETE `/:id` (posted guard), POST `/return-status`, POST `/gps-hints` |
| `src/config-v2.js` | modified | Added `receipt: {}` config block (Anthropic key, Drive creds, email creds) |
| `src/schemas/cal.js` | modified | Added `ReceiptScanBody` TypeBox schema (image: string minLength 100, crewName: optional string) |
| `src/index-v2.js` | modified | Registered receipt routes at `/api/cal/receipt`. Content type parser bodyLimit raised to 10MB |
| `src/plugins/session-v2.js` | v1.2.0 | All receipt routes now require Bearer auth (bypass removed) |

### Frontend (CalExp5)

| File | Version | Purpose |
|------|---------|---------|
| `src/components/shared/ReceiptFAB.jsx` | v1.0.0 | Fixed BB Red circle (56px), camera SVG icon, bottom-right, safe area inset. Only shows when authenticated |
| `src/components/modals/ReceiptScanModal.jsx` | v1.2.0 | State machine: idle -> scanning -> result/review/error. 4 hero fields. 600px canvas thumbnail. Focus trap, escape key, ARIA |
| `src/store/useStore.js` | modified | Added `receiptScanOpen`, `receiptScanResult`, `receiptScanLoading` state + actions |
| `src/utils/api.js` | modified | Added `scanReceipt()`, `fetchReceiptHistory()`, `deleteReceipt()` via existing `apiCall()` helper |
| `src/hooks/useReceiptVault.js` | v1.1.0 | Vault data hook: fetch, group, sub-sort, thumbnail resolution, search, scope=all |
| `src/components/modals/ReceiptVaultModal.jsx` | v1.4.0 | 3-column grid, group-by, collapsible BB-red headers, aggregated totals, posted delete guard |
| `src/components/modals/ReceiptHistoryModal.jsx` | v1.3.0 | "My Receipts" carousel, GhostSearch autocomplete, posted delete guard, persistent scrollbar |
| `src/components/shared/ReceiptFullScreen.jsx` | v2.1.0 | Pinch-to-zoom viewer, share, posted delete guard |
| `src/components/shared/GhostSearchInput.jsx` | v2.2.0 | Inline ghost-text autocomplete, canvas-measured pixel positioning |
| `src/App.jsx` | modified | Mounted ReceiptFAB + ReceiptScanModal, added to swipe-block condition |
| `server.js` | modified | JSON limit -> 10mb, proxy timeout -> 45s |
| `src/index.css` | modified | Added `scaleIn` animation + reduced motion support |

### Database (Neon)

```sql
cal_receipts (
  id SERIAL PK,
  employee_id TEXT NOT NULL,
  image_url TEXT,           -- Google Drive webViewLink
  vendor TEXT,
  amount DECIMAL(10,2),
  receipt_date DATE,
  items JSONB,
  jobcode_id TEXT,
  jobcode_name TEXT,
  confidence DECIMAL(3,2),
  status TEXT DEFAULT 'filed',
  metadata JSONB,           -- { crewName, imageMetadata, driveFileId }
  created_at TIMESTAMPTZ DEFAULT NOW()
)
idx_cal_receipts_employee (employee_id)
idx_cal_receipts_date (receipt_date)
```

### Railway Env Vars (Micro-Bridge)

| Variable | Status |
|----------|--------|
| `ANTHROPIC_API_KEY` | Set |
| `GOOGLE_DRIVE_CLIENT_ID` | Set |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Set |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | Set |
| `GOOGLE_DRIVE_FOLDER_ID` | Set (`1vpQauI-ckzM0McNZQrpthm7o7gRVcJoF` = "BB Receipts" folder) |
| `RECEIPT_EMAIL_TO` | Set (buildwithbainbridge@gmail.com) |
| `RECEIPT_EMAIL_FROM` | Set (buildwithbainbridge@gmail.com) |
| `RECEIPT_EMAIL_APP_PASSWORD` | NOT SET (email won't send without it) |
| `SESSION_SECRET` | Set |
| `WEBAUTHN_RP_ID` | Set (bb-crew-calendar-production.up.railway.app) |
| `WEBAUTHN_RP_NAME` | Set |
| `WEBAUTHN_ORIGIN` | Set |

### Bugs Fixed During Deployment

1. **Double `/api/api/` URL** — `apiCall()` already prepends `/api` via `API_BASE`. Receipt endpoints were passing `/api/cal/receipt/scan` instead of `/cal/receipt/scan`
2. **Body too large (1MB)** — Fastify content type parser had `bodyLimit: 1048576`. Parser-level limit fires before route-level limit. Raised to 10MB
3. **401 Missing Authorization** — Session plugin blocks all `/api/cal/*` routes. Added temp bypass for `/api/cal/receipt` routes until crew auth is deployed
4. **`ReferenceError: Cannot access 'je' before initialization`** (2026-03-31) — Terser minification crash on phones. `isReimbursable` const declared at line 1004 but used at line 997 in same scope. Terser merged the declarations into a comma-expression with TDZ. Fix: hoist declaration above first usage. See: CHANGELOG v2.13.0.
5. **UND_ERR_SOCKET on scan** (2026-03-30) — Railway drops idle TCP sockets after ~20s. Claude scan taking >20s hits socket drop mid-flight. Fix: `keepalive: false` + `Connection: close` on AI endpoint paths in CalExp5 server.js proxy.
6. **Slow scan (5-8s instead of 2-3s)** (2026-03-31) — Steps 11+12 after Claude response were sequential awaits (dedup DB + location Google API calls). Fix: parallel via `Promise.allSettled`. Also parallelized `geocodeAddress` + `findPlaceFromAddress` inside `resolveLocation`. See: receipt-v1.js v3.11.0, receipt-location.js v1.1.0.

---

## What Still Needs Work

### P0 — Required for Production

#### ~~1. Crew Authentication~~ DONE (2026-03-21)
- ~~Session plugin (`session-v2.js`) bypass removed~~
- ~~All receipt routes require Bearer token authentication~~
- ~~Receipts scoped to authenticated user~~
- ~~Anonymous receipts migrated to real employee IDs~~

#### 2. File Naming Convention (CURRENT: weak)
**Current:** `{date}_{vendor}_{crew}.jpg`
Example: `2026-03-18_Home_Depot_Mike.jpg`

**Problems:**
- No jobcode/customer in filename
- No receipt amount
- No sequence number for multiple receipts per vendor per day
- Vendor names can be messy (abbreviations, special chars)

**Proposed convention:**
```
{YYYY-MM-DD}_{JobcodeShortName}_{Vendor}_{Amount}_{Crew}_{seq}.pdf
```
Example: `2026-03-18_Eklund-Remodel_HomeDepot_247.83_Mike_01.pdf`

Rules:
- All spaces -> hyphens
- Strip special chars except hyphens
- Vendor: max 20 chars, title case
- Jobcode: max 25 chars, use `parseJobcodeName().shortName`
- Amount: no dollar sign, keep decimals
- Seq: 2-digit zero-padded (01, 02, ...) for same-day duplicates
- **PDF not JPG** (see #3 below)

#### 3. Straightened PDF Output (CURRENT: JPEG only)
**Current state:** Sharp outputs JPEG. Uploaded to Drive as `.jpg`

**Needed:** Customer-facing PDF with:
- Perspective correction / deskewing (receipt straightened)
- High-contrast B&W or grayscale processing (optimal for text readability)
- Full-page PDF with receipt image centered, white margins
- Consistent output regardless of input orientation/angle
- Professional appearance suitable for customer invoices and audits

**Implementation options:**
- **Sharp** can handle: auto-rotate (EXIF), resize, normalize, sharpen, grayscale/threshold
- **Sharp cannot do:** perspective correction / deskewing (no warp transform)
- **For deskewing:** Need either:
  - Ask Haiku to detect rotation angle from the image, then use Sharp `.rotate(angle)`
  - Or use a dedicated image processing approach
- **For PDF:** Use `pdfkit` or `pdf-lib` to wrap the processed image in a PDF document

#### 4. Metadata Embedding
**Current:** No metadata on the image or PDF

**Needed metadata (embedded in PDF properties):**
- **Title:** `Receipt - {Vendor} - {JobcodeName}`
- **Author:** `Bainbridge Builders Inc.`
- **Subject:** `{Vendor} ${Amount} - {JobcodeName} - {Crew}`
- **Creator:** `BB Scan v1.0`
- **CreationDate:** Receipt date (not scan date)
- **Keywords:** `receipt, {vendor}, {jobcodeName}, {crewName}, {amount}`
- **Custom properties:**
  - `BBJobcodeId`: jobcode ID
  - `BBEmployeeId`: crew employee ID
  - `BBAmount`: dollar amount
  - `BBVendor`: vendor name
  - `BBConfidence`: AI match confidence

This enables searching receipts by any field in Drive, Finder, Explorer, or any PDF viewer.

### P1 — Important

#### 5. Gmail App Password for Email Notifications
- Need to generate a Gmail app password for `buildwithbainbridge@gmail.com`
- Google Account > Security > 2-Step Verification > App passwords
- Set `RECEIPT_EMAIL_APP_PASSWORD` on Railway
- Without this: scanning and Drive upload work, but no email notification

#### 6. Image Quality / Deskewing Pipeline Upgrade
**Current Sharp pipeline:**
```
auto-rotate (EXIF) -> resize 2000px -> normalize -> sharpen -> JPEG 85%
```

**Needed pipeline:**
```
auto-rotate (EXIF)
-> deskew (straighten tilted receipt)
-> perspective correct (optional — flatten crumpled/curved receipts)
-> crop to receipt edges (remove background)
-> normalize contrast (optimize for text readability)
-> sharpen for print
-> grayscale conversion (professional B&W look)
-> embed in PDF with metadata
-> generate color thumbnail for email/UI preview
```

#### 7. Drive Folder Organization
**Current:** `BB Receipts / {YYYY-MM} / {filename}.jpg`

**Proposed:**
```
BB Receipts/
  2026-03/
    Eklund-Remodel/
      2026-03-18_HomeDepot_247.83_Mike_01.pdf
      2026-03-15_Lowes_89.50_Mike_01.pdf
    Smith-Kitchen/
      2026-03-17_HomeDepot_156.22_Carlos_01.pdf
```

Option: jobcode subfolder within month. Makes it easy for Sam to find all receipts for a specific job.

### P2 — Nice to Have

#### ~~8. Receipt History View in CalExp5~~ DONE (2026-03-22)
- ~~"My Receipts" carousel with portrait tiles, crew names, gradient overlays~~
- ~~Receipt Vault with 3-column grid, group-by (date/vendor/jobsite/amount), collapsible BB-red headers~~
- ~~Multi-keyword AND search with ghost-text autocomplete~~
- ~~Full-screen viewer with pinch-to-zoom, share, delete~~
- ~~Posted receipt protection (universal delete guard)~~

#### ~~9. Duplicate Detection~~ DONE (2026-03-18)
- ~~Server-side: vendor + amount + date check against cal_receipts~~
- ~~Drive-side: invoice# search in month folder~~
- ~~Phone-side: file hash prevents re-queuing same photo~~

#### 10. Multi-Receipt Support
- Long receipts or multi-page receipts
- Crew could scan multiple images for one receipt
- Stitch into single PDF

#### ~~11. Offline/Retry Queue~~ DONE (2026-03-18)
- ~~IndexedDB queue (max 5), auto-upload on reconnect~~
- ~~Queue management: count badge on FAB, long-press opens queue list with delete~~
- ~~Toast notifications on successful upload~~

---

## Costs

| Item | Monthly Estimate |
|------|-----------------|
| Claude Sonnet 4.6 API (~50 receipts/day) | ~$3 |
| Google Drive storage | Free (15GB shared) |
| Gmail sending | Free |
| Railway compute (already running) | $0 incremental |
| Neon DB (already provisioned) | $0 incremental |
| Sharp / pdfkit | Free (npm packages) |

---

## Git History

| Commit | Repo | Description |
|--------|------|-------------|
| `ea1c87f` | BB_Micro_Bridge | feat: BB Scan receipt scanning + CalExp5 auth backend |
| `f73eadc` | BB_Micro_Bridge | fix: increase JSON body limit to 10MB |
| `e069a00` | BB_Micro_Bridge | fix: temp bypass session auth for receipt routes |
| `221f589` | CalExp5 | feat: BB Scan receipt FAB + modal, auth system, Railway config |
| `2d33e54` | CalExp5 | fix: remove double /api prefix from receipt scan endpoints |

---

## Dependencies Added (Micro-Bridge)

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | latest | Claude Sonnet 4.6 vision API |
| `sharp` | latest | Image processing (native libvips — Nixpacks auto-handles on Railway) |
| `googleapis` | latest | Google Drive upload |
| `nodemailer` | latest | Gmail email notifications |

**Future (for PDF output):**
| Package | Purpose |
|---------|---------|
| `pdf-lib` or `pdfkit` | Wrap receipt image in PDF with metadata |
