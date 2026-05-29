# CalExp5 Database Schema Design | v1.3 | 2026-03-15 | BB

> **Purpose:** Drizzle ORM schema for migrating CalExp5 from localStorage/IndexedDB to Neon Postgres, aligned with the two-compartment model and superset enrichment architecture.
> **Derived from:** CalExp5 `useStore.js` (Zustand persist), `auditLog.js`, `constants.js`, `settings.json`, `api.js`
> **Cross-references:** BB_DB_STRATEGY.md v1.5 | BB_PLATFORM_SCHEMA-v2.md v2.24 | BB_PLATFORM_READINESS_REPORT.md v1.3

> **Changelog v1.3 (2026-03-15):** Auth strategy overhaul. Replaced Clerk with WebAuthn/Face ID + PIN for crew authentication at DB-2. Updated connection setup (Section 9) to use session tokens instead of Clerk JWTs. Updated migration map to use WebAuthn registration instead of Clerk login. Updated required packages (removed @clerk/clerk-react, added @simplewebauthn/browser). See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12.
>
> **Changelog v1.2 (2026-03-14):** Cross-doc reconciliation audit. Standardized jobcodes endpoint to `/api/master/jobcodes`. Added composite QBT write endpoints (timesheet submit). Added bulk-upsert endpoints for migration. Added note on `cal_uploaded_timesheets` not needing version column. Clarified dual audit log strategy. Fixed cross-references to v1.4/v1.3.
>
> **Changelog v1.1 (2026-03-14):** Aligned with two-compartment model. CalExp5 `users` table replaced by shared `employees` master data table (Compartment 1). `work_jobcodes` moved to shared master data. CalExp5 working data tables prefixed with `cal_`. Settings migrated to shared `app_settings` table. Added Compartment 1 references. Clarified what CalExp5 owns vs what it reads from shared tables.

---

## 1. DESIGN PRINCIPLES

1. **Two-compartment alignment** -- CalExp5 reads from shared master data (Compartment 1) and owns its working data tables (Compartment 2, prefixed `cal_`)
2. **Per-user isolation** -- every working data table has a `user_id` column referencing the shared `employees` table
3. **Typed core + JSONB details** -- follows BB_DB_STRATEGY.md v1.5 Section 10 pattern
4. **Additive-only** -- no breaking changes, JSONB for flexible fields
5. **Idempotent seeding** -- all upserts use `ON CONFLICT DO UPDATE`
6. **Optimistic concurrency** -- `version` column on mutable tables
7. **Bridge API only** -- CalExp5 never connects to Neon directly. All reads/writes go through Bridge API endpoints.

---

## 2. WHAT CALEXP5 READS vs OWNS

### Reads from Compartment 1 (Shared Master Data via Bridge API)

CalExp5 does NOT own these tables. They live in Compartment 1 and are managed by the Bridge (QBO/QBT sync) and the Data Manager UI (enrichment).

| Shared Table | What CalExp5 Reads | Bridge API Endpoint |
|-------------|-------------------|-------------------|
| `employees` | Employee names, QBT IDs, phone, email, role, enrichment (subscribed fields: `defaultCrew`, `scheduleColor`, `certifications`) | `GET /api/master/employees?app=calexp5` |
| `work_jobcodes` | Jobcode names, QBT IDs, types, active status | `GET /api/master/jobcodes` |

**CalExp5 subscribes to these enrichment fields on employees:**

| Field Key | Type | Purpose in CalExp5 |
|-----------|------|-------------------|
| `defaultCrew` | select | Crew assignment for schedule display |
| `scheduleColor` | color | Color coding in calendar views |
| `certifications` | tags | Display certs on crew cards (optional) |

These subscriptions are managed in the `app_field_subscriptions` table and can be updated via the Data Manager UI.

### Owns in Compartment 2 (CalExp5 Working Data)

These tables are CalExp5-specific. Prefixed with `cal_`. Managed through Bridge API (`/api/cal/*`).

