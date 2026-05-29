# BB Scan v2 Feature Spec | v1.0 | 2026-03-18 | BB

## Summary

BB Scan v2 upgrades the receipt scanning system from basic AI extraction + JPEG upload to a full
intelligence pipeline matching the battle-tested GScript crew section. Adds offline queue, dedup,
PDF output, confidence-coded UX, and crew traceability. Goal: retire GScript crew section entirely.

---

## Decisions (from Sam)

| # | Question | Answer |
|---|----------|--------|
| 1 | Offline queue limit | 5 receipts max |
| 2 | Upload behavior on reconnect | Auto-upload with toast notification |
| 3 | Queue visibility | Count badge on FAB + viewable/deletable list |
| 4 | Failed uploads | Stay in queue, crew decides to delete |
| 5 | Corrected image feedback | Build both server-side and client-canvas, toggle to compare |
| 6 | Bounding boxes on image | No -- use confidence-coded hero field borders instead (v1) |
| 7 | Metadata | Include employeeId + crewName for expense traceability |

---

## UX Design

### Crew Sees (4 Hero Elements)

```
+-------------------------------+
|  BB Scan                 X    |
|-------------------------------|
|                               |
|  +-------------------------+  |
|  |                         |  |
|  |  [Corrected Receipt     |  |
|  |   Image - straightened  |  |
|  |   and enhanced]         |  |
|  |               green chk |  |
|  +-------------------------+  |
|                               |
|  +-------------------------+  |
|  | R   HomeDepot       ### |  | <-- green left border (high conf)
|  |     Eklund Remodel  ##  |  | <-- green left border
|  |     $247.83         ### |  | <-- green left border
|  |     Inv# 6968       #   |  | <-- amber left border (medium)
|  +-------------------------+  |
|                               |
|  -- Filing to Drive... --     |
|                               |
|  [ Scan Another ]             |
|                               |
|  +-------------------------+  |
|  | 2 receipts queued       |  |
|  | (waiting for signal)    |  |
|  +-------------------------+  |
+-------------------------------+
```

### Confidence Border Colors

| Confidence | Left Border | Meaning |
|------------|-------------|---------|
| >= 0.85 | Green (`#16a34a`) | AI is sure |
| 0.50 - 0.84 | Amber (`#d97706`) | Might be wrong |
| < 0.50 | Red (`#dc2626`) | Crew should verify |

### Hero Fields (always visible)

1. **R/B Badge** -- red pill `R` (Receipt) or blue pill `B` (Bill)
2. **Store/Vendor** -- normalized name from supplier aliases
3. **Jobsite/Customer** -- matched via 5-level jobcode cascade
4. **Total Amount** -- large bold dollar amount

### Secondary Fields (below hero card, smaller text)

- Date (formatted)
- Invoice/Ref# (if found)
- CC last 4 (if found)
- Transaction time (if found)

---

## Architecture Changes

### Backend Pipeline (blocking path -- crew waits)

```
1. Decode base64 -> buffer
2. processImage() -- Sharp: auto-rotate, resize, normalize, sharpen
3. Fetch jobcodes from Neon (cal_jobcodes)
4. Fetch supplier aliases from Neon (supplier_aliases)
5. analyzeReceipt() -- Sonnet 4.6 vision, 10-field extraction
6. guardrailDate() -- reject future/old dates, fix OCR year errors
7. resolveSupplier() -- 2-tier alias matching (exact, partial)
8. resolveJobcode() -- 5-level cascade (exact, partial, word-in-alias, address, fuzzy)
9. checkContamination() -- if storeName == jobcode, retry store extraction
10. classifyDocument() -- R_ or B_ based on documentType + cc4
11. Return to crew: 4 hero fields + processed image + secondary fields
```

**Added latency: ~200-350ms typical (steps 6-10 are pure JS + 1 Neon query)**
**Contamination retry (rare): +2-5s (second Sonnet 4.6 call)**

### Backend Pipeline (background -- crew doesn't wait)

