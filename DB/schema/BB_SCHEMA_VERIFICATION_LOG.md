# BB Platform Schema Verification Log | v1.0 | 2026-03-14 | BB

## 3-Zero Protocol: Repeat verification until 3 consecutive waves return 0 gaps

---

## WAVE 1 RESULTS (2026-03-14)

### Summary: 344+ total gaps across 10 apps (BB_Desktop_Relay = 0)

| App | Gaps Found | Severity | Key Issues |
|-----|-----------|----------|------------|
| CalExp5 | 19 | MEDIUM | 3 localStorage caches, 3 IndexedDB stores, _segments array, 4 missing enums, incomplete JSONB docs, missing Section 6.2 settings |
| TS_Exp5 | 15+ | HIGH | PTO data handling contradiction, payType undocumented, QBT Custom Field Registry no table, Auto-Lunch processing flow unmapped, field name mismatches (workStartTime vs workSchedule.startTime), lunch.defaultEnd missing, 20+ validation settings |
| RevExp5 | 18 | HIGH | Invoice fields undocumented (contractNumber, attachments, nested payment/labor/materials), cycle snapshots missing ~20 projection fields, 11 settings undocumented, estimate field mismatches (vendorMappings, segmentOrder), labor reconciliation undocumented |
| PorjExp5 | 65+ | CRITICAL | Properties table missing 17+ fields, vendor dataset ambiguity (subs vs vendors-dir vs suppliers), master items field name mismatches (seq vs order, defaultBy vs by), no ProjExp5 in Section 6.2, project state persistence undefined, 6 localStorage keys unmapped |
| BB-DocEngine | 50+ | HIGH | 5 missing tables (binder-settings, qbo-vendors cache, qbo-notes-backup, suppliers pipeline, ignore-list), 20+ missing fields, 50+ missing enums (39 trades, 8 doc types, 4 watermark types), QBO Notes sync undocumented, estimate template items have 20+ fields per item |
| Invoice_Validate2 | 40+ | HIGH | 4 missing tables (validation_checks, vendor_patterns, suppressions, receipt queue), 20+ missing fields (Landfill markup tracking, labor validation), 15 check names need enumeration, receipt match needs exact/fuzzy/duplicate, 12 settings, 11 config constants |
| GS_Receipts | 85+ | CRITICAL | 9 receipt extraction fields missing (handwrittenName, printedJobRef, allDatesFound, documentType, txnTime, storeName, extractionMethod, isReceipt), Aliases_J 3-column structure, Aliases_S keyed lookup not tags, ~20 global + ~25 per-vendor settings, 20+ log columns |
| Chase_Expense | 22+ | HIGH | Transaction objects 8-12 fields vs schema ~5, validation result structure undocumented, cardholder reverse lookup needed, fingerprint dedup format undocumented, 8 chrome.storage keys unmapped, no Chase in Section 6.2, dual bridge mode, sideload adapters |
| Adobe eSigner | 30+ | HIGH | 3 missing tables (section_templates, config, signers), field structure mismatch (nested pages[].fields vs flat array), esign_agreements missing 7 fields, esign_overlay_registry missing 9 fields, signer objects wrong shape, missing enums |
| Landfill_Surcharge | 20+ | MEDIUM | 9 missing fields in lf_surcharge_calculations, missing status/surcharge enums, attachment handling undocumented, crew assignment mapping, session state persistence, markup formula undocumented |
| BB_Desktop_Relay | 0 | PASS | Schema 100% accurate. Pure infrastructure relay, no persistent data. |

---

### Detailed Findings by Category

#### A. Missing Tables (New tables needed)
1. `cal_error_logs` - CalExp5 API error history
2. `cal_upload_logs` - CalExp5 upload tracking
3. `cal_jobcode_cache` - CalExp5 jobcode sort order
4. `ts_auto_lunch_runs` - TS_Exp5 auto-lunch processing records
5. `ts_qbt_custom_fields` - TS_Exp5 QBT custom field metadata
6. `doc_binder_settings` - BB-DocEngine binder generation config
7. `doc_qbo_notes_backup` - BB-DocEngine QBO notes sync backup
8. `inv_validation_checks` - Invoice_Validate2 structured check results
9. `inv_validation_suppressions` - Invoice_Validate2 user suppressions
10. `receipt_vendor_patterns` - Invoice_Validate2 vendor filename patterns
11. `esign_section_templates` - Adobe eSigner section template registry
12. `esign_config` - Adobe eSigner Adobe Sign credentials/config
13. `esign_signers` - Adobe eSigner contractor profiles
14. `lf_surcharge_sessions` - Landfill_Surcharge session state

#### B. Missing Fields in Existing Tables
- `customers`: syncSource, qboSyncToken, qboLastUpdated, syncedAt
- `properties`: 17+ fields (geocoding, real estate, media, URLs, dataConfidence, propertyType)
- `vendors`: _userEdited tracking, inSubs/inVendors pipeline flags, autoTrade
- `work_jobcodes`: Aliases_J 3-column structure (address column)
- `master_items`: Field name clarification (seq vs order, defaultBy vs by)
- `employees`: payType compensation field
- `cal_user_settings.details`: Full JSONB structure (myTimeColor, crewColor, entryMode, logLevel, etc.)
- `cal_manual_hours.details`: _segments array structure
- `rev_cycle_snapshots.details`: ~20 projection/temporal fields
- `rev_estimates`: vendorMappings, segmentOrder, sectionTotals, line item notes/hours
- `esign_agreements`: participants, fieldsApplied, pages, contractNumber, projectName, projectAddress, projectLabel
- `esign_overlay_registry`: file, displayOrder, name, variant, pageSize, fieldCount, pagesWithFields
- `lf_surcharge_calculations`: 9 missing fields (surcharge, markupPct, salesAmt, etc.)
- `chase_validation_sessions.transactions`: 7+ missing fields per transaction

#### C. Missing Enums / Status Values
- CalExp5: entryMode, viewMode, logLevel, AUDIT_ACTIONS (16 values), ENTITY_TYPES, HOURS_TYPES, SOURCES
- TS_Exp5: Auto-Lunch action values (upload/skip/lock)
- RevExp5: invoice status, date class, margin class, overdue status, projection scenarios
- PorjExp5: project phases (8 values), propertyType, document type codes
- BB-DocEngine: 39 trades, 8 document type codes (ES/TM/XB/XC/XD/CO/BD/SG), 4 watermark types
- Invoice_Validate2: 15 check names, check result types, receipt match status (exact/fuzzy/duplicate), landfill markup status, labor type markers
- GS_Receipts: result status (SUCCESS/REVIEW/SKIPPED/DRY_RUN), documentType, extractionMethod
- Chase_Expense: category values, bridgeMode, source values (6 types)
- Adobe eSigner: agreement statuses (in-process, completed), field types (signature/initials/date), signer roles, document types (6 values)
- Landfill_Surcharge: status (new/skipped/applied/error), surcharge options (0/50/100)

#### D. Missing Settings (Section 6.2)
- CalExp5: defaultView, entryMode, logLevel, disablePastDays, showMockData, exportUploadLog
- TS_Exp5: qbtCustomFieldIds, specialJobcodes, companyHolidays, payPeriodConfig, validationCheckOverrides, lunchAssignmentRequired
- RevExp5: 11 fields (invoiceStartDate, invoiceEndDate, cycleAnchorDate, defaultGroup, futureRevTarget, claudeApiMode, fullAiMode, themeMode, revenueTargetLabor/NonLabor/Markup, avgBillRate, cycleProjections, estimateSourceFolder)
- PorjExp5: laborRate, hrsPerDay, tierMult, skipPreAssigned, userTemplates, templateOverrides, directory sort settings
- BB-DocEngine: officers array, per-doc-type metadata, document type registry, file settings, company info, watermark config details
- Chase_Expense: bridgeUrl, dateRange, debugMode, bridgeMode
- GS_Receipts: ~20 global settings + ~25 per-vendor settings
- Adobe eSigner: directory paths (inputDir, outputDir, exportsDir)
- Landfill_Surcharge: bridgeUrl, apiKey missing from seed data

