# BB Scan — GS_Receipts Crew Section Analysis | 2026-03-18 | BB

## Purpose

Analysis of `MultiVendorReceiptProcessor-v7.33.gs` crew receipt handling.
Goal: incorporate all battle-tested logic into BB Scan (CalExp5 + Micro-Bridge),
then retire the crew section of the Google Apps Script.

---

## What the GScript Does (Crew Section)

The GScript processes crew-submitted receipt photos that arrive via email.
Crew takes photo → emails it → script runs on timer → extracts data via AI →
saves renamed PDF to Drive with embedded metadata.

BB Scan replaces the email step: crew taps FAB → camera → done.
But the **post-capture intelligence** is what needs porting.

---

## Gap Analysis: GScript vs BB Scan Current

### 1. AI PROMPT — Extraction Fields

**GScript extracts 10 fields (v7.32 minimal prompt):**

| # | Field | GScript | BB Scan Current | Gap |
|---|-------|---------|-----------------|-----|
| 1 | `handwrittenName` | Crew writes client/job name by hand on receipt. AI looks for pen/marker text separate from printed text | Not extracted | MISSING — critical for jobcode matching |
| 2 | `storeName` | Brand/chain name. Secondary hints: URLs, rewards programs, survey links, email domains. Franchise detection (local abbreviation → real brand) | `vendor` — basic store name only | WEAK — no franchise detection, no secondary hints |
| 3 | `invoiceNo` | Receipt/transaction/invoice number | Not extracted | MISSING |
| 4 | `invoiceDate` | Date in M/DD/YY format | `date` in YYYY-MM-DD | OK (different format) |
| 5 | `txnTime` | Time in HH:MM 24hr format | Not extracted | MISSING — needed for filename |
| 6 | `total` | Final total (negative for returns/credits) | `amount` | OK (no negative support) |
| 7 | `cc4` | Last 4 digits of credit card | Not extracted | MISSING — needed for Receipt vs Bill classification |
| 8 | `printedJobRef` | Printed PO/job reference (NOT buyer name) | Not extracted | MISSING — secondary jobcode source |
| 9 | `allDatesFound` | ALL dates visible anywhere on document | Not extracted | MISSING — needed for date year voting |
| 10 | `documentType` | `receipt` / `invoice` / `paid_invoice` | Not extracted | MISSING — needed for R_ vs B_ prefix |

### 2. STORE NAME RESOLUTION (3-tier)

**GScript has a 3-tier store identification pipeline:**

1. **Primary extraction** — AI reads logo/header/business name
2. **Franchise detection** — If top shows abbreviation (e.g., "RGH"), AI checks:
   - URLs/websites (`TalkTo.AceHardware.com` → Ace Hardware)
   - Email addresses (domain reveals brand)
   - Loyalty/rewards program names (`ACE REWARDS` → Ace Hardware)
   - Survey links
   - "Thank you for shopping at X" text
3. **Retry (`retryStoreName()`)** — If still unknown or contaminated:
   - Separate focused AI call with franchise-detection prompt
   - Uses Sonnet 4.6 for better reasoning on hard cases
   - Contamination check: if storeName matches jobcode, it's wrong
   - Handles null (Unknown) and contaminated (customer name in store field) separately

**BB Scan current:** Single field `vendor` in the AI prompt. No franchise detection, no retry, no contamination check.

### 3. SUPPLIER ALIASES (Store Name Normalization)

**GScript:** `Aliases_S` sheet maps raw store names → canonical names.
- "The Home Depot", "HOME DEPOT", "HD" → all become `HomeDepot`
- 260+ aliases auto-populated from QBO vendor data
- Exact match first, then partial match (substring)
- Applied via `sanitizeStoreName()` before filename generation

**BB Scan current:** No supplier alias table. Raw AI output used directly.

**Need:** `supplier_aliases` table in Neon (or hardcoded map). Same exact/partial matching logic.

### 4. JOBCODE RESOLUTION (Priority Chain)

**GScript crew jobcode flow (v7.27 — simplified from v7.23 voting):**