| CalExp5 Table | Purpose | Records/Year Est. |
|---------------|---------|-------------------|
| `cal_manual_hours` | Hours entered via timesheet grid | ~500-2,000 |
| `cal_selected_jobcodes` | User's pinned jobcodes for quick access | ~100-200 |
| `cal_uploaded_timesheets` | Tracks which timesheets were pushed to QBT (CRITICAL) | ~1,000-5,000 |
| `cal_user_settings` | Per-user display preferences | ~20-50 |
| `cal_audit_log` | CalExp5-specific audit trail | ~5,000-10,000 |

### Uses from Shared Infrastructure

| Shared Table | What CalExp5 Uses |
|-------------|------------------|
| `app_settings` | App-level settings (`app_name='calexp5'`): default view, sync prefs, etc. |
| `audit_log` | Platform-wide audit trail -- CalExp5 writes summary entries via Bridge for cross-app visibility. `cal_audit_log` has full detail; shared `audit_log` has one-line summaries. |

---

## 3. DRIZZLE SCHEMA -- COMPARTMENT 1 REFERENCES

These are the shared master data tables that CalExp5 reads. They are defined in the Bridge's schema, not CalExp5's. Shown here for reference only.

```typescript
// ============================================================
// REFERENCE: employees (Compartment 1 -- owned by Bridge)
// ============================================================
// CalExp5 reads this via GET /api/master/employees?app=calexp5
// CalExp5 does NOT write to this table directly
// Enrichment managed via Data Manager UI (superset model)
//
// Typed columns: id, qbo_id, qbt_id, display_name, first_name,
//   last_name, phone, email, role, is_active, hire_date,
//   version, sync_source, synced_at, created_at, updated_at
// Enrichment: jsonb with all enrichment fields (superset)
//   CalExp5 receives only subscribed fields: defaultCrew,
//   scheduleColor, certifications

// ============================================================
// REFERENCE: work_jobcodes (Compartment 1 -- owned by Bridge)
// ============================================================
// CalExp5 reads this via GET /api/master/jobcodes
// Synced from QBT API by Bridge on schedule
//
// Typed columns: id, qbt_id, name, short_name, type, is_active,
//   parent_id, enrichment jsonb, synced_at
```

---

## 4. DRIZZLE SCHEMA -- COMPARTMENT 2 (CALEXP5 WORKING DATA)