#### E. Missing Migration Mappings (Section 9)
- CalExp5: Detailed Zustand→table mappings, 3 localStorage caches, 3 IndexedDB stores
- TS_Exp5: unified-settings.json structure, Auto-Lunch data directory
- RevExp5: Invoice caching strategy, estimate file discovery mechanism
- PorjExp5: 6 localStorage keys, project state persistence, template overrides, vendors-dir.json
- BB-DocEngine: binder-settings.json, qbo-vendors.json, qbo-notes-backup.json, suppliers.json, ignore-list.json
- Invoice_Validate2: chrome.storage keys, validation results, suppressions, receipt matcher state
- GS_Receipts: global settings sheet, per-vendor settings sheets, log sheet columns, extracted receipt data
- Chase_Expense: 8 chrome.storage keys, cardholder mappings, fingerprint format
- Adobe eSigner: adobe-sign-config.json, section template files, contractor profiles, PDF metadata keywords
- Landfill_Surcharge: session state, crew assignments, attachment cache

#### F. Structural Issues
- esign_overlay_registry: fields stored as nested pages[pageNum].fields, not flat array
- GS_Receipts: Aliases_J is 3-column (RawName, EnhancedCode, Address), not simple tags
- GS_Receipts: Aliases_S is keyed lookup (RawName→CanonicalName), not tags
- Chase_Expense: cardLast4 enrichment needs reverse lookup capability
- PorjExp5: subs.json vs vendors-dir.json relationship unclear
- TS_Exp5: PTO data contradiction (schema says fetch live, app stores with versioning)

---

## WAVE 2 RESULTS (2026-03-14)

### Summary: 68 total gaps across 8 apps (3 PASS: RevExp5, GS_Receipts, BB_Desktop_Relay)

| App | Wave 1 | Wave 2 | Delta | Severity | Key Issues |
|-----|--------|--------|-------|----------|------------|
| CalExp5 | 19 | 3 | -16 | MEDIUM | Enrichment fields (defaultCrew, scheduleColor, jobcode color/sortOrder) defined but not consumed by code; missing defaultView in settings example |
| TS_Exp5 | 15+ | 6 | -9 | HIGH | PTO field naming inconsistency (unpaidYTD vs unpaidAvailable), missing sickUsedYTD/vacationUsedYTD on active employees, PTO volatility note contradicts local caching with lastUpdated/source, workScheduleType nesting mismatch, payType "hourly" enum value unused |
| RevExp5 | 18 | 0 | -18 | PASS | All 18 Wave 1 gaps confirmed fixed |
| PorjExp5 | 65+ | 13 | -52 | CRITICAL | geocodeStatus enum missing 'verified', streetViewUrl redundancy, master_items field name mismatches (seq/hrs/nonLabor not in mapping), estimate templates ps vs sequence, vendors name vs displayName, vendors missing company field, customers missing companyName, duration encoding (durVal+durUnit vs durationWeeks) |
| BB-DocEngine | 50+ | 7 | -43 | MEDIUM | Estimate template item fields incomplete (durVal, schedDur, bufL, bufR, crew, sources), salesHistory structure mismatch (lastPrice/lastDate vs lastSalePrice/lastSaleDate + URLs inside object), googleMapsEmbedUrl placement ambiguity, QBO notes sync write-back detail missing, trade field optionality |
| Invoice_Validate2 | 40+ | 18 | -22 | HIGH | Check names mismatch (17 in code vs 15 in schema, wording differs), VALID_CATEGORIES 7 discrepancies (Sub vs Sub-Con, etc.), VALID_EMPLOYEES drastically incomplete (6 vs 17), 4 tables never written to by code (all in-memory), suppressions use localStorage not DB, receiptFilenamePatterns/customerLastName unused by code |
| GS_Receipts | 85+ | 0 | -85 | PASS | All 85+ Wave 1 gaps confirmed fixed |
| Chase_Expense | 22+ | 9 | -13 | HIGH | API response contract undefined (summary structure), chrome.storage key naming inconsistency (bbCardholders vs chase-cardholders), cardholder source still hardcoded not Neon, sideload adapter field gaps, attachment metadata structure undefined, bridge mode not explained, settings update IPC pattern undocumented |
| Adobe eSigner | 30+ | 7 | -23 | MEDIUM | customerId link never populated by code, overlay fields dual-schema (pages-nested vs flat .overlay.json), signerType field not used in code, status enum mapping not implemented, Change_Order/Binder missing from registry, participants never fetched from Adobe Sign API, pdfMetadataKeywords structure undefined |
| Landfill_Surcharge | 20+ | 5 | -15 | MEDIUM | lf_surcharge_calculations table never written to (app is entirely localStorage), invoiceBreakdown JSONB structure differs from code runtime, markupPct needs decimal(10,4) not doublePrecision, attachment refetch strategy undocumented, QBO sparse update validation constraints missing |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS | Confirmed: pure infrastructure relay, zero persistent data |

---

### Wave 2 Detailed Findings by Category

#### A. Schema-Code Architecture Mismatches (Tables defined but code doesn't write to them)
1. `inv_validation_runs` — Code generates results in-memory only, never persists to DB
2. `inv_validation_checks` — Code runs checks but never saves to DB
3. `inv_receipt_matches` — Code calculates matches but only stores in memory
4. `inv_validation_suppressions` — Code uses localStorage (`bb-suppressed-checks`), not DB
5. `lf_surcharge_calculations` — App is entirely localStorage-based, zero Neon writes

#### B. Field Name Mismatches (JSON source vs schema column name)
1. `master_items.hrs` → schema `defaultHours` (not in field name mapping)
2. `master_items.nonLabor` → schema `defaultNonLabor` (not in mapping)
3. `master_items.seq` → schema `sequence` (acknowledged but not all mappings listed)
4. Estimate template items `ps` → schema `sequence` (not documented)
5. Vendors `name` → schema `displayName` (subs.json and vendors-dir.json)
6. Vendors missing `company` field entirely in schema
7. Customers missing `companyName` field
8. Properties `salesHistory.lastPrice/lastDate` vs schema `lastSalePrice/lastSaleDate`

#### C. Enum Value Gaps
1. `geocodeStatus` missing 'verified' value
2. Invoice_Validate2 check names: 17 in code vs 15 in schema (8 wording differences)
3. `VALID_CATEGORIES`: 7 value discrepancies (Sub vs Sub-Con, Landfill, City, Credit, Fee vs Dump Fees)
4. `VALID_EMPLOYEES`: 6 in schema vs 17 in code (11 missing)
5. `payType`: 'hourly' value appears unused; 'regular' dominates
6. `esign_overlay_registry.docType`: Change_Order and Binder templates don't exist in registry

#### D. Enrichment Fields Defined But Not Consumed
1. CalExp5: `employees.enrichment.defaultCrew` — code uses hardcoded BADGE_COLORS
2. CalExp5: `employees.enrichment.scheduleColor` — not referenced
3. CalExp5: `work_jobcodes.enrichment.color` — code derives colors algorithmically
4. CalExp5: `work_jobcodes.enrichment.sortOrder` — code uses recent usage order
5. Invoice_Validate2: `vendors.enrichment.receiptFilenamePatterns` — code uses hardcoded VENDOR_PATTERNS
6. Invoice_Validate2: `work_jobcodes.enrichment.customerLastName` — not referenced
7. Invoice_Validate2: `work_jobcodes.enrichment.propertyAddress` — not referenced