```
12. buildFilename() -- {R_|B_}{Store}_{Job}_{DMMDDYY}{THHMM}{C{amount}}.pdf
13. generatePDF() -- pdf-lib wraps processed image + embeds metadata
14. uploadToDrive() -- PDF to Drive with month subfolder + file description
15. insertReceipt() -- Neon cal_receipts with all fields
16. checkDuplicate() -- compare invoice# + vendor + amount + date
17. sendEmail() -- Nodemailer with summary + thumbnail
```

### Frontend Flow

```
Crew taps FAB
  |
  +-- HAS CONNECTION
  |     |
  |     Camera/Gallery -> base64 -> POST /scan -> show result
  |     |
  |     Result screen: corrected image + 4 hero fields + confidence borders
  |     |
  |     "Scan Another" or Close
  |
  +-- NO CONNECTION (navigator.onLine === false)
        |
        Camera/Gallery -> store in IndexedDB queue (max 5)
        |
        Show "Queued (offline)" with receipt count
        |
        On reconnect (online event):
          -> Toast: "Uploading 2 queued receipts..."
          -> Process one at a time
          -> Toast per completion: "Receipt filed: HomeDepot $247.83"
          -> Remove from queue on success
```

---

## New Files

### BB Micro-Bridge

| File | Purpose |
|------|---------|
| `src/clients/receipt-validation.js` | guardrailDate(), classifyDocument(), checkContamination() |
| `src/clients/receipt-aliases.js` | resolveSupplier(), resolveJobcode() -- alias matching cascade |
| `src/clients/receipt-filename.js` | buildFilename() -- GScript naming convention |
| `src/clients/receipt-pdf.js` | generatePDF() -- pdf-lib image wrapping + metadata |

### CalExp5

| File | Purpose |
|------|---------|
| `src/utils/receipt-queue.js` | IndexedDB queue manager (store, retrieve, delete, count) |
| `src/utils/receipt-image-canvas.js` | Client-side canvas image processing (option B) |
| `src/hooks/useOnlineStatus.js` | navigator.onLine + event listener hook |
| `src/components/shared/ReceiptQueueBadge.jsx` | Queue count badge on FAB |
| `src/components/modals/ReceiptQueueModal.jsx` | View/delete queued receipts |

### Modified Files

| File | Changes |
|------|---------|
| `src/clients/receipt-ai.js` | 10-field prompt, per-field confidence |
| `src/clients/receipt-image.js` | Return processed image base64 for frontend display |
| `src/routes/receipt-v1.js` | Wire up validation, aliases, filename, PDF, dedup |
| `src/clients/google-drive.js` | PDF upload, file description metadata, dedup check |
| `ReceiptScanModal.jsx` | 4 hero fields, confidence borders, image display, queue indicator |
| `ReceiptFAB.jsx` | Queue count badge overlay |
| `useStore.js` | Queue state, online status |
| `api.js` | Offline detection, queue fallback |

---

## AI Prompt (10 Fields)

```
Extract these fields as JSON from the receipt image:

{
  "handwrittenName": "handwritten text (pen/marker, not printed) -- usually job/customer name",
  "storeName": "store/vendor/business name from header/logo",
  "invoiceNo": "receipt/transaction/invoice number",
  "invoiceDate": "date in YYYY-MM-DD format",
  "txnTime": "transaction time in HH:MM 24hr format, or null",
  "total": 0.00,
  "cc4": "last 4 digits of credit card, or null",
  "printedJobRef": "any printed PO/job/project reference (NOT buyer name), or null",
  "allDatesFound": ["all dates visible anywhere on the document"],
  "documentType": "receipt | invoice | paid_invoice",
  "items": [{"description": "item", "amount": 0.00}],
  "confidence": {
    "storeName": 0.95,
    "total": 0.98,
    "invoiceDate": 0.90,
    "jobcodeMatch": 0.85
  }
}

Store name hints: check URLs, rewards programs, survey links, email domains,
"Thank you for shopping at X" text. Franchise stores often show local abbreviation
at top but real brand in footer/URL.

Negative totals: returns/credits should have negative total.
```

---

## Filename Convention