```typescript
// src/db/schema.ts (on Bridge -- CalExp5 tables)
import {
  pgTable, text, integer, boolean, real, date, timestamp,
  jsonb, uuid, index, uniqueIndex
} from 'drizzle-orm/pg-core';

// Import shared master data table for foreign key references
import { employees } from './master-schema';

// ============================================================
// CAL_USER_SETTINGS -- Per-user display preferences
// ============================================================
// Source: data/settings.json (shared file) + Zustand partialize
// Migration: On first login, seed from current settings.json values
// CRITICAL: Replaces ephemeral Railway disk file
// NOTE: App-level settings (not per-user) go in shared app_settings table
export const calUserSettings = pgTable('cal_user_settings', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),                       // employees.id (shared master data)
  // Display preferences (from Zustand partialize, lines 1538-1558)
  showMyTime:        boolean('show_my_time').default(true),
  showCrew:          boolean('show_crew').default(false),
  myTimeColor:       text('my_time_color').default('#2196F3'),
  crewColor:         text('crew_color').default('#E040FB'),
  disablePastDays:   boolean('disable_past_days').default(false),
  showMockData:      boolean('show_mock_data').default(false),
  exportUploadLog:   boolean('export_upload_log').default(false),
  logLevel:          text('log_level').default('minimal'),        // 'minimal' | 'standard' | 'verbose'
  defaultView:       text('default_view').default('year'),        // 'year' | 'month'
  entryMode:         text('entry_mode').default('off'),           // 'off' | 'pto' | 'work'
  // Active employee filter (from activeEmployeeIds)
  activeEmployeeIds: jsonb('active_employee_ids').default([]),    // employee IDs from master data
  // Crew selection filter
  selectedCrewIds:   jsonb('selected_crew_ids').default([]),
  // Future per-user settings go here or in details
  details:           jsonb('details').default({}),
  version:           integer('version').default(1),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_cal_user_settings_user').on(table.userId),
]);

// ============================================================
// CAL_MANUAL_HOURS -- Hours entered via timesheet grid
// ============================================================
// Source: manualHoursByUser in localStorage
// Format: { [userId]: { 'YYYY-MM-DD': { jobcodeId: hours } } }
// Migration: Flatten nested object to rows
export const calManualHours = pgTable('cal_manual_hours', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),                       // employees.id
  targetDate:    date('target_date').notNull(),                   // 'YYYY-MM-DD'
  jobcodeId:     text('jobcode_id').notNull(),                    // QBT jobcode ID (string)
  jobcodeName:   text('jobcode_name'),                            // Denormalized for display
  hours:         real('hours').notNull(),                          // Decimal hours (e.g., 8.5)
  // Sync metadata
  syncStatus:    text('sync_status').default('local'),            // 'local' | 'synced' | 'conflict'
  qbtTimesheetId: text('qbt_timesheet_id'),                      // Set after successful QBT upload
  details:       jsonb('details').default({}),
  version:       integer('version').default(1),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_cal_manual_hours_unique').on(table.userId, table.targetDate, table.jobcodeId),
  index('idx_cal_manual_hours_user_date').on(table.userId, table.targetDate),
]);

// ============================================================
// CAL_SELECTED_JOBCODES -- User's pinned jobcodes for quick access
// ============================================================
// Source: selectedJobcodesByUser in localStorage
// Format: { [userId]: [{ id, name, shortName, color }] }
// Migration: Flatten array to rows
export const calSelectedJobcodes = pgTable('cal_selected_jobcodes', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),                       // employees.id
  jobcodeId:     text('jobcode_id').notNull(),                    // QBT jobcode ID
  jobcodeName:   text('jobcode_name').notNull(),
  shortName:     text('short_name'),                              // Abbreviated display name
  color:         text('color'),                                   // Hex color for UI
  sortOrder:     integer('sort_order').default(0),                // User's preferred order
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_cal_selected_jobcodes_unique').on(table.userId, table.jobcodeId),
  index('idx_cal_selected_jobcodes_user').on(table.userId),
]);

// ============================================================
// CAL_UPLOADED_TIMESHEETS -- Tracks QBT upload status (CRITICAL)
// ============================================================
// Source: uploadedTimesheetsByUser in localStorage
// Format: { [userId]: { 'date_jobcodeId': timesheetId } }
// CRITICAL: If this data is lost, the app will CREATE duplicates
// instead of UPDATEing existing timesheets in QBT.
// This table MUST be server-backed before multi-user deployment.
// NOTE: No `version` column needed -- rows are insert-only (never updated).
// Unique constraint on (userId, targetDate, jobcodeId) prevents duplicates.
export const calUploadedTimesheets = pgTable('cal_uploaded_timesheets', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id').notNull(),                       // employees.id
  targetDate:    date('target_date').notNull(),                   // 'YYYY-MM-DD'
  jobcodeId:     text('jobcode_id').notNull(),                    // QBT jobcode ID
  qbtTimesheetId: text('qbt_timesheet_id').notNull(),            // QBT timesheet ID (from API)
  hours:         real('hours'),                                   // Hours at time of upload
  uploadedAt:    timestamp('uploaded_at', { withTimezone: true }).defaultNow(),
  details:       jsonb('details').default({}),                    // Upload metadata (batch ID, etc.)
}, (table) => [
  uniqueIndex('idx_cal_uploaded_ts_unique').on(table.userId, table.targetDate, table.jobcodeId),
  index('idx_cal_uploaded_ts_user').on(table.userId),
  index('idx_cal_uploaded_ts_qbt').on(table.qbtTimesheetId),
]);

// ============================================================
// CAL_AUDIT_LOG -- CalExp5-specific audit trail
// ============================================================
// Source: bb-audit-log in localStorage (auditLog.js)
// Max: 2000 entries in localStorage, unlimited in Postgres
// Entry structure from logAuditEntry() params (auditLog.js:168-187)
// NOTE: Platform-wide audit entries also written to shared audit_log table
export const calAuditLog = pgTable('cal_audit_log', {
  id:              uuid('id').primaryKey().defaultRandom(),
  // Who
  userId:          text('user_id'),                                // employees.id (null for system)
  qbtUserId:       text('qbt_user_id'),                            // QBT ID for cross-ref
  userName:        text('user_name'),                              // Denormalized
  userInitials:    text('user_initials'),
  // What
  action:          text('action').notNull(),                       // AUDIT_ACTIONS enum values
  entityType:      text('entity_type').notNull(),                  // 'timesheet' | 'pto' | 'balance' | 'session'
  entityId:        text('entity_id'),                              // UUID or QBT ID
  // When (what the action refers to)
  targetDate:      date('target_date'),
  targetWeek:      text('target_week'),                            // '2026-W12'
  targetPayPeriod: text('target_pay_period'),                      // '2026-03-08_2026-03-21'
  targetYear:      integer('target_year'),
  // Hours detail
  hoursType:       text('hours_type'),                             // 'regular' | 'manual' | 'overtime' | 'vacation' | 'sick' | 'unpaid'
  jobcodeId:       text('jobcode_id'),
  jobcodeName:     text('jobcode_name'),
  // Values (before/after)
  oldValue:        jsonb('old_value'),
  newValue:        jsonb('new_value'),
  delta:           jsonb('delta'),
  // Context
  method:          text('method'),                                 // 'CREATE' | 'UPDATE' | 'DELETE'
  qbtTimesheetId:  text('qbt_timesheet_id'),
  source:          text('source'),                                 // 'manual' | 'grid' | 'upload' | 'sync' | 'admin'
  success:         boolean('success').default(true),
  errorCode:       text('error_code'),
  errorMessage:    text('error_message'),
  // Device/session context
  device:          text('device'),                                 // 'iOS' | 'Android' | 'Windows' | 'Mac'
  sessionId:       text('session_id'),
  metadata:        jsonb('metadata').default({}),
  // Timestamp
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_cal_audit_user').on(table.userId),
  index('idx_cal_audit_action').on(table.action),
  index('idx_cal_audit_created').on(table.createdAt),
  index('idx_cal_audit_target_date').on(table.targetDate),
  index('idx_cal_audit_entity').on(table.entityType, table.entityId),
]);
```