#### E. Structural Mismatches
1. `esign_overlay_registry.fields`: Dual schema — code handles BOTH `data.pages` (section files) and `data.fields` (flat .overlay.json)
2. `properties.salesHistory`: Code uses `{ lastPrice, lastDate, zillowUrl, redfinUrl }` object, not array with separate lastSalePrice/lastSaleDate
3. `lf_surcharge_calculations.invoiceBreakdown`: Code uses flat scanResults keyed by `purchase.Id:lineIdx`, not JSONB array
4. Estimate template items missing: `durVal`, `schedDur`, `bufL`, `bufR`, `crew`, `sources` array structure

#### F. PTO Data Model Issues
1. `unpaidYTD` vs `unpaidAvailable` — inconsistent naming across employees
2. Active employees missing `sickUsedYTD`/`vacationUsedYTD` fields
3. Schema says "don't persist PTO" but code stores with `lastUpdated`/`source: "qbt"`
4. `unpaidAvailable` field not in schema enrichment definition

#### G. API/Integration Gaps
1. Chase: Bridge API response contract (`{ data: { results: [...], summary: {...} } }`) not documented
2. Chase: Attachment metadata structure (`{ fileName, FileName?, name? }`) not documented
3. Adobe eSigner: customerId population mechanism undefined
4. Adobe eSigner: participants persistence from Adobe Sign API not implemented
5. Landfill: QBO sparse update validation constraints (percent range, error handling) missing

---

## WAVE 3 RESULTS (2026-03-14)

### Summary: ~17 total gaps across 7 apps (4 PASS: RevExp5, GS_Receipts, Chase_Expense, BB_Desktop_Relay)

| App | Wave 2 | Wave 3 | Delta | Key Remaining Issues |
|-----|--------|--------|-------|---------------------|
| CalExp5 | 3 | 1 | -2 | Settings field name: `defaultView` vs `view` (code uses `view`) |
| TS_Exp5 | 6 | 2 | -4 | PTO field naming still inconsistent in live data; sickUsedYTD/vacationUsedYTD not in enrichment registry (Section 5.1) |
| RevExp5 | 0 | 0 | 0 | PASS (2nd consecutive) |
| PorjExp5 | 13 | 3 | -10 | properties.json uses `clientId` not `customerId` (field name mapping needed); salesHistory has BOTH array and object formats across properties; ps/seq dual mapping already documented |
| BB-DocEngine | 7 | 5 | -2 | master-items.json has no `trade` field (assigned during migration); empty trade handling; streetViewUrl redundancy; companyName unused in clients.json; tiers all null (forward-looking) |
| Invoice_Validate2 | 18 | 2 | -16 | Missing check names 16-17 (Suggestion Chk, Pay Option Chk); checkKey format undocumented |
| GS_Receipts | 0 | 0 | 0 | PASS (2nd consecutive) |
| Chase_Expense | 9 | 0 | -9 | PASS (1st) |
| Adobe eSigner | 7 | 2 | -5 | pdfMetadataKeywords structure exists in code but marked TBD; participants built from PDF metadata not API |
| Landfill_Surcharge | 5 | 2 | -3 | Items table deferred creates dependency ambiguity for DB-8; markupPct precision safeguard (store surcharge, derive markup) |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS (3rd consecutive — 3-ZERO ACHIEVED) |

---

## WAVE 4 RESULTS (2026-03-14)

### Summary: 38 total gaps across 10 apps (1 PASS: BB_Desktop_Relay)

| App | Wave 3 | Wave 4 | Delta | Key Issues |
|-----|--------|--------|-------|------------|
| CalExp5 | 1 | 3 | +2 | Missing activeEmployeeIds setting, bb-upload-log entry structure wrong (per-op not batch), bb-audit-log missing from localStorage list |
| TS_Exp5 | 2 | 5 | +3 | Employee enrichment field name mappings incomplete (only workSchedule documented, missing compensation/lunch/mileage/payPeriod), mileageVehicleType missing "none", auto-lunch entries schema incomplete (missing result fields), billedLunches shape wrong, ts_auto_note_runs table missing |
| RevExp5 | 0 | 4 | +4 | Settings default values wrong (marginTarget 32→18, marginStrong 35→25, futureRevTarget 1500000→0, revenueTargetNonLabor 33→25), missing apiKey setting |
| PorjExp5 | 3 | 7 | +4 | Enum mismatches: geocodeStatus missing 'error', propertyType 'condo'→'condo_townhouse' + missing 'lot'/'other', status missing 'sold'/has wrong 'completed', relationship values completely wrong. Missing customers.mobile field, photos type 'streetview'→'street_view', vendor active→isActive mapping |
| BB-DocEngine | 5 | 5 | 0 | doc_contracts: field name mapping (clientId/amount/endDate), missing fields (name/description/type/folderPath), ID format (CON-00001 vs C26001), status missing 'archived'. Overlay fields: rect nesting, signerId vs signer, missing required field |
| Invoice_Validate2 | 2 | 1 | -1 | Stale check count figures (15/17/1-19 should be 20/20/1-20) |
| GS_Receipts | 0 | 7 | +7 | BATCH_LIMIT default wrong (10→50), missing TEST_LABEL, vendor config missing processMode/folderExtractionMethod/maxPages/attachments/docaiProcessorId, fieldHints abstraction doesn't exist in code (7 individual fields) |
| Chase_Expense | 0 | 1 | +1 | IPC message structure wrong (bridgeUrl nested in settings object, not top-level) |
| Adobe eSigner | 2 | 4 | +2 | pdfMetadataKeywords: docType value wrong ("TM_Agreement"→"agreement"), signers is array not string, manifest is array not string, fields is array not integer |
| Landfill_Surcharge | 2 | 1 | -1 | details JSONB has fabricated "rate": 0.12 field that doesn't exist in code |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS (4th consecutive — confirmed) |

---

### Wave 4 Detailed Findings by Category

#### A. Enum/Value Mismatches (13 gaps)
1. PorjExp5: `geocodeStatus` missing 'error' (distinct from 'failed')
2. PorjExp5: `propertyType` — 'condo' should be 'condo_townhouse', missing 'lot' and 'other'
3. PorjExp5: `properties.status` — 'completed' not in code, 'sold' missing from schema
4. PorjExp5: `properties.relationship` — only 'owner' shared; code uses 'rental', 'investment', 'commercial' not 'tenant', 'manager', 'contractor'
5. PorjExp5: `photos[].type` — 'streetview' should be 'street_view'
6. TS_Exp5: `mileageVehicleType` missing 'none' value
7. RevExp5: `marginTarget` default 32→18, `marginStrong` 35→25
8. RevExp5: `futureRevTarget` default 1500000→0
9. RevExp5: `revenueTargetNonLabor` default 33→25
10. GS_Receipts: `BATCH_LIMIT` default 10→50
11. Invoice_Validate2: check count figures stale (15/17/1-19 → 20/20/1-20)
12. BB-DocEngine: `doc_contracts` ID format 'CON-00001' → 'C{YY}{seq3}'
13. BB-DocEngine: `doc_contracts.status` missing 'archived'