```
{R_|B_}{StoreName}_{JobCode}_{DMMDDYY}{THHMM}{C{amount}}.pdf

Examples:
R_HomeDepot_Eklund_D031826T1430C24783.pdf
B_SanLorenzo_Smith_D031526T9999C15622.pdf
R_AceHardware_UNKNOWN_D031726T0930C8950.pdf
```

| Segment | Rules |
|---------|-------|
| Prefix | `R_` (receipt/paid_invoice + has cc4) or `B_` (invoice/no cc4) |
| StoreName | Max 20 chars, no spaces, no special chars, from supplier aliases |
| JobCode | From 5-level cascade, `UNKNOWN` if no match |
| DateCode | `D` + MMDDYY |
| TimeCode | `T` + HHMM (24hr), `T9999` if no time |
| AmountCode | `C` + cents no decimal, `C-` prefix for negatives |

---

## Metadata (PDF + Drive)

### PDF Properties (pdf-lib)

```javascript
{
  title: 'Receipt - HomeDepot - Eklund',
  author: 'Mike (emp_12345) | Bainbridge Builders Inc.',
  subject: 'HomeDepot $247.83 - Eklund - Mike',
  creator: 'BB Scan v2.0',
  creationDate: receiptDate,  // NOT scan date
  keywords: 'receipt, HomeDepot, Eklund, Mike, 247.83',
  // Custom (via XMP or info dict):
  // BBEmployeeId, BBCrewName, BBJobcodeId, BBVendor, BBAmount,
  // BBConfidence, BBInvoiceNo, BBDocType, BBcc4
}
```

### Drive File Description

```
BBInc Receipt | Vendor: HomeDepot | Job: Eklund | Date: 3/18/26 | Time: 1430 | Total: $247.83 | CC: x1234 | Crew: Mike (emp_12345) | Ref#: 6968-32324
```

Searchable in Google Drive by any field.

---

## Offline Queue (IndexedDB)

### Schema

```javascript
const DB_NAME = 'bb-scan-queue';
const STORE_NAME = 'receipts';
const MAX_QUEUE = 5;

// Each record:
{
  id: crypto.randomUUID(),
  imageBlob: Blob,           // original photo (NOT base64 -- saves 33%)
  thumbnailBlob: Blob,       // small preview for queue list
  timestamp: Date.now(),
  status: 'queued',          // queued | uploading | failed
  retryCount: 0,
  fileHash: 'sha256-...',    // for phone-side dedup
  fileName: 'IMG_20260318_143022.jpg',  // original filename
}
```

### Auto-Upload Flow

```
window.addEventListener('online', () => {
  // 1. Check queue count
  // 2. Show toast: "Uploading N queued receipts..."
  // 3. Process one at a time (sequential, not parallel)
  // 4. Per success: remove from queue, show mini-toast
  // 5. Per failure: increment retryCount, keep in queue
  //    (crew decides to delete via queue list)
});
```

### Queue List UI

Accessible from FAB long-press or queue badge tap:

```
+-------------------------------+
|  Queued Receipts (2/5)   X    |
|-------------------------------|
|  +-------------------------+  |
|  | [thumb]  Mar 18, 2:30pm |  |
|  |          Queued         |  |
|  |               [Delete]  |  |
|  +-------------------------+  |
|  | [thumb]  Mar 18, 1:15pm |  |
|  |          Failed (x2)    |  |
|  |               [Delete]  |  |
|  +-------------------------+  |
|                               |
|  [ Upload All Now ]           |
+-------------------------------+
```

---

## Dedup (3 Layers)

| Layer | Where | Key | Action |
|-------|-------|-----|--------|
| Phone | IndexedDB | File hash (size + name + timestamp) | Prevent re-queuing same photo |
| Server | Neon `cal_receipts` | vendor + amount + date | Warn "possible duplicate" in response |
| Drive | Drive folder listing | invoice# from AI | Exact match = skip, partial = save with `---` suffix |

### Server-Side Dedup Check (in receipt-v1.js)