```
1. AI handwritten text → enhanceJobcode() alias lookup → DONE if matched
2. Email subject line → alias lookup → DONE if matched
3. Neither matched → Review folder (default jobcode "UNKNOWN")
```

**enhanceJobcode() matching hierarchy (5 levels):**

| Priority | Method | Example |
|----------|--------|---------|
| 1 | Exact match | `"eklund"` → `"Eklund"` |
| 2 | Partial match (substring) | `"erick + jill eklund"` contains `"eklund"` → `"Eklund"` |
| 3 | Word-in-alias match | Word `"eklund"` found inside key `"erick + jill eklund"` → `"Eklund"` |
| 4 | Address reverse lookup | `"112 westmoor ct"` → `"Eklund"` (via Aliases_J column C) |
| 5 | Fuzzy similarity (50% threshold) | Levenshtein distance → best match |
| 6 | Default | `"XXXXXX"` or vendor DEFAULT_JOBCODE |

**BB Scan current:** Jobcode list from `cal_jobcodes` table passed to Sonnet 4.6. AI does direct matching. No alias table, no fuzzy matching, no fallback chain.

**Need:** Port `enhanceJobcode()` logic. CalExp5 already has jobcode data from QBT — need alias mapping table + the 5-level matching cascade.

### 5. CROSS-FIELD CONTAMINATION CHECK

**GScript (v7.25):** After jobcode resolution, checks if `storeName` matches the jobcode:
- `storeName == enhancedJobcode`? → contaminated
- `storeName` is a known alias in Aliases_J? → contaminated
- If contaminated → `retryStoreName()` with exclusion hint
- If retry fails → `storeName = "Unknown"` + review flag

**BB Scan current:** No contamination check. AI could put "Eklund" as both vendor and jobcode.

### 6. DATE INTELLIGENCE (3-layer)

**GScript has 3 layers of date protection:**

#### Layer 1: Date Context Hints (v7.32, crew-only)
- Before AI extraction, analyzes email metadata for date signals
- Sources: email sent date, subject dates, body text dates, filename dates (Microsoft Lens format)
- Scored by confidence (HIGH: 2+ signals agree, MEDIUM: email date only)
- Single hint injected into AI prompt: "receipt is from approximately March 6, 2026"