#### B. Missing Fields/Settings (12 gaps)
1. CalExp5: `activeEmployeeIds` missing from cal_user_settings.details and app_settings
2. CalExp5: `bb-audit-log` missing from localStorage stores list
3. RevExp5: `apiKey` setting undocumented
4. PorjExp5: `customers.mobile` field missing
5. PorjExp5: vendor `active`→`isActive` field mapping missing
6. BB-DocEngine: `doc_contracts` missing name, description, type, folderPath fields
7. BB-DocEngine: `doc_contracts` field name mapping (clientId/amount/endDate)
8. GS_Receipts: `TEST_LABEL` missing from settings
9. GS_Receipts: vendor config missing processMode, folderExtractionMethod, maxPages, attachments, docaiProcessorId
10. TS_Exp5: employee enrichment field name mappings incomplete (only workSchedule, missing compensation/lunch/mileage/payPeriod)
11. TS_Exp5: `ts_auto_note_runs` table missing entirely
12. Landfill_Surcharge: fabricated `rate: 0.12` field in details JSONB

#### C. Structure/Type Mismatches (8 gaps)
1. CalExp5: `bb-upload-log` entry structure wrong (per-operation records, not batch summaries)
2. Chase_Expense: IPC message structure wrong (bridgeUrl nested in settings object)
3. Adobe eSigner: `pdfMetadataKeywords.docType` value wrong ("agreement" not "TM_Agreement")
4. Adobe eSigner: `pdfMetadataKeywords.signers` is array of objects, not string
5. Adobe eSigner: `pdfMetadataKeywords.manifest` is array of objects, not string
6. Adobe eSigner: `pdfMetadataKeywords.fields` is array of objects, not integer
7. BB-DocEngine: overlay fields use `rect` nesting, `signerId` not `signer`, missing `required`
8. GS_Receipts: `fieldHints` abstraction doesn't exist — 7 individual field config keys

#### D. Schema Completeness (5 gaps)
1. TS_Exp5: auto-lunch entries schema missing result fields (recordId, status, payload, curl, billingRate, etc.)
2. TS_Exp5: billedLunches schema shape doesn't match code (fname/date/customer vs lunchTimesheetId/assignedJobcodeId/userId)
3. BB-DocEngine: doc_contracts field name mapping table needed (like properties/vendors have)
4. TS_Exp5: allowedWindow doubly-nested (workSchedule.allowedWindow.earliest) not single-level
5. GS_Receipts: fieldHints should be 7 individual camelCase fields (fieldInvoiceNo, fieldDate, etc.)

---

## WAVE 5 RESULTS (2026-03-14)

### Summary: 19 total gaps across 9 apps (2 PASS: BB_Desktop_Relay, Landfill_Surcharge)

| App | W4 | W5 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 3 | 2 | -1 | Migration table: wrong source (no data/settings.json, uses Zustand localStorage); bb-audit-log not in migration table |
| TS_Exp5 | 5 | 2 | -3 | Missing lunch.requiredAfterHours in field name mapping; mileageVehicleType in Section 5.1 missing 'none' |
| RevExp5 | 4 | 2 | -2 | revenueTargetMarkup default wrong (10→20); settings.json carries stale pre-v2.3 values |
| PorjExp5 | 7 | 3 | -4 | salesHistory array 'source' field undocumented in migration note; estimate template active→isActive mapping missing; 2 localStorage keys undocumented |
| BB-DocEngine | 5 | 2 | -3 | doc_qbo_notes_backup: originalNotes→oldNotes field name; officers stored as numbered object not array |
| Invoice_Validate2 | 1 | 1 | 0 | Section 3.6 header prose still says "17" checks (should be "20") |
| GS_Receipts | 7 | 3 | -4 | Default values: INCLUDE_IMAGES (true→false), ENABLE_AUTO_ROTATE (false→true), maxRetries (3→1) |
| Chase_Expense | 1 | 1 | 0 | Transaction fingerprint field documented but never attached to objects (computed at runtime) |
| Adobe eSigner | 4 | 3 | -1 | Overlay registry docType label inconsistency; contractors fname/lname mapping missing; keyed object migration note |
| Landfill_Surcharge | 1 | 0 | -1 | PASS (1st consecutive zero) |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS (5th consecutive — confirmed) |

---

## WAVE 6 RESULTS (2026-03-14)

### Summary: 42 total gaps across 7 apps (4 PASS: GS_Receipts, Invoice_Validate2, Landfill_Surcharge, BB_Desktop_Relay)

| App | W5 | W6 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 2 | 3 | +1 | data/settings.json EXISTS (dual persistence with Zustand); migration note incorrectly says "NO data/settings.json"; Section 1 storage column incomplete |
| TS_Exp5 | 2 | 8 | +6 | ts_auto_lunch_runs missing 6 columns (completedAt, startedAt, postFlightVerified/Confidence/Attempts, source, corrections, repairedAt, summary JSONB); entries schema incomplete for migrated-format runs |
| RevExp5 | 2 | 7 | +5 | themeMode missing 'system'; bridgeUrl missing from 6.2; employees cost-rate object missing from 6.2; invoiceStartDate/EndDate are dynamic not static; estimateSourceFolder has no code default |
| PorjExp5 | 3 | 4 | +1 | 6 missing estimate template fields (description, milestones, payments, isBuiltIn, createdBy, exportable); 2 undocumented localStorage keys (bbiPlanner_lastTpl, bbiPlanner_itemDirectory); project-state fields (clientDisplayName, propertyDisplayName, savedAt) not in details schema |
| BB-DocEngine | 2 | 8 | +6 | coverPage missing 4 fields; watermark positions structure undocumented; company.name missing; watchFolder boolean not string; watermarks per-type structure richer than documented; metadata default block missing; estimate-templates wrapper + items→sections mapping; documents.types alias field |
| Chase_Expense | 1 | 7 | +6 | invoiceNo uses raw DD-DDDDDDD format not "SL-" prefix; isReturn field exists (backward compat); settings split between popup/content script; sideload adapters omit fields (balanceDue, products, category); CARDHOLDERS enrichment undocumented |
| Adobe eSigner | 3 | 5 | +2 | sections-registry already uses canonical IDs (migration note wrong); .overlay.json has no docType field (derive from templateId); signers.label missing 'Property Owner 2'; .overlay.json has no name field; .overlay.json signers sub-array undocumented |
| GS_Receipts | 3 | 0 | -3 | PASS (1st consecutive zero) |
| Invoice_Validate2 | 1 | 0 | -1 | PASS (1st consecutive zero) |
| Landfill_Surcharge | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS (6th consecutive — confirmed) |

---

### Wave 6 Detailed Findings by Category

#### A. Missing Columns/Fields on Existing Tables (18 gaps)
1. TS_Exp5: `ts_auto_lunch_runs` missing `completedAt` timestamp column (present in all 5 AL result files)
2. TS_Exp5: `ts_auto_lunch_runs` missing `startedAt` timestamp column (present on auto_note_runs but not auto_lunch_runs)
3. TS_Exp5: `ts_auto_lunch_runs` missing `postFlightVerified` (boolean), `postFlightConfidence` (number), `postFlightAttempts` (integer) columns
4. TS_Exp5: `ts_auto_lunch_runs` missing `source` column (nullable, used for migrated runs: "migrated-from-published-lunches")
5. TS_Exp5: `ts_auto_lunch_runs` missing `corrections` JSONB column (manual post-run corrections array)
6. TS_Exp5: `ts_auto_lunch_runs` missing `repairedAt` timestamp column
7. TS_Exp5: `ts_auto_lunch_runs` missing `summary` JSONB column (success/failed/skipped/locked/alreadyDone counters)
8. TS_Exp5: `ts_auto_lunch_runs.entries` comment missing migrated-format fields (qboTimeActivityId, rate, statusBefore/After, verified, corrected/correctedAt/correctedBy)
9. PorjExp5: `proj_estimate_templates` missing 6 fields (description, milestones, payments, isBuiltIn, createdBy, exportable)
10. PorjExp5: `proj_projects.details` missing clientDisplayName, propertyDisplayName, savedAt
11. Chase_Expense: `transactions.invoiceNo` example wrong ("SL-1234567" → "55-1008795")
12. Chase_Expense: `transactions` missing `isReturn` field (backward-compat alias for isCredit)
13. Adobe eSigner: `esign_agreements.signers.label` missing 'Property Owner 2' value
14. Adobe eSigner: `esign_overlay_registry.name` has no source in .overlay.json (must synthesize on migration)
15. BB-DocEngine: `coverPage` missing showThumbnails, showFileSizes, showDocumentTypes, disclaimer
16. BB-DocEngine: `watermark` missing positions structure, font.opacity, margins, separator
17. BB-DocEngine: `company` missing `name` field
18. BB-DocEngine: estimate-templates items→sections field name mapping undocumented

