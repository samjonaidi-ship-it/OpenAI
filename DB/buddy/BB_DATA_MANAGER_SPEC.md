# BB Data Manager | Feature Spec v1.1 | 2026-03-14 | BB

> **Purpose:** Standalone app for managing BB Platform master data (Compartment 1) and inspecting per-app working data (Compartment 2). Single source of truth for all QBO/QBT-synced entities and their enrichment.

---

## 1. APP IDENTITY

| Property | Value |
|----------|-------|
| App Name | BB Data Manager |
| Type | Standalone web app (Express + static HTML/CSS/JS) |
| Port | TBD (check BAT_PORT_INVENTORY.csv) |
| Audience | Sam (single power-user) |
| Design | Minimalist, elegant, highly functional |
| Theme | BB colors (#C8102E, #1A1A1A) |

---

## 2. NAVIGATION MODEL

Left sidebar with two sections + system footer:

```
┌──────────────────────┐
│  BB DATA MANAGER     │
│  ─────────────────── │
│                      │
│  MASTER DATA         │
│  ├─ Employees        │
│  ├─ Customers        │
│  ├─ Vendors          │
│  ├─ Jobcodes         │
│  ├─ Properties       │
│  ├─ Items/Services   │
│  ├─ Trades           │
│  └─ Company          │
│                      │
│  APP DATA            │
│  ├─ CalExp5          │
│  ├─ TS_Exp5          │
│  ├─ RevExp5          │
│  ├─ PorjExp5         │
│  ├─ BB-DocEngine     │
│  ├─ Invoice Val.     │
│  ├─ GS_Receipts      │
│  ├─ Chase Val.       │
│  ├─ Adobe eSigner    │
│  └─ Landfill         │
│                      │
│  ─────────────────── │
│  SYSTEM              │
│  ├─ Sync Status      │
│  ├─ Audit Trail      │
│  ├─ Quality          │
│  ├─ Settings         │
│  └─ Enrichment Registry │
└──────────────────────┘
```

---

## 3. MASTER DATA VIEWS (Compartment 1)

### 3.1 Design Pattern: Entity Grid

Every master data entity shares the same grid layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Employees                                    [Sync ●] [+ Add] │
│  ─────────────────────────────────────────────────────────────  │
│  12 active · 8 inactive · 28 enrichment fields · 72% filled    │
│                                                                 │
│  [Search___________]  [Active ▼]  [All Fields ▼]  [Export]     │
│                                                                 │
│  ┌─┬────────────┬──────────┬──────────┬────────┬──────────┐    │
│  │ │ Name       │ QBO ID   │ QBT ID   │ Status │ Filled % │    │
│  ├─┼────────────┼──────────┼──────────┼────────┼──────────┤    │
│  │▶│ Evan B.    │ 6        │ 3194176  │ ● act  │ ████░ 89%│    │
│  │▶│ Chad B.    │ 12       │ 3211846  │ ● act  │ ███░░ 75%│    │
│  │▶│ Christian  │ 14       │ 3222041  │ ● act  │ ███░░ 71%│    │
│  │ │ ...        │          │          │        │          │    │
│  └─┴────────────┴──────────┴──────────┴────────┴──────────┘    │
│                                                                 │
│  ▼ DETAIL: Evan Bainbridge                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  CORE (QBO-synced)          │ ENRICHMENT (Sam-managed)  │    │
│  │  ─────────────────          │ ────────────────────────── │    │
│  │  Display Name: Evan B.      │ alias: Evan         [TS]  │    │
│  │  Email: evan@bb.com         │ payRate: $70.00     [TS]  │    │
│  │  Phone: (408) 555-1234      │ billRate: $85.00    [TS]  │    │
│  │  Hire Date: 2019-03-15      │ costRate: $70.00    [Rev] │    │
│  │  Active: ✓                  │ defaultCrew: A      [Cal] │    │
│  │  Salaried: ✗                │ cardLast4: 2145     [Chs] │    │
│  │                             │ role: owner         [All] │    │
│  │  QBO Sync: 2h ago ●        │ workDays: M-F       [TS]  │    │
│  │  QBT Sync: 2h ago ●        │ lunchRequired: ✓    [TS]  │    │
│  │                             │ ...12 more fields         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key features:**
- **Header bar:** Entity name, sync indicator (green dot = fresh, yellow = stale, red = error), add button
- **Stats ribbon:** Active/inactive counts, enrichment field count, overall filled %
- **Filter bar:** Search, status filter, field visibility toggle, export
- **Grid:** Sortable columns, expandable rows (▶ to expand detail panel)
- **Detail panel:** Split into CORE (QBO-synced, read-only) and ENRICHMENT (editable)
- **Enrichment badges:** Each field shows which app owns it [TS], [Cal], [Rev], etc.
- **Filled %:** Visual bar showing enrichment completeness per record

### 3.2 Entity-Specific Views

#### Employees
| Column | Source | Editable? |
|--------|--------|-----------|
| Display Name | QBO | No (sync) |
| QBO ID | QBO | No |
| QBT ID | QBT | No |
| Email | QBO | No (sync) |
| Phone | QBO | No (sync) |
| Hire Date | QBO | No (sync) |
| Active | QBO | No (sync) |
| Salaried | Crossref | Yes |
| 28 enrichment fields | Apps/Sam | Yes |

**Dual-ID highlight:** Both QBO ID and QBT ID displayed side by side. Color-coded:
- Both present = green
- Only one present = yellow (needs crossref resolution)
- Neither = red (orphan record)

#### Customers
| Column | Source | Editable? |
|--------|--------|-----------|
| Display Name | QBO | No |
| QBO ID | QBO | No |
| Name 1 / Name 2 | QBO | No |
| Last Name | QBO | No |
| Email, Phone, Mobile | QBO | No |
| Address, City, State, Zip | QBO | No |
| Active | QBO | No |
| Notes | QBO | No |
| 6 enrichment fields | Apps/Sam | Yes |

**Sub-customers:** QBO supports parent/sub-customer hierarchy. Display as expandable tree:
```
  ▼ Smith, John              QBO #139  ● active
    ├─ Smith - Main St        QBO #140  ● active    (sub-customer = property)
    └─ Smith - Oak Ave        QBO #141  ● active    (sub-customer = property)
```

**Customer ↔ Property link:** Show linked properties from the `properties` table inline.

#### Vendors
| Column | Source | Editable? |
|--------|--------|-----------|
| Display Name | QBO | No |
| QBO ID | QBO | No |
| Short Name | Enrichment | Yes |
| Company | QBO | No |
| Email, Phone | QBO | No |
| Active | QBO | No |
| Is 1099 | QBO | No |
| 12 enrichment fields | Apps/Sam | Yes |

**Pipeline view:** Visual indicator showing vendor pipeline status:
```
  QBO Vendor → [Supplier] → [Sub ✓] or [Vendor Dir ✓] or [Ignored ✗]
```

**Alias map:** For vendors with GS_Receipts aliases, show the keyed lookup inline:
```
  Aliases: "HOME DEPO" → Home Depot, "HD" → Home Depot, "HOMEDEPOT" → Home Depot
```

#### Jobcodes
| Column | Source | Editable? |
|--------|--------|-----------|
| Name | QBT | No |
| QBT ID | QBT | No |
| Short Name | Derived | Yes |
| Type | QBT | No |
| Parent ID | QBT | No |
| Active | QBT | No |
| Billable | QBT | No |
| 12 enrichment fields | Apps/Sam | Yes |

**Hierarchy:** Display parent/child jobcode tree:
```
  ▼ Hong - Oakland Ave       QBT #12345  regular  ● active
    ├─ (no children)
  ▼ PTO                      QBT #56172  pto      ● active
    ├─ Sick                   QBT #56172044
    ├─ Vacation               QBT #56172048
    └─ Unpaid                 QBT #56172040
```

**Special jobcodes:** Highlight hardcoded IDs (Lunch, Sick, Vacation, Unpaid, Shop) with a ★ badge.

#### Properties
| Column | Source | Editable? |
|--------|--------|-----------|
| Address | QBO/Geocode | No |
| Customer | FK | No |
| Geocode Status | System | No |
| Beds/Baths/SqFt | Zillow/Redfin | No |
| Enrichment (tags, photos, URLs) | Sam | Yes |

**Map view toggle:** Switch between grid and map view (Google Maps embed showing property pins).

#### Items/Services (NEW — currently deferred)
| Column | Source | Editable? |
|--------|--------|-----------|
| Name | QBO | No |
| Type | QBO | No |
| Description | QBO | No |
| Unit Price | QBO | No |
| Active | QBO | No |

**Note:** This table is currently deferred in the schema. The Data Manager should show it as "Not yet synced" with a button to enable sync when ready for DB-7.

#### Trades (Lookup)
Simple editable list of 39 trade values with aliases and auto-detect patterns.

#### Company
(stored in app_settings, not a C1 table — included here for convenient access)

Single-record view showing company info from QBO + BB settings:
```
  Bainbridge Builders Inc.
  License: #349328
  Phone: (408) 781-2364
  Email: info@bainbridgebuilders.com

  Officers:
  1. [fname] [lname] — [title] — [email] — [phone]
  2. ...
  3. ...

  QBO Realm: 9341455569882853
  Sandbox: ✓
```

---

## 4. QBO ↔ QBT ID RECONCILIATION

### The Problem
QBO and QBT are separate systems with separate IDs for the same entities:

| Entity | QBO ID | QBT ID | Example |
|--------|--------|--------|---------|
| Employee | Employee.Id (e.g., "6") | User.id (e.g., "3194176") | Evan Bainbridge |
| Jobcode | N/A | Jobcode.id (e.g., "65312908") | Shop (BBInc.) |
| Timesheet | TimeActivity.Id | Timesheet.id | Same hours record |

### UI Treatment
**Employees grid** shows both IDs in adjacent columns with status indicator:
- 🟢 **Matched:** Both QBO ID and QBT ID populated → crossref complete
- 🟡 **Partial:** Only one ID populated → needs resolution
- 🔴 **Orphan:** Neither ID → manual investigation needed

**Reconciliation panel** (accessible from Employees header):
```
  ID RECONCILIATION                                    [Run Match ▶]
  ─────────────────
  Matched: 12/12 employees  ● All resolved

  Match Strategy:
  1. Exact name match (DisplayName ↔ display_name)
  2. Email match (PrimaryEmailAddr ↔ email)
  3. Manual override

  Last run: 2026-03-14 09:30:00
```

---

## 5. APP DATA VIEWS (Compartment 2)

Each app gets its own tab showing schema + data population. Read-only inspection (apps own their own writes).

### 5.1 Design Pattern: App Data Tab

```
┌─────────────────────────────────────────────────────────────────┐
│  CalExp5                                                        │
│  ─────────────────────────────────────────────────────────────  │
│  5 tables · 12,847 rows · 6.2 MB · Last write: 2h ago          │
│                                                                 │
│  [Schema]  [Data]  [Settings]  [Enrichment Usage]              │
│                                                                 │
│  SCHEMA VIEW:                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  cal_manual_hours          4,821 rows    2.1 MB         │    │
│  │  ├─ id            text     PK                           │    │
│  │  ├─ user_id       text     FK → employees               │    │
│  │  ├─ date          date                                  │    │
│  │  ├─ jobcode_id    text     FK → work_jobcodes           │    │
│  │  ├─ hours         float                                 │    │
│  │  ├─ details       jsonb    { entryMode, notes, segments }│   │
│  │  ├─ version       int                                   │    │
│  │  ├─ created_at    timestamp                             │    │
│  │  └─ updated_at    timestamp                             │    │
│  │                                                         │    │
│  │  cal_selected_jobcodes     156 rows      24 KB          │    │
│  │  ├─ id            text     PK                           │    │
│  │  ├─ user_id       text     FK → employees               │    │
│  │  ├─ jobcode_id    text     FK → work_jobcodes           │    │
│  │  ├─ color         text     # hex color                  │    │
│  │  ├─ sort_order    int                                   │    │
│  │  └─ created_at    timestamp                             │    │
│  │                                                         │    │
│  │  cal_uploaded_timesheets   5,102 rows    1.8 MB         │    │
│  │  cal_user_settings         12 rows       8 KB           │    │
│  │  cal_audit_log             2,756 rows    2.3 MB         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  DATA VIEW (cal_manual_hours):                                  │
│  ┌───────────┬──────────┬────────────┬───────┬─────────────┐    │
│  │ user_id   │ date     │ jobcode    │ hours │ details     │    │
│  ├───────────┼──────────┼────────────┼───────┼─────────────┤    │
│  │ Evan B.   │ 03-14    │ Hong - Oak │ 8.0   │ {segments…} │    │
│  │ Chad B.   │ 03-14    │ Cortez     │ 7.5   │ {segments…} │    │
│  └───────────┴──────────┴────────────┴───────┴─────────────┘    │
│                                                                 │
│  SETTINGS VIEW:                                                 │
│  app_settings rows for calexp5:                                 │
│  ├─ calexp5 / defaults    → { view, logLevel, ... }            │
│  └─ (1 category)                                                │
│                                                                 │
│  ENRICHMENT USAGE:                                              │
│  Fields this app subscribes to:                                 │
│  ├─ employees.defaultCrew     ← writes                         │
│  ├─ employees.scheduleColor   ← writes                         │
│  ├─ jobcodes.color            ← writes                         │
│  └─ jobcodes.sortOrder        ← writes                         │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Per-App Summary

| App | Tables | Key Metrics to Show |
|-----|--------|-------------------|
| **CalExp5** | 5 | Hours entered today, uploads this period, active users |
| **TS_Exp5** | 4 | Current pay period status, last AL run, employee count |
| **RevExp5** | 2 | Current cycle, total estimates, annual revenue |
| **PorjExp5** | 3 | Active projects, templates, ignored suppliers |
| **BB-DocEngine** | 3 | Active contracts, templates, notes backups |
| **Invoice Val.** | 4 | Last validation run, pass/fail counts |
| **GS_Receipts** | 0 | (Google Sheets — show link + alias counts) |
| **Chase Val.** | 1 | Last session, matched/unmatched counts |
| **Adobe eSigner** | 3 | Agreements by status, overlay registry, signers |
| **Landfill** | 1 | Last calculation, total surcharges |

---

## 6. SYNC STATUS VIEW

Global sync dashboard:

```
┌─────────────────────────────────────────────────────────────────┐
│  SYNC STATUS                                                    │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  QBO Sync            Last: 09:15:00    Next: 09:30:00    ● OK  │
│  ├─ Customers        142 records    0 changes    ● fresh       │
│  ├─ Vendors          287 records    2 updated    ● fresh       │
│  ├─ Employees        20 records     0 changes    ● fresh       │
│  └─ Items            0 records      (not synced) ○ deferred    │
│                                                                 │
│  QBT Sync            Last: 09:15:00    Next: 09:30:00    ● OK  │
│  ├─ Users            20 records     0 changes    ● fresh       │
│  ├─ Jobcodes         148 records    1 updated    ● fresh       │
│  └─ Timesheets       (on-demand)                 ○              │
│                                                                 │
│  SYNC LOG (last 10):                                            │
│  ┌──────────┬────────┬──────────┬─────────┬─────────┬────────┐ │
│  │ Time     │ Source │ Entity   │ Checked │ Updated │ Status │ │
│  ├──────────┼────────┼──────────┼─────────┼─────────┼────────┤ │
│  │ 09:15:00 │ QBO    │ Vendors  │ 287     │ 2       │ ● ok   │ │
│  │ 09:15:01 │ QBO    │ Customers│ 142     │ 0       │ ● ok   │ │
│  │ 09:15:01 │ QBT    │ Users    │ 20      │ 0       │ ● ok   │ │
│  │ 09:00:00 │ QBO    │ All      │ 449     │ 0       │ ● ok   │ │
│  └──────────┴────────┴──────────┴─────────┴─────────┴────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. MDM FEATURES

### 7.1 Enrichment History Panel

When expanding any master data entity row, the detail panel gains a third tab: "History" (alongside Core and Enrichment). Shows:

- Field-level enrichment change log from the `enrichment_history` table, newest first
- Each row shows: field name, old value → new value, changed_by (app or user), timestamp
- Filterable by field name or date range
- Expandable from any entity detail view across all 6 entity grids (employees, customers, vendors, jobcodes, properties, master_items — NOT trades)

### 7.2 Conflict Resolution

> QBO/QBT conflict resolution is handled by Bridge at sync time. No user-facing conflict queue needed.

### 7.3 Audit Trail Viewer

New sidebar item under SYSTEM section: "Audit Trail" (between Sync Status and Quality).

- Primarily displays records from the `enrichment_history` table
- Filterable by: entity type, entity ID, changed_by, date range, field name
- Grid columns: Timestamp, Entity, Field Name, Old Value, New Value, Changed By, Source App
- Expandable rows show full old_value/new_value details
- Color-coded by source: blue=qbo_sync, green=qbt_sync, orange=enrichment, gray=manual

### 7.4 Data Quality Dashboard

Stats ribbon on each entity grid gains additional metrics beyond "Filled %":

- Freshness: "Last synced 2h ago" with color (green <6h, yellow 6-24h, red >24h)
- Consistency: "12/12 crossref matched" (for entities with both QBO and QBT IDs)
- Per-entity quality score card visible from a new "Quality" sidebar item showing bar charts per entity

### 7.5 context_map Editor

> **Note:** This is an inline editor within entity detail panels (not a standalone screen). It appears as horizontal tabs per context when expanding a `context_map` enrichment field.

When editing a `context_map` enrichment field (e.g., vendor aliases), the editor shows:

- Horizontal tabs for each context (e.g., "GS Receipts | Chase | Invoice")
- Each tab shows the context-specific value with appropriate editor (keyed lookup for aliases)
- "Add Context" button if a new app needs aliases
- Visual indicator showing which contexts have data vs empty

---

## 8. QBO + QBT MASTER DATA ENDPOINT INVENTORY

### Tier 1 — Sync Now (Compartment 1 core)

| Entity | QBO Endpoint | QBT Endpoint | Neon Table | Sync Strategy |
|--------|-------------|-------------|------------|---------------|
| **Employees** | `GET /v3/company/{id}/query?query=SELECT * FROM Employee` | `GET /api/v1/users` | `employees` | QBO primary (identity), QBT secondary (hours). Crossref via name/email match. |
| **Customers** | `GET /v3/company/{id}/query?query=SELECT * FROM Customer` | N/A | `customers` | QBO only. Sub-customers = properties. |
| **Vendors** | `GET /v3/company/{id}/query?query=SELECT * FROM Vendor` | N/A | `vendors` | QBO only. Pipeline: QBO → Supplier → Sub/VendorDir. |
| **Jobcodes** | N/A | `GET /api/v1/jobcodes` | `work_jobcodes` | QBT only. Parent/child hierarchy. |
| **Company** | `GET /v3/company/{id}/companyinfo/{id}` | N/A | `app_settings` (_global, company) | QBO only. Single record. |

### Tier 2 — Sync Soon (Compartment 1 expansion)

| Entity | QBO Endpoint | QBT Endpoint | Neon Table | Notes |
|--------|-------------|-------------|------------|-------|
| **Items/Services** | `GET /v3/company/{id}/query?query=SELECT * FROM Item` | N/A | `items` (deferred) | Products and services catalog. Used by Landfill, InvVal2. |
| **Accounts** | `GET /v3/company/{id}/query?query=SELECT * FROM Account` | N/A | TBD | Chart of accounts. Category validation for InvVal2. |
| **Terms** | `GET /v3/company/{id}/query?query=SELECT * FROM Term` | N/A | TBD | Net 30, Net 45, etc. Customer enrichment. |
| **PaymentMethod** | `GET /v3/company/{id}/query?query=SELECT * FROM PaymentMethod` | N/A | TBD | Cash, Check, ACH. Vendor enrichment. |
| **Jobcode Assignments** | N/A | `GET /api/v1/jobcode_assignments` | TBD | Which users can clock which jobcodes. |
| **Groups** | N/A | `GET /api/v1/groups` | TBD | Crew/team groupings → CalExp5 crews. |

### Tier 3 — Transaction Data (Compartment 2 / ephemeral reads)

| Entity | QBO Endpoint | QBT Endpoint | Neon Table | Notes |
|--------|-------------|-------------|------------|-------|
| **Invoices** | `SELECT * FROM Invoice` | N/A | Ephemeral (RevExp5) | Fetched live per session |
| **Estimates** | `SELECT * FROM Estimate` | N/A | `rev_estimates` | Stored after parsing |
| **Purchases** | `SELECT * FROM Purchase` | N/A | Ephemeral (Landfill, Chase) | Fetched for validation |
| **Bills** | `SELECT * FROM Bill` | N/A | Ephemeral (InvVal2) | Fetched for validation |
| **Timesheets** | N/A | `GET /api/v1/timesheets` | `ts_timesheet_snapshots` | Fetched per pay period |
| **Time Off Requests** | N/A | `GET /api/v1/time_off_requests` | TBD | Formal PTO tracking |
| **Attachables** | `SELECT * FROM Attachable` | N/A | Ephemeral | Receipt attachments |

### QBO ↔ QBT Field Mapping Reference

| Concept | QBO Field | QBT Field | Notes |
|---------|-----------|-----------|-------|
| Employee ID | `Employee.Id` | `User.id` | Different numeric IDs for same person |
| Employee Name | `Employee.DisplayName` | `User.first_name + last_name` | QBO may include middle name |
| Email | `Employee.PrimaryEmailAddr` | `User.email` | Should match (primary crossref key) |
| Active | `Employee.Active` | `User.active` | Same boolean |
| Hire Date | `Employee.HiredDate` | `User.hire_date` | Same concept |
| Jobcode | N/A (not in QBO) | `Jobcode.id` | QBT-only concept |
| Time Entry | `TimeActivity.Id` | `Timesheet.id` | Same hours, different APIs |
| Customer on Time | `TimeActivity.CustomerRef` | `Timesheet.jobcode_id` | QBO uses customer, QBT uses jobcode |

---

## 9. INTERACTION PATTERNS

### Inline Editing (Enrichment Only)
- Click any enrichment field to edit inline
- QBO-synced fields are visually read-only (gray background, lock icon)
- Changes auto-save with debounce (500ms)
- Audit trail shows who changed what and when

### Enrichment Field Types → UI Controls
| Type | Control |
|------|---------|
| text | Text input |
| number | Number input with step |
| boolean | Toggle switch |
| select | Dropdown with predefined options |
| tags | Tag input with autocomplete |
| color | Color picker |
| date | Date picker |
| object | JSON editor (expandable) |
| context_map | Tab group with per-context editors |

### JSONB Inspector
For JSONB columns (enrichment, details), show a formatted JSON tree with expand/collapse:
```
  enrichment: {
    ▼ "payRate": 70,
      "billRate": 85,
      "costRate": 70,
    ▶ "workDays": ["Mon","Tue","Wed","Thu","Fri"],
      "lunchRequired": true,
      ...
  }
```

### Keyboard Navigation
| Key | Action |
|-----|--------|
| ↑/↓ | Navigate rows |
| Enter | Expand/collapse row detail |
| Tab | Next editable field |
| Esc | Cancel edit |
| Ctrl+K | Global search |

---

## 10. TECH STACK

| Layer | Technology |
|-------|-----------|
| Server | Express.js on localhost (single port) |
| Frontend | Vanilla HTML/CSS/JS (BB pattern) |
| Data | Reads from Neon via Bridge API (or direct for local dev) |
| Styling | BB UI System (CLAUDE.md bb-ui skill) |
| State | Minimal — grid data fetched on tab switch, cached in memory |

---

## 11. SCREEN COUNT

| Screen | Description |
|--------|-------------|
| 1. Employees Grid | Master data + enrichment + dual-ID |
| 2. Customers Grid | Master data + sub-customer tree + property links |
| 3. Vendors Grid | Master data + pipeline status + alias map |
| 4. Jobcodes Grid | Master data + hierarchy tree + special badges |
| 5. Properties Grid | Master data + geocode status + map toggle |
| 6. Items Grid | Master data (deferred — placeholder) |
| 7. Trades Grid | Editable lookup table |
| 8. Company View | Single-record company info |
| 9-18. App Data Tabs | One per app (10 apps) — schema + data + settings |
| 19. Sync Status | Global sync dashboard |
| 20. Audit Trail | Filterable enrichment_history log |
| 21. Quality Dashboard | Per-entity data quality score cards |
| 22. Settings | App configuration |
| 23. Enrichment Registry | Manage enrichment_fields definitions and app_field_subscriptions |

**Total: ~23 screens** (20 original + 2 MDM [Enrichment History panel + Audit Trail] + Enrichment Registry), all following the same grid pattern with entity-specific customizations.

> **Enrichment Registry (Screen 23):** The Data Manager owns the `enrichment_fields` and `app_field_subscriptions` infrastructure tables but currently has no screen for managing them. This sub-screen (accessible from Settings or as a standalone sidebar item under SYSTEM) provides: (1) viewing/editing enrichment_fields definitions (field name, type, default, validation), (2) managing app_field_subscriptions (which apps subscribe to which fields, read/write permissions), and (3) adding new field definitions without requiring schema changes.

---

*Derived from: BB_PLATFORM_SCHEMA-v2.23, BB_DB_STRATEGY.md v1.4, BB_ARCHITECTURE_ANALYSIS.md v1.0*