#### Layer 2: Date Year Voting (v7.25, receipts only)
- After extraction, all dates on the document vote on the correct year
- Inner vote: AI dates self-correct (3 say 2026, 1 says 2020 → 2026 wins)
- Outer vote: AI consensus vs context anchor (email/file timestamp)
- Context always wins ties (it's from Google servers, not OCR)
- Can RECOVER null dates from `allDatesFound` or context timestamp

#### Layer 3: Date Guardrail (v7.25, all documents)
- Validates every date after all corrections
- Rejects: future dates, dates before Jan 1 of prior year
- Catches OCR errors: "2026" misread as "2020" (6→0 confusion)
- Auto-corrects year using context date when guardrail fails

**BB Scan current:** AI returns date, used as-is. No voting, no guardrail, no OCR error correction.

**Need:** Port guardrailDate() at minimum. Year voting valuable but optional (phone photos are usually higher quality than emailed scans, reducing OCR errors).

### 7. RECEIPT vs BILL CLASSIFICATION (R_ vs B_)

**GScript (v7.25):**
```
IF AI says "invoice" → B_ (always)
IF AI says "receipt" or "paid_invoice" AND has CC last 4 → R_
IF no AI classification → CC + amountPaid logic (backward compat)
```

This determines the `R_` or `B_` prefix on the filename. Critical for accounting:
- `R_` = Receipt (paid at point of sale, has CC transaction)
- `B_` = Bill (invoice to be paid later, or no payment shown)

**BB Scan current:** No R/B classification. Files saved as generic `.jpg`.

### 8. FILENAME CONVENTION

**GScript crew filename:**
```
{R_|B_}{StoreName}_{EnhancedJobcode}_{DateCode}{TimeCode}{AmountCode}.pdf

Examples:
R_HomeDepot_Eklund_D031826T1430C24783.pdf
B_SanLorenzo_Smith_D031526T9999C15622.pdf
R_AceHardware_UNKNOWN_D031726T0930C8950.pdf
```

| Segment | Format | Notes |
|---------|--------|-------|
| Prefix | `R_` or `B_` | Receipt vs Bill |
| StoreName | Max 20 chars, no spaces, no special chars | Through sanitizeStoreName() + supplier aliases |
| JobCode | Enhanced jobcode from alias chain | Through enhanceJobcode() |
| DateCode | `DMMDDYY` | D + 2-digit month + 2-digit day + 2-digit year |
| TimeCode | `THHMM` | T + 24hr time. `T9999` if no time found |
| AmountCode | `C{digits}` or `C-{digits}` | C + cents with no decimal. Negative for returns |
| Extension | `.pdf` | Always PDF, even if source was JPEG |

**BB Scan current:** `{date}_{vendor}_{crew}.jpg` — missing jobcode, amount, time, R/B prefix, and it's JPEG not PDF.

### 9. FILE METADATA (Google Drive File Description)

**GScript embeds this in every file's Drive description:**
```
BBInc Receipt | Vendor: HomeDepot | Job: Eklund | Date: 3/18/26 | Time: 1430 | Total: $247.83 | CC: x1234 | Ref#: 6968 00063 32324
```

Fields: Vendor, Job, Date, Time, Total, CC last 4, Invoice/Ref#

This makes every receipt searchable in Google Drive by any field.

**BB Scan current:** No metadata on uploaded files.

### 10. IMAGE PROCESSING

**GScript image pipeline:**
- EXIF orientation detection (free, instant — `parseExifOrientation()`)
- If sideways → rotation hint added to AI prompt ("this image is rotated 90° clockwise")
- PDF conversion via Google Slides (preserves quality, applies rotation)
- `convertImageToPdfWithRotation()` for rotated images
- `convertImageToPdf()` for normal orientation

**BB Scan current:** Sharp does auto-rotate (EXIF), resize, normalize, sharpen → JPEG only. No PDF conversion, no rotation hint to AI.

### 11. DUPLICATE DETECTION

**GScript:**
- Builds index of all files in destination folder (by invoice#)
- Exact match (same invoice#, total, date, job) → SKIP
- Partial match (same invoice# but differs) → save with `---` suffix
- EMAIL mode: also checks exact filename match in Drive folder

**BB Scan current:** No duplicate detection.

### 12. VALIDATION + RETRY + REVIEW

**GScript validation pipeline:**
1. `validateExtraction()` — checks ALL metadata fields
2. If any missing → `retryExtractionWithGemini()` with fresh context
3. If still missing jobcode only → `extractJobcodeWithTriangulation()` (alias-based search prompt)
4. If still incomplete → `saveToReviewFolder()` with proper filename + metadata
5. Non-critical missing fields (invoiceNo for crew) → continue pipeline, just flag for review

**BB Scan current:** If AI returns error → show error to crew. No retry, no partial save, no review queue.

### 13. NEGATIVE AMOUNTS (Returns/Credits)

**GScript:** Supports negative totals for returns/credits.
- Amount code: `C-7533` for -$75.33
- AI prompt explicitly requests negative values
- Preserves sign through entire pipeline

**BB Scan current:** No negative amount handling.

---

## Implementation Plan — What to Port

### Must Have (retire GScript crew section)

| # | Feature | Where | Effort |
|---|---------|-------|--------|
| 1 | **Enhanced AI prompt** — add all 10 fields (handwrittenName, storeName with franchise hints, invoiceNo, txnTime, cc4, printedJobRef, allDatesFound, documentType) | `receipt-ai.js` | Medium |
| 2 | **Filename convention** — `{R_|B_}{Store}_{Job}_{DateCode}{TimeCode}{AmountCode}.pdf` | `receipt-v1.js` + new `receipt-filename.js` | Medium |
| 3 | **PDF output** — convert processed JPEG to PDF with metadata embedded | `receipt-image.js` + add `pdf-lib` | Medium |
| 4 | **File metadata** — embed searchable description in Drive file properties | `google-drive.js` | Small |
| 5 | **Supplier aliases** — store name normalization (Neon table or hardcoded) | New `receipt-aliases.js` | Medium |
| 6 | **Jobcode resolution** — port `enhanceJobcode()` 5-level cascade | New or extend `receipt-ai.js` | Medium |
| 7 | **R/B classification** — Receipt vs Bill from documentType + cc4 | `receipt-v1.js` | Small |
| 8 | **Date guardrail** — reject future dates, dates > 13 months old, OCR year correction | New `receipt-validation.js` | Small |
| 9 | **Contamination check** — if storeName == jobcode, retry store extraction | `receipt-v1.js` | Small |
| 10 | **Return hero fields to crew** — add invoiceNo, txnTime, cc4, documentType to frontend | `ReceiptScanModal.jsx` | Small |

### Nice to Have (Phase 2)

| # | Feature | Notes |
|---|---------|-------|
| 11 | Date year voting (multi-source) | Phone photos are higher quality than email scans — less OCR error |
| 12 | Duplicate detection | Check `cal_receipts` before filing |
| 13 | Retry pipeline (validation → fresh AI call → triangulation) | Current single-shot is usually good enough with Sonnet 4.6 |
| 14 | Review queue UI | Show flagged receipts for Sam to verify |
| 15 | Negative amount support | Returns/credits with `C-` prefix |
| 16 | Store name retry with Sonnet 4.6 | For hard franchise cases — expensive but more accurate |

---

## Data Tables Needed

### `supplier_aliases` (new Neon table)
```sql
CREATE TABLE supplier_aliases (
  id SERIAL PRIMARY KEY,
  raw_name TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL
);
```
Seed with existing `Aliases_S` data (260+ rows from QBO vendor data).

### `jobcode_aliases` (new Neon table or reuse cal_jobcodes)
```sql
CREATE TABLE jobcode_aliases (
  id SERIAL PRIMARY KEY,
  raw_name TEXT NOT NULL,
  enhanced_code TEXT NOT NULL,
  address TEXT
);
```
Seed with existing `Aliases_J` data. The `address` column enables address reverse lookup.

### Existing `cal_receipts` — add columns:
```sql
ALTER TABLE cal_receipts ADD COLUMN invoice_no TEXT;
ALTER TABLE cal_receipts ADD COLUMN txn_time TEXT;
ALTER TABLE cal_receipts ADD COLUMN cc4 TEXT;
ALTER TABLE cal_receipts ADD COLUMN document_type TEXT;
ALTER TABLE cal_receipts ADD COLUMN is_receipt BOOLEAN DEFAULT true;
ALTER TABLE cal_receipts ADD COLUMN handwritten_name TEXT;
ALTER TABLE cal_receipts ADD COLUMN drive_file_name TEXT;
```

---

## Retirement Checklist

Once BB Scan has features #1-10 above:

- [ ] Disable `ENABLE_Crew` in Settings_Global (set to FALSE)
- [ ] Remove Settings_Crew tab
- [ ] Remove crew-specific code paths in processReceipt() (gated by `IS_CREW_RECEIPT`)
- [ ] Remove buildCrewPrompt() and buildCrewPrompt_v731()
- [ ] Remove crew-specific sections in parseExtractedData()
- [ ] Keep all non-crew vendor logic (SanLorenzo, Hayward, HomeDepot) — those stay in GScript
- [ ] Archive GScript as v7.34 with "Crew section retired — moved to BB Scan" note
- [ ] Verify BB Scan receipts appear in same Drive folder structure
- [ ] Verify BB Scan filename convention matches GScript format
- [ ] Verify metadata searchability in Drive

---

## Key Insight

The GScript has been battle-tested across 7+ major versions of crew receipt handling.
The hardest problems it solved:

1. **Franchise stores** — local abbreviations hide the real brand name
2. **Handwritten text** — crew writes job name by hand, AI must distinguish from printed text
3. **Date OCR errors** — "2026" misread as "2020" (6→0 is common)
4. **Cross-field contamination** — AI puts customer name in store field or vice versa
5. **Store name → jobcode confusion** — same text could be either

BB Scan must handle all 5 of these or crew will hit the same edge cases.
The good news: phone camera → Sonnet 4.6 is higher quality input than email-forwarded-scan → Gemini,
so some edge cases (especially date OCR) will be less frequent.