#### B. Settings/Config Documentation Gaps (15 gaps)
1. RevExp5: themeMode enum missing 'system' value (code supports light/dark/system)
2. RevExp5: bridgeUrl not in Section 6.2 (code default: bb-micro-bridge-production URL)
3. RevExp5: employees cost-rate object not in Section 6.2 (flat {name: rate} map)
4. RevExp5: invoiceStartDate/EndDate are dynamic (1yr back/end next yr) not static strings
5. RevExp5: annualTarget only in TileStore defaults, not in main defaultSettings
6. RevExp5: estimateSourceFolder has no code default (user-value only)
7. PorjExp5: bbiPlanner_lastTpl localStorage key not documented
8. PorjExp5: bbiPlanner_itemDirectory localStorage key not documented
9. BB-DocEngine: watchFolder type is boolean (false) not string ("")
10. BB-DocEngine: watermarks per-type structure richer (text, opacity, rotation, fontSize; 5 missing doc-type keys)
11. BB-DocEngine: metadata missing default block; per-type only has keywords, not full fields
12. BB-DocEngine: documents.types alias field not documented in 6.2
13. Chase_Expense: dateRange/debugMode/bridgeMode never loaded into content script SETTINGS
14. Chase_Expense: sideload adapters omit fields present in scrape mode (balanceDue, products, category)
15. Chase_Expense: CARDHOLDERS employee enrichment on scraped transactions not documented

#### C. Migration/Architecture Notes (9 gaps)
1. CalExp5: Section 9 incorrectly says "NO data/settings.json" — file exists with active endpoints
2. CalExp5: Section 1 storage column missing "File JSON (data/settings.json)"
3. CalExp5: Section 9 missing migration source row for data/settings.json
4. Adobe eSigner: Migration note incorrectly says sections-registry uses human labels — it already uses canonical IDs
5. Adobe eSigner: .overlay.json has no docType field — must derive from templateId on migration
6. Adobe eSigner: .overlay.json signers sub-array (id/role/required/order) undocumented
7. BB-DocEngine: estimate-templates.json wrapped in { "templates": [...] } — not documented
8. TS_Exp5: Section 9 migration mapping incomplete (consequence of missing columns above)
9. PorjExp5: project-state.json structure not enumerated in schema

---

## WAVE 7 RESULTS (2026-03-14)

### Summary: 37 total gaps across 8 apps (3 PASS: GS_Receipts, Landfill_Surcharge, BB_Desktop_Relay)

| App | W6 | W7 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 3 | 3 | 0 | cal_user_settings missing currentUser + workJobcodes fields; loadSettingsFromFile fallback defaults contradict schema (wrong colors, booleans) |
| TS_Exp5 | 8 | 4 | -4 | Missing repairNote column; postFlightAttempts has no source data; billedLunches field mismatch (fname/qbtTimesheetId/addedAt/customer/hours vs schema); payType absent for inactive employees |
| RevExp5 | 7 | 9 | +2 | cycle_snapshots.details: totalRevenue→rev, grossMargin→profit, materialsCost/subsCost not separate; employees category rates wrong (Felipe/Matt/Evan) + 5 missing employees; defaultGroup enum wrong (individual not quarter/year); annualTarget split ownership |
| PorjExp5 | 4 | 2 | -2 | Section 6.2 defaults missing lastTemplate; Section 6.2 missing item_directory category block |
| BB-DocEngine | 8 | 12 | +4 | watermarks ES/TM missing position; CO type inherit→text-logo; default position center not top-right; document_types XB/XC names wrong + 6 aliases wrong; company missing officers; binder company missing address |
| Chase_Expense | 7 | 3 | -4 | dateBuffer hardcoded not from storage; IPC uses chrome.tabs.sendMessage not chrome.runtime; saveHiddenRows fingerprint format inconsistency |
| Adobe eSigner | 5 | 3 | -2 | Section 6.2 api example missing 5 fields; Contract_Overlay→TM_Agreement mapping; .overlay.json staging files not in Section 9 migration |
| Invoice_Validate2 | 0 | 1 | +1 | maxRetries default 1→3 in settings.json |
| GS_Receipts | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| Landfill_Surcharge | 0 | 0 | 0 | PASS (3rd consecutive — 3-ZERO ACHIEVED) |
| BB_Desktop_Relay | 0 | 0 | 0 | PASS (7th consecutive — confirmed) |

---

## WAVE 8 RESULTS (2026-03-14)

### Summary: 34 total gaps across 8 apps (1 PASS: Invoice_Validate2; 2 DONE: BB_Desktop_Relay, Landfill_Surcharge)

| App | W7 | W8 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 3 | 3 | 0 | Section 9 workJobcodes missing NOT-migrated row; entryMode dual-listed in 6.2 + cal_user_settings; Zustand field split undefined (which fields → cal_user_settings vs app_settings) |
| TS_Exp5 | 4 | 5 | +1 | ts_auto_note_runs missing completedAt/postFlightVerified/postFlightConfidence/source columns; corrections entries missing originalReason/customer/hours/qbtTimesheetId; id-crossref.json serviceItems+excludedJobcodes unmapped in Section 9 |
| RevExp5 | 9 | 3 | -6 | byProject field documented but absent from code; rev_estimates field name mapping table missing (customer→customerName, date→estimateDate, duration→durationDays); dual persistence (server-backed settings.json) not noted in Section 9 |
| PorjExp5 | 2 | 2 | 0 | suppliers.json uses inVendors not inVendorsDir (field name mapping gap); TM document type name "Home Improvement Agreement" vs schema "T&M Agreement" |
| BB-DocEngine | 12 | 7 | -5 | Section 3.5 XB/XC names still inconsistent with 6.2; watermark default text empty vs "BAINBRIDGE BUILDERS INC."; ES/TM still type-only (should have full fields); XD missing text/opacity/position; metadata keywords all empty vs actual values; binder bottom-center items missing value/label |
| Invoice_Validate2 | 1 | 0 | -1 | PASS (1st consecutive zero) |
| GS_Receipts | 0 | 8 | +8 | originalSender type array→string; ENABLE_AUTO_ROTATE default true→false; folderSortOrder/emailSortOrder DESC→ASC; defaultJobcode ""→"XXXXXX"; fieldTime ""→"9999"; fieldInvoiceNo "Invoice #"→"Invoice No"; fieldDate/fieldTotal "Date"/"Total"→"Invoice Date"/"Invoice Total" |
| Chase_Expense | 3 | 3 | 0 | sideload-sanlorenzo also omits card field; jobName used by SanLorenzo too (not HD-exclusive); autoVerify loaded from bb_autoVerify key not chase-bb-settings |
| Adobe eSigner | 3 | 3 | 0 | 3Day_Notice_Blank docType not in enum; job-specific overlay (Contract_C25038_Eklund) no derivation rule; non-.overlay.json staging files (v1-binded-contract, Contract_New, etc.) not in Section 9 |
| Landfill_Surcharge | 0 | — | — | DONE (3-ZERO achieved Wave 7) |
| BB_Desktop_Relay | 0 | — | — | DONE (3-ZERO achieved Wave 3) |

