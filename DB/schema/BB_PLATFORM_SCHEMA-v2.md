# BB Platform Schema | v2.24 | 2026-03-15 | BB

> **Purpose:** Comprehensive Neon database schema for the entire BB platform, derived from analysis of all 11 BB apps. Defines Compartment 1 (shared master data + enrichment), Compartment 2 (per-app working data), and shared infrastructure tables.
>
> **Authority:** This document is the authoritative reference for all table definitions and field-level schemas. See BB_DB_STRATEGY.md v1.5 for architecture decisions and BB_PLATFORM_READINESS_REPORT.md v1.3 for implementation gaps.
>
> **Methodology:** Every BB app was analyzed for: QBO/QBT entity usage, enrichment patterns, working data structures, settings/config, and storage mechanisms. The Settings_crawl master analysis was also incorporated. **v2.0:** Full verification pass by 11 deep-analysis agents with line-by-line codebase comparison. **v2.1:** Wave 2 verification — 68 gaps fixed. **v2.2:** Wave 3 verification — ~17 gaps fixed (field name mappings, salesHistory format, PTO enrichment registry, check names, pdfMetadataKeywords structure, migration notes). **v2.3:** Wave 4 verification — 38 gaps fixed. **v2.4:** Wave 5 verification — 19 gaps fixed (migration sources, field name mappings, default values, migration notes, officers structure). **v2.5:** Wave 6 verification — 42 gaps fixed (CalExp5 dual persistence, TS_Exp5 auto-lunch run columns, RevExp5 settings completeness, PorjExp5 template fields, BB-DocEngine binder/watermark/metadata structures, Chase invoiceNo format, Adobe eSigner migration notes). **v2.6:** Wave 7 verification — 37 gaps fixed (CalExp5 currentUser/workJobcodes, TS_Exp5 repairNote/billedLunches, RevExp5 cycle field names/employee rates/defaultGroup enum, PorjExp5 6.2 completeness, BB-DocEngine watermarks/doc_types/officers, Chase dateBuffer/IPC, Adobe api settings/Contract_Overlay, Invoice_Validate2 maxRetries). **v2.7:** Wave 8 verification — 34 gaps fixed (CalExp5 migration field split, TS_Exp5 AN columns/corrections/id-crossref mapping, RevExp5 byProject/estimates mapping/dual persistence, PorjExp5 inVendors mapping/TM name, BB-DocEngine watermarks full fields/metadata keywords/binder items/doc type table, GS_Receipts 8 default values, Chase sideload/jobName/autoVerify key, Adobe eSigner staging file mapping rules). **v2.8:** Wave 9 verification — 22 gaps fixed (CalExp5 activeEmployeeIds destination, TS_Exp5 lunchAssignment key/AN postFlightAttempts/corrections beforeState/qboRealmId, RevExp5 lineItems isExtra, PorjExp5+BB-DocEngine TM watermark text/metadata keywords exact values/binder labels/displayName, Invoice_Validate2 popup settings, GS_Receipts sheet seed/ACCOUNT_HOLDER_NAME). **v2.9:** Wave 10 verification — 17 gaps fixed (CalExp5 selectedCrewIds, TS_Exp5 shiftStart key+default/lunchRequiredAfter key/id-crossref qboRealmId removal, RevExp5 laborAssignments, BB-DocEngine+PorjExp5 TM watermark/keywords divergence resolved, DocEngine qbo-notes-backup customerId note, Adobe eSigner signers role values, Invoice_Validate2 defaults cleanup/bridgeUrl/Section 9 migration, GS_Receipts vendor label defaults). **v2.10:** Wave 11 verification — 4 gaps fixed (CalExp5 selectedCrewIds NOT-persisted note, Adobe eSigner .env vs config JSON note, Invoice_Validate2 hoursTolerance in validation, GS_Receipts extractionMethod default empty). **v2.19:** MDM best practices — added SCD2 versioning (valid_from/valid_to/is_current) to all Compartment 1 tables, masterDataContext watermarking on key Compartment 2 tables, sync_conflicts table, audit_log enhancements (masterDataVersion/changeSource/fieldPath), survivorship rules, data lineage documentation. See BB_MDM_BEST_PRACTICES.md v1.0. **v2.20:** Context-keyed enrichment pattern — enrichment fields that need per-app/per-context variants (e.g., aliases) use `context_map` field type with nested context keys instead of duplicating fields. Convention: `{ "context_key": <value> }` where context_key is the app or use-case identifier. **v2.21:** Cross-document audit fixes — converted qbo_id/qbt_id from `.unique()` to partial unique indexes (`WHERE is_current = true`) for SCD2 compatibility, fixed table count (37->39: C2 was 24 not 25 due to ts_auto_note_runs miscount, and parenthetical sub-counts actually sum to 26; added ts_auto_note_runs to DB-6 phase), added masterDataContext to ts_timesheet_snapshots, added Section 5.5 Property Enrichment Fields. See BB_CROSS_DOC_AUDIT.md v1.0. **v2.22:** SCD2 primary key fix — changed all 6 SCD2 tables from `id.primaryKey()` to composite `primaryKey({ columns: [table.id, table.version] })` since SCD2 version rows share the same id. Added 'system' to audit_log change_source enum. See BB_CROSS_DOC_AUDIT.md v1.2. **v2.23:** Approach B pivot — enrichment-first architecture. Removed SCD2 versioning from all C1 tables (core fields change rarely at BB's scale; SCD2 was over-engineered). Restored simple primaryKey() and .unique() constraints. Replaced sync_conflicts with enrichment_history table for field-level enrichment change tracking. Replaced masterDataContext JSONB and employeeVersion integer watermarks with enrichmentSnapshotAt timestamp on 6 C2 tables. Survivorship rules delegated to Bridge. Simplified audit_log (removed master_data_version and field_path; enrichment_history covers these). See BB_CROSS_DOC_AUDIT.md v1.4. **v2.24:** Auth strategy update — replaced Clerk with two-phase lightweight auth. Added `webauthnCredentials` and `pinHash` enrichment fields to employees. Updated `app_settings.updated_by` and `rev_cycle_snapshots.closed_by` to use employee ID (not Clerk user ID). Updated DB-1 phase description. See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12.
>
> **Verification:** See BB_SCHEMA_VERIFICATION_LOG.md for wave-by-wave gap tracking.

---

## 1. APP INVENTORY & DATA USAGE MATRIX

| App | Master Data Used | Enrichment Fields | Working Data | Current Storage |
|-----|-----------------|-------------------|-------------|-----------------|
| **CalExp5** | employees, jobcodes, timesheets | defaultCrew, scheduleColor, color, sortOrder | manual hours, selected jobcodes, uploaded timesheets, user settings, error logs, upload logs, jobcode cache | Zustand/localStorage/IndexedDB + File JSON (data/settings.json) |
| **TS_Exp5** | employees, jobcodes, timesheets | payRate, billRate, payType, workSchedule, lunch, pto (volatile), mileage, payPeriod, alias | auto-lunch runs, auto-notes, validation results, QBT custom field metadata | File JSON (unified-settings.json, id-crossref.json, Auto-Lunch/) |
| **RevExp5** | employees, customers, jobcodes, invoices, estimates | costRate per employee, margin targets | cycle projections, estimate snapshots, invoice cache (ephemeral from QBO) | File JSON (settings.json, estimates/) |
| **PorjExp5** | customers, vendors, items | properties (geocoded), subs (trade-enriched), officers | estimate templates, projects (bid state), supplier pipeline, master items, template overrides | File JSON (db/*.json — shared model with DocEngine) + localStorage |
| **Invoice_Validate2** | invoices, purchases, vendors | receiptPatterns (vendor), receiptAliases (jobcode) | validation runs, validation checks, receipt matches, suppressions | File JSON (settings.json) + chrome.storage |
| **GS_Receipts** | vendors (aliases), jobcodes (aliases+address), stores (aliases) | jobcode aliases (3-col: name/code/address), vendor aliases (keyed lookup: raw->canonical) | processing log (Google Sheets), extraction results | Google Sheets (Settings_Global, Settings_<Vendor>, Aliases_J, Aliases_S, Log) |
| **Chase_Expense_Validator** | purchases, bills, vendors, cardholders | cardLast4-to-employee mapping (reverse lookup needed) | scraped transactions (8-12 fields per site), validation results, fingerprint dedup | chrome.storage (persistent per-extension) |
| **BB_Desktop_Relay** | (passthrough) | (none) | relay state (in-memory only) | Minimal (empty settings.json, ephemeral workspace) |
| **Adobe eSigner** | contractors, clients | (document-specific) | PDF overlays, section templates, agreements, signer profiles, Adobe Sign config | File JSON (overlays/, settings/) |
| **Landfill_Surcharge** | purchases, items | (minimal) | surcharge calculations, session state, crew assignments, attachment cache | File JSON (settings.json) + localStorage |
| **BB-DocEngine** | clients, properties, subs, vendors, trades, master items | trade assignment, keywords, notes, geocode data, _userEdited tracking | contracts, binder settings, estimate templates, QBO notes backup | File JSON (db/*.json, data/) |

---

## 2. COMPARTMENT 1: SHARED MASTER DATA

### Entity Usage Heatmap

| Entity | CalExp5 | TS_Exp5 | RevExp5 | ProjExp | InvVal2 | GS_Rcpt | Chase | DocEngine | AdobeSign | Landfill |
|--------|---------|---------|---------|---------|---------|---------|-------|-----------|-----------|----------|
| **employees** | R/W | R | R | - | - | - | R | R | R | - |
| **customers** | - | - | R | R/W | - | - | - | R/W | R | - |
| **vendors** | - | - | - | R | R | R | R | R/W | - | - |
| **jobcodes** | R | R | R | R | - | R | - | - | - | - |
| **properties** | - | - | - | R/W | - | - | - | R/W | R | - |
| **items** | - | - | - | R | R | - | - | R | - | R |
| **trades** | - | - | - | R/W | - | - | - | R/W | - | - |

R = Reads, W = Writes enrichment, R/W = Reads and writes

---

### 2.1 employees

**Source:** QBT (primary for hours/timesheets) + QBO (primary for payroll/compensation)
**Used by:** CalExp5, TS_Exp5, RevExp5, Chase_Expense_Validator, BB-DocEngine, Adobe eSigner

```typescript
// Drizzle imports needed:
// import { pgTable, text, integer, boolean, timestamp, jsonb, date, doublePrecision,
//          index, uniqueIndex } from 'drizzle-orm/pg-core';
// import { sql } from 'drizzle-orm';

export const employees = pgTable('employees', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),                 // Internal BB ID (e.g., 'EMP-001')
  qboId:           text('qbo_id').unique(),                // QBO Employee.Id (e.g., '6')
  qbtId:           text('qbt_id').unique(),                // QBT User.id (e.g., '3194176')

  // === CORE FIELDS (from QBO/QBT sync) ===
  displayName:     text('display_name').notNull(),       // "Evan Bainbridge"
  firstName:       text('first_name'),                   // "Evan"
  lastName:        text('last_name'),                    // "Bainbridge"
  email:           text('email'),
  phone:           text('phone'),
  hireDate:        date('hire_date'),
  isActive:        boolean('is_active').default(true),
  isSalaried:      boolean('is_salaried').default(false), // From id-crossref (salaried flag)

  // === ENRICHMENT (superset - all apps' fields) ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB (managed by enrichment_fields registry):
  // {
  //   -- CalExp5 fields --
  //   "defaultCrew": "A",                     // select: A, B, C
  //   "scheduleColor": "#FF5733",             // color
  //
  //   -- TS_Exp5 fields --
  //   "alias": "Chad",                        // text: short display name
  //   "payType": "regular",                    // select: hourly, salary, regular (compensation type)
  //                                          // NOTE: In practice, "regular" is used for hourly workers.
  //                                          // "hourly" exists but is rarely used. "salary" for salaried.
  //   "payRate": 59.00,                       // number: hourly pay rate
  //   "billRate": 85.00,                      // number: hourly bill rate
  //   "workScheduleType": "full-time",        // select: full-time, part-time
  //   "workDays": ["Mon","Tue","Wed","Thu","Fri"], // tags
  //   "workStartTime": "07:30",              // text (HH:MM) — app uses workSchedule.startTime
  //   "workEndTime": "16:30",                // text (HH:MM) — app uses workSchedule.endTime
  //   "allowedWindowEarliest": "06:00",      // text (HH:MM)
  //   "allowedWindowLatest": "18:00",        // text (HH:MM)
  //   "lunchDefaultStart": "11:30",          // text (HH:MM)
  //   "lunchDefaultEnd": "12:00",            // text (HH:MM)
  //   "lunchDuration": 30,                   // number (minutes)
  //   "lunchRequired": true,                 // boolean
  //   "lunchRequiredAfterHours": 4,          // number
  //   "mileageDailyAllowance": 100,          // number
  //   "mileageVehicleType": "company",       // select: company, personal, none
  //   "mileageHomeZip": "95018-9175",        // text
  //   "payPeriodTargetHours": 80,            // number
  //   "overtimeApproved": false,             // boolean
  //
  //   -- RevExp5 fields --
  //   "costRate": 45.00,                     // number: labor cost rate
  //
  //   -- Chase fields --
  //   "cardLast4": "2145",                   // text: Chase card last 4 digits
  //                                          // NOTE: Chase also needs reverse lookup (card->employee).
  //                                          // This is handled by querying employees WHERE enrichment->>'cardLast4' = ?
  //
  //   -- Auth fields (DB-2) --
  //   "webauthnCredentials": [               // JSONB array: registered device public keys
  //     { "credentialId": "base64...", "publicKey": "base64...", "deviceName": "iPhone 15", "registeredAt": "2026-..." }
  //   ],
  //   "pinHash": "$2b$10$...",               // string: bcrypt-hashed 4-digit PIN
  //
  //   -- Cross-app utility --
  //   "certifications": ["OSHA-30"],         // tags
  //   "vehicleAssignment": "TRK-003",        // text
  //   "emergencyContact": "206-555-9999",    // text
  //   "tShirtSize": "XL",                    // select
  //   "role": "crew",                        // select: crew, lead, foreman, pm, owner
  // }
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this

  // === SYNC METADATA ===
  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),   // 'qbo' or 'qbt'
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),

  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_emp_active').on(table.isActive),
  index('idx_emp_display').on(table.displayName),
  index('idx_emp_card').using('gin', sql`enrichment->'cardLast4'`), // For Chase reverse lookup
]);
```

**PTO balances note:** TS_Exp5 currently tracks PTO balances (sickAvailable, vacationAvailable, unpaidYTD/unpaidAvailable) in unified-settings.json with `lastUpdated` and `source: "qbt"` fields. These are **volatile data synced from QBT** — they should be fetched live from QBT via Bridge, NOT stored as enrichment. Enrichment is for Sam-managed values. PTO balances are QBT-managed. The app caches them locally with `lastUpdated` timestamps and `source: "qbt"` metadata, but Neon should not persist them.

**PTO field naming inconsistency:** unified-settings.json uses BOTH `unpaidYTD` and `unpaidAvailable` inconsistently across employees. Some active employees (e.g., Evan, Chad) are missing `sickUsedYTD`/`vacationUsedYTD` fields while others (e.g., Aiden, Felipe) have them. On migration, normalize: `unpaidAvailable` → `unpaidYTD` (preferred name), and ensure all PTO sub-fields (`sickAvailable`, `sickUsedYTD`, `vacationAvailable`, `vacationUsedYTD`, `unpaidYTD`) are present when PTO data is cached. Note: PTO fields are volatile (fetched from QBT) — incomplete fields reflect QBT sync timing, not a schema error.

**TS_Exp5 field name mapping:** The app stores employee data as nested objects in unified-settings.json. ALL must be flattened for enrichment JSONB:
- `compensation.payRate` → `enrichment.payRate`
- `compensation.billRate` → `enrichment.billRate`
- `compensation.payType` → `enrichment.payType`
- `workSchedule.type` → `enrichment.workScheduleType`
- `workSchedule.startTime` → `enrichment.workStartTime`
- `workSchedule.endTime` → `enrichment.workEndTime`
- `workSchedule.days` → `enrichment.workDays`
- `workSchedule.allowedWindow.earliest` → `enrichment.allowedWindowEarliest` (doubly nested)
- `workSchedule.allowedWindow.latest` → `enrichment.allowedWindowLatest` (doubly nested)
- `lunch.defaultStart` → `enrichment.lunchDefaultStart`
- `lunch.defaultEnd` → `enrichment.lunchDefaultEnd`
- `lunch.duration` → `enrichment.lunchDuration`
- `lunch.required` → `enrichment.lunchRequired`
- `lunch.requiredAfterHours` → `enrichment.lunchRequiredAfterHours`
- `mileage.dailyAllowance` → `enrichment.mileageDailyAllowance`
- `mileage.vehicleType` → `enrichment.mileageVehicleType`
- `mileage.homeZip` → `enrichment.mileageHomeZip`
- `payPeriod.targetHours` → `enrichment.payPeriodTargetHours`
- `payPeriod.overtimeApproved` → `enrichment.overtimeApproved`

---

### 2.2 customers

**Source:** QBO (Customers API)
**Used by:** RevExp5, BB-DocEngine (as "clients"), Project_Exp, Adobe eSigner

```typescript
export const customers = pgTable('customers', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),                 // Internal BB ID (e.g., 'CLI-00001')
  qboId:           text('qbo_id').unique(),                // QBO Customer.Id (e.g., '139')

  // === CORE FIELDS (from QBO sync) ===
  displayName:     text('display_name').notNull(),       // "Alcantar" (QBO DisplayName)
  companyName:     text('company_name'),                  // "Alcantar Residence" (if different from displayName)
  name1:           text('name_1'),                       // First homeowner: "Ernesto"
  name2:           text('name_2'),                       // Second homeowner (if couple)
  lastName:        text('last_name'),                    // "Alcantar"
  email1:          text('email_1'),
  email2:          text('email_2'),
  phone1:          text('phone_1'),
  phone2:          text('phone_2'),
  mobile:          text('mobile'),                        // QBO Mobile.FreeFormNumber (PorjExp5 syncs this)
  address:         text('address'),                      // Street address
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  isActive:        boolean('is_active').default(true),
  notes:           text('notes'),                        // QBO notes field

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   -- BB-DocEngine fields --
  //   "preferredContact": "email",          // select: email, phone, text
  //   "referralSource": "Google",           // text
  //   "customerType": "residential",        // select: residential, commercial
  //   "tags": ["repeat", "referral"],       // tags
  //
  //   -- RevExp5 fields --
  //   "revenueCategory": "remodel",         // select: remodel, addition, new-build, repair
  //   "paymentTerms": "net-30",             // select: net-15, net-30, net-45, due-on-receipt
  // }
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this

  // === SYNC METADATA ===
  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_cust_active').on(table.isActive),
  index('idx_cust_display').on(table.displayName),
  index('idx_cust_last').on(table.lastName),
]);
```

---

### 2.3 vendors

**Source:** QBO (Vendors API)
**Used by:** Invoice_Validate2, Chase_Expense_Validator, GS_Receipts, BB-DocEngine (as "subs"), PorjExp5

**Three-tier pipeline:** QBO Vendors → minus Ignore List = Suppliers → promoted to Subs or Vendors directory. PorjExp5 and DocEngine both maintain this pipeline. On migration, `qbo-vendors.json` becomes a sync cache, `ignore-list.json` becomes `proj_supplier_ignore_list`, and `subs.json`/`vendors-dir.json` unify into this `vendors` table with enrichment flags (`isSub`, `inVendorsDir`).

```typescript
export const vendors = pgTable('vendors', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),                 // Internal BB ID (e.g., 'VEN-001' or 'sub_qbo_370')
  qboId:           text('qbo_id').unique(),                // QBO Vendor.Id

  // === CORE FIELDS (from QBO sync) ===
  displayName:     text('display_name').notNull(),       // "ACE PORTABLE SERVICES"
  shortName:       text('short_name'),                   // "AcePortable"
  company:         text('company'),                      // Full company name
  email:           text('email'),
  phone:           text('phone'),
  address:         text('address'),
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  isActive:        boolean('is_active').default(true),
  is1099:          boolean('is_1099').default(false),     // QBO 1099 contractor flag

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   -- BB-DocEngine / PorjExp5 fields --
  //   "trade": "electrical",                // select: from trades lookup (39 values)
  //   "license": "CSLB #561842",           // text
  //   "keywords": "floor, wood, hardwood",  // text (search keywords)
  //   "notes": "Owner: Tony Rebuelta...",   // text (rich notes)
  //   "isSub": true,                        // boolean (is subcontractor — in subs.json)
  //   "inVendorsDir": true,                 // boolean (is in vendors directory)
  //   "autoTrade": "plumbing",              // text (auto-detected trade from supplier pipeline)
  //   "_userEdited": { "trade": true },     // object: tracks which fields were manually edited
  //
  //   -- CONTEXT-KEYED: aliases (field_type: context_map) --
  //   "aliases": {                          // CONTEXT MAP — per-app alias mappings
  //     "gs_receipts": {                    //   GS_Receipts Aliases_S: RawName -> CanonicalName
  //       "HOME DEPO": "Home Depot",
  //       "HD": "Home Depot",
  //     },
  //     "chase": {                          //   Chase_Exp: transaction description -> canonical
  //       "THE HOME DEPOT": "Home Depot",
  //     },
  //     "invoice": {                        //   Invoice_Validate2: invoice vendor name -> canonical
  //       "Home Depot Inc.": "Home Depot",
  //     },
  //   },
  //   // Each app queries its own context: enrichment->'aliases'->'gs_receipts'
  //   // Data Manager shows all contexts side-by-side for editing
  //   "defaultJobcode": "Materials",        // text
  //
  //   -- Chase_Exp fields --
  //   "chaseCategory": "building-materials", // select
  //
  //   -- Invoice_Validate2 fields --
  //   "receiptFilenamePatterns": ["HD_*"],   // tags: patterns for receipt name matching
  //
  //   -- Cross-app utility --
  //   "paymentMethod": "check",             // select: check, ach, credit-card
  //   "w9OnFile": true,                     // boolean
  //   "insuranceExpiry": "2026-12-31",      // date
  // }
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this

  // === SYNC METADATA ===
  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ven_active').on(table.isActive),
  index('idx_ven_display').on(table.displayName),
]);
```

**Aliases note:** GS_Receipts Aliases_S sheet uses a **keyed lookup** (RawName → CanonicalName), NOT simple tags. The enrichment `aliases` field must be an object/map, not an array. When migrating, each row from Aliases_S becomes a key-value pair in the vendor's `enrichment.aliases` object.

**Vendor field name mapping:** PorjExp5/DocEngine JSON files use different field names:
| JSON field | Schema column | Notes |
|-----------|--------------|-------|
| `name` (subs.json) | `shortName` | Short display name (e.g., "AcePortable") |
| `company` (subs.json) | `displayName` | Full company name (e.g., "ACE PORTABLE SERVICES") |
| `name` (vendors-dir.json) | `shortName` | Short display name (e.g., "A-ToolShed") |
| `company` (vendors-dir.json) | `displayName` | Full company name (e.g., "A Tool SHed") |

| `active` (subs.json) | `isActive` (is_active) | Boolean active flag |
| `active` (vendors-dir.json) | `isActive` (is_active) | Boolean active flag |

Migration must swap `name` → `shortName`, `company` → `displayName`, and `active` → `isActive`.

---

### 2.4 work_jobcodes

**Source:** QBT (Jobcodes API)
**Used by:** CalExp5, TS_Exp5, RevExp5, Project_Exp, GS_Receipts

```typescript
export const workJobcodes = pgTable('work_jobcodes', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),                 // Internal BB ID
  qbtId:           text('qbt_id').unique(),                // QBT Jobcode.id

  // === CORE FIELDS (from QBT sync) ===
  name:            text('name').notNull(),               // "Hong - Oakland Ave." or "Sick"
  shortName:       text('short_name'),                   // "Hong" (parsed owner)
  parentId:        text('parent_id'),                    // Parent jobcode ID (for hierarchy)
  jobcodeType:     text('jobcode_type').notNull(),       // 'regular', 'pto', 'unpaid_break', 'paid_break'
  isActive:        boolean('is_active').default(true),
  hasChildren:     boolean('has_children').default(false),
  billable:        boolean('billable').default(true),

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   -- CalExp5 fields --
  //   "color": "#4A90E2",                   // color: jobcode display color
  //   "sortOrder": 1,                       // number: display sort position
  //
  //   -- TS_Exp5 fields --
  //   "excludeFromProcessing": false,       // boolean: skip in timesheet calcs
  //   "excludeReason": "lunch",             // text: why excluded
  //
  //   -- CONTEXT-KEYED: receiptAliases (field_type: context_map) --
  //   "receiptAliases": {                   // CONTEXT MAP — per-app alias mappings for jobcodes
  //     "gs_receipts": {                    //   GS_Receipts Aliases_J (3-column):
  //       "aliases": ["Oak", "Oakland"],    //     Column A→B: RawName -> EnhancedCode mappings
  //       "address": "123 Oakland Ave",     //     Column C: property address for reverse lookup
  //     },
  //     "invoice": {                        //   Invoice_Validate2: invoice jobcode name -> canonical
  //       "aliases": ["Oakland"],
  //     },
  //   },
  //   // Each app queries its own context: enrichment->'receiptAliases'->'gs_receipts'
  //   // GS_Receipts Aliases_J is 3-column: RawName | EnhancedCode | Address
  //   // The address enables reverse lookup when AI returns an address instead of a jobcode name.
  //   "propertyAddress": "123 Oakland Ave", // text: associated address (also in receiptAliases)
  //
  //   -- RevExp5 fields --
  //   "revenueCategory": "labor",           // select: labor, materials, sub
  //   "projectStatus": "active",            // select: active, completed, on-hold
  //   "estimateNumber": "E26818",           // text: linked estimate
  //
  //   -- Invoice_Validate2 fields --
  //   "customerLastName": "Hong",           // text: parsed from jobcode name for receipt matching
  //
  //   -- Cross-app utility --
  //   "customerName": "Labe + Nakamura",    // text: associated customer
  //   "propertyId": "PROP-00042",           // text: FK to properties
  // }
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this

  // === SYNC METADATA ===
  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbt'),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_jc_active').on(table.isActive),
  index('idx_jc_type').on(table.jobcodeType),
  index('idx_jc_parent').on(table.parentId),
]);
```

**Special jobcode IDs (hardcoded in multiple apps):**
| Jobcode | QBT ID | Type |
|---------|--------|------|
| Lunch (unpaid break) | 171969570 | unpaid_break |
| Sick | 56172044 | pto |
| Vacation | 56172048 | pto |
| Unpaid | 56172040 | pto |
| Shop (BBInc.) | 65312908 | regular |

---

### 2.5 properties

**Source:** Derived from QBO customer addresses + geocoding + Zillow/Redfin
**Used by:** BB-DocEngine (primary), Project_Exp, Adobe eSigner

```typescript
export const properties = pgTable('properties', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),                 // 'PROP-00001'
  customerId:      text('customer_id').notNull(),        // FK to customers
  qboId:           text('qbo_id').unique(),               // QBO sub-customer ID (if applicable)

  // === ADDRESS (from QBO + geocoding) ===
  name:            text('name'),                          // Property name (e.g., "Oakland Ave Remodel")
  address:         text('address').notNull(),
  city:            text('city'),
  state:           text('state'),
  zip:             text('zip'),
  zipPlus4:        text('zip_plus4'),
  county:          text('county'),
  googleFormatted: text('google_formatted'),              // Google-normalized address
  lat:             doublePrecision('lat'),
  lng:             doublePrecision('lng'),
  placeId:         text('place_id'),                      // Google Places ID
  geocodeStatus:   text('geocode_status'),                // 'success', 'partial', 'failed', 'error', 'pending', 'verified'
                                                         // NOTE: 'failed' = geocode API returned no result; 'error' = exception thrown
  googleMapsUrl:   text('google_maps_url'),
  googleMapsEmbedUrl: text('google_maps_embed_url'),

  // === PROPERTY DATA (from geocoding + Zillow/Redfin) ===
  beds:            integer('beds'),
  baths:           doublePrecision('baths'),
  sqft:            integer('sqft'),
  lotSqft:         integer('lot_sqft'),
  yearBuilt:       integer('year_built'),
  garage:          integer('garage'),
  propertyType:    text('property_type'),                 // 'single_family', 'multi_family', 'condo_townhouse', 'commercial', 'lot', 'other'

  // === STATUS ===
  status:          text('status').default('active'),      // 'active', 'archived', 'sold'
  relationship:    text('relationship'),                  // 'owner', 'rental', 'investment', 'commercial'
  isPrimary:       boolean('is_primary').default(false),
  displayName:     text('display_name'),                  // Short name: "Loyola Dr"
  createdBy:       text('created_by'),                    // User who created the record

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   "tags": ["kitchen-remodel", "2-story"],  // tags
  //   "notes": "",                              // text
  //   "streetView": {                           // object (Google Street View metadata)
  //     "url": "https://...",
  //     "date": "2014-09",
  //     "panoId": "...",
  //     "available": true
  //   },
  //   "zillowUrl": "https://...",              // text
  //   "redfinUrl": "https://...",              // text
  //   "salesHistory": {                         // OBJECT (not array) — matches actual properties.json structure
  //     "lastPrice": null,                     // number (most recent sale price)
  //     "lastDate": null,                      // date (most recent sale date)
  //     "zillowUrl": "https://...",            // text (redundant with top-level, kept for historical)
  //     "redfinUrl": null                      // text
  //   },
  //   "photos": [                               // array of property photos
  //     { "url": "https://...", "type": "street_view", "source": "google", "date": "2014-09" }
  //   ],
  // }
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this

  // === METADATA ===
  source:          text('source').default('qbo-sync'),    // 'qbo-sync', 'manual', 'geocode'
  dataConfidence:  text('data_confidence'),               // 'high', 'medium', 'low'
  version:         integer('version').default(1),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_prop_customer').on(table.customerId),
  index('idx_prop_status').on(table.status),
  index('idx_prop_city').on(table.city),
]);
```

**DocEngine note:** The app stores `streetView`, `zillowUrl`, `redfinUrl`, `photos`, and `salesHistory` as top-level fields in properties.json. On migration, these move to `enrichment` JSONB since they are enrichment data (not QBO-synced). Note: properties.json also has a top-level `streetViewUrl` string alongside the `streetView` object — these are redundant. On migration, consolidate into the `streetView.url` enrichment field only.

**salesHistory note:** properties.json has DUAL formats across properties: some use an OBJECT `{ lastPrice, lastDate, zillowUrl, redfinUrl }`, others use an ARRAY `[{ date, price, source }]`. On migration, normalize to the object format as canonical. Array entries map: `[0].price` → `lastPrice`, `[0].date` → `lastDate`, `[0].source` → `source` (e.g., "zillow", "redfin", "manual" — preserve this field on migration). The field names are `lastPrice`/`lastDate` (not `lastSalePrice`/`lastSaleDate`).

**properties field name mapping:** PorjExp5/DocEngine properties.json uses `clientId` (not `customerId`). On migration, map `clientId` → `customer_id` column.
| JSON field | Schema column | Notes |
|-----------|--------------|-------|
| `clientId` | `customerId` (customer_id) | FK to customers.id |

---

### 2.6 trades (lookup table)

**Source:** Manual / BB-DocEngine
**Used by:** BB-DocEngine, PorjExp5

```typescript
export const trades = pgTable('trades', {
  id:              text('id').primaryKey(),              // 'electrical', 'plumbing', etc.
  label:           text('label').notNull(),               // 'Electrical'
  aliases:         jsonb('aliases').default([]),           // ["electric", "electrician", "wiring"]
  autoDetectPatterns: jsonb('auto_detect_patterns').default([]), // ["ELECTRI", "WIRING"]
  sortOrder:       integer('sort_order').default(0),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

**Seed values (39 trades from BB-DocEngine db/trades.json):**
electrical, plumbing, hvac, roofing, tile, flooring, painting, concrete, stucco, cabinets, countertops, glass, insulation, drywall, siding, fencing, supplier, general, other, toilets, rental, asbestos, countertop, garage, gutters, metal, scaffolding, shower, solar, waterproof, appliance, engineering, framing, landfill, outdoor, permits, security, supply, windows

---

### 2.7 master_items (estimate cost catalog)

**Source:** Manual / BB-DocEngine
**Used by:** BB-DocEngine, PorjExp5, RevExp5

```typescript
export const masterItems = pgTable('master_items', {
  id:              text('id').primaryKey(),                 // 'item_DUMP_FEES'
  name:            text('name').notNull(),               // 'DUMP FEES'
  section:         text('section'),                      // 'sitework', 'structure', 'finishes'
  phase:           text('phase'),                        // 'pre_con', 'demo_prep', 'structural', 'rough_in',
                                                         //  'close_in', 'finishing', 'install', 'closeout'
  defaultBy:       text('default_by'),                   // 'BBI', 'SUB', or 'OWN'
  duration:        integer('duration'),                  // Estimated days
  sequence:        text('sequence'),                     // 'P' (parallel) or 'S' (sequential)
  leadTimeDays:    integer('lead_time_days').default(0),
  defaultHours:    doublePrecision('default_hours').default(0),
  defaultNonLabor: doublePrecision('default_non_labor').default(0),
  avgCost:         doublePrecision('avg_cost'),
  tiers:           jsonb('tiers'),                       // { "basic": 0.85, "standard": 1.0, "premium": 1.25 }
  trade:           text('trade'),                        // FK trades.id (e.g., 'electrical')
  isActive:        boolean('is_active').default(true),
  enrichmentVersion: integer('enrichment_version').default(1),  // Bumps on any enrichment change; C2 tables snapshot this
  sortOrder:       integer('sort_order').default(0),

  version:         integer('version').default(1),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_mi_section').on(table.section),
  index('idx_mi_phase').on(table.phase),
]);
```

**Field name mapping:** PorjExp5 master-items.json uses different field names from the schema:
| JSON field | Schema column | Notes |
|-----------|--------------|-------|
| `seq` | `sequence` | 'P' (parallel) or 'S' (sequential) |
| `hrs` | `defaultHours` | Default labor hours |
| `dur` | `duration` | Estimated days |
| `nonLabor` | `defaultNonLabor` | Default non-labor cost |
| `defaultBy` | `defaultBy` | 'BBI', 'SUB', or 'OWN' — already matches schema column in master-items.json. NOTE: estimate-templates.json items use short name `by` → map to `defaultBy` on migration |
| `lead` | `leadTimeDays` | Lead time in days |

Migration must map these field names during import.

**Phase enum values:** `pre_con`, `demo_prep`, `structural`, `rough_in`, `close_in`, `finishing`, `install`, `closeout`

**Tier values:** `null` (no tiers), `basic`, `standard`, `premium` — multipliers applied to base cost. Note: All master-items currently have `tiers: null`. Tiered pricing is forward-looking functionality for estimate templates.

**Trade field note:** master-items.json does NOT contain a `trade` field. The `trade` column is populated during migration via `autoDetectPatterns` matching from the trades table, or left null/empty. Trade is optional — empty string is allowed despite the FK reference. Estimate template items also commonly have `"trade": ""` (~46% of items).

---

### 2.8 items (QBO service items) — DEFERRED

**Source:** QBO (Items API)
**Used by:** Landfill_Surcharge, Invoice_Validate2

```
-- DEFERRED: Add when Landfill_Surcharge or Invoice_Validate2 migrate to Bridge.
-- Current apps query QBO directly for items. When Bridge handles this:
items {
  id, qbo_id, name, type, description, unit_price, is_active,
  enrichment jsonb, sync metadata
}
```

---

### 2.9 id_crossref (QBO <-> QBT ID mapping)

**Source:** Derived (computed from QBO + QBT employee sync)
**Used by:** TS_Exp5, any app needing both QBO and QBT data for same employee

```typescript
// NOTE: This is handled by the employees table having BOTH qbo_id AND qbt_id columns.
// The current file-based id-crossref.json in TS_Exp5 becomes unnecessary once employees
// table has both IDs populated during Bridge sync.
// No separate table needed — the employees table IS the crossref.
//
// Additional id-crossref.json data that needs migration:
// - payrollItemRefs: Move to app_settings (ts_exp5, payroll)
// - employeeTargets: Move to app_settings (ts_exp5, publishing)
// - qbtCustomFields: Move to app_settings (ts_exp5, qbt_fields)
```

---

## 3. COMPARTMENT 2: PER-APP WORKING DATA

### Naming Convention
All working data tables are prefixed with the app abbreviation:
- `cal_*` — CalExp5
- `ts_*` — TS_Exp5
- `rev_*` — RevExp5
- `proj_*` — PorjExp5
- `doc_*` — BB-DocEngine
- `inv_*` — Invoice_Validate2
- `chase_*` — Chase_Expense_Validator
- `esign_*` — Adobe eSigner
- `lf_*` — Landfill_Surcharge

Apps that don't need Neon working data:
- **GS_Receipts** — Lives in Google Sheets; aliases move to Compartment 1 enrichment. Settings move to app_settings.
- **BB_Desktop_Relay** — Stateless relay; no persistent working data

---

### 3.1 CalExp5 (cal_*)

*Already defined in BB_CALEXP5_SCHEMA.md v1.3. Summary with expanded JSONB documentation:*

```typescript
// cal_manual_hours — Hours entered by employees (before upload to QBT)
export const calManualHours = pgTable('cal_manual_hours', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),              // FK employees.id
  date:        date('date').notNull(),
  jobcodeId:   text('jobcode_id').notNull(),           // FK work_jobcodes.id
  hours:       doublePrecision('hours').notNull(),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "entryMode": "work" | "pto",          // How entry was created
  //   "notes": "",                           // Optional notes
  //   "segments": [                          // Chronological timesheet segments
  //     {
  //       "jobcodeId": "12345",
  //       "name": "Cortez - Main St",
  //       "hours": 4.0,
  //       "type": "regular",                 // regular, pto, unpaid_break
  //       "startTime": "07:30",
  //       "endTime": "11:30",
  //       "timestamp": "2026-03-14T15:30:00Z"
  //     }
  //   ]
  // }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// cal_selected_jobcodes — Per-user jobcode selection and ordering
export const calSelectedJobcodes = pgTable('cal_selected_jobcodes', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  jobcodeId:   text('jobcode_id').notNull(),
  color:       text('color'),                             // Hex color from JOBSITE_COLORS (e.g. '#FF6600'), assigned on add
  sortOrder:   integer('sort_order').default(0),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// cal_uploaded_timesheets — Record of hours uploaded to QBT
export const calUploadedTimesheets = pgTable('cal_uploaded_timesheets', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  date:        date('date').notNull(),
  jobcodeId:   text('jobcode_id').notNull(),
  hours:       doublePrecision('hours').notNull(),
  qbtTimesheetId: text('qbt_timesheet_id'),            // QBT response ID
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp at upload time
  uploadedAt:  timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
});

// cal_user_settings — Per-user display preferences
export const calUserSettings = pgTable('cal_user_settings', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull().unique(),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "myTimeColor": "#2196F3",           // HEX color for user's time bars
  //   "crewColor": "#E040FB",             // HEX color for crew time bars
  //   "entryMode": "off",                 // "off" | "pto" | "work"
  //   "logLevel": "minimal",              // "minimal" | "standard" | "verbose"
  //   "disablePastDays": false,           // boolean
  //   "showMockData": false,              // boolean
  //   "exportUploadLog": false,           // boolean
  //   "showMyTime": true,                 // boolean
  //   "showCrew": false,                  // boolean
  //   "view": "year",                     // "year" | "month"
  //   "activeEmployeeIds": [],             // array of employee ID strings (empty = all active; filter dropdown)
  //   "selectedCrewIds": [],              // array of crew member ID strings — NOT PERSISTED (excluded from partialize + saveSettingsToFile; resets to [] on reload)
  //   "currentUser": { id, name, ... },   // Currently selected employee object (session state)
  //   "workJobcodes": [...]               // Cached jobcode array from QBT API (ephemeral, refetched from Bridge)
  // }
  // NOTE: currentUser is session-only state; on migration, extract userId only (→ cal_user_settings.userId).
  // NOTE: workJobcodes is an API cache; on migration, NOT migrated — refetched from Bridge/work_jobcodes table.
  // CAUTION: loadSettingsFromFile() has stale/wrong fallback defaults (showCrew:true, myTimeColor:'#FFC107',
  //   crewColor:'#2196F3', disablePastDays:true) that contradict the authoritative Zustand initial state and
  //   constants.js defaults. Migration tooling must use Zustand/constants defaults, NOT file-load fallbacks.
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// cal_audit_log — CalExp5-specific audit trail
export const calAuditLog = pgTable('cal_audit_log', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  action:      text('action').notNull(),
  // Action enum: CREATE, UPDATE, DELETE, UPLOAD, UPLOAD_BATCH,
  //   PTO_REQUEST, PTO_CANCEL, PTO_MODIFY, BALANCE_ADJUST, BALANCE_SYNC,
  //   PREFLIGHT_CHECK, POSTFLIGHT_VERIFY, CONFLICT_DETECTED, CONFLICT_RESOLVED,
  //   SESSION_START, USER_SWITCH
  entityType:  text('entity_type'),                    // 'timesheet', 'pto', 'balance', 'session'
  entityId:    text('entity_id'),
  hoursType:   text('hours_type'),                     // 'regular','manual','overtime','vacation','sick','unpaid'
  source:      text('source'),                         // 'manual','grid','upload','sync','admin','import'
  details:     jsonb('details').default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Ephemeral caches (NOT persisted to Neon — documented for completeness):**
- `localStorage['bb-api-errors']` — API error log (array of {timestamp, context, error: {message, type, stack}, ...extra})
- `localStorage['bb-upload-log']` — Upload history: per-operation records (array of {action, userId, userName, jobcodeId, jobcodeName, date, hours, timesheetId, status ('SUCCESS'|'FAILED'|'WARN'|'WARN_NO_ID'), error, timestamp})
- `localStorage['bb-audit-log']` — Audit trail (up to 2000 entries, 365-day retention): {id, timestamp, userId, userName, userInitials, action, entityType, entityId, targetDate, targetWeek, targetPayPeriod, targetYear, hoursType, jobcodeId, jobcodeName, oldValue, newValue, delta, method, qbtTimesheetId, source, deviceInfo, sessionId, success, errorCode, errorMessage}. Pre-migration data for `cal_audit_log` table (DB-2 phase).
- `localStorage['bb-jobcode-sort-cache']` — Jobcode sort order cache per year
- IndexedDB `crew-calendar` store — Crew PTO calendar (5min fresh / 24h stale)
- IndexedDB `user-hours` store — User's year of hours (5min fresh / 24h stale)
- IndexedDB `metadata` store — Sync timestamps

These are **volatile caches** that can be regenerated from API data. They do NOT need Neon tables.

---

### 3.2 TS_Exp5 (ts_*)

**Current state:** TS_Exp5 stores rich employee config in unified-settings.json and processes timesheets for auto-lunch/auto-note features.

```typescript
// ts_timesheet_snapshots — Cached timesheet data per pay period
export const tsTimesheetSnapshots = pgTable('ts_timesheet_snapshots', {
  id:          text('id').primaryKey(),
  employeeId:  text('employee_id').notNull(),          // FK employees.id
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  rawTimesheets: jsonb('raw_timesheets').default([]),  // QBT timesheet data as-fetched
  processedData: jsonb('processed_data').default({}),  // Auto-lunch, auto-note results
  status:      text('status').default('draft'),        // 'draft', 'reviewed', 'approved'
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "totalHours": 80,
  //   "regularHours": 72,
  //   "otHours": 8,
  //   "warnings": [],
  //   "originalNotesMap": {},               // Original QBT notes before auto-note modification
  //   "publishedBy": null,                  // User ID who published
  //   "publishedAt": null,                  // ISO timestamp of publish
  //   "publishCounts": { "uploaded": 0, "skipped": 0, "locked": 0 },
  //   "publishTarget": "qbt"               // "qbo", "qbt", "both"
  // }
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp — query enrichment_history WHERE changed_at <= this for point-in-time reconstruction
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ts_snap_emp').on(table.employeeId),
  index('idx_ts_snap_period').on(table.periodStart, table.periodEnd),
]);

// ts_pay_periods — Pay period metadata and status tracking
export const tsPayPeriods = pgTable('ts_pay_periods', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  status:      text('status').default('open'),         // 'open', 'processing', 'closed'
  details:     jsonb('details').default({}),           // { totalEmployees, totalHours, issues }
  closedAt:    timestamp('closed_at', { withTimezone: true }),
  closedBy:    text('closed_by'),                      // employee ID (or Clerk user ID at DB-4+)
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_ts_period_unique').on(table.periodStart, table.periodEnd),
]);

// ts_auto_lunch_runs — Auto-lunch batch processing records
// Currently stored as JSON files in data/Auto-Lunch/{period}/ directories
export const tsAutoLunchRuns = pgTable('ts_auto_lunch_runs', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  totalRecords: integer('total_records').default(0),
  toUpload:    integer('to_upload').default(0),
  toSkip:      integer('to_skip').default(0),
  toLock:      integer('to_lock').default(0),
  status:      text('status').default('pending'),       // 'pending', 'processing', 'completed', 'failed'
  source:      text('source'),                           // Nullable — 'migrated-from-published-lunches' on migrated runs
  entries:     jsonb('entries').default([]),
  // entries schema: Array of {
  //   -- Standard input fields --
  //   seq, qboId, qbtTimesheetId, employee, date, customer, hours,
  //   action ('upload'|'skip'|'lock'), reason,
  //   -- Standard result fields (added after processing) --
  //   recordId, status, payload: { method, url, body }, curl,
  //   billingRate, billingRateSource, costRate, costRateSource,
  //   newSyncToken, ts,
  //   -- Migrated-format entry fields (from pre-migration AL runs) --
  //   qboTimeActivityId, rate, statusBefore, statusAfter, verified,
  //   -- Correction fields (post-run manual fixes) --
  //   corrected (boolean), correctedAt, correctedBy, originalQboId
  // }
  billedLunches: jsonb('billed_lunches').default([]),
  // billedLunches source: billed-lunches.json wraps in { "lunches": [...] } — unwrap on migration.
  // billedLunches schema: Array of {
  //   fname, date, customer, hours, qbtTimesheetId, addedAt
  // }
  // NOTE: Field names differ from earlier schema — actual file uses fname (not userId),
  //   qbtTimesheetId (not lunchTimesheetId), plus customer, hours, addedAt fields.
  summary:     jsonb('summary').default({}),
  // summary schema: { success: 28, failed: 0, skipped: 5, locked: 0, alreadyDone: 1 }
  corrections: jsonb('corrections').default([]),
  // corrections schema: Array of {
  //   seq, correctedAt, correctedBy, originalAction, originalQboId,
  //   originalQboIdWas, correctedQboId, correctedAction, employee, date,
  //   originalReason, customer, hours, qbtTimesheetId,
  //   beforeState (object — snapshot before correction), afterState (object — snapshot after correction),
  //   rootCause (string — e.g., "duplicate", "wrong-employee", "wrong-date")
  // }
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp — query enrichment_history WHERE changed_at <= this for point-in-time reconstruction
  postFlightVerified: boolean('post_flight_verified'),   // Whether post-flight verification passed
  postFlightConfidence: doublePrecision('post_flight_confidence'), // Confidence score (nullable)
  postFlightAttempts: integer('post_flight_attempts'),    // Number of verification attempts (only on newer runs; absent from older files)
  repairNote:  text('repair_note'),                       // Human-readable repair description (e.g., "Rebuilt from QBT+QBO live API data...")
  repairedAt:  timestamp('repaired_at', { withTimezone: true }), // Manual repair timestamp
  startedAt:   timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ts_lunch_period').on(table.periodStart, table.periodEnd),
]);
```

```typescript
// ts_auto_note_runs — Auto-note batch processing records
// Currently stored as JSON files in data/Auto-Note/QBT_PP*_AN/ directories
export const tsAutoNoteRuns = pgTable('ts_auto_note_runs', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  target:      text('target').default('QBT'),              // 'QBT'
  totalRecords: integer('total_records').default(0),
  toUpload:    integer('to_upload').default(0),
  toSkip:      integer('to_skip').default(0),
  toLock:      integer('to_lock').default(0),
  status:      text('status').default('pending'),           // 'pending', 'processing', 'completed', 'failed'
  entries:     jsonb('entries').default([]),
  // entries schema: Array of {
  //   -- Input fields --
  //   seq, qbtTimesheetId, employee, date, noteBefore, noteAfter,
  //   action ('upload'|'skip'|'lock'), reason,
  //   -- Result fields (added after processing) --
  //   recordId, status, payload: { method, url, body }, ts,
  //   -- Migrated entry fields (from pre-migration AN runs) --
  //   verified (boolean — present on migrated entries)
  // }
  source:      text('source'),                           // Nullable — 'migrated-from-snapshot-v1', 'migrated-from-csv-audit-v1' on migrated runs
  postFlightVerified: boolean('post_flight_verified'),   // Whether post-flight verification passed
  postFlightConfidence: doublePrecision('post_flight_confidence'), // Confidence score (nullable)
  // NOTE: Auto-Note runs do NOT have postFlightAttempts (unlike Auto-Lunch runs which do).
  // This is intentional — AN post-flight is single-pass. Do not add postFlightAttempts here.
  startedAt:   timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ts_note_period').on(table.periodStart, table.periodEnd),
]);
```

**Migration note:** The bulk of TS_Exp5's "settings" (payRate, payType, workSchedule, lunch, mileage, etc.) are actually employee enrichment and move to the `employees.enrichment` JSONB in Compartment 1. Additional id-crossref.json data (payrollItemRefs, employeeTargets, qbtCustomFields) moves to `app_settings`. **Also in id-crossref.json:** `serviceItems` (QBO Item IDs for Labor/Sub-Con/Materials/Rental/PM) → `app_settings` (ts_exp5, service_items); `excludedJobcodes` (QBT jobcode IDs filtered from UI) → `app_settings` (ts_exp5, excluded_jobcodes).

---

### 3.3 RevExp5 (rev_*)

**Current state:** RevExp5 stores employee cost rates in settings.json, estimates in individual JSON files, and tracks billing cycles. Invoice data is **ephemeral** (fetched from QBO via Bridge each session, not persisted to Neon).

**RevExp5 dual persistence:** `data/settings.json` is actively maintained server-side by `settings-server-v1.js` (GET/POST `/api/settings` endpoints). On migration, the FILE (not localStorage) is the authoritative persisted settings source — but use CODE DEFAULTS for seed values (file may contain user-modified rates).

**rev_estimates field name mapping (JSON file → schema column):**
| JSON field | Schema column | Notes |
|------------|--------------|-------|
| `customer` | `customerName` | String customer name |
| `date` | `estimateDate` | Date string |
| `duration` | `durationDays` | String in JSON → integer in schema (requires type conversion) |
| `parsedDate` | `details.parsedDate` | Top-level in JSON → inside details JSONB |
| `vendorMappings` | `details.vendorMappings` | Top-level in JSON → inside details JSONB |
| `segmentOrder` | `details.segmentOrder` | Top-level in JSON → inside details JSONB |

```typescript
// rev_cycle_snapshots — Revenue data per billing cycle
export const revCycleSnapshots = pgTable('rev_cycle_snapshots', {
  id:          text('id').primaryKey(),
  cycleNum:    integer('cycle_num').notNull(),
  year:        integer('year').notNull(),
  startDate:   date('start_date').notNull(),
  endDate:     date('end_date').notNull(),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   -- Revenue breakdown (field names match code's cycleData object) --
  //   "rev": 45000,                        // Total revenue (code uses 'rev' not 'totalRevenue')
  //   "laborRev": 24750,                   // Labor portion of revenue
  //   "laborCost": 15000,                  // Labor cost (COGS)
  //   "laborHours": 320,                   // Total labor hours
  //   "nonLaborRev": 14850,                // Materials + subcon revenue (combined)
  //   "nonLaborCost": 20000,               // Materials + subcon cost (combined, no separate materialsCost/subsCost)
  //   "overheadRev": 5400,                 // Overhead + markup revenue
  //   "totalCost": 35000,                  // Total COGS
  //   "profit": 10000,                     // Gross profit in dollars (code uses 'profit' not 'grossMargin')
  //   "invoiceCount": 5,
  //
  //   -- Projection fields --
  //   "userProjection": null,              // User-entered revenue estimate for this cycle
  //   "annualTargetProjection": null,      // System-derived from annual target
  //   "annualDailyRev": 2307.69,           // Daily revenue rate for annual target
  //   "annualDailyLaborHrs": 27.15,        // Daily labor hours for annual target
  //
  //   -- Temporal fields --
  //   "actualStart": "2026-01-13",         // Earliest invoice date in cycle
  //   "actualEnd": "2026-01-24",           // Latest invoice date in cycle
  //   "workDays": 10,                      // Business days in cycle
  //   "hasData": true,                     // Whether cycle has any invoices
  //
  //   -- Per-project breakdown (FORWARD-LOOKING: code does not build this yet) --
  //   "byProject": [
  //     { "jobcodeId": "JC-001", "invoiced": 12000, "labor": 5000, "materials": 3000, "margin": 33 }
  //   ]
  // }
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp — query enrichment_history WHERE changed_at <= this for point-in-time reconstruction
  status:      text('status').default('current'),      // 'current', 'closed', 'archived'
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_rev_cycle_unique').on(table.year, table.cycleNum),
]);

// rev_estimates — Stored estimates with line items
export const revEstimates = pgTable('rev_estimates', {
  id:          text('id').primaryKey(),                 // 'E26818'
  customerId:  text('customer_id'),                     // FK customers.id (linked after name matching)
  customerName: text('customer_name'),                  // Original customer name string from estimate
  projectName: text('project_name'),
  preparedBy:  text('prepared_by'),                     // Preparer name (not FK — may not be employee)
  estimateDate: date('estimate_date'),
  durationDays: integer('duration_days'),
  summary:     jsonb('summary').default({}),
  // summary schema:
  // {
  //   "siteworkAndBuilding": 155770,
  //   "ohPct": 12,                          // OH percentage
  //   "ohAmount": 18692,                    // OH dollar amount
  //   "insPct": 0,                          // Insurance percentage
  //   "insAmount": 0,                       // Insurance dollar amount
  //   "estimateTotal": 174462
  // }
  lineItems:   jsonb('line_items').default([]),
  // lineItems schema: Array of {
  //   name, section ('PROJECT'|'SITEWORK'), type ('SUB'|'BBI'|'OWN'),
  //   notes, hours, labor, materials, total,
  //   isExtra (boolean, optional — marks extra/added line items)
  // }
  sectionTotals: jsonb('section_totals').default({}),  // { sitework: {labor,materials,total}, project: {...} }
  status:      text('status').default('draft'),        // 'draft', 'sent', 'accepted', 'declined'
  linkedCustomerId: text('linked_customer_id'),        // QBO customer ID (for invoice matching)
  sourceFile:  text('source_file'),                    // Original Excel filename
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "notes": "",
  //   "revisions": [],
  //   "changeOrders": [],
  //   "vendorMappings": {},                 // Sub vendor ID -> vendor ID overrides
  //   "segmentOrder": {},                   // Custom line item reordering
  //   "parsedDate": "2026-03-06",
  //   "laborAssignments": [{ "amount": 18000, "item": "DEMO" }]  // Labor line item assignments (optional, newer estimates only)
  // }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_rev_est_customer').on(table.customerId),
  index('idx_rev_est_status').on(table.status),
]);
```

**Invoice data strategy:** RevExp5 fetches QBO invoices live via Bridge each session. Invoice data (docNumber, payment status, line items, labor/materials breakdown) is **NOT persisted to Neon** — it's computed in-memory from QBO responses. The `rev_cycle_snapshots` table captures aggregated cycle-level data only.

**Migration note:** RevExp5's employee cost rates move to `employees.enrichment.costRate` in Compartment 1. The `employees` object in settings.json is a flat `{ [nameString]: costRateNumber }` map (e.g., `{"Chad": 59, "Christian": 45, ...}`). Margin targets and cycle config move to `app_settings` (revexp5, defaults). **CAUTION:** `data/settings.json` may carry stale user-overridden values (e.g., marginTarget:32) that differ from code defaults (marginTarget:18). On migration, use the CODE DEFAULTS documented in Section 6.2 as the seed values, not the persisted file — the file represents the user's current runtime state, not the intended defaults.

---

### 3.4 PorjExp5 (proj_*)

**Current state:** Rich project management app with estimate builder, Gantt scheduling, client/property management, and subcontractor directory. Shares the same `db/` JSON structure as BB-DocEngine (clients, properties, subs, trades, master items). On migration, both apps will read/write the same Compartment 1 tables.

**Key insight:** PorjExp5 writes enriched property data BACK to QBO customer Notes fields (two-way sync). The Bridge must support this write-back pattern.

```typescript
// proj_estimate_templates — Project estimate blueprints (the core PorjExp5 entity)
export const projEstimateTemplates = pgTable('proj_estimate_templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),                      // Template description (e.g., "Complete tear-out & rebuild...")
  category:    text('category'),
  durationWeeks: integer('duration_weeks'),
  isBuiltIn:   boolean('is_built_in').default(false),    // true = system template, false = user-created
  createdBy:   text('created_by'),                       // 'system' | 'user'
  exportable:  boolean('exportable').default(true),      // Whether template can be exported
  milestones:  jsonb('milestones').default([]),           // Array of milestone objects
  payments:    jsonb('payments').default([]),             // Array of payment schedule objects
  items:       jsonb('items').default([]),
  // items schema: Array of {
  //   id, name, section (sitework/building), phase (pre_con/demo_prep/structural/rough_in/
  //     close_in/finishing/install/closeout),
  //   trade (electrical/plumbing/etc — FK trades.id), order, by (BBI/SUB/OWN),
  //   dur, durVal, durUnit, schedDur, lead, bufL, bufR,
  //   crew, hrs, nonLabor, avgCost, tier, tiers: { basic, standard, premium },
  //   sources: [{ id: "sub_qbo_370", type: "SUB"|"VEN" }],
  //   prefSource, scope, keywords, ps ('P'|'S' parallel/sequential)
  // }
  // NOTE: Estimate template items use `ps` (not `sequence`). Map `ps` → `sequence` on migration.
  // NOTE: Duration uses `durVal` + `durUnit` (e.g., durVal:2, durUnit:"D" = 2 days).
  //   `durationWeeks` is the template-level total; item-level uses durVal/durUnit/schedDur.
  isActive:    boolean('is_active').default(true),
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// proj_projects — Active construction project tracking
export const projProjects = pgTable('proj_projects', {
  id:          text('id').primaryKey(),                 // Sequential project ID
  customerId:  text('customer_id'),                     // FK customers.id
  propertyId:  text('property_id'),                     // FK properties.id
  jobcodeId:   text('jobcode_id'),                      // FK work_jobcodes.id (primary jobcode)
  name:        text('name').notNull(),
  status:      text('status').default('planning'),      // 'planning', 'active', 'on-hold', 'completed'
  startDate:   date('start_date'),
  targetEnd:   date('target_end'),
  actualEnd:   date('actual_end'),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "estimateId": "E26818",
  //   "contractId": "CON-001",
  //   "notes": "",
  //   "milestones": [],
  //   "assignedCrew": ["EMP-001", "EMP-003"],
  //   "gantt": { schedule data },
  //   -- Bid state (from localStorage bbiPlanner_bidData) --
  //   "bidProjectName": "",
  //   "bidStartDate": "",
  //   "bidDuration": "",
  //   "bidDurationUnit": "weeks",
  //   "bidEndDate": "",
  //   "bidPreparedByName": "",
  //   "bidPreparedByPhone": "",
  //   "bidPreparedByEmail": "",
  //   "bidDesignedByName": "",
  //   "bidDesignedByPhone": "",
  //   "bidDesignedByEmail": "",
  //   "templateId": "",
  //   "projectFolder": "",
  //   -- Session/display fields (from project-state.json save) --
  //   "clientDisplayName": "",              // Customer display name at save time
  //   "propertyDisplayName": "",            // Property display name at save time
  //   "savedAt": "2026-03-14T10:30:00Z"    // ISO timestamp of last save
  // }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_proj_status').on(table.status),
  index('idx_proj_customer').on(table.customerId),
]);

// proj_supplier_ignore_list — Vendors filtered out of supplier pipeline
export const projSupplierIgnoreList = pgTable('proj_supplier_ignore_list', {
  id:          text('id').primaryKey(),
  vendorId:    text('vendor_id').notNull(),             // FK vendors.id (via qboId)
  reason:      text('reason'),                          // 'user_ignored', 'user_hidden'
  ignoredBy:   text('ignored_by'),                      // 'user' or 'system'
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Migration note:** PorjExp5 and BB-DocEngine share identical `db/` schemas for clients, properties, subs, trades, master items. On migration, these become the SAME Compartment 1 tables. The `qbo-vendors.json` + `ignore-list.json` -> `suppliers.json` pipeline becomes a view/filter on the shared `vendors` table with `proj_supplier_ignore_list`. The relationship between `subs.json` and `vendors-dir.json` is resolved by the `enrichment.isSub` and `enrichment.inVendorsDir` flags on the unified `vendors` table.

**Estimate template field name mapping:** Code uses `active` (boolean) for soft-delete state. On migration, map `active` → `isActive` (is_active column) in `proj_estimate_templates`.

**Ephemeral state (NOT persisted to Neon):**
- `localStorage['bbiPlanner_userTpls']` — User-created estimate templates (move to app_settings)
- `localStorage['bbiPlanner_tplOverrides']` — Template customizations (move to app_settings)
- `localStorage['bbiPlanner_fuzzyOnly']` — Skip pre-assigned flag (move to app_settings)
- `localStorage['bbiPlanner_bidData']` — Current bid state (move to proj_projects.details)
- `localStorage['bbiPlanner_lastTpl']` — Last loaded template ID (move to app_settings projexp5/defaults)
- `localStorage['bbiPlanner_subDirectory']` — Sub directory UI state (sort field, sort asc, collapsed sections)
- `localStorage['bbiPlanner_itemDirectory']` — Master item directory user overrides (move to app_settings projexp5/item_directory)
- `localStorage['bbi_vendors']` — Vendor directory UI state (sort field, sort asc, collapsed sections). NOTE: Does NOT use the `bbiPlanner_` prefix convention.
- `localStorage['projexp5_binder_state']` — Binder tool UI session state: `{ folderPath, contractNumber, customerName, watermarkEnabled, coverPageEnabled }`. **NOT migrated** — ephemeral session convenience only.
- `localStorage['tmDocuSignConfig']` — DocuSign anchor config for TM agreement tool. **NOT migrated** — ephemeral UI config.
- `localStorage['tmAgreementData']` — TM agreement form data (cleared on save). **NOT migrated** — ephemeral.
- `localStorage['contract_{num}']` — Per-contract state for TM agreement tool (dynamic key pattern, e.g. `contract_C26001`). **NOT migrated** — ephemeral.
- `localStorage['tmAgreementConfig']` — TM agreement configuration (company info, contract defaults, timeline, features) from `tm-agreement-config-v3.js`. **NOT migrated** — ephemeral UI config.

---

### 3.5 BB-DocEngine (doc_*)

**Current state:** Rich local JSON database. Most of its "master data" (clients, properties, subs, trades, master items) moves to Compartment 1. Working data = contracts, binder settings, estimate templates, QBO notes backup.

```typescript
// doc_contracts — Construction contracts (the core DocEngine entity)
export const docContracts = pgTable('doc_contracts', {
  id:          text('id').primaryKey(),                 // 'C{YY}{seq3}' (e.g., 'C26001')
  customerId:  text('customer_id').notNull(),           // FK customers.id
  propertyId:  text('property_id'),                     // FK properties.id
  estimateId:  text('estimate_id'),                     // FK rev_estimates.id (cross-app!)
  name:        text('name'),                            // Contract/project name (used in search)
  description: text('description'),                     // Project description (used in search)
  type:        text('type').default('residential'),     // Contract type (e.g., 'residential')
  folderPath:  text('folder_path'),                     // Local filesystem path to contract folder
  contractNumber: text('contract_number'),
  status:      text('status').default('draft'),         // 'draft', 'pending-signature', 'signed', 'active', 'completed', 'archived'
  amount:      doublePrecision('amount'),               // Contract amount (code uses 'amount' not 'totalAmount')
  signedDate:  date('signed_date'),
  startDate:   date('start_date'),
  endDate:     date('end_date'),                        // Code uses 'endDate' not 'completionDate'
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "binderDocuments": [...],    // Array of document refs in binder
  //   "exhibits": [...],           // Attached exhibits
  //   "changeOrders": [...],       // Change order history
  //   "signatureStatus": {},       // Adobe Sign status
  //   "watermarkConfig": {},       // Per-contract watermark overrides
  // }
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp — query enrichment_history WHERE changed_at <= this for point-in-time reconstruction
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_doc_customer').on(table.customerId),
  index('idx_doc_status').on(table.status),
]);

**Contract field name mapping:** contracts.json uses different field names:
| JSON field | Schema column | Notes |
|-----------|--------------|-------|
| `clientId` | `customerId` (customer_id) | FK to customers.id |
| `amount` | `amount` | Contract dollar amount (NOT 'totalAmount') |
| `endDate` | `endDate` (end_date) | Completion date (NOT 'completionDate') |

**Contract ID format:** Code generates IDs as `C{YY}{seq3}` (e.g., `C26001`), NOT `CON-00001`.

**Contract status values:** `'draft'`, `'pending-signature'`, `'signed'`, `'active'`, `'completed'`, `'archived'` (archived on soft-delete). Note: DATA_MODELS.md uses PascalCase (`Active`, `Draft`, `Complete`, `Void`) — on migration, normalize to lowercase.

// doc_estimate_templates — Reusable estimate templates for DocEngine
// NOTE: db/estimate-templates.json wraps templates in { "templates": [...] } — unwrap on migration.
// NOTE: JSON field is `items` — map `items` → `sections` column on migration.
export const docEstimateTemplates = pgTable('doc_estimate_templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  category:    text('category'),                        // Template category
  durationWeeks: integer('duration_weeks'),
  sections:    jsonb('sections').default([]),           // Template sections with default items
  // sections/items schema: Same structure as proj_estimate_templates.items
  // Array of { id, name, section, phase, trade (optional — empty string allowed despite FK),
  //   order, ps ('P'|'S'), by ('BBI'|'SUB'|'OWN'), dur, durVal, durUnit, schedDur,
  //   lead, bufL (buffer left), bufR (buffer right), crew (integer),
  //   hrs, nonLabor, avgCost, tier, tiers: { basic, standard, premium },
  //   scope, sources: [{ id, type }], prefSource, keywords }
  isActive:    boolean('is_active').default(true),
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// doc_qbo_notes_backup — Backup of QBO customer notes before sync overwrites
export const docQboNotesBackup = pgTable('doc_qbo_notes_backup', {
  id:          text('id').primaryKey(),
  customerId:  text('customer_id').notNull(),           // FK customers.id — NOT present in source JSON; must be resolved from qboId → customers.qboId on migration
  qboId:       text('qbo_id').notNull(),                // QBO Customer.Id
  displayName: text('display_name'),                    // QBO Customer DisplayName (e.g., "Smith, John") — present per record in qbo-notes-backup.json
  oldNotes:      text('old_notes'),                      // Notes before DocEngine wrote (code uses 'oldNotes')
  newNotes:    text('new_notes'),                       // Notes after DocEngine wrote
  // Notes format: "(beds / baths / garage), (sqft / lot)" + Google Maps + Zillow + Redfin URLs
  syncedAt:    timestamp('synced_at', { withTimezone: true }).defaultNow(),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Document type codes (used across DocEngine + eSigner):**
| Code | Full Name | Usage |
|------|-----------|-------|
| ES | Estimate | Binder section, PDF metadata |
| TM | T&M Agreement | Binder section, eSigner overlay |
| XB | Notice to Owner | Binder section |
| XC | Proof of Insurance | Binder section |
| XD | 3-Day Notice (Right to Cancel) | Binder section |
| CO | Change Order | Binder section |
| BD | Binder | Combined document |
| SG | Signed Package | Post-signature bundle |

**Watermark types:** `text-logo`, `text`, `inherit`, `none`

---

### 3.6 Invoice_Validate2 (inv_*)

**Current state:** Validates invoices/receipts against QBO. Chrome extension with 20 validation checks. **NOTE:** All inv_* tables are **forward-looking** — the current code generates results in-memory only and never persists to a database. On migration (DB-7 phase), the extension will POST results to Bridge for Neon persistence. Until then, suppressions use `localStorage['bb-suppressed-checks']`.

```typescript
// inv_validation_runs — Batch validation sessions
export const invValidationRuns = pgTable('inv_validation_runs', {
  id:          text('id').primaryKey(),
  runDate:     timestamp('run_date', { withTimezone: true }).defaultNow(),
  periodStart: date('period_start'),
  periodEnd:   date('period_end'),
  customerId:  text('customer_id'),                     // FK customers.id (invoice customer)
  totalItems:  integer('total_items').default(0),
  matched:     integer('matched').default(0),
  unmatched:   integer('unmatched').default(0),
  flagged:     integer('flagged').default(0),
  passCount:   integer('pass_count').default(0),
  failCount:   integer('fail_count').default(0),
  noteCount:   integer('note_count').default(0),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "laborTotal": 0,
  //   "nonLaborTotal": 0,
  //   "ohTotal": 0,
  //   "subtotal": 0,
  //   "grandTotal": 0,
  //   "expectedOH": 0,                     // 12% of subtotal
  //   "ohVariance": 0,
  //   "categoryTotals": {},
  //   "bbInvoiceFilename": "",
  //   "version": "1.0.119"
  // }
  enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(), // Enrichment version timestamp — query enrichment_history WHERE changed_at <= this for point-in-time reconstruction
  status:      text('status').default('completed'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// inv_validation_checks — Structured results for each of the 20 checks
export const invValidationChecks = pgTable('inv_validation_checks', {
  id:          text('id').primaryKey(),
  runId:       text('run_id').notNull(),                // FK inv_validation_runs.id
  checkName:   text('check_name').notNull(),
  // checkName enum (20 checks, exact names from code):
  //   'No Blank Fields', 'No "0" Amounts', 'No Dups', 'Categories Valid',
  //   'Emp. Names', 'Svc Dates L:... O:...' (dynamic date range), 'Labor Rate',
  //   'Labor Cleared', '>8 Hrs Chk', 'Big Qty/Rate', "Mat'l Qty. is 1",
  //   'Items Cleared', 'Evans Hours', 'No SubTot. Line', 'OH Exists & Correct',
  //   'Landfill Chk', 'Rental Chk', 'Receipt Chk', 'Suggestion Chk', 'Pay Option Chk'
  checkOrder:  integer('check_order'),                  // 1-20
  passed:      boolean('passed').default(false),
  errorCount:  integer('error_count').default(0),
  infoCount:   integer('info_count').default(0),
  details:     jsonb('details').default([]),            // Array of error/info items
  // Each item: { line, field, desc, name, date, qty, amount, reason }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_inv_check_run').on(table.runId),
]);

// inv_receipt_matches — Individual receipt-to-QBO-transaction matches
export const invReceiptMatches = pgTable('inv_receipt_matches', {
  id:          text('id').primaryKey(),
  runId:       text('run_id').notNull(),                // FK inv_validation_runs.id
  receiptFile: text('receipt_file'),                    // Original filename
  vendorId:    text('vendor_id'),                       // FK vendors.id
  jobcodeId:   text('jobcode_id'),                      // FK work_jobcodes.id
  amount:      doublePrecision('amount'),
  date:        date('date'),
  qboTxnId:    text('qbo_txn_id'),                     // Matched QBO transaction ID
  qboTxnType:  text('qbo_txn_type'),                   // 'Purchase', 'Bill', 'Expense'
  matchStatus: text('match_status'),                    // 'exact', 'fuzzy', 'unmatched', 'duplicate'
  details:     jsonb('details').default({}),            // { confidence, matchReason, thumbnail }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_inv_match_run').on(table.runId),
  index('idx_inv_match_status').on(table.matchStatus),
]);

// inv_validation_suppressions — User-suppressed check results
export const invValidationSuppressions = pgTable('inv_validation_suppressions', {
  id:          text('id').primaryKey(),
  runId:       text('run_id').notNull(),                // FK inv_validation_runs.id
  checkKey:    text('check_key').notNull(),             // Format: "${checkName}::${errorDescs.join('|')}"
  suppressedBy: text('suppressed_by'),                  // User/role
  reason:      text('reason'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Configuration constants (move to app_settings on migration):**
- `OH_RATE`: 0.12 (12% overhead markup)
- `OH_CATEGORY`: "OH & Ins"
- `LANDFILL_MARKUP`: 100
- `VALID_CATEGORIES`: `['Labor', 'Materials', 'Sub-Con', 'Landfill', 'Rental', 'City', 'Credit', 'OH & Ins', 'Fee']` (9 values)
- `VALID_EMPLOYEES`: `['Evan', 'Christian', 'Felipe', 'Matt', 'Chad', 'Ross', 'Clay', 'Jesus', 'Aiden', 'Brian', 'Erik', 'Tyler', 'Nick', 'Nicholas', 'Iaroslav', 'Yarik', 'Alfonso']` (17 values)
- `MAX_REASONABLE_QTY`: 500
- `MAX_REASONABLE_RATE`: 10000
- `INVOICE_CYCLE_DAYS`: 14

**Receipt filename pattern:** `B/R_Vendor_Jobcode_DMMDDYY_THHMM_Cxxxxx.pdf`

---

### 3.7 Chase_Expense_Validator (chase_*)

**Current state:** Chrome extension. Scrapes transactions from 3 sites (Chase, Home Depot, San Lorenzo), validates against QBO, manages cardholder mappings. Supports CSV sideload.

```typescript
// chase_validation_sessions — Scraped & validated transaction batches
export const chaseValidationSessions = pgTable('chase_validation_sessions', {
  id:          text('id').primaryKey(),
  site:        text('site').notNull(),                  // 'chase', 'homedepot', 'sanlorenzo'
  source:      text('source'),                          // 'scrape', 'sideload-chase', 'sideload-homedepot', 'sideload-sanlorenzo'
  sessionDate: timestamp('session_date', { withTimezone: true }).defaultNow(),
  totalScraped: integer('total_scraped').default(0),
  totalMatched: integer('total_matched').default(0),
  totalUnmatched: integer('total_unmatched').default(0),
  transactions: jsonb('transactions').default([]),
  // Transaction schema (varies by site, superset of all fields):
  // {
  //   "date": "2026-01-20",                 // YYYY-MM-DD
  //   "vendor": "Home Depot #1234",         // Vendor/merchant name (<=60 chars)
  //   "amount": 123.45,                     // Absolute value
  //   "card": "2145",                       // Last 4 digits (or "----" for SanLorenzo)
  //   "category": "Shopping",               // Chase category, "Home Depot", "SanLorenzo", "Pending", "Uncategorized"
  //   "isPending": false,                   // Chase-only: pending transaction
  //   "isCredit": false,                    // Negative amount / credit
  //   "source": "chase",                    // Site source
  //   "jobName": "Cortez Kitchen",          // Parsed job name (shared: Home Depot + San Lorenzo)
  //   -- Home Depot specific --
  //   "receiptNo": "12345 - 67890",         // Receipt number
  //   "products": ["2x4 Stud", "Nails"],   // Product names
  //   -- San Lorenzo specific --
  //   "invoiceNo": "55-1008795",            // Raw MyBldr format DD-DDDDDDD (no "SL-" prefix)
  //   "balanceDue": 250.00,                 // Optional: remaining balance (scrape only, not in sideload adapter)
  //   "isReturn": false,                    // Backward-compat alias for isCredit (Chase sideload only)
  //   -- Sideload specific --
  //   "employee": "Evan",                   // From CSV Card/Account Nickname
  //   "transactionId": "TX-12345",          // For HD sideloads
  //   "store": "HD #1234",                  // For HD sideloads
  //   -- Validation result (from QBO) --
  //   "inQbo": true,                        // Whether matched in QuickBooks
  //   "qboMatch": {
  //     "qboJob": "Cortez",                 // Job name from QBO
  //     "qboBillable": true                 // Billable status
  //   },
  //   "attachments": [],                    // QBO attachment metadata
  //   "status": "matched",                  // 'matched', 'unmatched', 'pending'
  //   "fingerprint": "2026-01-20|123.45|home depot" // Dedup key — COMPUTED at runtime via getTxnFingerprint(), NOT stored on transaction objects in code. DB-7 persistence layer must compute and attach when writing to Neon.
  // }
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "source": "scrape" | "sideload",
  //   "sideloadFile": "chase_jan2026.csv",
  //   "bridgeMode": "desktop" | "cloud",    // desktop = Mini_API_Bridge (localhost:3100)
  //                                          // cloud = Railway (bb-micro-bridge-production.up.railway.app)
  //   "dateRange": 14,
  //   "dateBuffer": 3
  // }
  //
  // Bridge API response contract (from /api/verify endpoint):
  // {
  //   "data": {
  //     "results": [                         // Array matching transaction order
  //       { "inQbo": true, "qboMatch": { "qboJob": "...", "qboBillable": true },
  //         "attachments": [{ "fileName": "receipt.pdf" }], "status": "matched" }
  //     ],
  //     "summary": { "inQbo": 5, "total": 10, "withReceipts": 3 }
  //   }
  // }
  //
  // Attachment metadata structure: { fileName: string, FileName?: string }
  //   (API returns camelCase; QBO may return PascalCase — code handles both)
  //
  // Settings update IPC: popup.js broadcasts via chrome.tabs.sendMessage (per-tab, not runtime)
  //   { type: 'CHASE_BB_SETTINGS_UPDATED', settings: { bridgeUrl, dateRange, debugMode, bridgeMode }, cardholders }
  //   Content script listens and updates SETTINGS + CARDHOLDERS in-memory.
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_chase_site').on(table.site),
  index('idx_chase_date').on(table.sessionDate),
]);
```

**Sideload adapter field coverage note:** Sideload adapters emit fewer fields than live scrapers:
- `sideload-sanlorenzo`: omits `balanceDue`, `card`
- `sideload-homedepot`: omits `products`, `category`
- All sideload adapters: `isReturn` only emitted by Chase CSV sideload (backward-compat alias for `isCredit`)
- Scraped Chase transactions: `employee` is enriched at render time via CARDHOLDERS lookup (not stored on transaction object)

**Content script SETTINGS note:** The content script's in-memory SETTINGS object loads `bridgeUrl` from `chase-bb-settings` and `autoVerify` from the separate `bb_autoVerify` key (NOT from `chase-bb-settings`). `dateBuffer` is **hardcoded** at `3` in the content script (never read from storage). `dateRange`, `debugMode`, and `bridgeMode` are stored in chrome.storage but only used by `popup.js`, not the content script. On migration, `dateBuffer` must be seeded from the hardcoded default (`3`), not from chrome.storage.

**Fingerprint format inconsistency:** `getTxnFingerprint()` produces `{date}|{amount.toFixed(2)}|{vendor_first_15_lowercase}` but `saveHiddenRows()` stores raw `{date}|{amount}|{vendor_first_15}` (no toFixed, no lowercase). This code-level inconsistency means hide/gray states may fail to match. Schema documents the canonical `getTxnFingerprint` format only.

**Fingerprint dedup format:**
- San Lorenzo (has invoiceNo): `inv:{invoiceNo}`
- Chase/Home Depot: `{date}|{amount}|{vendor_first_15_chars_lowercase}`

**Cardholder mappings (hardcoded in content-v27.js, move to employees.enrichment.cardLast4):**
| Card Last 4 | Employee | Status |
|-------------|----------|--------|
| 2145 | Evan | Active |
| 2160 | Chad | Active |
| 2152 | Christian | Active |
| 2178 | Ross | Active |
| 2186 | Clay | Active |
| 2194 | Matt | Active |
| 8030 | Ross-Old | Inactive |
| 5929 | Matt-Old | Inactive |
| 2131 | Christian-Old | Inactive |
| 1942 | Chad-Old | Inactive |
| 8003 | Clay-Old | Inactive |
| 3570 | Evan-Old | Inactive |

**chrome.storage keys (ephemeral, optional Neon persistence):**
- `bbCardholders` (content script) / `chase-cardholders` (popup) — Cardholder mappings (→ employees.enrichment.cardLast4)
  - NOTE: Key name inconsistency between popup.js (`chase-cardholders`) and content script (`bbCardholders`). Both reference the same data. On migration to Neon, consolidate to a single source.
  - Currently hardcoded in content-v27.js CARDHOLDERS object; popup allows user JSON editing.
- `bb_autoVerify` — Auto-verify toggle (→ app_settings)
- `chase-bb-settings` — Bridge config (→ app_settings)
- `{site}HiddenTxns` — Hidden transaction fingerprints per site
- `{site}GrayedTxns` — Grayed transaction fingerprints per site

---

### 3.8 Adobe eSigner (esign_*)

**Current state:** PDF overlay management and Adobe Sign integration. Manages section templates, contractor profiles, and signing workflows.

```typescript
// esign_agreements — Sent-for-signature document tracking
export const esignAgreements = pgTable('esign_agreements', {
  id:          text('id').primaryKey(),
  contractId:  text('contract_id'),                     // FK doc_contracts.id (cross-app!)
  customerId:  text('customer_id'),                     // FK customers.id
  //            NOTE: customerId is not currently populated by code. The /api/tag-pdf endpoint
  //            accepts contractNumber/projectName/projectAddress but no customerId parameter.
  //            Population mechanism TBD — likely derived from contract lookup during DB-8.
  adobeAgreementId: text('adobe_agreement_id'),         // Adobe Sign agreement ID
  documentName: text('document_name'),
  contractNumber: text('contract_number'),              // Contract/project ID
  projectName: text('project_name'),
  projectAddress: text('project_address'),
  projectLabel: text('project_label'),                  // Short identifier for filenames
  status:      text('status').default('draft'),
  // Status enum: 'draft', 'tagged', 'sent', 'in-process', 'viewed', 'signed', 'completed', 'cancelled'
  // NOTE: Status mapping from Adobe Sign API to these values is not yet implemented.
  // Code currently returns raw Adobe Sign status. Mapping logic needed during DB-8 migration.
  sentAt:      timestamp('sent_at', { withTimezone: true }),
  signedAt:    timestamp('signed_at', { withTimezone: true }),
  fieldsApplied: integer('fields_applied'),             // Count of PDF fields tagged
  pages:       jsonb('pages').default([]),               // Page numbers with tagged fields
  signers:     jsonb('signers').default([]),
  // signers schema: [{ role ('signer1'|'signer2'|'signer3'), name, email }]
  // NOTE: pdf-tagger.js maps contractor→signer1, owner1→signer2, owner2→signer3 (Adobe Sign numbered roles).
  // No 'order' or 'label' fields in the output — only role, name, email.
  participants: jsonb('participants').default([]),       // Signer participant data
  //            NOTE: participants are built from PDF metadata keywords by
  //            buildParticipantsFromMetadata(), NOT fetched from Adobe Sign API.
  //            getAgreementStatus() returns full agreement object but code never extracts
  //            Adobe's participantSetsInfo. sendForSignature() constructs participants
  //            from PDF-embedded signer tags. On DB-8 migration, persist these locally-built
  //            participants, not raw API data.
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "overlayId": "binder-v1",
  //   "sections": ["TM_Agreement", "Estimate"],
  //   "pdfUrl": "",
  //   "pdfMetadataKeywords": {              // Structured keywords embedded by pdf-metadata-v1.js
  //                                         // Values shown are PARSED output of parsePdfKeywords()
  //     "docType": "agreement",             // DOC_TYPE_MAP.id value: "agreement", "estimate", "mechanics_lien", "binder"
  //     "docCode": "TM",                    // Short code (ES/TM/XB/XC/XD/CO/BD/SG)
  //     "contract": "CON-00001",            // Contract reference
  //     "signers": [                        // ARRAY of signer objects (parsed from pipe-delimited SIGNERS keyword)
  //       { "role": "contractor", "name": "Evan Bainbridge", "email": "evan@..." },
  //       { "role": "owner1", "name": "Client Name", "email": "client@..." }
  //     ],
  //     "manifest": [                       // ARRAY of document section objects (parsed from MANIFEST keyword)
  //       { "index": 0, "filename": "doc.pdf", "code": "TM", "date": "2026-03-14", "startPage": 1, "endPage": 3 }
  //     ],
  //     "fields": [                         // ARRAY of per-section field counts (parsed from FIELDS keyword)
  //       { "docType": "agreement", "startPage": 1, "endPage": 3, "fieldCount": 12 }
  //     ]
  //   }
  // }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_esign_status').on(table.status),
  index('idx_esign_customer').on(table.customerId),
]);

// esign_overlay_registry — PDF overlay field definitions
export const esignOverlayRegistry = pgTable('esign_overlay_registry', {
  id:          text('id').primaryKey(),
  name:        text('name'),                            // Display name for UI
  docType:     text('doc_type').notNull(),
  // docType enum (currently in sections-registry.json):
  //   'TM_Agreement', 'Estimate', 'Mechanics_Lien', 'Insurance', '3Day_Notice'
  // Planned but not yet in registry: 'Change_Order', 'Binder'
  // NOTE: sections-registry.json ALREADY uses canonical underscore IDs (TM_Agreement, etc.).
  // NOTE: .overlay.json staging files have NO docType field — on migration, derive docType
  //   from templateId (e.g., strip "_overlay" suffix: "Mechanics_Lien_overlay" → "Mechanics_Lien").
  //   EXCEPTION: "Contract_Overlay" → "TM_Agreement" (not just stripping suffix — requires explicit mapping).
  //   EXCEPTION: "3Day_Notice_Blank_overlay" → "3Day_Notice" (treat Blank as variant of 3Day_Notice).
  //   EXCEPTION: Job-specific overlays (e.g., "Contract_C25038_Eklund_*_overlay") → fall back to
  //     registry.json _staging[*].docType field (normalize "T&M Agreement" → "TM_Agreement").
  //   Non-.overlay.json files in _staging/ (v1-binded-contract.json, Contract_New.json, Contract_Binder.json,
  //     Contract_Binder_8pg.json, Overlay_8pages_dual.json, test_contract.json) — NOT migrated (development artifacts).
  // NOTE: .overlay.json files also lack a `name` field — synthesize from templateId on migration.
  // NOTE: .overlay.json files contain a `signers` sub-array ({ id, role, required, order })
  //   using human-readable role labels ("Property Owner 1", "Contractor") — discard or normalize
  //   to canonical signer IDs (owner1, contractor) on migration.
  variant:     text('variant'),                         // e.g., '3pg', '1pg', '2pg'
  pageCount:   integer('page_count').notNull(),
  description: text('description'),
  file:        text('file'),                            // Source filename reference
  displayOrder: integer('display_order').default(0),
  fieldCount:  integer('field_count').default(0),       // Denormalized count of fields
  pagesWithFields: jsonb('pages_with_fields').default([]), // Array of page numbers that have fields
  pageSize:    jsonb('page_size'),                      // { width, height } in points (default 612x792)
  fields:      jsonb('fields').default({}),
  // fields schema: DUAL FORMAT — server code handles BOTH:
  //   1. Section files (.json): `{ "pages": { "1": { "fields": [...] } } }` (v1/pages-nested)
  //   2. Overlay files (.overlay.json): `{ "fields": [...] }` (flat array, each field has `page` property)
  // Neon schema uses the pages-nested format as canonical:
  // {
  //   "1": {                                // Page number
  //     "fields": [
  //       {
  //         "id": "tm3-p1-owner1-init",     // Unique field ID
  //         "type": "initials",             // 'signature', 'initials', 'date', 'text', 'checkbox'
  //         "signer": "owner1",             // 'contractor', 'owner1', 'owner2', 'witness'
  //         "x": 565,
  //         "y": 336,
  //         "width": 35,
  //         "height": 30,
  //         "label": "Owner 1 Init",        // Human-readable label
  //         "required": true                // boolean (field requirement)
  //       }
  //     ]
  //   }
  // }
  // NOTE: .overlay.json files use DIFFERENT field shape:
  //   { id, type, "signerId" (not "signer"), "page": 1,
  //     "rect": { x, y, width, height } (nested, not flat), required, label }
  // On migration, normalize overlay format to canonical (flatten rect, rename signerId→signer, group by page).
  isActive:    boolean('is_active').default(true),
  reason:      text('reason'),                          // Why inactive (e.g., "staging")
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_esign_doctype').on(table.docType),
]);

// esign_signers — Contractor/signer profiles for signing workflows
// Currently stored in data/settings/contractors.json (keyed object: { "evan": {...}, "sam": {...} })
// On migration, extract the object key as the `id` value.
export const esignSigners = pgTable('esign_signers', {
  id:          text('id').primaryKey(),                  // 'evan', 'sam', etc. (from object key)
  firstName:   text('first_name'),                      // Code uses 'fname' — map fname → firstName on migration
  lastName:    text('last_name'),                       // Code uses 'lname' — map lname → lastName on migration
  email:       text('email'),
  phone:       text('phone'),
  title:       text('title'),                           // 'Owner', 'Project Manager', etc.
  signerType:  text('signer_type').default('contractor'), // 'contractor', 'owner', 'witness'
  //            NOTE: signerType is not used in the current codebase. The app hardcodes
  //            signer IDs as 'contractor', 'owner1', 'owner2' internally.
  //            contractors.json has no signerType field. Kept for future use.
  isActive:    boolean('is_active').default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

**Adobe Sign configuration** moves to `app_settings` (adobe_esigner, api):
- `apiBaseUrl`, `clientId`, `clientSecret`, `refreshToken`, `accessToken`, `accessTokenExpiry`, `webhookUrl`, `enabled`

---

### 3.9 Landfill_Surcharge (lf_*)

**Current state:** Calculates landfill surcharge markups on QBO Purchase line items. Manages session state, crew assignments, and attachment viewing. **NOTE:** The `lf_surcharge_calculations` table is **forward-looking** — the app currently uses localStorage exclusively and never writes to a database. Session data is stored in `localStorage['landfill_surcharge_session']` with only `{surcharge, checked}` per row choice (not the full breakdown). On migration (DB-8 phase), the app will POST completed scan results to Bridge for Neon persistence.

```typescript
// lf_surcharge_calculations — Calculated surcharges per period
export const lfSurchargeCalculations = pgTable('lf_surcharge_calculations', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  itemName:    text('item_name').default('Landfill'),
  totalInvoiced: doublePrecision('total_invoiced').default(0),
  surchargeAmount: doublePrecision('surcharge_amount').default(0),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "invoiceBreakdown": [                 // Per-line-item results (keyed by purchase.Id:lineIdx at runtime)
  //     {
  //       "purchaseId": "QBO-123",
  //       "lineIdx": 0,
  //       "vendor": "Vendor Name",
  //       "date": "2026-01-20",
  //       "amount": 200.00,                 // Line base amount
  //       "surcharge": 50,                  // Surcharge dollars (enum: 0, 50, 100)
  //       "markupPct": 25.0000,             // Calculated markup % (4 decimal places)
  //       "salesAmt": 250.00,               // Base + markup
  //       "existingMarkup": 0,              // Current markup % from QBO
  //       "expectedPct": 25.0000,           // Target markup %
  //       "markupCorrect": false,           // Whether existing matches expected
  //       "status": "new",                  // 'new', 'skipped', 'applied', 'error'
  //       "crew": "Evan"                    // Crew assignment (from paste)
  //     }
  //   ],
  //   "notes": "",
  //   "sortState": { "field": null, "dir": null }  // 3-way: null -> 'asc' -> 'desc'
  // }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Markup formula:** `markupPct = ((surcharge + amount) / amount - 1) * 100` (rounded to 4 decimal places via `Math.round(pct * 10000) / 10000`). On Neon migration, use `decimal(10,4)` for markupPct to avoid JavaScript floating-point drift.

**Surcharge options:** `0`, `50`, `100` (dollars)

**QBO sparse update note:** When applying markups, the app sends a sparse Purchase update preserving all line types (ItemBasedExpenseLineDetail, AccountBasedExpenseLineDetail) and only modifying `MarkupInfo: { PercentBased: true, Percent: markupPct }` on the target line.

**Ephemeral state (NOT persisted to Neon):**
- `localStorage['landfill_surcharge_session']` — Per-scan session state (dates, sort, row choices, crew map)
- `localStorage['landfill_surcharge_settings']` — App settings mirror
- In-memory `attachmentCache` — QBO attachment metadata keyed by Purchase ID (batch size 3, up to 2 retries with 2000ms fixed backoff, respects 429 rate-limit, marks 'none' after exhausted retries)

---

## 4. SHARED INFRASTRUCTURE TABLES

*Already defined in BB_DB_STRATEGY.md v1.5 Section 14. Summary:*

| Table | Purpose |
|-------|---------|
| `enrichment_fields` | Registry of all enrichment field definitions (entity_type, field_key, field_type, options) |
| `app_field_subscriptions` | Which apps subscribe to which enrichment fields |
| `app_settings` | Per-app and global configuration (JSONB settings per app+category) |
| `audit_log` | Platform-wide audit trail (enhanced with MDM columns — see below) |
| `sync_log` | QBO/QBT sync history and statistics |
| `enrichment_history` | Field-level enrichment change tracking |

See BB_DB_STRATEGY.md v1.5 Section 14 for complete Drizzle schemas.

### 4.1 audit_log MDM Enhancements

The existing `audit_log` table (defined in BB_DB_STRATEGY.md) gains 1 additional column for MDM traceability:

```typescript
// Additional column on audit_log (append to existing schema):
  changeSource:      text('change_source'),             // 'qbo_sync', 'qbt_sync', 'enrichment', 'manual', 'merge', 'system'
// NOTE: master_data_version and field_path removed in v2.23 — enrichment_history table covers
// field-level change tracking with old/new values, making these audit_log columns redundant.
```

### 4.2 enrichment_history

**Purpose:** Field-level enrichment change tracking. Captures every enrichment change with old/new values for point-in-time reconstruction. To reconstruct enrichment at a past time: query WHERE entity_id=X AND changed_at <= $ts ORDER BY changed_at.

```typescript
// enrichment_history — Field-level enrichment change tracking
// Captures every enrichment change with old/new values for point-in-time reconstruction.
// To reconstruct enrichment at a past time: query WHERE entity_id=X AND changed_at <= $ts ORDER BY changed_at
export const enrichmentHistory = pgTable('enrichment_history', {
  id:                 text('id').primaryKey(),               // 'EH-{uuid}'
  entityType:         text('entity_type').notNull(),          // 'employee', 'customer', 'vendor', 'work_jobcode', 'property', 'master_item'
  entityId:           text('entity_id').notNull(),            // FK to C1 entity id
  fieldName:          text('field_name').notNull(),           // 'payRate', 'aliases.gs_receipts', 'trade', etc.
  oldValue:           jsonb('old_value'),                     // Previous value (null for new fields)
  newValue:           jsonb('new_value'),                     // New value
  enrichmentVersion:  integer('enrichment_version').notNull(), // Version number AFTER this change
  changedBy:          text('changed_by').default('system'),   // 'sam', 'system', 'migration'
  changedAt:          timestamp('changed_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_eh_entity').on(table.entityType, table.entityId),
  index('idx_eh_version').on(table.entityId, table.enrichmentVersion),
  index('idx_eh_date').on(table.changedAt),
]);
```

### Survivorship — Delegated to Bridge

QBO/QBT conflict resolution is handled by Mini_API_Bridge at sync time, NOT in the database layer:
- HR/Identity fields → QBO wins (Bridge merges QBO employee data as primary)
- Time/Scheduling fields → QBT wins (Bridge uses QBT as time authority)
- Financial fields → QBO wins (Bridge uses QBO as financial authority)

The database stores the RESULT of Bridge's sync — no conflict tracking needed.
Enrichment fields are BB-owned and never conflict with QBO/QBT data.

---

## 5. ENRICHMENT FIELD SEED DATA

Based on analysis of all 11 apps, here is the initial enrichment field registry.

### Enrichment Field Types

| field_type | Value Shape | When to Use |
|-----------|------------|-------------|
| `text` | `"string value"` | Free text (names, notes, IDs) |
| `number` | `45.00` | Numeric values (rates, counts) |
| `boolean` | `true` / `false` | Flags and toggles |
| `select` | `"option_value"` | Single choice from defined options |
| `tags` | `["tag1", "tag2"]` | Multi-select / tag arrays |
| `color` | `"#4A90E2"` | Hex color values |
| `date` | `"2026-12-31"` | Date strings |
| `object` | `{ ... }` | Structured data (single context) |
| **`context_map`** | `{ "context_key": <value> }` | **Per-app/per-context variants of the same field** |

**`context_map` convention:** When an enrichment field genuinely needs different values in different contexts (e.g., aliases that differ by app), the value is an object keyed by context identifier. Each app queries only its own key: `enrichment->'fieldName'->'app_key'`. The `enrichment_fields` registry `options` column lists valid context keys (e.g., `contexts: gs_receipts, chase, invoice`). Most enrichment fields do NOT need this — only use `context_map` when values genuinely differ by use case. The Data Manager UI shows all contexts side-by-side for editing.

### 5.1 Employee Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| alias | Short Name | text | - | TS_Exp5 | Phase 1 |
| payType | Compensation Type | select | hourly, salary, regular | TS_Exp5 | Phase 1 |
> **payType migration note:** `payType` is absent from inactive employees in unified-settings.json (their `compensation` object has only `payRate`/`billRate`). On migration, default missing `payType` to `null` (not "regular") — indicate unknown status for inactive employees.
| defaultCrew | Default Crew | select | A, B, C | CalExp5 | Phase 1 |
| scheduleColor | Schedule Color | color | - | CalExp5 | Phase 1 |

**CalExp5 enrichment note:** `defaultCrew`, `scheduleColor` are **forward-looking** — CalExp5 code currently uses hardcoded BADGE_COLORS and doesn't read these enrichment fields. Similarly, jobcode `color` and `sortOrder` are derived algorithmically (from recent usage), not from enrichment. These fields will be consumed after DB-2 migration when CalExp5 switches to Bridge reads.
| payRate | Pay Rate ($/hr) | number | - | TS_Exp5 | Phase 1 |
| billRate | Bill Rate ($/hr) | number | - | TS_Exp5, RevExp5 | Phase 1 |
| costRate | Cost Rate ($/hr) | number | - | RevExp5 | Phase 1 |
| workScheduleType | Work Schedule | select | full-time, part-time | TS_Exp5 | Phase 2 |
| workDays | Work Days | tags | Mon,Tue,Wed,Thu,Fri,Sat,Sun | TS_Exp5 | Phase 2 |
| workStartTime | Work Start | text | - | TS_Exp5 | Phase 2 |
| workEndTime | Work End | text | - | TS_Exp5 | Phase 2 |
| allowedWindowEarliest | Window Earliest | text | - | TS_Exp5 | Phase 2 |
| allowedWindowLatest | Window Latest | text | - | TS_Exp5 | Phase 2 |
| lunchDefaultStart | Lunch Start | text | - | TS_Exp5 | Phase 2 |
| lunchDefaultEnd | Lunch End | text | - | TS_Exp5 | Phase 2 |
| lunchDuration | Lunch Duration (min) | number | - | TS_Exp5 | Phase 2 |
| lunchRequired | Lunch Required | boolean | - | TS_Exp5 | Phase 2 |
| lunchRequiredAfterHours | Lunch After Hours | number | - | TS_Exp5 | Phase 2 |
| mileageDailyAllowance | Mileage Allowance | number | - | TS_Exp5 | Phase 3 |
| mileageVehicleType | Vehicle Type | select | company, personal, none | TS_Exp5 | Phase 3 |
| mileageHomeZip | Home ZIP | text | - | TS_Exp5 | Phase 3 |
| payPeriodTargetHours | Period Target Hours | number | - | TS_Exp5 | Phase 2 |
| overtimeApproved | Overtime Approved | boolean | - | TS_Exp5 | Phase 2 |
| cardLast4 | Chase Card Last 4 | text | - | Chase_Exp | Phase 3 |
| webauthnCredentials | WebAuthn Credentials | json | - | Bridge (auth) | Phase 2 (DB-2) |
| pinHash | PIN Hash | text | - | Bridge (auth) | Phase 2 (DB-2) |
| role | Role | select | crew, lead, foreman, pm, owner | All | Phase 1 |
| certifications | Certifications | tags | OSHA-30, First Aid, etc. | All | Phase 3 |
| vehicleAssignment | Vehicle | text | - | All | Phase 3 |
| emergencyContact | Emergency Contact | text | - | All | Phase 3 |
| tShirtSize | T-Shirt Size | select | XS, S, M, L, XL, 2XL | All | Phase 3 |

### 5.2 Customer Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| preferredContact | Preferred Contact | select | email, phone, text | DocEngine | Phase 2 |
| referralSource | Referral Source | text | - | DocEngine | Phase 3 |
| customerType | Customer Type | select | residential, commercial | DocEngine, RevExp5 | Phase 2 |
| tags | Tags | tags | - | DocEngine | Phase 2 |
| revenueCategory | Revenue Category | select | remodel, addition, new-build, repair | RevExp5 | Phase 2 |
| paymentTerms | Payment Terms | select | net-15, net-30, net-45, due-on-receipt | RevExp5 | Phase 3 |

### 5.3 Vendor Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| trade | Trade | select | (from trades table — 39 values) | DocEngine, PorjExp5 | Phase 1 |
| license | License # | text | - | DocEngine | Phase 2 |
| isSub | Is Subcontractor | boolean | - | DocEngine, PorjExp5 | Phase 1 |
| inVendorsDir | In Vendors Directory | boolean | - | PorjExp5 | Phase 1 |
> **inVendorsDir migration note:** `suppliers.json` uses `inVendors` (not `inVendorsDir`). Map `inVendors` → `inVendorsDir` on migration.
| autoTrade | Auto-Detected Trade | text | - | PorjExp5 | Phase 2 |
| keywords | Search Keywords | text | - | DocEngine | Phase 2 |
| aliases | Name Aliases | context_map | contexts: gs_receipts, chase, invoice | GS_Receipts, Chase_Exp, InvVal2 | Phase 2 |
| _userEdited | User-Edited Fields | object | - | DocEngine, PorjExp5 | Phase 2 |
| defaultJobcode | Default Jobcode | text | - | GS_Receipts | Phase 2 |
| receiptFilenamePatterns | Receipt Patterns | tags | - | Invoice_Validate2 | Phase 3 |

**Invoice_Validate2 enrichment note:** `receiptFilenamePatterns` (vendor) and `customerLastName`/`propertyAddress` (jobcode) are **forward-looking** — Invoice_Validate2 code currently uses hardcoded VENDOR_PATTERNS array and does not read from enrichment. These fields will be consumed after DB-7 migration.
| chaseCategory | Chase Category | select | building-materials, etc. | Chase_Exp | Phase 3 |
| w9OnFile | W-9 On File | boolean | - | All | Phase 3 |
| insuranceExpiry | Insurance Expiry | date | - | All | Phase 3 |
| paymentMethod | Payment Method | select | check, ach, credit-card | All | Phase 3 |
| notes | Vendor Notes | text | - | DocEngine | Phase 2 |

**Aliases note:** The `aliases` field for vendors is a **context_map** — each key is a context (app) identifier, and the value is that app's alias mapping. Structure: `{ "gs_receipts": { "RAW_NAME": "Canonical" }, "chase": { ... }, "invoice": { ... } }`. Each app queries only its own context key. On migration from GS_Receipts Aliases_S, existing mappings go under the `"gs_receipts"` context key.

### 5.4 Jobcode Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| color | Display Color | color | - | CalExp5 | Phase 1 |
| sortOrder | Sort Order | number | - | CalExp5 | Phase 1 |
| excludeFromProcessing | Exclude | boolean | - | TS_Exp5 | Phase 1 |
| excludeReason | Exclude Reason | text | - | TS_Exp5 | Phase 1 |
| receiptAliases | Receipt Aliases | context_map | contexts: gs_receipts, invoice | GS_Receipts, InvVal2 | Phase 2 |
| propertyAddress | Property Address | text | - | GS_Receipts | Phase 2 |
| customerName | Customer Name | text | - | RevExp5 | Phase 2 |
| customerLastName | Customer Last Name | text | - | Invoice_Validate2 | Phase 2 |
| propertyId | Property Link | text | - | DocEngine | Phase 3 |
| revenueCategory | Revenue Category | select | labor, materials, sub | RevExp5 | Phase 2 |
| projectStatus | Project Status | select | active, completed, on-hold | RevExp5 | Phase 2 |
| estimateNumber | Linked Estimate | text | - | RevExp5 | Phase 2 |

**Receipt aliases note:** The `receiptAliases` field is a **context_map** — each key is a context (app) identifier. Structure: `{ "gs_receipts": { "aliases": ["Oak", "Oakland"], "address": "123 Oakland Ave" }, "invoice": { "aliases": ["Oakland"] } }`. GS_Receipts context includes the address for reverse lookup (from Aliases_J 3-column format). On migration, existing Aliases_J data goes under the `"gs_receipts"` context key.

### 5.5 Property Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| tags | Tags | tags | - | DocEngine | Phase 2 |
| notes | Property Notes | text | - | DocEngine | Phase 2 |
| streetView | Street View | object | url, date, panoId, available | DocEngine | Phase 2 |
| zillowUrl | Zillow URL | text | - | DocEngine | Phase 2 |
| redfinUrl | Redfin URL | text | - | DocEngine | Phase 2 |
| salesHistory | Sales History | object | lastPrice, lastDate, zillowUrl, redfinUrl | DocEngine | Phase 2 |
| photos | Property Photos | object | array of {url, type, source, date} | DocEngine | Phase 3 |

**Property enrichment note:** These fields are derived from geocoding and manual research in BB-DocEngine. On migration from properties.json, `streetView`, `zillowUrl`, `redfinUrl`, `salesHistory`, and `photos` move from top-level JSON fields into the `enrichment` JSONB column. The `salesHistory` dual-format (object vs array) must be normalized to object format on migration (see Section 2.5 notes).

---

## 6. APP SETTINGS SEED DATA

Based on analysis of all app settings files:

### 6.1 Global Settings (_global)

```jsonc
// app_settings: { appName: '_global', category: 'company' }
{
  "name": "Bainbridge Builders Inc.",
  "licenseNumber": "BAINBBU836N1",
  "qboCompanyId": "349328",
  "phone": "(408) 781-2364",
  "email": "info@bainbridgebuilders.com",
  "address": { "street": "123 Main Street", "city": "Bainbridge Island", "state": "WA", "zip": "98110" },
  "officers": {                            // NOTE: Code stores as NUMBERED OBJECT, not array
    "1": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" },
    "2": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" },
    "3": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" }
  }                                       // On migration, normalize to array if preferred
}

// app_settings: { appName: '_global', category: 'payroll' }
{
  "periodType": "biweekly",
  "anchorDate": "2026-01-08",
  "laborStartDay": 4,           // Thursday
  "invoiceDay": 0               // Sunday
}

// app_settings: { appName: '_global', category: 'sync' }
{
  "autoSync": true,
  "frequency": "6hours",
  "conflictResolution": "preferRemote"
}

// app_settings: { appName: '_global', category: 'document_types' }
// Shared across DocEngine + eSigner
{
  "ES": { "name": "Estimate", "alias": "Estimate" },
  "TM": { "name": "T&M Agreement", "alias": "TM Agreement" },
  "XB": { "name": "Notice to Owner", "alias": "Notice" },
  "XC": { "name": "Proof of Insurance", "alias": "COI" },
  "XD": { "name": "3-Day Notice", "alias": "3-Day" },
  "CO": { "name": "Change Order", "alias": "CO" },
  "BD": { "name": "Binder", "alias": "Binder" },
  "SG": { "name": "Signed Package", "alias": "Signed" }
}
```

### 6.2 Per-App Settings Examples

```jsonc
// === CalExp5 ===
// app_settings: { appName: 'calexp5', category: 'defaults' }
{
  "view": "year",                          // 'year' | 'month' (code uses 'view' not 'defaultView')
  // NOTE: entryMode is per-USER state — lives in cal_user_settings.details, NOT here.
  // Do NOT seed entryMode to app_settings; it belongs exclusively in cal_user_settings.
  "logLevel": "minimal",                  // 'minimal' | 'standard' | 'verbose'
  "disablePastDays": false,
  "showMockData": false,
  "exportUploadLog": false
  // NOTE: activeEmployeeIds is per-USER state — lives in cal_user_settings.details, NOT here.
  // See Section 9 migration table for authoritative field routing.
}

// === TS_Exp5 ===
// app_settings: { appName: 'ts_exp5', category: 'defaults' }
{
  "lunchDuration": 30,
  "lunchRequiredAfter": 4,
  "shiftStart": "07:00",
  "lunchAssignment": true
}
// app_settings: { appName: 'ts_exp5', category: 'special_jobcodes' }
{
  "lunch": "171969570",
  "sick": "56172044",
  "vacation": "56172048",
  "unpaid": "56172040",
  "shop": "65312908"
}
// app_settings: { appName: 'ts_exp5', category: 'qbt_fields' }
{
  "1136264": { "name": "Tasks", "required": false },
  "1136266": { "name": "Service Item", "required": true, "defaultValue": "Labor" },
  "1136268": { "name": "Class", "required": false },
  "1816264": { "name": "Property", "required": false },
  "1992560": { "name": "Billable", "required": true, "defaultValue": "Yes" }
}
// app_settings: { appName: 'ts_exp5', category: 'payroll' }
// payrollItemRefs from id-crossref.json
{ "payrollItemRefs": {} }
// app_settings: { appName: 'ts_exp5', category: 'publishing' }
// employeeTargets from id-crossref.json
{ "employeeTargets": {} }
// app_settings: { appName: 'ts_exp5', category: 'holidays' }
{ "companyHolidays": [] }
// app_settings: { appName: 'ts_exp5', category: 'validation' }
{ "checkOverrides": {} }

// === RevExp5 ===
// app_settings: { appName: 'revexp5', category: 'defaults' }
{
  "marginTarget": 18, "marginStrong": 25,
  "revenueTargetLabor": 55, "revenueTargetNonLabor": 25, "revenueTargetMarkup": 20,
  "avgBillRate": 85, "futureRevTarget": 0,
  "annualTarget": 600000,               // NOTE: annualTarget lives in TileStore defaults (tile-store-v2.js),
                                         // NOT in index.html defaultSettings. Managed exclusively by TileStore.
  "apiKey": "re_dev_key_revexp5",             // Micro-Bridge X-API-Key header value
  "bridgeUrl": "https://bb-micro-bridge-production.up.railway.app", // Bridge endpoint
  "cycleWeeks": 2, "warningDays": 15, "criticalDays": 30,
  "invoiceDay": 0, "laborStartDay": 4
}
// app_settings: { appName: 'revexp5', category: 'employees' }
// Flat {nameString: costRateNumber} map — migrates to employees.enrichment.costRate
// NOTE: This is the CODE DEFAULT from index.html defaultSettings.employees.
// Persisted file may have user-modified rates (e.g., Chad:59, Christian:45).
// Both short names and full names are mapped (e.g., "Chad": 55, "Chad Buthker": 55).
{
  "Chad": 55, "Chad Buthker": 55,
  "Christian": 41, "Christian Incze": 41,
  "Felipe": 55, "Felipe Sandoval Ontiveros": 55,
  "Matt": 45, "Matt Miguel": 45,
  "Evan": 70, "Evan Bainbridge": 70, "EVAN BAINBRIDGE": 70,
  "Clay": 48.14, "Clay Anderson": 48.14,
  "Ross": 45, "Ross Bainbridge": 45,
  "Aiden": 0, "Aiden Dugan-Roy": 0,
  "Nicholas": 0, "Nicholas Brenkwitz": 0,
  "Iaroslav": 0, "Iaroslav Semych": 0
}
// app_settings: { appName: 'revexp5', category: 'temporal' }
{
  "invoiceStartDate": "2024-12-30",       // DYNAMIC: code computes 1 year back from today
  "invoiceEndDate": "2026-12-13",         // DYNAMIC: code computes end of next year
  "cycleAnchorDate": "2026-01-11"         // Static anchor date
}
// NOTE: invoiceStartDate and invoiceEndDate are computed dynamically at runtime
// (1 year back / end of next year). Values shown are point-in-time examples,
// not fixed defaults. On migration, compute fresh values.
// app_settings: { appName: 'revexp5', category: 'display' }
{
  "defaultGroup": "cycle",               // 'individual' | 'cycle' | 'month' (UI options — no quarter/year)
  "themeMode": "light"                   // 'light' | 'dark' | 'system'
}
// app_settings: { appName: 'revexp5', category: 'features' }
{
  "claudeApiMode": false,
  "fullAiMode": false
}
// app_settings: { appName: 'revexp5', category: 'projections' }
{
  "cycleProjections": {},                // { cycleNum: projectionValue }
  "estimateSourceFolder": ""             // File system path for estimate discovery (NO code default — user-set only)
}

// === PorjExp5 ===
// app_settings: { appName: 'projexp5', category: 'defaults' }
{
  "laborRate": 85,
  "hrsPerDay": 8,
  "tierMult": { "basic": 0.85, "standard": 1.0, "premium": 1.25 },
  "skipPreAssigned": false,
  "lastTemplate": ""                     // Last loaded template ID (from bbiPlanner_lastTpl)
}
// app_settings: { appName: 'projexp5', category: 'item_directory' }
// Master item directory user overrides (from bbiPlanner_itemDirectory localStorage)
{}
// app_settings: { appName: 'projexp5', category: 'templates' }
{
  "userTemplates": {},                   // User-created estimate templates
  "templateOverrides": {}                // Customizations to built-in templates
}
// app_settings: { appName: 'projexp5', category: 'directories' }
{
  "subDirectorySortField": "name",
  "subDirectorySortAsc": true,
  "vendorDirectorySortField": "name",
  "vendorDirectorySortAsc": true
}

// === Invoice_Validate2 ===
// app_settings: { appName: 'inv_validate2', category: 'defaults' }
// NOTE: hoursTolerance lives in 'validation' category; thumbnailWidth lives in 'thumbnail' category.
// This category holds only naming/sanitization defaults from settings.json "naming" object.
{
  "maxVendorLength": 20,
  "maxDescriptionLength": 20,
  "sanitizePattern": "[^a-zA-Z0-9_]"
}
// app_settings: { appName: 'inv_validate2', category: 'connection' }
// NOTE: These settings come from chrome.storage popup (bridgeUrl, timeout, debugMode).
// They are set by the extension popup and persisted in chrome.storage.local.
{
  "bridgeUrl": "https://bb-micro-bridge-production.up.railway.app",
  "timeout": 30000,
  "debugMode": false
}
// app_settings: { appName: 'inv_validate2', category: 'payperiod' }
{
  "type": "biweekly",
  "anchorDate": "2024-12-11",
  "dayOfWeek": "wednesday"
}
// app_settings: { appName: 'inv_validate2', category: 'validation' }
{
  "hoursTolerance": 0.01,
  "lunchDuration": 0.5,
  "lunchStartTime": "11:30",
  "ohRate": 0.12,
  "ohCategory": "OH & Ins",
  "landfillMarkup": 100,
  "maxReasonableQty": 500,
  "maxReasonableRate": 10000,
  "invoiceCycleDays": 14,
  "validCategories": ["Labor", "Materials", "Sub-Con", "Landfill", "Rental", "City", "Credit", "OH & Ins", "Fee"],
  "validEmployees": ["Evan", "Christian", "Felipe", "Matt", "Chad", "Ross", "Clay", "Jesus", "Aiden", "Brian", "Erik", "Tyler", "Nick", "Nicholas", "Iaroslav", "Yarik", "Alfonso"]
}
// app_settings: { appName: 'inv_validate2', category: 'api' }
{
  "qboMinorVersion": "65",
  "rateLimitDelay": 100,
  "maxRetries": 3
}
// app_settings: { appName: 'inv_validate2', category: 'thumbnail' }
{
  "width": 200,
  "format": "jpeg",
  "quality": 80
}

// === BB-DocEngine ===
// app_settings: { appName: 'docengine', category: 'binder' }
{
  "coverPage": {
    "enabled": true,
    "title": "CONTRACT BINDER SUMMARY",
    "showThumbnails": true,                // Show document thumbnails on cover
    "showFileSizes": true,                 // Show file sizes on cover
    "showDocumentTypes": true,             // Show doc type labels on cover
    "disclaimer": "This summary page is for reference only..." // Footer disclaimer text
  },
  "watermark": {
    "enabled": true,
    "positions": {                         // Keyed by position name
      "bottom-left":   { "enabled": true, "items": [{ "type": "variable", "value": "DATESTAMP", "label": "..." }] },
      "bottom-center": { "enabled": true, "items": [{ "type": "variable", "value": "LNAME", "label": "Homeowner Last Name" }, { "type": "freeform", "value": "CONFIDENTIAL", "label": "CONFIDENTIAL" }, { "type": "variable", "value": "CONTRACT_NUM", "label": "Contract #" }] },
      "bottom-right":  { "enabled": true, "items": [{ "type": "variable", "value": "PAGE_OF_TOTAL", "label": "..." }] }
    },
    "font": { "name": "Helvetica", "size": 10, "color": "#e41111", "opacity": 0.8 },
    "margins": { "top": 20, "bottom": 20, "left": 30, "right": 30 },
    "separator": " . "
  },
  "eSignature": { "platform": "adobeSign", "enabled": true }
}
// app_settings: { appName: 'docengine', category: 'company' }
// NOTE: DocEngine-specific company fields from data/binder-settings.json
// binder-settings has { name, license, phone, email } — NO address field (different from _global/company)
// This is a DocEngine override — the canonical _global/company is in Section 6.1
{
  "name": "Bainbridge Builders Inc.",      // Company display name
  "license": "", "phone": "", "email": "",
  "officers": {                            // Numbered object (not array) — from db/settings.json
    "1": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" },
    "2": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" },
    "3": { "fname": "", "lname": "", "title": "", "email": "", "phone": "" }
  }
}
// app_settings: { appName: 'docengine', category: 'metadata' }
// Per-document-type PDF metadata. `default` block has full fields; per-type has keywords only.
{
  "default": { "author": "Bainbridge Builders Inc.", "creator": "BB-DocEngine v1.0", "copyright": "© 2026 Bainbridge Builders Inc.", "keywords": "" },
  "ES": { "keywords": "estimate, construction, quote" },
  "TM": { "keywords": "agreement, contract, time and materials" },
  // NOTE: BB-DocEngine uses "time and materials". PorjExp5's local copy diverged to "home improvement".
  // Canonical value follows BB-DocEngine (the authoritative document management app).
  "XB": { "keywords": "mechanics lien, notice to owner" },
  "XC": { "keywords": "insurance, certificate" },
  "XD": { "keywords": "3-day notice, right to stop work" },
  "CO": { "keywords": "change order, modification" },
  "BD": { "keywords": "binder, contract package" },
  "SG": { "keywords": "signed, executed, contract" }
}
// app_settings: { appName: 'docengine', category: 'watermarks' }
// Per-document-type watermark overrides (all 8 doc types + default)
// Each entry may have: type, text, opacity, position, rotation, fontSize
{
  "default": { "type": "text-logo", "text": "BAINBRIDGE BUILDERS INC.", "opacity": 30, "position": "center", "rotation": -45, "fontSize": "medium" },
  "ES": { "type": "text-logo", "text": "ESTIMATE - BB", "opacity": 25, "position": "center", "rotation": -45, "fontSize": "medium" },
  "TM": { "type": "text-logo", "text": "T&M AGREEMENT - BB", "opacity": 25, "position": "center", "rotation": -45, "fontSize": "medium" },
  // NOTE: BB-DocEngine uses "T&M AGREEMENT - BB". PorjExp5's local copy diverged to "HOME IMPROVEMENT AGREEMENT - BB".
  // Canonical value follows BB-DocEngine (the authoritative document management app).
  "XB": { "type": "inherit" },
  "XC": { "type": "inherit" },
  "XD": { "type": "text", "text": "3-DAY NOTICE", "opacity": 50, "position": "top-right", "rotation": 0, "fontSize": "large" },
  "CO": { "type": "text-logo", "text": "CHANGE ORDER - BB", "opacity": 25, "position": "center", "rotation": -45, "fontSize": "medium" },
  "BD": { "type": "inherit" },
  "SG": { "type": "none" }
}
// app_settings: { appName: 'docengine', category: 'document_types' }
// DocEngine-specific document type aliases (exhibit letters for binder system)
// Overrides _global/document_types from Section 6.1 with DocEngine's exhibit-based naming
{
  "ES": { "name": "Estimate", "alias": "Exhibit A" },
  "TM": { "name": "T&M Agreement", "alias": "Agreement" },
  // NOTE: BB-DocEngine uses "T&M Agreement". PorjExp5's local copy diverged to "Home Improvement Agreement".
  // Canonical value follows BB-DocEngine. On migration, PorjExp5 should adopt the platform canonical name.
  "XB": { "name": "Notice to Owner", "alias": "Exhibit B" },
  "XC": { "name": "Proof of Insurance", "alias": "Exhibit C" },
  "XD": { "name": "3-Day Notice", "alias": "Exhibit D" },
  "CO": { "name": "Change Order", "alias": "CO" },
  "BD": { "name": "Binder", "alias": "Binder" },
  "SG": { "name": "Signed Package", "alias": "Signed" }
}
// app_settings: { appName: 'docengine', category: 'files' }
{
  "watchFolder": false, "autoOrganize": false, "backupOriginal": true
}
// NOTE: watchFolder is boolean (false) in code, NOT string (""). Type: boolean.

// === Chase_Expense_Validator ===
// app_settings: { appName: 'chase_exp', category: 'defaults' }
{
  "bridgeUrl": "http://localhost:3100",
  "bridgeMode": "desktop",               // 'desktop' | 'cloud'
  "dateRange": 14,
  "dateBuffer": 3,
  "debugMode": false,
  "autoVerify": true
}

// === GS_Receipts ===
// app_settings: { appName: 'gs_receipts', category: 'api_keys' }
{
  "GEMINI_API_KEY": "",
  "CLAUDE_API_KEY": "",
  "DOCAI_PROJECT_ID": "",
  "DOCAI_LOCATION": "us",
  "PDF_CO_API_KEY": ""
}
// app_settings: { appName: 'gs_receipts', category: 'processing' }
{
  "VISION_API": "GEMINI",                // 'GEMINI' | 'CLAUDE'
  "BATCH_LIMIT": 50,
  "INCLUDE_IMAGES": false,
  "ACCOUNT_HOLDER_NAME": "",
  "SPLIT_EMAIL": "",
  "ENABLE_MULTIPAGE_SPLIT": false,
  "ENABLE_AUTO_ROTATE": false
  // NOTE: ENABLE_AUTO_ROTATE runtime default is false, but setupSheet() seeds the Google Sheet with "TRUE".
  // This is a known contradiction — runtime code defaults to false if the sheet value is missing.
}
// NOTE: ACCOUNT_HOLDER_NAME is loaded dynamically from the Google Sheet GLOBAL_CONFIG tab at runtime,
// not declared in a static config object. The app_settings seed value is "" (empty string).
// app_settings: { appName: 'gs_receipts', category: 'notifications' }
{
  "ERROR_EMAIL": "",
  "TIMEZONE": "America/Los_Angeles"
}
// app_settings: { appName: 'gs_receipts', category: 'testing' }
{
  "DRY_RUN": false,
  "DEBUG_MODE": false,
  "LOG_LEVEL": "STANDARD",              // 'MINIMAL' | 'STANDARD' | 'DEBUG'
  "TEST_LABEL": ""                      // Label filter for testing (empty = production mode)
}
// app_settings: { appName: 'gs_receipts', category: 'vendors' }
// Per-vendor configuration (one record per vendor)
// {
//   "vendorName": "Chase",
//   "vendorPrefix": "CH",
//   "isCrewReceipt": false,
//   "originalSender": "noreply@chase.com",  // Comma-separated STRING (not array) — code splits with .split(",")
//   "gmailQuery": "from:noreply@chase.com",
//   "includeForwards": false,
//   "pendingFolderId": "",
//   "driveFolderId": "",
//   "reviewFolderId": "",
//   "extractionMethod": "",               // '' (empty = inherit from GLOBAL_CONFIG.VISION_API) | 'GEMINI' | 'CLAUDE' | 'DOCUMENT_AI' | 'EMAIL_BODY'
//   "processMode": "EMAIL",               // 'EMAIL' | 'FOLDER' — how receipts are sourced
//   "folderExtractionMethod": "",         // Separate extraction method for FOLDER mode
//   "docaiProcessorId": "",               // Document AI processor ID (when extractionMethod=DOCUMENT_AI)
//   "maxRetries": 1,
//   "maxPages": 1,                        // Max PDF pages per file
//   "attachments": 1,                     // Max PDF attachments per email
//   "defaultJobcode": "XXXXXX",             // Sentinel value — not empty string
//   "successLabel": "",                   // Default: vendorName + "_GD" (dynamically constructed in loadVendorConfig)
//   "failLabel": "",                      // Default: vendorName + "_FAIL" (dynamically constructed in loadVendorConfig)
//   // Per-field extraction config (individual keys, NOT a fieldHints object):
//   "fieldInvoiceNo": "Invoice No",       // Field label/hint for invoice number extraction
//   "fieldDate": "Invoice Date",          // Field label/hint for date extraction
//   "fieldTotal": "Invoice Total",        // Field label/hint for total extraction
//   "fieldReference": "Reference",        // Field label/hint for reference extraction (default "Reference", not empty)
//   "fieldCc": "",                        // Field label/hint for CC extraction
//   "fieldAmountPaid": "",               // Field label/hint for amount paid extraction
//   "fieldTime": "9999",                  // Sentinel: "9999" means "no time field on doc" (distinct from "" which means "use default")
//   "folderSortBy": "FILE_DATE",          // 'FILE_DATE' | 'FILENAME_DATE'
//   "folderSortOrder": "ASC",             // 'ASC' | 'DESC' (code default is ASC)
//   "emailSortBy": "EMAIL_DATE",          // 'EMAIL_DATE' | 'SUBJECT'
//   "emailSortOrder": "ASC"               // Code default is ASC (not DESC)
// }

// === Adobe eSigner ===
// app_settings: { appName: 'adobe_esigner', category: 'paths' }
{
  "inputDir": "workspace/input",
  "outputDir": "workspace/output",
  "exportsDir": "workspace/exports"
}
// app_settings: { appName: 'adobe_esigner', category: 'api' }
// NOTE: adobe-sign-config.json only stores apiBaseUrl, accessToken, accessTokenExpiry, webhookUrl, enabled.
// clientId, clientSecret, refreshToken are loaded from .env (not in the JSON config file).
// On migration, all 8 fields move to app_settings; .env values must be imported separately.
{
  "apiBaseUrl": "https://api.na4.adobesign.com/api/rest/v6",
  "clientId": "",                          // Adobe Sign OAuth client ID — from .env, NOT in config JSON
  "clientSecret": "",                      // Adobe Sign OAuth client secret — from .env, NOT in config JSON
  "refreshToken": "",                      // OAuth refresh token — from .env, NOT in config JSON
  "accessToken": "",                       // Current access token (runtime-managed, in config JSON)
  "accessTokenExpiry": null,               // Token expiry timestamp (runtime-managed, in config JSON)
  "webhookUrl": "",
  "enabled": false
}

// === Landfill_Surcharge ===
// app_settings: { appName: 'landfill', category: 'defaults' }
{
  "itemName": "Landfill",
  "defaultWeeks": 3,
  "bridgeUrl": "https://bb-micro-bridge-production.up.railway.app",
  "apiKey": ""
}
```

---

## 7. CROSS-APP DATA FLOWS

These tables reference each other across app boundaries:

```
doc_contracts.estimateId  -------> rev_estimates.id
doc_contracts.customerId  -------> customers.id
doc_contracts.propertyId  -------> properties.id
esign_agreements.contractId ----> doc_contracts.id
esign_agreements.customerId ----> customers.id
proj_projects.customerId  -------> customers.id
proj_projects.propertyId  -------> properties.id
proj_projects.jobcodeId   -------> work_jobcodes.id
rev_estimates.customerId  -------> customers.id
rev_cycle_snapshots        reads  work_jobcodes (for project breakdown)
cal_manual_hours.userId   -------> employees.id
cal_manual_hours.jobcodeId -----> work_jobcodes.id
ts_timesheet_snapshots.employeeId > employees.id
inv_receipt_matches.vendorId ---> vendors.id
inv_receipt_matches.jobcodeId --> work_jobcodes.id
inv_validation_runs.customerId -> customers.id
chase_validation_sessions   reads  vendors (for matching)
                            reads  employees (for cardholder reverse lookup via enrichment.cardLast4)
properties.customerId     -------> customers.id
esign_signers              refs   employees (contractor profiles may map to employees)
```

**Key insight:** The contract lifecycle flows across 4 apps:
1. **PorjExp5** creates the estimate template + builds scope (`proj_estimate_templates`)
2. **RevExp5** tracks revenue against the estimate (`rev_estimates`)
3. **BB-DocEngine** creates the contract binder (`doc_contracts`) linking to the estimate
4. **Adobe eSigner** sends it for signature (`esign_agreements`) linking to the contract
5. **PorjExp5** tracks the active project + Gantt schedule (`proj_projects`)

**QBO Notes write-back flow (DocEngine -> QBO):**
DocEngine syncs property data BACK to QBO Customer notes via Bridge `POST /api/qbo/customer/:id` update.
- **Trigger:** When property geocoding completes or property data is enriched (beds/baths/sqft populated)
- **Format:** `(beds / baths / garage), (sqft / lot)` + Google Maps URL + Zillow URL + Redfin URL
- **Backup:** Before overwriting, original notes are backed up to `doc_qbo_notes_backup` (oldNotes + newNotes)
- **Fields that trigger write-back:** beds, baths, garage, sqft, lotSqft, googleMapsUrl, zillowUrl, redfinUrl

**Shared data:** PorjExp5 and BB-DocEngine share identical JSON databases for clients, properties, subs, trades, and master items. On migration, they share the same Compartment 1 tables — no data duplication. `subs.json` and `vendors-dir.json` unify into the `vendors` table differentiated by `enrichment.isSub` and `enrichment.inVendorsDir` flags.

**Labor reconciliation flow (RevExp5):**
RevExp5 fetches QBO invoices and QBT timesheets, matches labor to employees, and calculates labor cost using `employees.enrichment.costRate`. Reconciliation is computed in-memory per session — no persistent reconciliation table needed (results are reflected in `rev_cycle_snapshots`).

---

## 8. TABLE COUNT SUMMARY

| Category | Tables | Notes |
|----------|--------|-------|
| **Compartment 1: Master Data** | 7 | employees, customers, vendors, work_jobcodes, properties, trades, master_items |
| **Compartment 2: Working Data** | 26 | cal_* (5), ts_* (4), rev_* (2), proj_* (3), doc_* (3), inv_* (4), chase_* (1), esign_* (3), lf_* (1) |
| **Shared Infrastructure** | 6 | enrichment_fields, app_field_subscriptions, app_settings, audit_log, sync_log, enrichment_history |
| **TOTAL** | 39 | |

### Phase Rollout

| Phase | Tables Created | Apps Affected |
|-------|---------------|---------------|
| **DB-1** (Bridge + Master Data) | employees, work_jobcodes, enrichment_fields, app_field_subscriptions, app_settings, audit_log, sync_log, enrichment_history | All |
| **DB-2** (CalExp5 + Auth) | cal_manual_hours, cal_selected_jobcodes, cal_uploaded_timesheets, cal_user_settings, cal_audit_log + WebAuthn/PIN auth endpoints + `webauthnCredentials`/`pinHash` enrichment fields | CalExp5 |
| **DB-3** (Data Manager + Enrichment) | (no new tables — populates enrichment_fields registry) | Data Manager |
| **DB-4** (DocEngine + PorjExp5 migration) | customers, vendors, properties, trades, master_items, doc_contracts, doc_estimate_templates, doc_qbo_notes_backup, proj_estimate_templates, proj_projects, proj_supplier_ignore_list | BB-DocEngine, PorjExp5 |
| **DB-5** (Revenue migration) | rev_cycle_snapshots, rev_estimates | RevExp5 |
| **DB-6** (Timesheet migration) | ts_timesheet_snapshots, ts_pay_periods, ts_auto_lunch_runs, ts_auto_note_runs | TS_Exp5 |
| **DB-7** (Validation apps) | inv_validation_runs, inv_validation_checks, inv_receipt_matches, inv_validation_suppressions, chase_validation_sessions | InvVal2, Chase |
| **DB-8** (Remaining) | esign_agreements, esign_overlay_registry, esign_signers, lf_surcharge_calculations | Adobe eSigner, Landfill |

---

## 9. MIGRATION NOTES

### What Moves Where

| Current Location | Destination |
|-----------------|-------------|
| **TS_Exp5** | |
| `unified-settings.json` employee data | `employees.enrichment` (Compartment 1) — includes payType, workSchedule, lunch, mileage |
| `unified-settings.json` PTO data | **NOT migrated** — fetched live from QBT via Bridge |
| `id-crossref.json` byQboId/byQbtId maps | Eliminated — `employees` table has both `qbo_id` and `qbt_id` |
| `id-crossref.json` payrollItemRefs | `app_settings` (ts_exp5, payroll) |
| `id-crossref.json` employeeTargets | `app_settings` (ts_exp5, publishing) |
| `id-crossref.json` qbtCustomFields | `app_settings` (ts_exp5, qbt_fields) |
| `id-crossref.json` serviceItems | `app_settings` (ts_exp5, service_items) — QBO Item IDs for Labor/Sub-Con/Materials/Rental/PM |
| `id-crossref.json` excludedJobcodes | `app_settings` (ts_exp5, excluded_jobcodes) — QBT jobcode IDs filtered from UI |
| `unified-settings.json` app.qboRealmId | `app_settings` (ts_exp5, qbo_realm) — QBO company realm ID (NOT in id-crossref.json — only in unified-settings) |
| `data/Auto-Lunch/` manifests + files | `ts_auto_lunch_runs` table |
| `data/Auto-Lunch/billed-lunches.json` | `ts_auto_lunch_runs.billedLunches` JSONB |
| **RevExp5** | |
| `settings.json` employee rates | `employees.enrichment.costRate` |
| `settings.json` app config | `app_settings` (revexp5, defaults + temporal + display + features + projections) |
| **DUAL PERSISTENCE:** `data/settings.json` is server-backed via `settings-server-v1.js` (GET/POST `/api/settings`). The file is the authoritative persisted state (not localStorage). However, use CODE DEFAULTS from `index.html defaultSettings` for migration seed — the file may contain user-modified values. |
| `data/estimates/*.json` | `rev_estimates` table |
| Invoice data | **NOT migrated** — fetched live from QBO via Bridge each session |
| **BB-DocEngine** | |
| `db/clients.json` | `customers` table |
| `db/properties.json` | `properties` table (enrichment fields to enrichment JSONB) |
| `db/subs.json` | `vendors` table (with `enrichment.isSub = true`) |
| `db/vendors-dir.json` | `vendors` table (with `enrichment.inVendorsDir = true`) |
| `db/suppliers.json` | Derived view: vendors NOT in proj_supplier_ignore_list |
| `db/qbo-vendors.json` | Temporary sync cache — not persisted, refetched from QBO |
| `db/ignore-list.json` | `proj_supplier_ignore_list` table |
| `db/trades.json` | `trades` table (39 trade values) |
| `db/master-items.json` | `master_items` table |
| `db/contracts.json` | `doc_contracts` table |
| `db/estimate-templates.json` | `doc_estimate_templates` table |
| `db/settings.json` officers | `app_settings` (_global, company).officers |
| `db/settings.json` metadata/watermarks | `app_settings` (docengine, metadata + watermarks) |
| `db/settings.json` document types | `app_settings` (_global, document_types) |
| `data/binder-settings.json` | `app_settings` (docengine, binder + company) |
| `db/qbo-notes-backup.json` | `doc_qbo_notes_backup` table |
| **CalExp5** | |
| Zustand `manualHoursByUser` | `cal_manual_hours` table |
| Zustand `selectedJobcodesByUser` | `cal_selected_jobcodes` table |
| Zustand `uploadedTimesheetsByUser` | `cal_uploaded_timesheets` table |
| Zustand user preferences (`showMyTime`, `showCrew`, `myTimeColor`, `crewColor`, `entryMode`, `activeEmployeeIds`) | `cal_user_settings` table |
| Zustand `selectedCrewIds` | **NOT migrated** — runtime-only state, excluded from persistence (partialize + saveSettingsToFile), resets on reload |
| Zustand app-level state (`view`, `logLevel`, `disablePastDays`, `showMockData`, `exportUploadLog`) | `app_settings` (calexp5, defaults) |
| Zustand `workJobcodes` | **NOT migrated** — ephemeral API cache, refetched from Bridge on each session |
| `data/settings.json` (server-side mirror of Zustand state) | Same destinations as localStorage row — working data to `cal_*` tables, defaults to `app_settings`. **DUAL PERSISTENCE:** CalExp5 maintains BOTH Zustand localStorage AND a server-side data/settings.json via `/settings/save` and `/settings/load` endpoints. Migration tooling must read the file, not rely solely on browser localStorage. |
| `localStorage['bb-audit-log']` | `cal_audit_log` table (DB-2 phase) — up to 2000 entries, 365-day retention |
| `localStorage['bb-api-errors']` | **NOT migrated** — ephemeral error cache, regenerated |
| `localStorage['bb-upload-log']` | **NOT migrated** — ephemeral upload log, regenerated |
| `localStorage['bb-jobcode-sort-cache']` | **NOT migrated** — ephemeral sort cache, regenerated |
| IndexedDB stores | **NOT migrated** — ephemeral API caches with TTL |
| **PorjExp5** | |
| `db/` files (shared with DocEngine) | Same Compartment 1 tables as DocEngine (see above) |
| `localStorage['bbiPlanner_bidData']` | `proj_projects.details` (bid state fields) |
| `localStorage['bbiPlanner_userTpls']` | `app_settings` (projexp5, templates).userTemplates |
| `localStorage['bbiPlanner_tplOverrides']` | `app_settings` (projexp5, templates).templateOverrides |
| `localStorage['bbiPlanner_fuzzyOnly']` | `app_settings` (projexp5, defaults).skipPreAssigned |
| `localStorage['bbiPlanner_lastTpl']` | `app_settings` (projexp5, defaults).lastTemplate |
| `localStorage['bbiPlanner_itemDirectory']` | `app_settings` (projexp5, item_directory) |
| `localStorage['bbiPlanner_subDirectory']` | `app_settings` (projexp5, directories).subDirectorySortField + subDirectorySortAsc |
| `localStorage['bbi_vendors']` | `app_settings` (projexp5, directories).vendorDirectorySortField + vendorDirectorySortAsc |
| `/api/project-id/save-state` files | `proj_projects` table (details JSONB) — includes projectId, clientDisplayName, propertyDisplayName, savedAt, templateId, plus all bid fields |
| `data/settings/project-counter.json` | `app_settings` (projexp5, id_counter) — { lastNumber, usedIds[], year } — tracks C{YY}{seq3} ID sequence |
| `data/settings/project-id-settings.json` | `app_settings` (projexp5, id_settings) — { mode: "random" } — ID generation mode |
| `data/settings/binder-settings.json` | `app_settings` (projexp5, binder) — PorjExp5's own binder config (diverges from DocEngine's). Has elements-based watermark, company with address, documentOrder, output, paths. NOTE: structure differs from DocEngine binder-settings (elements[] vs positions{}, has address, has documentOrder/output/paths, no eSignature/separator) |
| `localStorage['projexp5_binder_state']` | **NOT migrated** — ephemeral binder UI session state (folderPath, contractNumber, customerName, watermarkEnabled, coverPageEnabled) |
| `data/settings/settings.json` | **NOT migrated** — empty placeholder `{}`, no active routes write to it |
| `localStorage['tmDocuSignConfig']` | **NOT migrated** — ephemeral DocuSign anchor config for TM agreement tool |
| `localStorage['tmAgreementData']` | **NOT migrated** — ephemeral, cleared on save (TM agreement form data) |
| `localStorage['contract_{num}']` | **NOT migrated** — ephemeral per-contract state for TM agreement tool (dynamic key pattern) |
| `localStorage['tmAgreementConfig']` | **NOT migrated** — TM agreement config (company info, defaults, timeline, features) from tm-agreement-config-v3.js |
| **Chase_Exp** | |
| `chrome.storage.bbCardholders` | `employees.enrichment.cardLast4` (reverse lookup by query) |
| `chrome.storage.chase-bb-settings` | `app_settings` (chase_exp, defaults) |
| `chrome.storage.bb_autoVerify` | `app_settings` (chase_exp, defaults).autoVerify |
| `chrome.storage.{site}HiddenTxns` | **NOT migrated** — ephemeral per-session fingerprints |
| `chrome.storage.{site}GrayedTxns` | **NOT migrated** — ephemeral per-session fingerprints |
| **GS_Receipts** | |
| Aliases_J sheet (3 columns) | `work_jobcodes.enrichment.receiptAliases` (object with aliases + address) |
| Aliases_S sheet (2 columns) | `vendors.enrichment.aliases` (keyed lookup object) |
| Settings_Global sheet | `app_settings` (gs_receipts, api_keys + processing + notifications + testing) |
| Settings_<Vendor> sheets | `app_settings` (gs_receipts, vendors) — one record per vendor |
| Log sheet | **Stays in Google Sheets** — different runtime |
| **Invoice_Validate2** | |
| `settings.json` | `app_settings` (inv_validate2, defaults + payperiod + validation + api + thumbnail) |
| `chrome.storage` extension settings (bridgeUrl, timeout, debugMode) | `app_settings` (inv_validate2, connection) |
| Validation results (in-memory) | `inv_validation_runs` + `inv_validation_checks` tables |
| Suppressed checks (`localStorage['bb-suppressed-checks']`) | `inv_validation_suppressions` table (currently localStorage-only; DB persistence in DB-7) |
| **Adobe eSigner** | |
| `contractors.json` | `esign_signers` table |
| `sections-registry.json` + section files | `esign_overlay_registry` table |
| `data/overlays/_staging/*.overlay.json` files | `esign_overlay_registry` table (separate source with different schema: signerId/rect format, signers sub-array, no docType — derive from templateId, special-case Contract_Overlay→TM_Agreement) |
| `adobe-sign-config.json` | `app_settings` (adobe_esigner, api) |
| `settings.json` (paths) | `app_settings` (adobe_esigner, paths) |
| PDF metadata keywords | `esign_agreements.details.pdfMetadataKeywords` |
| **Landfill_Surcharge** | |
| `settings.json` | `app_settings` (landfill, defaults) — includes bridgeUrl + apiKey |
| `localStorage['landfill_surcharge_session']` | **NOT migrated** — ephemeral per-scan session state |

### What Stays External

| Data | Why It Stays |
|------|-------------|
| GS_Receipts processing log | Lives in Google Sheets — different runtime |
| GS_Receipts extracted receipt data | Processed in Google Sheets; results stay in Sheets |
| Chase_Exp scraped transactions | Ephemeral per-session; optional persistence in `chase_validation_sessions` |
| Chase_Exp hidden/grayed fingerprints | Per-session UI state, regenerated |
| BB_Desktop_Relay state | Stateless relay; no persistent data needed |
| CalExp5 IndexedDB caches | TTL-based API caches, regenerated from Bridge |
| CalExp5 localStorage caches | Error/upload logs, jobcode sort cache — regenerated |
| Landfill_Surcharge session state | Per-scan working data, not historical |
| Landfill_Surcharge attachment cache | In-memory QBO attachment metadata, refetched |
| RevExp5 invoice data | Fetched live from QBO each session |

---

*See: BB_DB_STRATEGY.md v1.5 @ Section 14 for Drizzle schemas of shared infrastructure tables*
*See: BB_CALEXP5_SCHEMA.md v1.3 for detailed CalExp5 working data schemas*
*See: BB_PLATFORM_READINESS_REPORT.md v1.3 for implementation phases and gaps*
*See: BB_SCHEMA_VERIFICATION_LOG.md for wave-by-wave verification tracking*