---

## 5. HARDCODED QBT IDS (Bainbridge-Specific)

These IDs are hardcoded in CalExp5 and are specific to Bainbridge Builders' QBT account. They are correct and intentional, but must be documented before any schema work.

### PTO Jobcode IDs
> Source: `src/utils/constants.js` lines 33-41, `src/store/useStore.js` line 1064

| QBT Jobcode ID | Type | Name | Used In |
|----------------|------|------|---------|
| `56172048` | pto | Vacation | `PTO_TYPES.vacation.id`, PTO filter in `useStore.js:909` |
| `56172044` | pto | Sick | `PTO_TYPES.sick.id`, PTO filter in `useStore.js:909` |
| `56172040` | unpaid_time_off | Unpaid | `PTO_TYPES.unpaid.id`, PTO filter in `useStore.js:909` |

### Custom Field IDs
> Source: `src/utils/api.js` lines 802-814

| QBT Custom Field ID | Name | Value | Purpose |
|---------------------|------|-------|---------|
| `1136266` | Service Item | `"Labor"` | Required on all QBT timesheet creates |
| `1992560` | Billable | `"Yes"` | Required on all QBT timesheet creates |

### Active Employee IDs (Settings Default)
> Source: `data/settings.json` lines 10-18

| QBT Employee ID | Notes |
|----------------|-------|
| `2866540` | In default `activeEmployeeIds` filter |
| `3194176` | " |
| `5623604` | " |
| `5761332` | " |
| `5901720` | " |
| `6153134` | " |
| `7021552` | " |