---

### Wave 8 Detailed Findings by Category

#### A. Missing Columns/Fields (10 gaps)
1. TS_Exp5: `ts_auto_note_runs` missing `completedAt` column (present in all 6 AN run files)
2. TS_Exp5: `ts_auto_note_runs` missing `postFlightVerified` + `postFlightConfidence` columns (present in all AN run files; only defined on ts_auto_lunch_runs)
3. TS_Exp5: `ts_auto_note_runs` missing `source` column (4 of 6 AN files have "migrated-from-*" values; only defined on ts_auto_lunch_runs)
4. TS_Exp5: `ts_auto_lunch_runs.corrections` entry schema missing `originalReason`, `customer`, `hours`, `qbtTimesheetId` fields
5. BB-DocEngine: watermark `default.text` is `"BAINBRIDGE BUILDERS INC."` not `""` (empty string)
6. BB-DocEngine: watermarks ES/TM show type-only but code has full fields (text, opacity, position, rotation, fontSize)
7. BB-DocEngine: watermark XD missing `text` ("3-DAY NOTICE"), `opacity` (50), `position` ("top-right")
8. BB-DocEngine: metadata per-type keywords have actual values, not empty strings
9. BB-DocEngine: binder bottom-center items missing `value` and `label` fields
10. GS_Receipts: `originalSender` type is comma-separated string, not array

#### B. Field Name / Value Mismatches (9 gaps)
1. PorjExp5: `suppliers.json` uses `inVendors` — schema says `inVendorsDir` (no mapping note)
2. PorjExp5: TM document type `name` is "Home Improvement Agreement" in code vs "T&M Agreement" in schema
3. BB-DocEngine: Section 3.5 XB name "Mechanics Lien / Notice to Owner" vs code "Notice to Owner"
4. BB-DocEngine: Section 3.5 XC name "Certificate of Insurance" vs code "Proof of Insurance"
5. GS_Receipts: `ENABLE_AUTO_ROTATE` default `true` → code `false`
6. GS_Receipts: `folderSortOrder`/`emailSortOrder` default `"DESC"` → code `"ASC"`
7. GS_Receipts: `defaultJobcode` default `""` → code `"XXXXXX"`
8. GS_Receipts: `fieldTime` default `""` → code sentinel `"9999"` (means "no time field")
9. GS_Receipts: `fieldInvoiceNo` `"Invoice #"` → `"Invoice No"`; `fieldDate` `"Date"` → `"Invoice Date"`; `fieldTotal` `"Total"` → `"Invoice Total"`

#### C. Migration/Documentation Gaps (12 gaps)
1. CalExp5: Section 9 `workJobcodes` has no explicit NOT-migrated row
2. CalExp5: `entryMode` listed in both 6.2 app_settings AND cal_user_settings (migration ambiguity)
3. CalExp5: Section 9 Zustand field split undefined (which fields → cal_user_settings vs app_settings)
4. TS_Exp5: id-crossref.json `serviceItems` section has no migration destination in Section 9
5. TS_Exp5: id-crossref.json `excludedJobcodes` section has no migration destination in Section 9
6. RevExp5: `rev_cycle_snapshots.details.byProject` documented but code never builds it
7. RevExp5: `rev_estimates` missing field name mapping table (customer→customerName, date→estimateDate, duration→durationDays)
8. RevExp5: dual persistence (server-backed settings.json via /api/settings) not noted in Section 9
9. Chase_Expense: sideload-sanlorenzo coverage note missing `card` field in omit list
10. Chase_Expense: `jobName` scoped to "HD specific" but SanLorenzo also emits it
11. Chase_Expense: `autoVerify` loaded from `bb_autoVerify` key, not from `chase-bb-settings`
12. Adobe eSigner: `3Day_Notice_Blank` docType not in enum (needs mapping → `3Day_Notice` variant)

#### D. Staging/Forward-Looking Gaps (3 gaps)
1. Adobe eSigner: job-specific overlay `Contract_C25038_Eklund_1767147210651_overlay` has no docType derivation rule
2. Adobe eSigner: non-.overlay.json staging files (v1-binded-contract.json, Contract_New.json, etc.) not in Section 9 migration
3. RevExp5: byProject in cycle_snapshots — either remove or add "forward-looking only" note

---

## WAVE 9 RESULTS (2026-03-14)

### Summary: 22 total gaps across 7 apps (2 PASS: Chase_Expense, Adobe eSigner; 2 DONE: BB_Desktop_Relay, Landfill_Surcharge)

| App | W8 | W9 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 3 | 1 | -2 | activeEmployeeIds in 6.2 defaults conflicts with Section 9 routing to cal_user_settings |
| TS_Exp5 | 5 | 4 | -1 | lunchAssignmentRequired vs lunchAssignment key name; postFlightAttempts absent from AN runs; corrections missing beforeState/afterState/rootCause; qboRealmId unmapped |
| RevExp5 | 3 | 1 | -2 | rev_estimates.lineItems missing isExtra boolean field |
| PorjExp5 | 2 | 5 | +3 | TM watermark text wrong ("T&M AGREEMENT - BB" vs "HOME IMPROVEMENT AGREEMENT - BB"); 4 metadata keyword mismatches (TM/XC/XD/SG) |
| BB-DocEngine | 7 | 8 | +1 | TM doc_types name was reverted incorrectly in v2.7 (should be "T&M Agreement"); 4 metadata keyword exact values wrong (XC/XD/CO/SG); 2 binder label mismatches; qbo-notes-backup displayName unmapped |
| Invoice_Validate2 | 0 | 1 | +1 | chrome.storage popup settings (bridgeUrl, timeout, debugMode) missing from app_settings seed |
| GS_Receipts | 8 | 2 | -6 | ENABLE_AUTO_ROTATE sheet seed contradicts code default; ACCOUNT_HOLDER_NAME missing from GLOBAL_CONFIG declaration |
| Chase_Expense | 3 | 0 | -3 | PASS (1st consecutive zero) |
| Adobe eSigner | 3 | 0 | -3 | PASS (1st consecutive zero) |
| Landfill_Surcharge | — | — | — | DONE |
| BB_Desktop_Relay | — | — | — | DONE |

---

## WAVE 10 RESULTS (2026-03-14)

### Summary: 17 total gaps across 7 apps (1 PASS: Chase_Expense; 2 DONE: BB_Desktop_Relay, Landfill_Surcharge)