```javascript
// After AI extraction, before filing:
const dupes = await sql`
  SELECT id, vendor, amount, receipt_date, jobcode_name
  FROM cal_receipts
  WHERE vendor = ${vendor}
    AND amount = ${amount}
    AND receipt_date = ${date}
    AND created_at > NOW() - INTERVAL '30 days'
`;
if (dupes.length > 0) {
  result.duplicateWarning = {
    message: 'Possible duplicate receipt',
    existingId: dupes[0].id,
    existingJob: dupes[0].jobcode_name,
  };
}
// Still file it -- just warn crew. They decide.
```

---

## Neon Schema Changes

### New Tables

```sql
CREATE TABLE supplier_aliases (
  id SERIAL PRIMARY KEY,
  raw_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  UNIQUE(raw_name)
);
-- Seed with 260+ rows from GScript Aliases_S

CREATE TABLE jobcode_aliases (
  id SERIAL PRIMARY KEY,
  raw_name TEXT NOT NULL,
  enhanced_code TEXT NOT NULL,
  address TEXT,
  UNIQUE(raw_name, enhanced_code)
);
-- Seed with GScript Aliases_J data
```

### Alter cal_receipts

```sql
ALTER TABLE cal_receipts ADD COLUMN invoice_no TEXT;
ALTER TABLE cal_receipts ADD COLUMN txn_time TEXT;
ALTER TABLE cal_receipts ADD COLUMN cc4 TEXT;
ALTER TABLE cal_receipts ADD COLUMN document_type TEXT;
ALTER TABLE cal_receipts ADD COLUMN is_receipt BOOLEAN DEFAULT true;
ALTER TABLE cal_receipts ADD COLUMN handwritten_name TEXT;
ALTER TABLE cal_receipts ADD COLUMN drive_file_name TEXT;
ALTER TABLE cal_receipts ADD COLUMN crew_name TEXT;
```

---

## Image Feedback Toggle

Build both, Sam toggles to compare:

### Option A: Server-Processed Image

- Sharp processes image on server (already done)
- Return `processedImageBase64` in API response (~50-200KB extra)
- Display in modal with green checkmark overlay
- Pro: highest quality, consistent across devices
- Con: adds payload size, requires connection

### Option B: Client-Side Canvas

- Process on-device using HTML5 Canvas API
- Auto-rotate (from EXIF), normalize contrast, sharpen (convolution kernel)
- Pro: instant, works offline, no bandwidth
- Con: lower quality than Sharp, inconsistent across browsers

### Toggle

- Settings toggle in ReceiptScanModal or app settings
- Default: server-processed (Option A)
- Fallback: client-canvas (Option B) when offline
- Both show green checkmark overlay on verified image

---

## Dependencies to Add

| Package | Where | Purpose |
|---------|-------|---------|
| `pdf-lib` | Micro-Bridge | PDF generation with metadata |
| `idb` | CalExp5 | IndexedDB wrapper (typed, promise-based, 1.2KB) |

---

## Build Order

| Phase | What | Effort |
|-------|------|--------|
| 1 | Enhanced AI prompt (10 fields + per-field confidence) | Medium |
| 2 | Backend intelligence (guardrail, aliases, jobcode cascade, R/B, contamination) | Large |
| 3 | Filename convention + PDF output + Drive metadata | Medium |
| 4 | Revised UX (4 heroes, confidence borders, image display) | Medium |
| 5 | Offline queue (IndexedDB, auto-upload, toast, queue list, gallery) | Large |
| 6 | Dedup (phone + server + Drive) | Medium |
| 7 | Image toggle (server vs canvas) | Small |
| 8 | Neon schema changes + seed alias data | Medium |

---

## GScript Retirement (after all phases)

- [ ] Disable `ENABLE_Crew` in Settings_Global
- [ ] Remove crew code paths in processReceipt()
- [ ] Keep all non-crew vendor logic (SanLorenzo, Hayward, HomeDepot)
- [ ] Archive as v7.34 with retirement note
- [ ] Verify BB Scan receipts in same Drive folder structure
- [ ] Verify filename convention matches
- [ ] Verify metadata searchability