**Note:** These employee IDs will be replaced by dynamic lookup against the shared `employees` master data table via Bridge API. The PTO jobcode IDs and custom field IDs are permanent BB QBT configuration.

---

## 6. MIGRATION MAP (localStorage --> Bridge API --> Neon)

| localStorage Key | Zustand State | Target | Migration Strategy |
|-----------------|--------------|--------|-------------------|
| `bb-calendar-storage` --> `currentUser` | `currentUser` | Shared `employees` table (Compartment 1) | Employee selected from dropdown. Identity verified via WebAuthn (Face ID) or 4-digit PIN. Bridge returns employee context. |
| `bb-calendar-storage` --> `showMyTime`, `showCrew`, etc. | Zustand partialize | `cal_user_settings` (Compartment 2) | Seed from current `settings.json` on first login via Bridge API |
| `bb-calendar-storage` --> `manualHoursByUser` | `manualHoursByUser` | `cal_manual_hours` (Compartment 2) | Dual-write (Phase 2), flatten nested object to rows, POST to Bridge `/api/cal/manual-hours` |
| `bb-calendar-storage` --> `selectedJobcodesByUser` | `selectedJobcodesByUser` | `cal_selected_jobcodes` (Compartment 2) | Dual-write (Phase 2), flatten array to rows |
| `bb-calendar-storage` --> `uploadedTimesheetsByUser` | `uploadedTimesheetsByUser` | `cal_uploaded_timesheets` (Compartment 2) | **PRIORITY** -- dual-write ASAP via Bridge `/api/cal/uploaded-timesheets` |
| `bb-audit-log` | standalone | `cal_audit_log` (Compartment 2) | Server-side logging via Bridge, keep client as offline fallback |
| `bb-calendar-storage` --> `workJobcodes` | `workJobcodes` | Shared `work_jobcodes` table (Compartment 1) | Bridge syncs from QBT on schedule. CalExp5 reads via Bridge API. |
| `bb-calendar-storage` --> employee enrichment | app-specific settings | Shared `employees.enrichment` (Compartment 1) | Migrate to superset enrichment via Data Manager UI |
| App-level settings (shared, not per-user) | various | `app_settings` (shared infra, `app_name='calexp5'`) | Migrate to Bridge `/api/settings/calexp5` |
| `bb-calendar-cache` (IndexedDB) | n/a | **Keep as-is** | IndexedDB stays as read-through cache for offline |

### Data Volume Estimates

| Table | Records at Migration | Growth/Year | Storage Est. |
|-------|---------------------|-------------|-------------|
| `cal_user_settings` | ~20 | ~5-10 | <1 KB |
| `cal_manual_hours` | ~0 (fresh start) | ~2,000 | ~200 KB |
| `cal_selected_jobcodes` | ~50 (from existing) | ~50 | ~5 KB |
| `cal_uploaded_timesheets` | ~0 (fresh start) | ~5,000 | ~500 KB |
| `cal_audit_log` | ~0 (fresh start) | ~10,000 | ~5 MB |
| **CalExp5 Total Year 1** | | | **~6 MB** |

Well under Neon free tier (500 MB). Combined with master data and other apps, Year 1 total is ~88 MB (see BB_DB_STRATEGY.md v1.5 Section 13).

---

## 7. CALEXP5 API ENDPOINTS (on Bridge)

CalExp5 communicates exclusively through these Bridge API endpoints:

### Master Data (read-only for CalExp5)

```
GET /api/master/employees?app=calexp5     -- employees with subscribed enrichment
GET /api/master/jobcodes                  -- all active jobcodes from QBT
```

### QBT Write Operations (composite endpoints)