| App | W9 | W10 | Delta | Key Issues |
|-----|----|----|-------|------------|
| CalExp5 | 1 | 1 | 0 | selectedCrewIds missing from cal_user_settings.details schema and Section 9 migration |
| TS_Exp5 | 4 | 3 | -1 | shiftStart key+default ("07:00" not "07:30"), lunchRequiredAfter key (not lunchRequiredAfterHours), id-crossref.json has NO qboRealmId |
| RevExp5 | 1 | 1 | 0 | laborAssignments array missing from rev_estimates details JSONB schema |
| PorjExp5 | 5 | 1 | -4 | PorjExp5 local copy uses "Home Improvement Agreement" for TM (diverged from BB-DocEngine's "T&M Agreement") |
| BB-DocEngine | 8 | 3 | -5 | TM keywords "time and materials" (not "home improvement"), TM watermark "T&M AGREEMENT - BB" (not "HOME IMPROVEMENT..."), qbo-notes-backup customerId not in source JSON |
| Invoice_Validate2 | 1 | 4 | +3 | bridgeUrl Railway not localhost, thumbnailWidth/hoursTolerance in wrong category (duplicates), Section 9 routes chrome.storage to defaults instead of connection |
| GS_Receipts | 2 | 3 | +1 | fieldReference default "Reference" not "", successLabel/failLabel dynamically constructed (vendorName + suffix) |
| Chase_Expense | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| Adobe eSigner | 0 | 1 | +1 | signers role values are signer1/signer2/signer3 (not contractor/owner1/owner2); no order/label fields |
| Landfill_Surcharge | — | — | — | DONE |
| BB_Desktop_Relay | — | — | — | DONE |

### Key resolution: TM document type name divergence
BB-DocEngine (authoritative) uses "T&M Agreement" / "T&M AGREEMENT - BB" / "time and materials".
PorjExp5 (local copy) uses "Home Improvement Agreement" / "HOME IMPROVEMENT AGREEMENT - BB" / "home improvement".
Schema v2.9 follows BB-DocEngine as canonical. PorjExp5 should adopt platform values on migration.

---

## WAVE 11 RESULTS (2026-03-14)

### Summary: 4 total gaps across 4 apps (5 PASS; 4 DONE: BB_Desktop_Relay, Landfill_Surcharge, Chase_Expense NEW)

| App | W10 | W11 | Delta | Key Issues |
|-----|-----|-----|-------|------------|
| CalExp5 | 1 | 1 | 0 | selectedCrewIds not persisted (excluded from partialize + saveSettingsToFile) — runtime-only |
| TS_Exp5 | 3 | 0 | -3 | PASS (1st consecutive zero) |
| RevExp5 | 1 | 0 | -1 | PASS (1st consecutive zero) |
| PorjExp5 | 1 | 0 | -1 | PASS (1st consecutive zero) — TM divergence documented |
| BB-DocEngine | 3 | 0 | -3 | PASS (1st consecutive zero) |
| Invoice_Validate2 | 4 | 1 | -3 | hoursTolerance removed from defaults but not added to validation block |
| GS_Receipts | 3 | 1 | -2 | vendors.extractionMethod default "" not "GEMINI" |
| Chase_Expense | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| Adobe eSigner | 1 | 1 | 0 | clientId/clientSecret/refreshToken from .env not config JSON |
| Landfill_Surcharge | — | — | — | DONE |
| BB_Desktop_Relay | — | — | — | DONE |

---

## WAVE 12 RESULTS (2026-03-14)

### Summary: 0 total gaps — ALL 8 ACTIVE APPS PASS! First clean wave.

| App | W11 | W12 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 1 | 0 | -1 | PASS (1st consecutive zero) |
| TS_Exp5 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| RevExp5 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| PorjExp5 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| BB-DocEngine | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| Invoice_Validate2 | 1 | 0 | -1 | PASS (1st consecutive zero) |
| GS_Receipts | 1 | 0 | -1 | PASS (1st consecutive zero) |
| Adobe eSigner | 1 | 0 | -1 | PASS (1st consecutive zero) |

No schema changes needed — v2.10 remains current.

---

## WAVE 13 RESULTS (2026-03-14)

### Summary: 4 total gaps (PorjExp5 only) — 7 apps PASS, PorjExp5 FAIL. Schema updated v2.10 → v2.11.

| App | W12 | W13 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| TS_Exp5 | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| RevExp5 | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| PorjExp5 | 0 | 4 | +4 | FAIL — dur→duration mapping, 3 undocumented settings files (resets to 0 consecutive) |
| BB-DocEngine | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| Invoice_Validate2 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| GS_Receipts | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| Adobe eSigner | 0 | 0 | 0 | PASS (2nd consecutive zero) |

### Wave 13 PorjExp5 Gaps (4 gaps → v2.11 fixes)
1. master_items field mapping missing `dur` → `duration` (Estimated days)
2. `data/settings/project-counter.json` undocumented — { lastNumber, usedIds[], year } for C{YY}{seq3} ID sequence
3. `data/settings/project-id-settings.json` undocumented — { mode: "random" } ID generation mode
4. `data/settings/binder-settings.json` undocumented — PorjExp5's own binder config (diverges from DocEngine's: elements[] watermark, company with address, documentOrder, output, paths sections)

**Newly DONE this wave:** TS_Exp5, RevExp5, BB-DocEngine (all hit 3rd consecutive zero)
**NOTE:** Two W13 agents ran for PorjExp5 due to context break. First agent (more thorough) found 4 gaps; second agent missed them. First agent's results are authoritative.

---

## WAVE 14 RESULTS (2026-03-14)

### Summary: 2 total gaps (CalExp5 1, PorjExp5 1) — 3 apps PASS to DONE, 2 FAIL. Schema v2.11 → v2.12 → v2.13.

| App | W13 | W14 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 0 | 1 | +1 | FAIL — missing color column in cal_selected_jobcodes (resets to 0 consecutive) |
| Adobe eSigner | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| Invoice_Validate2 | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| GS_Receipts | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| PorjExp5 | 4 | 1 | -3 | FAIL — master-items `by`→`defaultBy` mapping wrong; already uses `defaultBy` (resets to 0 consecutive) |

### Wave 14 Gaps
1. **CalExp5:** `cal_selected_jobcodes` missing `color` column — code stores hex color from JOBSITE_COLORS per selected jobcode. Fixed in v2.12.
2. **PorjExp5:** master-items field mapping claims `by` → `defaultBy` but master-items.json already uses `defaultBy`. The `by` short name is only in estimate-templates.json items. Fixed in v2.13.

**Newly DONE this wave:** Adobe eSigner, Invoice_Validate2, GS_Receipts

---

## WAVE 15 RESULTS (2026-03-14)

### Summary: 3 total gaps (CalExp5 2, PorjExp5 1). Schema v2.13 → v2.14 → v2.15.

| App | W14 | W15 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 1 | 2 | +1 | FAIL — activeEmployeeIds example value, color example value (resets to 0) |
| PorjExp5 | 1 | 1 | 0 | FAIL — undocumented localStorage['projexp5_binder_state'] (resets to 0) |

### Wave 15 Gaps
1. **CalExp5:** `activeEmployeeIds` example shows `["3194176"]` but code default is `[]` (empty). Fixed in v2.15.
2. **CalExp5:** `cal_selected_jobcodes.color` example `#4CAF50` not in actual JOBSITE_COLORS. First color is `#FF6600`. Fixed in v2.15.
3. **PorjExp5:** `localStorage['projexp5_binder_state']` undocumented — binder UI session state { folderPath, contractNumber, customerName, watermarkEnabled, coverPageEnabled }. NOT migrated. Fixed in v2.14.

---

## WAVE 16 RESULTS (2026-03-14)

### Summary: 1 total gap (PorjExp5 only). CalExp5 PASS. Schema v2.15 → v2.16.

| App | W15 | W16 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 2 | 0 | -2 | PASS (1st consecutive zero) |
| PorjExp5 | 1 | 1 | 0 | FAIL — undocumented empty data/settings/settings.json placeholder (resets to 0) |

### Wave 16 Gaps
1. **PorjExp5:** `data/settings/settings.json` exists as empty `{}` placeholder — no routes write to it. Added NOT-migrated row. Fixed in v2.16.

---

## WAVE 17 RESULTS (2026-03-14)

### Summary: 2 total gaps (PorjExp5 only). CalExp5 PASS. Schema v2.16 → v2.17.

| App | W16 | W17 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 0 | 0 | 0 | PASS (2nd consecutive zero) |
| PorjExp5 | 1 | 2 | +1 | FAIL — missing Section 9 rows for bbiPlanner_subDirectory/bbi_vendors + 3 TM agreement localStorage keys (resets to 0) |

