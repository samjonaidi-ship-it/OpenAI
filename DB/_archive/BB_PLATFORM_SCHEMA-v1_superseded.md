# BB Platform Schema | v1.0 | 2026-03-14 | BB

> **SUPERSEDED:** This v1.0 document has been superseded by **BB_PLATFORM_SCHEMA-v2.md (v2.23)** which contains the authoritative schema definitions derived from 11-app deep analysis with 500+ gaps fixed across 21 verification waves, plus enrichment-first architecture (enrichment_version on C1 tables, enrichment_history table, enrichmentSnapshotAt watermarks on C2 tables, context_map enrichment, Bridge-delegated survivorship). This v1.0 is retained for historical reference only. **Do not use this document for implementation.**

> **Purpose:** Comprehensive Neon database schema for the entire BB platform, derived from analysis of all 11 BB apps. Defines Compartment 1 (shared master data + enrichment), Compartment 2 (per-app working data), and shared infrastructure tables.
>
> **Authority:** This document WAS the original reference for table definitions. It has been superseded — see the banner above. See BB_DB_STRATEGY.md v1.4 for architecture decisions and BB_PLATFORM_READINESS_REPORT.md v1.3 for implementation gaps.
>
> **Methodology:** Every BB app was analyzed for: QBO/QBT entity usage, enrichment patterns, working data structures, settings/config, and storage mechanisms. The Settings_crawl master analysis was also incorporated.

---

## 1. APP INVENTORY & DATA USAGE MATRIX