```
POST   /api/cal/timesheets/submit         -- create/update timesheet in QBT + record in cal_uploaded_timesheets
  Body: { userId, targetDate, jobcodeId, hours }
  Returns: { qbtTimesheetId, status }
  Bridge: (1) calls QBT API, (2) writes to cal_uploaded_timesheets, (3) writes to cal_audit_log

POST   /api/cal/timesheets/delete         -- delete timesheet in QBT + remove from cal_uploaded_timesheets
  Body: { userId, targetDate, jobcodeId }
```

### Working Data (CalExp5 owned)

```
GET    /api/cal/user-settings             -- current user's display prefs
PUT    /api/cal/user-settings             -- update display prefs
GET    /api/cal/manual-hours?date=YYYY-MM-DD&user=:id  -- manual hours
POST   /api/cal/manual-hours              -- create/update manual hour entry
POST   /api/cal/manual-hours/bulk-upsert  -- bulk import (for localStorage migration)
DELETE /api/cal/manual-hours/:id          -- delete manual hour entry
GET    /api/cal/selected-jobcodes         -- user's pinned jobcodes
POST   /api/cal/selected-jobcodes         -- add pinned jobcode
POST   /api/cal/selected-jobcodes/bulk-upsert  -- bulk import (for localStorage migration)
DELETE /api/cal/selected-jobcodes/:id     -- remove pinned jobcode
GET    /api/cal/uploaded-timesheets?user=:id&date=YYYY-MM-DD  -- upload status
POST   /api/cal/uploaded-timesheets/bulk-upsert  -- bulk import (for localStorage migration)
GET    /api/cal/audit-log?user=:id&from=:date&to=:date  -- audit trail
POST   /api/cal/audit-log                 -- log an action
```

### App Settings

```
GET /api/settings/calexp5                 -- all CalExp5 app-level settings
PUT /api/settings/calexp5/display         -- update display settings category
PUT /api/settings/calexp5/sync            -- update sync settings category
```

---

## 8. SEED SCRIPT OUTLINE

```typescript
// scripts/seed-calexp5.ts
// Idempotent -- safe to re-run at any time
// Runs AFTER master data tables are seeded (Bridge Phase 1)

import { db } from '../src/db';
import { calUserSettings, calSelectedJobcodes } from '../src/db/cal-schema';

// Step 1: Seed default user settings for each employee
// Read employees from master data table
// Create cal_user_settings row per employee with defaults from settings.json
// Use onConflictDoUpdate to avoid duplicates

// Step 2: Seed default selected jobcodes (if migrating from existing localStorage)
// Read selectedJobcodesByUser from a one-time migration dump
// Flatten to rows, upsert into cal_selected_jobcodes

// Step 3: One-time client-side migration (runs in CalExp5 browser during Phase 2)
// - Read manualHoursByUser from localStorage
// - Flatten { userId: { date: { jobcodeId: hours } } } to rows
// - POST to /api/cal/manual-hours/bulk-upsert
// - Same for uploadedTimesheetsByUser (PRIORITY)
// - Same for selectedJobcodesByUser
// - After successful migration, set localStorage flag: cal_migrated=true
// - Keep localStorage data as fallback until Phase 3 cutover
```

---

## 9. CONNECTION SETUP

CalExp5 does NOT connect to Neon directly. All data flows through Bridge API.

### Authentication Flow (DB-2: WebAuthn + PIN)

> **Full auth strategy:** See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12 and BB_DB_STRATEGY.md v1.5 Section 9.