### Wave 17 Gaps
1. **PorjExp5:** `bbiPlanner_subDirectory` and `bbi_vendors` listed in Section 3.4 ephemeral state but had no Section 9 migration rows. Added rows mapping to app_settings (projexp5, directories). Fixed in v2.17.
2. **PorjExp5:** 3 TM agreement localStorage keys undocumented: `tmDocuSignConfig`, `tmAgreementData`, `contract_{num}`. All ephemeral, NOT migrated. Added to Section 3.4 + Section 9. Fixed in v2.17.

---

## WAVE 18 RESULTS (2026-03-14)

### Summary: 1 total gap (PorjExp5 only). CalExp5 PASS (3rd zero — DONE!). Schema v2.17 → v2.18.

| App | W17 | W18 | Delta | Status |
|-----|-----|-----|-------|--------|
| CalExp5 | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |
| PorjExp5 | 2 | 1 | -1 | FAIL — undocumented localStorage['tmAgreementConfig'] from tm-agreement-config-v3.js (resets to 0). NOTE: W18 agent incorrectly claimed tmDocuSignConfig/contract_{num} don't exist — direct grep confirmed they DO exist in TM_agreement-V5.html. |

### Wave 18 Gaps
1. **PorjExp5:** `localStorage['tmAgreementConfig']` (from `tm-agreement-config-v3.js`) undocumented. Stores TM agreement configuration. NOT migrated. Fixed in v2.18.

**Newly DONE this wave:** CalExp5 (3rd consecutive zero at W16/W17/W18)

---

## WAVES 19-21 RESULTS (2026-03-14)

### Summary: 0 gaps across all 3 waves. PorjExp5 achieves 3-ZERO. PROTOCOL COMPLETE.

| App | W18 | W19 | W20 | W21 | Status |
|-----|-----|-----|-----|-----|--------|
| PorjExp5 | 1 | 0 | 0 | 0 | PASS (3rd consecutive zero — DONE!) |

No schema changes needed — v2.18 remains final.

**ALL 11 APPS NOW AT 3-ZERO. BB Platform Schema verification protocol is COMPLETE.**

---

## 3-ZERO TRACKER
| App | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | W11 | W12 | W13 | W14 | W15 | W16 | W17 | W18 | Consecutive Zeros | Status |
|-----|----|----|----|----|----|----|----|----|----|----|-----|-----|-----|-----|-----|-----|-----|-----|-----|--------|
| BB_Desktop_Relay | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | 8+ | DONE |
| Landfill_Surcharge | 20+ | 5 | 2 | 1 | 0 | 0 | 0 | — | — | — | — | — | — | — | — | — | — | — | 3+ | DONE |
| Chase_Expense | 22+ | 9 | 0 | 1 | 1 | 7 | 3 | 3 | 0 | 0 | 0 | — | — | — | — | — | — | — | 3+ | DONE |
| TS_Exp5 | 15+ | 6 | 2 | 5 | 2 | 8 | 4 | 5 | 4 | 3 | 0 | 0 | 0 | — | — | — | — | — | 3 | DONE |
| RevExp5 | 18 | 0 | 0 | 4 | 2 | 7 | 9 | 3 | 1 | 1 | 0 | 0 | 0 | — | — | — | — | — | 3 | DONE |
| BB-DocEngine | 50+ | 7 | 5 | 5 | 2 | 8 | 12 | 7 | 8 | 3 | 0 | 0 | 0 | — | — | — | — | — | 3 | DONE |
| Adobe eSigner | 30+ | 7 | 2 | 4 | 3 | 5 | 3 | 3 | 0 | 1 | 1 | 0 | 0 | 0 | — | — | — | — | 3 | DONE |
| Invoice_Validate2 | 40+ | 18 | 2 | 1 | 1 | 0 | 1 | 0 | 1 | 4 | 1 | 0 | 0 | 0 | — | — | — | — | 3 | DONE |
| GS_Receipts | 85+ | 0 | 0 | 7 | 3 | 0 | 0 | 8 | 2 | 3 | 1 | 0 | 0 | 0 | — | — | — | — | 3 | DONE |
| CalExp5 | 19 | 3 | 1 | 3 | 2 | 3 | 3 | 3 | 1 | 1 | 1 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | — | — | — | 3 | DONE |
| PorjExp5 | 65+ | 13 | 3 | 7 | 3 | 4 | 2 | 2 | 5 | 1 | 0 | 0 | 4 | 1 | 1 | 1 | 2 | 1 | 0 | 0 | 0 | 3 | DONE |

## RECONCILIATION LOG
| Wave | Date | Gaps Found | Schema Updated? | Version |
|------|------|-----------|----------------|---------|
| 1 | 2026-03-14 | 344+ | YES | v1.0 → v2.0 |
| 2 | 2026-03-14 | 68 | YES | v2.0 → v2.1 |
| 3 | 2026-03-14 | ~17 | YES | v2.1 → v2.2 |
| 4 | 2026-03-14 | 38 | YES | v2.2 → v2.3 |
| 5 | 2026-03-14 | 19 | YES | v2.3 → v2.4 |
| 6 | 2026-03-14 | 42 | YES | v2.4 → v2.5 |
| 7 | 2026-03-14 | 37 | YES | v2.5 → v2.6 |
| 8 | 2026-03-14 | 34 | YES | v2.6 → v2.7 |
| 9 | 2026-03-14 | 22 | YES | v2.7 → v2.8 |
| 10 | 2026-03-14 | 17 | YES | v2.8 → v2.9 |
| 11 | 2026-03-14 | 4 | YES | v2.9 → v2.10 |
| 12 | 2026-03-14 | 0 | NO (clean) | v2.10 (no changes) |
| 13 | 2026-03-14 | 4 | YES | v2.10 → v2.11 |
| 14 | 2026-03-14 | 2 | YES | v2.11 → v2.12 → v2.13 |
| 15 | 2026-03-14 | 3 | YES | v2.13 → v2.14 → v2.15 |
| 16 | 2026-03-14 | 1 | YES | v2.15 → v2.16 |
| 17 | 2026-03-14 | 2 | YES | v2.16 → v2.17 |
| 18 | 2026-03-14 | 1 | YES | v2.17 → v2.18 |
| 19 | 2026-03-14 | 0 | NO (clean) | v2.18 (no changes) |
| 20 | 2026-03-14 | 0 | NO (clean) | v2.18 (no changes) |
| 21 | 2026-03-14 | 0 | NO (clean) | v2.18 (no changes) |

---

## PROTOCOL COMPLETE

**BB Platform Schema 3-Zero Verification Protocol achieved across all 11 apps.**

| Metric | Value |
|--------|-------|
| Total waves | 21 |
| Total gaps found across all waves | 500+ |
| Schema versions | v1.0 → v2.18 (18 revisions) |
| Final clean waves | W19, W20, W21 (all 11 apps at 0 gaps) |
| Apps verified | 11/11 DONE |

### Completion Order
| # | App | 3-Zero Achieved | Final Wave |
|---|-----|----------------|------------|
| 1 | BB_Desktop_Relay | W1-W3 | W3 |
| 2 | Landfill_Surcharge | W5-W7 | W7 |
| 3 | Chase_Expense | W9-W11 | W11 |
| 4 | TS_Exp5 | W11-W13 | W13 |
| 5 | RevExp5 | W11-W13 | W13 |
| 6 | BB-DocEngine | W11-W13 | W13 |
| 7 | Adobe eSigner | W12-W14 | W14 |
| 8 | Invoice_Validate2 | W12-W14 | W14 |
| 9 | GS_Receipts | W12-W14 | W14 |
| 10 | CalExp5 | W16-W18 | W18 |
| 11 | PorjExp5 | W19-W21 | W21 |