| App | Master Data Used | Enrichment Fields | Working Data | Current Storage |
|-----|-----------------|-------------------|-------------|-----------------|
| **CalExp5** | employees, jobcodes, timesheets | defaultCrew, scheduleColor | manual hours, selected jobcodes, uploaded timesheets, user settings | Zustand/localStorage |
| **TS_Exp5** | employees, jobcodes, timesheets | payRate, billRate, workSchedule, lunch, pto, mileage, payPeriod, alias | auto-lunch, auto-notes, validation results | File JSON (unified-settings.json) |
| **RevExp5** | employees, customers, jobcodes, invoices, estimates | costRate per employee, margin targets | cycle projections, estimate snapshots, invoice cache | File JSON (settings.json, estimates/) |
| **PorjExp5** | customers, vendors, items | properties (geocoded), subs (trade-enriched), officers | estimate templates, contracts, supplier pipeline, master items | File JSON (db/*.json — shared model with DocEngine) |
| **Invoice_Validate2** | invoices, purchases, vendors | (minimal) | validation runs, receipt matches, processing queue | File JSON (settings.json) |
| **GS_Receipts** | vendors (aliases), jobcodes (aliases), stores (aliases) | jobcode aliases, vendor aliases, store aliases | processing log, extraction results | Google Sheets |
| **Chase_Expense_Validator** | purchases, bills, vendors, cardholders | cardLast4-to-employee mapping | scraped transactions, validation results | chrome.storage (ephemeral) |
| **BB_Desktop_Relay** | (passthrough) | (none) | relay state | Minimal |
| **Adobe eSigner** | contractors, clients | (document-specific) | PDF overlays, section registry, agreements | File JSON |
| **Landfill_Surcharge** | invoices, items | (minimal) | surcharge calculations | File JSON |
| **BB-DocEngine** | clients, properties, subs, vendors, trades, master items | trade assignment, keywords, notes, geocode data | contracts, exhibits, estimate templates, binder docs | File JSON (db/*.json) |

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
export const employees = pgTable('employees', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),              // Internal BB ID (e.g., 'EMP-001')
  qboId:           text('qbo_id').unique(),              // QBO Employee.Id (e.g., '6')
  qbtId:           text('qbt_id').unique(),              // QBT User.id (e.g., '3194176')

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
  //   "payRate": 59.00,                       // number: hourly pay rate
  //   "billRate": 85.00,                      // number: hourly bill rate
  //   "workScheduleType": "full-time",        // select: full-time, part-time
  //   "workDays": ["Mon","Tue","Wed","Thu","Fri"], // tags
  //   "workStartTime": "07:30",              // text (HH:MM)
  //   "workEndTime": "16:30",                // text (HH:MM)
  //   "allowedWindowEarliest": "06:00",      // text (HH:MM)
  //   "allowedWindowLatest": "18:00",        // text (HH:MM)
  //   "lunchDefaultStart": "11:30",          // text (HH:MM)
  //   "lunchDefaultEnd": "12:00",            // text (HH:MM)
  //   "lunchDuration": 30,                   // number (minutes)
  //   "lunchRequired": true,                 // boolean
  //   "lunchRequiredAfterHours": 4,          // number
  //   "mileageDailyAllowance": 100,          // number
  //   "mileageVehicleType": "company",       // select: company, personal
  //   "mileageHomeZip": "95018-9175",        // text
  //   "payPeriodTargetHours": 80,            // number
  //   "overtimeApproved": false,             // boolean
  //
  //   -- RevExp5 fields --
  //   "costRate": 45.00,                     // number: labor cost rate
  //
  //   -- Chase fields --
  //   "cardLast4": "2145",                   // text: Chase card last 4 digits
  //
  //   -- Cross-app utility --
  //   "certifications": ["OSHA-30"],         // tags
  //   "vehicleAssignment": "TRK-003",        // text
  //   "emergencyContact": "206-555-9999",    // text
  //   "tShirtSize": "XL",                    // select
  //   "role": "crew",                        // select: crew, lead, foreman, pm, owner
  // }

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
]);
```

**PTO balances note:** TS_Exp5 currently tracks PTO balances (sickAvailable, vacationAvailable, etc.) in unified-settings.json. These are volatile data synced from QBT — they should be fetched live from QBT via Bridge, NOT stored as enrichment. Enrichment is for Sam-managed values. PTO balances are QBT-managed.

---

### 2.2 customers

**Source:** QBO (Customers API)
**Used by:** RevExp5, BB-DocEngine (as "clients"), Project_Exp, Adobe eSigner

```typescript
export const customers = pgTable('customers', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),              // Internal BB ID (e.g., 'CLI-00001')
  qboId:           text('qbo_id').unique(),              // QBO Customer.Id (e.g., '139')

  // === CORE FIELDS (from QBO sync) ===
  displayName:     text('display_name').notNull(),       // "Alcantar" (QBO DisplayName)
  name1:           text('name_1'),                       // First homeowner: "Ernesto"
  name2:           text('name_2'),                       // Second homeowner (if couple)
  lastName:        text('last_name'),                    // "Alcantar"
  email1:          text('email_1'),
  email2:          text('email_2'),
  phone1:          text('phone_1'),
  phone2:          text('phone_2'),
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
  //   "revenueCategory": "remodel",         // select: remodel, addition, new-build
  //   "paymentTerms": "net-30",             // select: net-15, net-30, net-45, due-on-receipt
  // }

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
**Used by:** Invoice_Validate2, Chase_Expense_Validator, GS_Receipts, BB-DocEngine (as "subs")

```typescript
export const vendors = pgTable('vendors', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),              // Internal BB ID (e.g., 'VEN-001' or 'sub_qbo_370')
  qboId:           text('qbo_id').unique(),              // QBO Vendor.Id

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

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   -- BB-DocEngine fields --
  //   "trade": "electrical",                // select: from trades lookup
  //   "license": "CSLB #561842",           // text
  //   "keywords": "floor, wood, hardwood",  // text (search keywords)
  //   "notes": "Owner: Tony Rebuelta...",   // text (rich notes)
  //   "isSub": true,                        // boolean (is subcontractor)
  //
  //   -- GS_Receipts fields --
  //   "aliases": ["HD", "Home Depot"],      // tags (name variations for matching)
  //   "defaultJobcode": "Materials",        // text
  //
  //   -- Chase_Exp fields --
  //   "chaseCategory": "building-materials", // select
  //
  //   -- Cross-app utility --
  //   "paymentMethod": "check",             // select: check, ach, credit-card
  //   "w9OnFile": true,                     // boolean
  //   "insuranceExpiry": "2026-12-31",      // date
  // }

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

---

### 2.4 work_jobcodes

**Source:** QBT (Jobcodes API)
**Used by:** CalExp5, TS_Exp5, RevExp5, Project_Exp, GS_Receipts

```typescript
export const workJobcodes = pgTable('work_jobcodes', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),              // Internal BB ID
  qbtId:           text('qbt_id').unique(),              // QBT Jobcode.id

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
  //   -- GS_Receipts fields --
  //   "receiptAliases": ["Oak", "Oakland"], // tags: alias names for receipt matching
  //   "propertyAddress": "123 Oakland Ave", // text: associated address
  //
  //   -- RevExp5 fields --
  //   "revenueCategory": "labor",           // select: labor, materials, sub
  //   "projectStatus": "active",            // select: active, completed, on-hold
  //   "estimateNumber": "E26818",           // text: linked estimate
  //
  //   -- Cross-app utility --
  //   "customerName": "Labe + Nakamura",    // text: associated customer
  //   "propertyId": "PROP-00042",           // text: FK to properties
  // }

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

**Source:** Derived from QBO customer addresses + geocoding
**Used by:** BB-DocEngine (primary), Project_Exp, Adobe eSigner

```typescript
export const properties = pgTable('properties', {
  // === IDENTITY ===
  id:              text('id').primaryKey(),              // 'PROP-00001'
  customerId:      text('customer_id').notNull(),        // FK to customers
  qboId:           text('qbo_id'),                       // QBO sub-customer ID (if applicable)

  // === ADDRESS (from QBO + geocoding) ===
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

  // === PROPERTY DATA (from geocoding + Zillow/Redfin) ===
  beds:            integer('beds'),
  baths:           doublePrecision('baths'),
  sqft:            integer('sqft'),
  lotSqft:         integer('lot_sqft'),
  yearBuilt:       integer('year_built'),
  garage:          integer('garage'),
  propertyType:    text('property_type'),                 // 'single_family', 'multi_family', 'condo', etc.

  // === STATUS ===
  status:          text('status').default('active'),      // 'active', 'completed', 'archived'
  relationship:    text('relationship'),                  // 'owner', 'tenant', 'manager'
  isPrimary:       boolean('is_primary').default(false),
  displayName:     text('display_name'),                  // Short name: "Loyola Dr"

  // === ENRICHMENT ===
  enrichment:      jsonb('enrichment').default({}),
  // Schema of enrichment JSONB:
  // {
  //   "tags": ["kitchen-remodel", "2-story"],  // tags
  //   "notes": "",                              // text
  //   "streetViewUrl": "https://...",           // text (auto-generated)
  //   "streetViewDate": "2014-09",             // text
  //   "zillowUrl": "https://...",              // text
  //   "redfinUrl": "https://...",              // text
  //   "lastSalePrice": null,                   // number
  //   "lastSaleDate": null,                    // date
  //   "photos": [...],                         // JSON array
  // }

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

---

### 2.6 trades (lookup table)

**Source:** Manual / BB-DocEngine
**Used by:** BB-DocEngine

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

---

### 2.7 master_items (estimate cost catalog)

**Source:** Manual / BB-DocEngine
**Used by:** BB-DocEngine, RevExp5

```typescript
export const masterItems = pgTable('master_items', {
  id:              text('id').primaryKey(),              // 'item_DUMP_FEES'
  name:            text('name').notNull(),               // 'DUMP FEES'
  section:         text('section'),                      // 'sitework', 'structure', 'finishes'
  phase:           text('phase'),                        // 'demo_prep', 'closeout', etc.
  defaultBy:       text('default_by'),                   // 'BBI' or 'SUB'
  duration:        integer('duration'),                  // Estimated days
  sequence:        text('sequence'),                     // 'P' (parallel) or 'S' (sequential)
  leadTimeDays:    integer('lead_time_days').default(0),
  defaultHours:    doublePrecision('default_hours').default(0),
  defaultNonLabor: doublePrecision('default_non_labor').default(0),
  avgCost:         doublePrecision('avg_cost'),
  tiers:           jsonb('tiers'),                       // Tiered pricing (small/medium/large)
  isActive:        boolean('is_active').default(true),
  sortOrder:       integer('sort_order').default(0),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_mi_section').on(table.section),
  index('idx_mi_phase').on(table.phase),
]);
```

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

### 2.9 id_crossref (QBO ↔ QBT ID mapping)

**Source:** Derived (computed from QBO + QBT employee sync)
**Used by:** TS_Exp5, any app needing both QBO and QBT data for same employee

```typescript
// NOTE: This is handled by the employees table having BOTH qbo_id AND qbt_id columns.
// The current file-based id-crossref.json in TS_Exp5 becomes unnecessary once employees
// table has both IDs populated during Bridge sync.
// No separate table needed — the employees table IS the crossref.
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
- **GS_Receipts** — Lives in Google Sheets; aliases move to Compartment 1 enrichment
- **BB_Desktop_Relay** — Stateless relay; no persistent working data

---

### 3.1 CalExp5 (cal_*)

*Already defined in BB_CALEXP5_SCHEMA.md v1.2. Summary:*

```typescript
// cal_manual_hours — Hours entered by employees (before upload to QBT)
export const calManualHours = pgTable('cal_manual_hours', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),              // FK employees.id
  date:        date('date').notNull(),
  jobcodeId:   text('jobcode_id').notNull(),           // FK work_jobcodes.id
  hours:       doublePrecision('hours').notNull(),
  details:     jsonb('details').default({}),           // { entryMode, notes, segments }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// cal_selected_jobcodes — Per-user jobcode selection and ordering
export const calSelectedJobcodes = pgTable('cal_selected_jobcodes', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull(),
  jobcodeId:   text('jobcode_id').notNull(),
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
  uploadedAt:  timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
});

// cal_user_settings — Per-user display preferences
export const calUserSettings = pgTable('cal_user_settings', {
  id:          text('id').primaryKey(),
  userId:      text('user_id').notNull().unique(),
  details:     jsonb('details').default({}),           // { myTimeColor, crewColor, entryMode, logLevel }
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

---

### 3.2 TS_Exp5 (ts_*)

**Current state:** TS_Exp5 stores rich employee config in unified-settings.json and processes timesheets for auto-lunch/auto-note features.

```typescript
// ts_timesheet_snapshots — Cached timesheet data per pay period
// TS_Exp5 fetches timesheets from QBT and processes them (auto-lunch, validation).
// Snapshots capture the processed state per period.
export const tsTimesheetSnapshots = pgTable('ts_timesheet_snapshots', {
  id:          text('id').primaryKey(),
  employeeId:  text('employee_id').notNull(),          // FK employees.id
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  rawTimesheets: jsonb('raw_timesheets').default([]),  // QBT timesheet data as-fetched
  processedData: jsonb('processed_data').default({}),  // Auto-lunch, auto-note results
  status:      text('status').default('draft'),        // 'draft', 'reviewed', 'approved'
  details:     jsonb('details').default({}),           // { totalHours, regularHours, otHours, warnings }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_ts_snap_emp').on(table.employeeId),
  index('idx_ts_snap_period').on(table.periodStart, table.periodEnd),
]);

// ts_auto_lunch_rules — Auto-lunch insertion rules per employee
// (Currently embedded in unified-settings.json employee.lunch object)
// Moves to enrichment on employees table — no separate table needed.

// ts_pay_periods — Pay period metadata and status tracking
export const tsPayPeriods = pgTable('ts_pay_periods', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  status:      text('status').default('open'),         // 'open', 'processing', 'closed'
  details:     jsonb('details').default({}),           // { totalEmployees, totalHours, issues }
  closedAt:    timestamp('closed_at', { withTimezone: true }),
  closedBy:    text('closed_by'),                      // Clerk user ID
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_ts_period_unique').on(table.periodStart, table.periodEnd),
]);
```

**Migration note:** The bulk of TS_Exp5's "settings" (payRate, workSchedule, lunch, mileage, etc.) are actually employee enrichment and move to the `employees.enrichment` JSONB in Compartment 1.

---

### 3.3 RevExp5 (rev_*)

**Current state:** RevExp5 stores employee cost rates in settings.json, estimates in individual JSON files, and tracks billing cycles.

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
  //   "totalRevenue": 45000,
  //   "laborCost": 15000,
  //   "materialsCost": 8000,
  //   "subsCost": 12000,
  //   "grossMargin": 35,
  //   "invoiceCount": 5,
  //   "projections": { ... },
  //   "byProject": [ { jobcodeId, invoiced, labor, materials, margin } ]
  // }
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
  customerId:  text('customer_id'),                     // FK customers.id
  projectName: text('project_name'),
  preparedBy:  text('prepared_by'),
  estimateDate: date('estimate_date'),
  durationDays: integer('duration_days'),
  summary:     jsonb('summary').default({}),           // { siteworkAndBuilding, ohPct, ohAmount, estimateTotal }
  lineItems:   jsonb('line_items').default([]),         // Array of { name, section, type, hours, labor, materials, total }
  status:      text('status').default('draft'),        // 'draft', 'sent', 'accepted', 'declined'
  linkedCustomerId: text('linked_customer_id'),        // QBO customer ID (for invoice matching)
  sourceFile:  text('source_file'),                    // Original Excel filename
  details:     jsonb('details').default({}),           // { notes, revisions, changeOrders, vendorMappings, parsedDate }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_rev_est_customer').on(table.customerId),
  index('idx_rev_est_status').on(table.status),
]);
```

**Migration note:** RevExp5's employee cost rates move to `employees.enrichment.costRate` in Compartment 1. Margin targets and cycle config move to `app_settings` (revexp5, defaults).

---

### 3.4 PorjExp5 (proj_*)

**Current state:** Rich project management app with estimate builder, Gantt scheduling, client/property management, and subcontractor directory. Shares the same `db/` JSON structure as BB-DocEngine (clients, properties, subs, trades, master items). On migration, both apps will read/write the same Compartment 1 tables.

**Key insight:** PorjExp5 writes enriched property data BACK to QBO customer Notes fields (two-way sync). The Bridge must support this write-back pattern.

```typescript
// proj_estimate_templates — Project estimate blueprints (the core PorjExp5 entity)
export const projEstimateTemplates = pgTable('proj_estimate_templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  category:    text('category'),
  durationWeeks: integer('duration_weeks'),
  items:       jsonb('items').default([]),
  // items schema: Array of {
  //   name, section (sitework/building), phase (demo_prep/structural/finishes/closeout),
  //   trade (electrical/plumbing/etc), order, by (BBI/SUB/OWN),
  //   dur, durVal, durUnit, schedDur, lead, bufL, bufR,
  //   crew, hrs, nonLabor, avgCost, tier, tiers,
  //   sources: [{ id: "sub_qbo_370", type: "SUB"|"VEN" }],
  //   prefSource, scope, keywords
  // }
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
  //   "gantt": { schedule data }
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
  vendorId:    text('vendor_id').notNull(),             // FK vendors.id
  reason:      text('reason'),                          // Why ignored
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

**Migration note:** PorjExp5 and BB-DocEngine share identical `db/` schemas for clients, properties, subs, trades, master items. On migration, these become the SAME Compartment 1 tables. The `qbo-vendors.json` + `ignore-list.json` → `suppliers.json` pipeline becomes a view/filter on the shared `vendors` table with `proj_supplier_ignore_list`.

---

### 3.5 BB-DocEngine (doc_*)

**Current state:** Rich local JSON database. Most of its "master data" (clients, properties, subs, trades, master items) moves to Compartment 1. Working data = contracts, exhibits, estimate templates.

```typescript
// doc_contracts — Construction contracts (the core DocEngine entity)
export const docContracts = pgTable('doc_contracts', {
  id:          text('id').primaryKey(),                 // 'CON-00001'
  customerId:  text('customer_id').notNull(),           // FK customers.id
  propertyId:  text('property_id'),                     // FK properties.id
  estimateId:  text('estimate_id'),                     // FK rev_estimates.id (cross-app!)
  contractNumber: text('contract_number'),
  status:      text('status').default('draft'),         // 'draft', 'pending-signature', 'signed', 'active', 'completed'
  totalAmount: doublePrecision('total_amount'),
  signedDate:  date('signed_date'),
  startDate:   date('start_date'),
  completionDate: date('completion_date'),
  details:     jsonb('details').default({}),
  // details schema:
  // {
  //   "binderDocuments": [...],    // Array of document refs in binder
  //   "exhibits": [...],           // Attached exhibits
  //   "changeOrders": [...],       // Change order history
  //   "signatureStatus": {},       // Adobe Sign status
  //   "watermarkConfig": {},       // Per-contract watermark overrides
  // }
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_doc_customer').on(table.customerId),
  index('idx_doc_status').on(table.status),
]);

// doc_estimate_templates — Reusable estimate templates for DocEngine
export const docEstimateTemplates = pgTable('doc_estimate_templates', {
  id:          text('id').primaryKey(),
  name:        text('name').notNull(),
  description: text('description'),
  sections:    jsonb('sections').default([]),           // Template sections with default items
  isActive:    boolean('is_active').default(true),
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

---

### 3.6 Invoice_Validate2 (inv_*)

**Current state:** Validates invoices/receipts against QBO. Processing queue and results.

```typescript
// inv_validation_runs — Batch validation sessions
export const invValidationRuns = pgTable('inv_validation_runs', {
  id:          text('id').primaryKey(),
  runDate:     timestamp('run_date', { withTimezone: true }).defaultNow(),
  periodStart: date('period_start'),
  periodEnd:   date('period_end'),
  totalItems:  integer('total_items').default(0),
  matched:     integer('matched').default(0),
  unmatched:   integer('unmatched').default(0),
  flagged:     integer('flagged').default(0),
  details:     jsonb('details').default({}),           // { summary, config, timing }
  status:      text('status').default('completed'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// inv_receipt_matches — Individual receipt-to-QBO-transaction matches
export const invReceiptMatches = pgTable('inv_receipt_matches', {
  id:          text('id').primaryKey(),
  runId:       text('run_id').notNull(),                // FK inv_validation_runs.id
  receiptFile: text('receipt_file'),                    // Original filename
  vendorId:    text('vendor_id'),                       // FK vendors.id
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
```

---

### 3.7 Chase_Expense_Validator (chase_*)

**Current state:** Chrome extension. Scrapes transactions, validates against QBO. Ephemeral storage.

```typescript
// chase_validation_sessions — Scraped & validated transaction batches
export const chaseValidationSessions = pgTable('chase_validation_sessions', {
  id:          text('id').primaryKey(),
  site:        text('site').notNull(),                  // 'chase', 'homedepot', 'sanlorenzo'
  sessionDate: timestamp('session_date', { withTimezone: true }).defaultNow(),
  totalScraped: integer('total_scraped').default(0),
  totalMatched: integer('total_matched').default(0),
  totalUnmatched: integer('total_unmatched').default(0),
  transactions: jsonb('transactions').default([]),      // Array of scraped + validation results
  // Each transaction: { date, amount, card, vendor, description, qboMatch, status }
  details:     jsonb('details').default({}),            // { source, sideloadFile, config }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_chase_site').on(table.site),
  index('idx_chase_date').on(table.sessionDate),
]);
```

---

### 3.8 Adobe eSigner (esign_*)

**Current state:** PDF overlay management and Adobe Sign integration.

```typescript
// esign_agreements — Sent-for-signature document tracking
export const esignAgreements = pgTable('esign_agreements', {
  id:          text('id').primaryKey(),
  contractId:  text('contract_id'),                     // FK doc_contracts.id (cross-app!)
  customerId:  text('customer_id'),                     // FK customers.id
  adobeAgreementId: text('adobe_agreement_id'),         // Adobe Sign agreement ID
  documentName: text('document_name'),
  status:      text('status').default('draft'),         // 'draft', 'sent', 'viewed', 'signed', 'cancelled'
  sentAt:      timestamp('sent_at', { withTimezone: true }),
  signedAt:    timestamp('signed_at', { withTimezone: true }),
  signers:     jsonb('signers').default([]),            // [{ name, email, role, status }]
  details:     jsonb('details').default({}),            // { overlayId, sections, pdfUrl }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_esign_status').on(table.status),
  index('idx_esign_customer').on(table.customerId),
]);

// esign_overlay_registry — PDF overlay field definitions
export const esignOverlayRegistry = pgTable('esign_overlay_registry', {
  id:          text('id').primaryKey(),
  docType:     text('doc_type').notNull(),              // 'TM_Agreement', 'Estimate', 'Mechanics_Lien', etc.
  pageCount:   integer('page_count').notNull(),
  description: text('description'),
  fields:      jsonb('fields').default([]),             // Array of { name, type, page, x, y, width, height }
  isActive:    boolean('is_active').default(true),
  version:     integer('version').default(1),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_esign_doctype').on(table.docType),
]);
```

---

### 3.9 Landfill_Surcharge (lf_*)

**Current state:** Simple calculator. Queries QBO invoices for landfill items.

```typescript
// lf_surcharge_calculations — Calculated surcharges per period
export const lfSurchargeCalculations = pgTable('lf_surcharge_calculations', {
  id:          text('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd:   date('period_end').notNull(),
  itemName:    text('item_name').default('Landfill'),
  totalInvoiced: doublePrecision('total_invoiced').default(0),
  surchargeAmount: doublePrecision('surcharge_amount').default(0),
  details:     jsonb('details').default({}),            // { invoiceBreakdown: [...], rate, notes }
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

---

## 4. SHARED INFRASTRUCTURE TABLES

*Already defined in BB_DB_STRATEGY.md v1.4 Section 14. Summary:*

| Table | Purpose |
|-------|---------|
| `enrichment_fields` | Registry of all enrichment field definitions (entity_type, field_key, field_type, options) |
| `app_field_subscriptions` | Which apps subscribe to which enrichment fields |
| `app_settings` | Per-app and global configuration (JSONB settings per app+category) |
| `audit_log` | Platform-wide audit trail |
| `sync_log` | QBO/QBT sync history and statistics |

See BB_DB_STRATEGY.md v1.4 Section 14 for complete Drizzle schemas.

---

## 5. ENRICHMENT FIELD SEED DATA

Based on analysis of all 11 apps, here is the initial enrichment field registry:

### 5.1 Employee Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| alias | Short Name | text | - | TS_Exp5 | Phase 1 |
| defaultCrew | Default Crew | select | A, B, C | CalExp5 | Phase 1 |
| scheduleColor | Schedule Color | color | - | CalExp5 | Phase 1 |
| payRate | Pay Rate ($/hr) | number | - | TS_Exp5 | Phase 1 |
| billRate | Bill Rate ($/hr) | number | - | TS_Exp5, RevExp5 | Phase 1 |
| costRate | Cost Rate ($/hr) | number | - | RevExp5 | Phase 1 |
| workScheduleType | Work Schedule | select | full-time, part-time | TS_Exp5 | Phase 2 |
| workDays | Work Days | tags | Mon,Tue,Wed,Thu,Fri,Sat,Sun | TS_Exp5 | Phase 2 |
| workStartTime | Work Start | text | - | TS_Exp5 | Phase 2 |
| workEndTime | Work End | text | - | TS_Exp5 | Phase 2 |
| lunchDuration | Lunch Duration (min) | number | - | TS_Exp5 | Phase 2 |
| lunchRequired | Lunch Required | boolean | - | TS_Exp5 | Phase 2 |
| lunchRequiredAfterHours | Lunch After Hours | number | - | TS_Exp5 | Phase 2 |
| mileageDailyAllowance | Mileage Allowance | number | - | TS_Exp5 | Phase 3 |
| mileageVehicleType | Vehicle Type | select | company, personal | TS_Exp5 | Phase 3 |
| mileageHomeZip | Home ZIP | text | - | TS_Exp5 | Phase 3 |
| payPeriodTargetHours | Period Target Hours | number | - | TS_Exp5 | Phase 2 |
| overtimeApproved | Overtime Approved | boolean | - | TS_Exp5 | Phase 2 |
| cardLast4 | Chase Card Last 4 | text | - | Chase_Exp | Phase 3 |
| role | Role | select | crew, lead, foreman, pm, owner | All | Phase 1 |
| certifications | Certifications | tags | OSHA-30, First Aid, etc. | All | Phase 3 |
| vehicleAssignment | Vehicle | text | - | All | Phase 3 |
| emergencyContact | Emergency Contact | text | - | All | Phase 3 |

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
| trade | Trade | select | (from trades table) | DocEngine | Phase 1 |
| license | License # | text | - | DocEngine | Phase 2 |
| isSub | Is Subcontractor | boolean | - | DocEngine | Phase 1 |
| keywords | Search Keywords | text | - | DocEngine | Phase 2 |
| aliases | Name Aliases | tags | - | GS_Receipts, Chase | Phase 2 |
| w9OnFile | W-9 On File | boolean | - | All | Phase 3 |
| insuranceExpiry | Insurance Expiry | date | - | All | Phase 3 |

### 5.4 Jobcode Enrichment Fields

| field_key | display_name | field_type | options | used_by | priority |
|-----------|-------------|------------|---------|---------|----------|
| color | Display Color | color | - | CalExp5 | Phase 1 |
| sortOrder | Sort Order | number | - | CalExp5 | Phase 1 |
| excludeFromProcessing | Exclude | boolean | - | TS_Exp5 | Phase 1 |
| receiptAliases | Receipt Aliases | tags | - | GS_Receipts | Phase 2 |
| propertyAddress | Property Address | text | - | GS_Receipts | Phase 2 |
| customerName | Customer Name | text | - | RevExp5 | Phase 2 |
| propertyId | Property Link | text | - | DocEngine | Phase 3 |
| revenueCategory | Revenue Category | select | labor, materials, sub | RevExp5 | Phase 2 |
| projectStatus | Project Status | select | active, completed, on-hold | RevExp5 | Phase 2 |

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
  "address": { "street": "123 Main Street", "city": "Bainbridge Island", "state": "WA", "zip": "98110" }
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
```

### 6.2 Per-App Settings Examples

```jsonc
// app_settings: { appName: 'calexp5', category: 'display' }
{ "defaultView": "calendar", "entryMode": "work", "logLevel": "minimal" }

// app_settings: { appName: 'ts_exp5', category: 'defaults' }
{ "lunchDuration": 30, "lunchRequiredAfterHours": 4, "defaultWorkStart": "07:30" }

// app_settings: { appName: 'revexp5', category: 'defaults' }
{
  "marginTarget": 32, "marginStrong": 35,
  "revenueTargetLabor": 55, "revenueTargetNonLabor": 33, "revenueTargetMarkup": 10,
  "avgBillRate": 85, "futureRevTarget": 1500000,
  "cycleWeeks": 2, "warningDays": 15, "criticalDays": 30
}

// app_settings: { appName: 'inv_validate2', category: 'defaults' }
{ "hoursTolerance": 0.01, "thumbnailWidth": 200, "maxVendorLength": 20 }

// app_settings: { appName: 'docengine', category: 'binder' }
{
  "coverPage": { "enabled": true, "title": "CONTRACT BINDER SUMMARY" },
  "watermark": { "enabled": true, "font": { "name": "Helvetica", "size": 10, "color": "#e41111" } },
  "eSignature": { "platform": "adobeSign", "enabled": true }
}

// app_settings: { appName: 'landfill', category: 'defaults' }
{ "itemName": "Landfill", "defaultWeeks": 3 }
```

---

## 7. CROSS-APP DATA FLOWS

These tables reference each other across app boundaries:

```
doc_contracts.estimateId  ──────► rev_estimates.id
doc_contracts.customerId  ──────► customers.id
doc_contracts.propertyId  ──────► properties.id
esign_agreements.contractId ────► doc_contracts.id
esign_agreements.customerId ────► customers.id
proj_projects.customerId  ──────► customers.id
proj_projects.propertyId  ──────► properties.id
proj_projects.jobcodeId   ──────► work_jobcodes.id
rev_estimates.customerId  ──────► customers.id
rev_cycle_snapshots        reads  work_jobcodes (for project breakdown)
cal_manual_hours.userId   ──────► employees.id
cal_manual_hours.jobcodeId ─────► work_jobcodes.id
ts_timesheet_snapshots.employeeId ► employees.id
inv_receipt_matches.vendorId ───► vendors.id
chase_validation_sessions   reads  vendors (for matching)
properties.customerId     ──────► customers.id
```

**Key insight:** The contract lifecycle flows across 4 apps:
1. **PorjExp5** creates the estimate template + builds scope (`proj_estimate_templates`)
2. **RevExp5** tracks revenue against the estimate (`rev_estimates`)
3. **BB-DocEngine** creates the contract binder (`doc_contracts`) linking to the estimate
4. **Adobe eSigner** sends it for signature (`esign_agreements`) linking to the contract
5. **PorjExp5** tracks the active project + Gantt schedule (`proj_projects`)

**Shared data:** PorjExp5 and BB-DocEngine share identical JSON databases for clients, properties, subs, trades, and master items. On migration, they share the same Compartment 1 tables — no data duplication.

---

## 8. TABLE COUNT SUMMARY

| Category | Tables | Notes |
|----------|--------|-------|
| **Compartment 1: Master Data** | 7 | employees, customers, vendors, work_jobcodes, properties, trades, master_items |
| **Compartment 2: Working Data** | 18 | cal_* (4), ts_* (2), rev_* (2), proj_* (3), doc_* (2), inv_* (2), chase_* (1), esign_* (2), lf_* (1) → some deferred |
| **Shared Infrastructure** | 5 | enrichment_fields, app_field_subscriptions, app_settings, audit_log, sync_log |
| **TOTAL** | 30 | (items table deferred) |

### Phase Rollout

| Phase | Tables Created | Apps Affected |
|-------|---------------|---------------|
| **DB-1** (Bridge + Auth) | employees, work_jobcodes, enrichment_fields, app_field_subscriptions, app_settings, audit_log, sync_log | All |
| **DB-2** (CalExp5 migration) | cal_manual_hours, cal_selected_jobcodes, cal_uploaded_timesheets, cal_user_settings | CalExp5 |
| **DB-3** (Data Manager + Enrichment) | (no new tables — populates enrichment_fields registry) | Data Manager |
| **DB-4** (DocEngine + PorjExp5 migration) | customers, vendors, properties, trades, master_items, doc_contracts, doc_estimate_templates, proj_estimate_templates, proj_projects, proj_supplier_ignore_list | BB-DocEngine, PorjExp5 |
| **DB-5** (Revenue migration) | rev_cycle_snapshots, rev_estimates | RevExp5 |
| **DB-6** (Timesheet migration) | ts_timesheet_snapshots, ts_pay_periods | TS_Exp5 |
| **DB-7** (Validation apps) | inv_validation_runs, inv_receipt_matches, chase_validation_sessions | InvVal2, Chase |
| **DB-8** (Remaining) | esign_agreements, esign_overlay_registry, lf_surcharge_calculations | Adobe eSigner, Landfill |

---

## 9. MIGRATION NOTES

### What Moves Where

| Current Location | Destination |
|-----------------|-------------|
| TS_Exp5 `unified-settings.json` employee data | `employees.enrichment` (Compartment 1) |
| TS_Exp5 `id-crossref.json` | Eliminated — `employees` table has both `qbo_id` and `qbt_id` |
| RevExp5 `settings.json` employee rates | `employees.enrichment.costRate` |
| RevExp5 `settings.json` app config | `app_settings` (revexp5, defaults) |
| RevExp5 `data/estimates/*.json` | `rev_estimates` table |
| BB-DocEngine `db/clients.json` | `customers` table |
| BB-DocEngine `db/properties.json` | `properties` table |
| BB-DocEngine `db/subs.json` | `vendors` table (with `enrichment.isSub = true`) |
| BB-DocEngine `db/trades.json` | `trades` table |
| BB-DocEngine `db/master-items.json` | `master_items` table |
| BB-DocEngine `db/contracts.json` | `doc_contracts` table |
| CalExp5 Zustand/localStorage | `cal_*` tables |
| Chase_Exp `chrome.storage` cardholders | `employees.enrichment.cardLast4` |
| GS_Receipts Aliases_J sheet | `work_jobcodes.enrichment.receiptAliases` |
| GS_Receipts Aliases_S sheet | `vendors.enrichment.aliases` |
| All app `settings.json` files | `app_settings` table |
| Invoice_Validate2 `settings.json` | `app_settings` (inv_validate2, defaults) |
| Adobe eSigner `contractors.json` | `employees` table (filtered to active contractors) |
| Adobe eSigner `sections-registry.json` | `esign_overlay_registry` table |
| Landfill_Surcharge `settings.json` | `app_settings` (landfill, defaults) |

### What Stays External

| Data | Why It Stays |
|------|-------------|
| GS_Receipts processing log | Lives in Google Sheets — different runtime |
| Chase_Exp scraped transactions | Ephemeral per-session; optional persistence in `chase_validation_sessions` |
| BB_Desktop_Relay state | Stateless relay; no persistent data needed |
| Adobe eSigner PDF overlay coordinates | Could move to `esign_overlay_registry` or stay as files (both work) |

---

*See: BB_DB_STRATEGY.md v1.4 @ Section 14 for Drizzle schemas of shared infrastructure tables*
*See: BB_CALEXP5_SCHEMA.md v1.2 for detailed CalExp5 working data schemas*
*See: BB_PLATFORM_READINESS_REPORT.md v1.3 for implementation phases and gaps*