```typescript
// CalExp5 client-side auth flow
// src/utils/auth.js

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3105';

// Session token stored in memory (not localStorage — 8hr expiry, matches work day)
let sessionToken = null;

// First-time setup: register Face ID + set PIN
async function registerEmployee(employeeId) {
  // 1. Get WebAuthn registration options from Bridge
  const options = await fetch(`${BRIDGE_URL}/api/auth/webauthn/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  }).then(r => r.json());

  // 2. Trigger Face ID / fingerprint on device
  const credential = await startRegistration(options);

  // 3. Send credential to Bridge for storage in employee enrichment
  await fetch(`${BRIDGE_URL}/api/auth/webauthn/register/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, credential }),
  });
}

// Login via Face ID (primary)
async function loginWebAuthn(employeeId) {
  const challenge = await fetch(`${BRIDGE_URL}/api/auth/webauthn/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  }).then(r => r.json());

  const assertion = await startAuthentication(challenge);

  const result = await fetch(`${BRIDGE_URL}/api/auth/webauthn/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, assertion }),
  }).then(r => r.json());

  sessionToken = result.token; // HS256 signed { employeeId, exp }
  return result.employee;
}

// Login via PIN (fallback)
async function loginPin(employeeId, pin) {
  const result = await fetch(`${BRIDGE_URL}/api/auth/pin/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId, pin }),
  }).then(r => r.json());

  sessionToken = result.token;
  return result.employee;
}
```

### API Call Pattern

```typescript
// CalExp5 client-side API call pattern
// src/utils/api.js (updated)

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3105';

async function apiCall(endpoint, options = {}) {
  if (!sessionToken) throw new Error('Not authenticated');
  const response = await fetch(`${BRIDGE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
      ...options.headers,
    },
  });
  if (response.status === 401) {
    sessionToken = null; // Token expired — prompt re-auth
    throw new Error('Session expired');
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

// Example: Read employees with CalExp5's subscribed enrichment fields
const employees = await apiCall('/api/master/employees?app=calexp5');

// Example: Save manual hours
await apiCall('/api/cal/manual-hours', {
  method: 'POST',
  body: JSON.stringify({ userId, targetDate, jobcodeId, hours }),
});

// Example: Read app settings
const settings = await apiCall('/api/settings/calexp5');
```

### Required Packages (CalExp5 -- NO database packages needed)

```json
{
  "dependencies": {
    "@simplewebauthn/browser": "^11.x"
  }
}
```

**Note:** CalExp5 does NOT need `drizzle-orm`, `@neondatabase/serverless`, `ws`, or `@clerk/clerk-react`. Those are Bridge dependencies only (and Clerk is deferred to DB-4+). CalExp5 is a pure API client. The Bridge needs `@simplewebauthn/server` and `bcrypt` for credential verification.

---

## 10. NOTES FOR IMPLEMENTATION

1. **`cal_uploaded_timesheets` is the highest-priority table.** Without it server-backed, clearing localStorage creates duplicate QBT timesheets. Migrate via Bridge API in Phase 2.

2. **`cal_user_settings` replaces ephemeral disk file.** The `data/settings.json` pattern is destroyed on every Railway deploy. Per-user settings go to `cal_user_settings`. App-level settings go to shared `app_settings` table.

3. **Audit log stays dual-write permanently.** Client-side (`cal_audit_log` via Bridge) provides persistence. localStorage provides offline fallback. Both write in parallel.

4. **IndexedDB (`bb-calendar-cache`) is NOT migrated.** Stays as read-through cache for offline. Add user-level key isolation (prefix with userId).

5. **`work_jobcodes` is now shared master data.** CalExp5 reads it via Bridge API, not from its own table. Bridge syncs from QBT on schedule.

6. **Employee enrichment is superset.** CalExp5's employee-related settings (crew assignments, schedule colors) are now enrichment fields in the shared `employees` table, managed via Data Manager UI. CalExp5 subscribes to the fields it needs.

7. **All QBT IDs are strings** in the current codebase. Schema uses `text` type consistently.

8. **`version` columns** enable optimistic concurrency. On `cal_user_settings` and `cal_manual_hours` where concurrent edits are possible.

9. **CalExp5 becomes a thin client.** No database packages, no direct Neon connection, no QBO/QBT sync logic. Just WebAuthn/PIN auth + Bridge API calls + UI rendering + offline cache.

---

*This schema is ready for implementation once Bridge Phase 2 (DB-2) is complete (enrichment registry + CalExp5 working data API endpoints live). See BB_PLATFORM_READINESS_REPORT.md v1.3 Section 5 for action items and phase dependency map.*
