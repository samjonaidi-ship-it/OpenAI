# BB Effective-Dated Versioning Architecture
# BB_EFFECTIVE_DATING_ARCHITECTURE.md | v1.1 | 2026-04-14 | BB
# v1.1: Added Rule 8 — date display format standard MM/DD/YYYY, HH:MM TZ

---

## Purpose

This document defines the universal effective-dated versioning layer for the BB ecosystem.
It is **purely additive** — no existing tables, helpers, or cron jobs are modified.

The single new table (`versioned_field_values`) and four new helper functions form the complete
implementation surface. Everything else in the system continues to work exactly as before.

---

## The Core Problem

Three things happen in the real world that the existing system cannot handle correctly:

1. **Retroactive corrections** — Evan's pay rate is corrected on April 14th to be effective April 1st.
   `master_data_history.changed_at = April 14th`, so any query for "rate on April 10th" using
   `changed_at <= asOfTimestamp` returns the old rate. Wrong.

2. **Future-dated changes** — Sam enters a rate change today that takes effect June 1st.
   There is no place to store this. The change must be applied manually on June 1st.

3. **Seasonal schedule changes** — Evan's shift changes to 6AM–2PM every summer.
   There is no way to record "effective June 1 through August 31". Validation and GPS ingest
   use whatever is current in `employees.work_schedule`.

The fix is a second time axis: **`effective_from` (business date)** alongside the existing
**`changed_at` (wall-clock recording time)**.

---

## The Two-Axis Mental Model

```
                  BUSINESS DATE AXIS  (effective_from)
                  ─────────────────────────────────────────────────────►
                  2026-01-01    2026-04-01    2026-06-01    (future)
                       │             │             │
     $28.00 ──── ──────┤─────────────┤             │
     $31.00 ────────────────────────►├─────────────┤
     $34.00 ──────────────────────────────────────►│  ← scheduled, not yet active
                       │
  WALL-CLOCK    ────────────────────────────────────►
  AXIS          Apr 14 2pm:  entered "$31 effective Apr 1"  (retroactive)
  (changed_at)  Apr 14 3pm:  entered "$34 effective Jun 1"  (future-dated)
```

**Invariants:**

| Rule | Detail |
|---|---|
| `effective_from` is `DATE` | Business calendar day, timezone is always **PT (America/Los_Angeles)** |
| `effective_to` is computed | = `effective_from` of next row in timeline. Never stored — avoids update fan-out |
| Timeline is ordered by `effective_from` | Not by insertion order. Retroactive inserts sort correctly |
| `changed_at` on `master_data_history` | Unchanged — still wall-clock UTC, all fields, audit purpose |
| Active row for date D | Row where `effective_from <= D` and no later active effective row exists before D |

---

## Timezone Rules — Critical

The company operates on **Pacific Time (America/Los_Angeles)**. The Railway server runs **UTC**.
This mismatch has caused multiple production bugs. These rules are mandatory for all
effective-dated versioning code:

### Rule 1 — All `effective_from` dates are PT calendar dates

```
"Evan's rate is $31 starting April 1" means April 1 in Pacific Time.
In UTC, that starts at 2026-04-01T07:00:00Z (PST) or 2026-04-01T08:00:00Z (PDT).

Store:  effective_from = DATE '2026-04-01'
Never store a TIMESTAMPTZ for effective_from — it creates ambiguity.
```

### Rule 2 — All date arithmetic uses the UTC noon anchor

```javascript
// WRONG — will fail at DST boundary (clocks spring forward at 2am PT = 9/10am UTC):
const d = new Date(dateStr + 'T00:00:00');  // no suffix = local/UTC ambiguous

// CORRECT — UTC noon is always unambiguously the same calendar day in PT:
const d = new Date(dateStr + 'T12:00:00Z');

// CORRECT — use existing pacific-time.js helpers:
import { todayPT, toPTDate, ptDaysBetween, addPTDays } from '../utils/pacific-time.js';
```

### Rule 3 — "Today" for effectivity queries means PT today

```javascript
// WRONG on Railway (returns UTC date, could be tomorrow in PT after 4/5pm):
const today = new Date().toISOString().slice(0, 10);

// CORRECT — always use todayPT():
import { todayPT } from '../utils/pacific-time.js';
const today = todayPT();  // returns YYYY-MM-DD in PT
```

### Rule 4 — `recorded_at` is always UTC TIMESTAMPTZ (system clock)

```
recorded_at = NOW()  in PostgreSQL = UTC.
This is correct. Wall-clock audit events are always UTC.
Do NOT convert recorded_at to PT — it would lose sub-day precision.
```

### Rule 5 — Comparison of `effective_from` (DATE) vs a timestamp

```sql
-- Comparing a PT DATE against a UTC timestamp requires explicit cast:
-- "Is today's PT date on or after effective_from?"

WHERE effective_from <= (NOW() AT TIME ZONE 'America/Los_Angeles')::date

-- NOT:
WHERE effective_from <= NOW()::date   -- wrong: NOW()::date is UTC date
```

### Rule 6 — The existing `T00:00:00` bug pattern

**14 places in the codebase currently do `new Date(dateStr + 'T00:00:00')` without a timezone
suffix.** This creates a Date object in local/UTC time. On Railway (UTC server) this is UTC
midnight, which is 4–5 hours AHEAD of PT midnight. For date-only comparisons this usually
doesn't matter — but at the day boundary (4pm–midnight PT) it produces wrong calendar dates.

The fix is always `new Date(dateStr + 'T12:00:00Z')` (UTC noon anchor). These 14 locations
are flagged for a separate cleanup pass — they are not in scope for this architecture but must
be fixed before they touch effective-dating logic.

Known bad files:
- `timesheet-projection-cron.js`: lines 24, 28, 113, 114, 363, 364
- `admin-controltower-v1.js`: lines 440, 441, 442
- `receipt-validation.js`: lines 22, 28, 71, 78, 99

### Rule 7 — DST handling in date range comparisons

PT observes DST: UTC-8 (November–March), UTC-7 (March–November). The UTC noon anchor
sidesteps DST entirely because noon in PT is always noon ± 1 hour — it never crosses
a calendar day boundary. Use `ptDaysBetween()` and `addPTDays()` from `pacific-time.js`
for all day-count arithmetic in effective-dating logic.

### Rule 8 — Date display format standard (ALL user-facing output)

**Format: `MM/DD/YYYY, HH:MM TZ`** — 24-hour clock with explicit TZ label. No exceptions.

| Context | Format | Example |
|---|---|---|
| PT business date (date only) | `MM/DD/YYYY` | `04/14/2026` |
| PT display with time | `MM/DD/YYYY, HH:MM PT` | `04/14/2026, 14:30 PT` |
| UTC audit timestamp (UI display) | `MM/DD/YYYY, HH:MM UTC` | `04/14/2026, 22:30 UTC` |
| Server log lines | `MM/DD/YYYY, HH:MM:SS UTC` | `04/14/2026, 22:30:05 UTC` |
| `effective_from` in UI tables | `MM/DD/YYYY` | `04/01/2026` |
| `changed_at` in history UI | `MM/DD/YYYY, HH:MM PT` | `04/14/2026, 09:15 PT` |

**Rules:**
- User-facing dates (ControlTower, TS_Exp5, BB Buddy) → PT with "PT" label
- Server logs → UTC with "UTC" label
- Never display a date/time without a TZ label — unlabeled timestamps caused past incidents
- Never use ISO 8601 (`T`-delimited, `Z`-suffixed) format in any user-visible string

**Standard display helpers — add to a shared `date-format.js` utility (both repos):**

```javascript
// Client-side (browser JS) — all times displayed in PT
function formatPT(isoTimestamp, includeTime = true) {
    const opts = {
        timeZone: 'America/Los_Angeles',
        month: '2-digit', day: '2-digit', year: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
    };
    const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(new Date(isoTimestamp));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    if (!includeTime) return `${p.month}/${p.day}/${p.year}`;
    return `${p.month}/${p.day}/${p.year}, ${p.hour}:${p.minute} PT`;
}

// Server-side (Node.js) — logs always in UTC
function formatUTC(isoTimestamp) {
    const d = new Date(isoTimestamp);
    const mm  = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd  = String(d.getUTCDate()).padStart(2, '0');
    const yy  = d.getUTCFullYear();
    const hh  = String(d.getUTCHours()).padStart(2, '0');
    const mn  = String(d.getUTCMinutes()).padStart(2, '0');
    const ss  = String(d.getUTCSeconds()).padStart(2, '0');
    return `${mm}/${dd}/${yy}, ${hh}:${mn}:${ss} UTC`;
}

// For effective_from DATE strings (YYYY-MM-DD from DB) — no time component
function formatPTDate(dateStr) {
    // dateStr is already a PT calendar date — just reformat
    const [y, m, d] = dateStr.split('-');
    return `${m}/${d}/${y}`;
}
```

**Where this applies in this architecture:**
- `getEffectiveTimeline()` return values: `effective_from` displayed via `formatPTDate()`
- `getEffectiveValue()` / `getEffectiveValueAtWallClock()`: `recorded_at` displayed via `formatPT()`
- ControlTower timeline view: all `changed_at` values displayed via `formatPT()`
- BB Buddy natural language responses: rates/dates use PT format (`"effective 04/01/2026"`)
- Migration report (Phase 3): `changed_at` of each history row via `formatPT()`

---

## Data Model

### `versioned_field_values` — the only new table

```sql
-- Migration 027c | 2026-04-14 | BB
-- Universal effective-dated versioning layer.
-- Additive: no existing tables modified.

CREATE TABLE IF NOT EXISTS versioned_field_values (

  id                  BIGSERIAL       PRIMARY KEY,

  -- Entity identification (mirrors master_data_history conventions)
  entity_type         TEXT            NOT NULL,
    -- 'employee' | 'company' | 'vendor' | 'work_jobcode' | 'customer'
    -- | 'property' | 'trade' | 'master_item'

  entity_id           TEXT            NOT NULL,
    -- matches master_data_history.entity_id (e.g. 'EMP-42', 'COMPANY-1')

  -- Field identification — must exist in VERSIONED_FIELDS registry
  field_name          TEXT            NOT NULL,
    -- e.g. 'qbt_pay_rate', 'work_schedule', 'is_1099', 'cycles.ppAnchor'

  -- The effective value — universal JSONB:
  --   Scalars:  {"v": 28.50}          number
  --             {"v": true}           boolean
  --             {"v": "full-time"}    string
  --   Objects:  {"days":["Mon",...], "start":"07:00", "end":"15:30"}
  value               JSONB           NOT NULL,

  -- Business date effectivity (ALWAYS a PT calendar date — see Timezone Rule 1)
  effective_from      DATE            NOT NULL,
  -- effective_to: DERIVED in application code.
  --   = (effective_from of the NEXT active row) - 1 day
  --   Never stored — avoids cascading updates on retroactive inserts.

  -- Provenance (mirrors master_data_history fields)
  changed_by          TEXT            NOT NULL,
    -- user/system: 'Sam Jonaidi' | 'sync_runner' | 'BB-Buddy' | 'migration'
  source              TEXT            NOT NULL,
    -- 'ControlTower' | 'BB-Buddy' | 'ts_exp5_settings_migration'
    -- | 'cron' | 'migration' | 'backfill'
  trace_id            TEXT,
  source_metadata     JSONB,

  -- Wall-clock recording time (ALWAYS UTC via NOW()) — see Timezone Rule 4
  recorded_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Soft-delete / supersede
  -- When a retroactive correction replaces a row, the old row is NOT deleted.
  -- It is marked superseded so the full audit trail of corrections is preserved.
  -- Active timeline = rows WHERE superseded_at IS NULL.
  superseded_at       TIMESTAMPTZ,
  superseded_by_id    BIGINT          REFERENCES versioned_field_values(id),

  -- Cross-reference to master_data_history (nullable — not every effective
  -- value change goes through updateMasterData, e.g. future-dated scheduling)
  history_id          BIGINT
);

-- Primary lookup: "what is the effective value on PT date D?"
-- Most critical query path — used by cron for every timesheet row
CREATE UNIQUE INDEX idx_vfv_unique_active
  ON versioned_field_values (entity_type, entity_id, field_name, effective_from)
  WHERE superseded_at IS NULL;

CREATE INDEX idx_vfv_entity_field_eff
  ON versioned_field_values (entity_type, entity_id, field_name, effective_from DESC)
  WHERE superseded_at IS NULL;

-- Full timeline scan (ControlTower timeline view)
CREATE INDEX idx_vfv_timeline
  ON versioned_field_values (entity_type, entity_id, field_name, effective_from ASC)
  WHERE superseded_at IS NULL;

-- Trace threading
CREATE INDEX idx_vfv_trace
  ON versioned_field_values (trace_id)
  WHERE trace_id IS NOT NULL;

-- Audit: find all versions of a row including superseded
CREATE INDEX idx_vfv_history_link
  ON versioned_field_values (history_id)
  WHERE history_id IS NOT NULL;
```

---

## How It Extends master_data_history

The two tables are **complementary, not competing**:

| Dimension | `master_data_history` | `versioned_field_values` |
|---|---|---|
| **Time key** | `changed_at` (wall-clock UTC) | `effective_from` (business PT date) |
| **Coverage** | ALL field changes, all entities | DESIGNATED versioned fields only |
| **Purpose** | Audit trail — what was entered when | Payroll/billing — what applied when |
| **Mutation** | Immutable (rows never updated) | Superseded (soft-delete on correction) |
| **Query** | `getFieldAsOf(asOfTimestamp)` | `getEffectiveValue(asOfDate)` |

**Flow when Sam changes Evan's rate retroactively in ControlTower:**

```
Sam enters: $31.00 effective 2026-04-01 (retroactive)
  │
  ├─► updateMasterData() writes to master_data_history:
  │     changed_at = 2026-04-14T22:00:00Z  (wall clock)
  │     field_name = 'qbt_pay_rate'
  │     old_value  = 28.00, new_value = 31.00
  │
  └─► setEffectiveValue() writes to versioned_field_values:
        effective_from = 2026-04-01  (PT business date — what Sam entered)
        value          = {"v": 31.00}
        recorded_at    = 2026-04-14T22:00:00Z  (UTC wall clock)
        history_id     = <master_data_history.history_id>

Correct query result:
  getEffectiveValue(sql, 'employee', 'EMP-42', 'qbt_pay_rate', '2026-04-10')
  → {"v": 31.00}  ✓  (effective_from 2026-04-01 <= 2026-04-10)
```

---

## Designated Versioned Fields Registry

A JavaScript config object in `master-data-helper-v2.js` — **not a DB table**. This drives
validation in `setEffectiveValue`, UI hints in ControlTower, and query routing in BB Buddy.
Adding a new versioned field = add one line to this config object. No migration needed.

```javascript
export const VERSIONED_FIELDS = {

  // ── CRITICAL: affect payroll and billing calculations ─────────────────────
  employee: {
    qbt_pay_rate:  { type: 'numeric', label: 'Pay Rate',      priority: 'critical' },
    qbo_bill_rate: { type: 'numeric', label: 'Bill Rate',     priority: 'critical' },
    qbo_cost_rate: { type: 'numeric', label: 'Cost Rate',     priority: 'critical' },
    work_schedule: { type: 'object',  label: 'Work Schedule', priority: 'critical' },
    is_active:     { type: 'boolean', label: 'Active Status', priority: 'important' },
    qbt_active:    { type: 'boolean', label: 'QBT Active',    priority: 'important' },
    qbt_group_id:  { type: 'text',    label: 'Group/Team',    priority: 'important' },
  },

  company: {
    'cycles.ppAnchor':      { type: 'date',   label: 'Pay Period Anchor',  priority: 'critical' },
    'cycles.invoiceAnchor': { type: 'date',   label: 'Invoice Anchor',     priority: 'critical' },
    overtime_rules:         { type: 'object', label: 'Overtime Rules',     priority: 'critical' },
    payroll_config:         { type: 'object', label: 'Payroll Config',     priority: 'critical' },
    schedule:               { type: 'object', label: 'Company Schedule',   priority: 'critical' },
    mileageRate:            { type: 'numeric', label: 'Mileage Rate',      priority: 'important' },
  },

  // ── IMPORTANT: affect job costing and compliance ──────────────────────────
  work_jobcode: {
    billable: { type: 'boolean', label: 'Billable Status', priority: 'important' },
  },

  vendor: {
    is_1099:        { type: 'boolean', label: '1099 Status',   priority: 'important' },
    is_subcontractor: { type: 'boolean', label: 'Sub-Con Flag', priority: 'important' },
  },

  // ── USEFUL: for historical accuracy in GPS and job queries ────────────────
  customer: {
    address: { type: 'object', label: 'Address', priority: 'useful' },
  },

  property: {
    address: { type: 'object',  label: 'Address',    priority: 'useful' },
    lat:     { type: 'numeric', label: 'Latitude',   priority: 'useful' },
    lng:     { type: 'numeric', label: 'Longitude',  priority: 'useful' },
  },

  trade: {
    aliases:              { type: 'array', label: 'Aliases',            priority: 'useful' },
    auto_detect_patterns: { type: 'array', label: 'Detection Patterns', priority: 'useful' },
  },
};

export function isVersionedField(entityType, fieldName) {
  return !!VERSIONED_FIELDS[entityType]?.[fieldName];
}
```

**Fields explicitly NOT versioned** (no business-date effectivity needed):

| Field | Reason |
|---|---|
| `customers.qbo_balance` | Real-time AR balance — snapshot not meaningful |
| `employees.qbt_approved_to` | Always-current approval watermark |
| Any `synced_at`, `updated_at`, `version` | Infrastructure columns |
| QBO/QBT primary IDs (`qbt_id`, `qbo_id`) | IDs don't change once set |
| `employees.qbt_submitted_to` | Current watermark only |

---

## Helper Functions — master-data-helper-v2.js

Four functions. Complete public API for the effective-dating layer.

### `setEffectiveValue` — insert or replace a versioned value

```javascript
/**
 * Insert or replace a versioned value for a designated field.
 *
 * If a row already exists for (entity_type, entity_id, field_name, effective_from),
 * the existing row is superseded (soft-deleted) and a new row is inserted.
 * This preserves the full correction audit trail.
 *
 * @param {object} p
 * @param {string} p.entityType    'employee' | 'company' | ...
 * @param {string} p.entityId      PK of the entity, e.g. 'EMP-42'
 * @param {string} p.fieldName     Must exist in VERSIONED_FIELDS[entityType]
 * @param {*}      p.value         Raw JS value — auto-wrapped: scalar → {v: val}
 * @param {string} p.effectiveFrom 'YYYY-MM-DD' — PT calendar date (see Rule 1)
 * @param {string} p.changedBy     Actor: 'Sam Jonaidi' | 'sync_runner' | ...
 * @param {string} p.source        Origin: 'ControlTower' | 'BB-Buddy' | ...
 * @param {string} [p.traceId]
 * @param {object} [p.sourceMetadata]
 * @param {number} [p.historyId]   master_data_history.history_id if available
 * @returns {{ id: number, supersededId: number|null }}
 */
export async function setEffectiveValue(sql, p) {
  // 1. Guard: field must be in registry
  if (!isVersionedField(p.entityType, p.fieldName)) {
    throw new Error(`setEffectiveValue: '${p.fieldName}' is not a versioned field for '${p.entityType}'`);
  }

  // 2. Wrap scalar value → {v: val}; objects used as-is
  const jsonbValue = (typeof p.value === 'object' && p.value !== null)
    ? p.value
    : { v: p.value };

  // 3. Supersede existing active row for same (entity, field, effective_from) if any
  let supersededId = null;
  const existing = await sql`
    SELECT id FROM versioned_field_values
    WHERE entity_type = ${p.entityType}
      AND entity_id   = ${p.entityId}
      AND field_name  = ${p.fieldName}
      AND effective_from = ${p.effectiveFrom}
      AND superseded_at IS NULL
    LIMIT 1
  `;
  if (existing.length > 0) {
    supersededId = existing[0].id;
    // Mark superseded (superseded_by_id filled after insert below)
    await sql`
      UPDATE versioned_field_values
      SET superseded_at = NOW()
      WHERE id = ${supersededId}
    `;
  }

  // 4. Insert new row
  const [row] = await sql`
    INSERT INTO versioned_field_values
      (entity_type, entity_id, field_name, value, effective_from,
       changed_by, source, trace_id, source_metadata, history_id)
    VALUES (
      ${p.entityType}, ${p.entityId}, ${p.fieldName},
      ${JSON.stringify(jsonbValue)}::jsonb,
      ${p.effectiveFrom},
      ${p.changedBy}, ${p.source},
      ${p.traceId || null}, ${p.sourceMetadata ? JSON.stringify(p.sourceMetadata) : null}::jsonb,
      ${p.historyId || null}
    )
    RETURNING id
  `;

  // 5. Back-fill superseded_by_id
  if (supersededId) {
    await sql`
      UPDATE versioned_field_values
      SET superseded_by_id = ${row.id}
      WHERE id = ${supersededId}
    `;
  }

  return { id: row.id, supersededId };
}
```

### `getEffectiveValue` — point-in-time by PT business date

```javascript
/**
 * Returns the value of a versioned field as of a PT calendar date.
 * This is the primary query for payroll, billing, and historical reporting.
 *
 * Timezone: asOfDate is a PT date string 'YYYY-MM-DD'.
 * The comparison `effective_from <= asOfDate` is pure DATE arithmetic —
 * no timezone conversion needed (both are PT calendar dates).
 *
 * @param {string} entityType
 * @param {string} entityId
 * @param {string} fieldName
 * @param {string} asOfDate  'YYYY-MM-DD' — PT calendar date
 * @returns {{ value: *, effectiveFrom: string, recordedAt: Date } | null}
 */
export async function getEffectiveValue(sql, entityType, entityId, fieldName, asOfDate) {
  const rows = await sql`
    SELECT value, effective_from, recorded_at
    FROM versioned_field_values
    WHERE entity_type   = ${entityType}
      AND entity_id     = ${entityId}
      AND field_name    = ${fieldName}
      AND effective_from <= ${asOfDate}::date
      AND superseded_at IS NULL
    ORDER BY effective_from DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const raw = rows[0].value;
  return {
    value:         raw?.v !== undefined ? raw.v : raw,  // unwrap scalar {v:x} or return object
    effectiveFrom: rows[0].effective_from,
    recordedAt:    rows[0].recorded_at,
  };
}
```

### `getEffectiveValueAtWallClock` — point-in-time by UTC wall-clock

```javascript
/**
 * Returns the value that was active as of a specific UTC wall-clock timestamp.
 * Answers: "what did the system have on record at 2pm UTC on April 14th?"
 * This is distinct from business-date effectivity — it uses recorded_at.
 *
 * @param {string} asOfTimestamp  ISO8601 UTC timestamp
 * @returns {{ value: *, effectiveFrom: string, recordedAt: Date } | null}
 */
export async function getEffectiveValueAtWallClock(sql, entityType, entityId, fieldName, asOfTimestamp) {
  const rows = await sql`
    SELECT value, effective_from, recorded_at
    FROM versioned_field_values
    WHERE entity_type = ${entityType}
      AND entity_id   = ${entityId}
      AND field_name  = ${fieldName}
      AND recorded_at <= ${asOfTimestamp}::timestamptz
      AND (superseded_at IS NULL OR superseded_at > ${asOfTimestamp}::timestamptz)
    ORDER BY effective_from DESC, recorded_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const raw = rows[0].value;
  return {
    value:         raw?.v !== undefined ? raw.v : raw,
    effectiveFrom: rows[0].effective_from,
    recordedAt:    rows[0].recorded_at,
  };
}
```

### `getEffectiveTimeline` — full sorted timeline

```javascript
/**
 * Returns all active past, present, and future-scheduled values for a field.
 * effective_to is computed client-side as (next row's effective_from - 1 day).
 * Status is computed client-side using todayPT().
 *
 * @returns {Array<{
 *   id: number, value: *, effectiveFrom: string, effectiveTo: string|null,
 *   changedBy: string, source: string, recordedAt: Date, traceId: string|null,
 *   status: 'past'|'current'|'scheduled'
 * }>}
 */
export async function getEffectiveTimeline(sql, entityType, entityId, fieldName) {
  const rows = await sql`
    SELECT id, value, effective_from, changed_by, source, recorded_at, trace_id
    FROM versioned_field_values
    WHERE entity_type = ${entityType}
      AND entity_id   = ${entityId}
      AND field_name  = ${fieldName}
      AND superseded_at IS NULL
    ORDER BY effective_from ASC
  `;

  const today = todayPT();  // PT date — see Timezone Rule 3

  return rows.map((row, i) => {
    const nextRow       = rows[i + 1];
    const effectiveTo   = nextRow ? addPTDays(nextRow.effective_from, -1) : null;
    const raw           = row.value;
    const status        = row.effective_from > today ? 'scheduled'
                        : (!effectiveTo || effectiveTo >= today) ? 'current'
                        : 'past';
    return {
      id:            row.id,
      value:         raw?.v !== undefined ? raw.v : raw,
      effectiveFrom: row.effective_from,
      effectiveTo,
      changedBy:     row.changed_by,
      source:        row.source,
      recordedAt:    row.recorded_at,
      traceId:       row.trace_id,
      status,
    };
  });
}
```

---

## Cron Integration Pattern

The timesheet projection cron currently reads live `employees` table values for rate snapshots.
After this change, it uses `getEffectiveValue` with the **timesheet work date** as `asOfDate`.

### Before (current — wall-clock, always current value)
```javascript
// From empMap built at cron start:
const payRate  = emp?.qbt_pay_rate  ? Number(emp.qbt_pay_rate)  : null;
const billRate = emp?.qbo_bill_rate ? Number(emp.qbo_bill_rate) : null;
const costRate = emp?.qbo_cost_rate ? Number(emp.qbo_cost_rate) : null;
```

### After (effective-dated — uses PT business date of the timesheet)
```javascript
// tsDate is already 'YYYY-MM-DD' from QBT — this IS a PT date (QBT stores local dates)
// Fallback to live empMap value if no versioned row exists (pre-migration data)

const [payRateRow, billRateRow, costRateRow] = await Promise.all([
  getEffectiveValue(sql, 'employee', emp.id, 'qbt_pay_rate',  tsDate),
  getEffectiveValue(sql, 'employee', emp.id, 'qbo_bill_rate', tsDate),
  getEffectiveValue(sql, 'employee', emp.id, 'qbo_cost_rate', tsDate),
]);

const payRate  = payRateRow?.value  ?? (emp?.qbt_pay_rate  ? Number(emp.qbt_pay_rate)  : null);
const billRate = billRateRow?.value ?? (emp?.qbo_bill_rate ? Number(emp.qbo_bill_rate) : null);
const costRate = costRateRow?.value ?? (emp?.qbo_cost_rate ? Number(emp.qbo_cost_rate) : null);
```

**Performance note:** This adds 3 Neon queries per timesheet per cron run. For a 2-PP window
(~800 timesheets × 3 queries = 2,400 extra round-trips), this would be unacceptable. Instead,
batch-load the entire effective value table for the date range at cron start:

```javascript
// Batch load at cron start — one query for ALL versioned rate data in range
const vfvRows = await sql`
  SELECT entity_id, field_name, effective_from, value
  FROM versioned_field_values
  WHERE entity_type = 'employee'
    AND field_name IN ('qbt_pay_rate', 'qbo_bill_rate', 'qbo_cost_rate', 'work_schedule')
    AND superseded_at IS NULL
    AND effective_from <= ${endDate}
  ORDER BY entity_id, field_name, effective_from DESC
`;

// Build a lookup map: empId → fieldName → sorted timeline
const vfvMap = buildVfvMap(vfvRows);

// Per-timesheet lookup (no DB round-trip — pure JS):
const payRate = lookupEffectiveValue(vfvMap, emp.id, 'qbt_pay_rate', tsDate);
```

`buildVfvMap` and `lookupEffectiveValue` are pure JS functions — no SQL. See implementation
notes in Phase 4 of the migration plan.

---

## ControlTower UI Pattern

Each versioned field on an entity detail page shows a timeline table:

```
Evan Pickett — Pay Rate History
──────────────────────────────────────────────────────────────────────
Effective From   Effective To   Value    Changed By   Source    Status
2024-01-15       2026-03-31     $28.00   Sam J.       CT        Past
2026-04-01       2026-05-31     $31.00   Sam J.       CT        Current  ◄
2026-06-01       —              $34.00   Sam J.       CT        Scheduled
──────────────────────────────────────────────────────────────────────
[+ Add Change]
```

**Interaction rules:**

| Action | Behavior |
|---|---|
| [+ Add Change] | Date picker (PT date) + value input → `setEffectiveValue` |
| Retroactive entry (`effective_from` < today) | Warning: "Affects past payroll. Consider re-projecting." |
| Future entry (`effective_from` > today) | Shows "Scheduled" badge. Can be edited/cancelled. |
| Click any row | Read-only panel: `recorded_at` (UTC), `trace_id`, `source_metadata` |
| Re-project link | Triggers `POST /api/admin/ct/projection/refresh?start=<effective_from>&end=<today>` |

**Date display rule:** `effective_from` is displayed as a PT date (it already is one).
`recorded_at` is displayed as "Recorded: Apr 14, 2026 2:04 PM PT" — convert to PT for display.

---

## BB Buddy Query Pattern

```javascript
// BB Buddy temporal query handler (pseudocode)

// User: "What was Evan's pay rate in March?"
// Resolved:
//   entityType = 'employee', entityId = 'EMP-42'
//   fieldName  = 'qbt_pay_rate'        ← from VERSIONED_FIELDS registry
//   asOfDate   = '2026-03-31'          ← end of period, PT date

if (isVersionedField(entityType, fieldName)) {
  // Business-date query → versioned_field_values
  const result = await getEffectiveValue(sql, entityType, entityId, fieldName, asOfDate);
  // → { value: 28.00, effectiveFrom: '2026-01-15', recordedAt: ... }

  // Enrich response: check if a change happened close to asOfDate
  const timeline = await getEffectiveTimeline(sql, entityType, entityId, fieldName);
  const nextChange = timeline.find(r => r.effectiveFrom > asOfDate);

  return `Evan's pay rate on March 31, 2026 was $28.00/hr.`
       + (nextChange ? ` (It became $${nextChange.value}/hr effective ${nextChange.effectiveFrom}.)` : '');

} else {
  // Wall-clock query → existing getFieldAsOf (master_data_history)
  return getFieldAsOf(sql, entityType, entityId, fieldName, asOfTimestamp);
}
```

**Natural language → PT date resolution:**

| Phrase | Resolved `asOfDate` (PT) |
|---|---|
| "in March" / "last month" | Last day of that PT month |
| "last week" | Last day of that PT week (Sunday) |
| "on April 10th" | `'2026-04-10'` |
| "when he started" | `employee.hire_date` (already a PT date from QBT) |
| "currently" / "now" | `todayPT()` |
| "before the raise" | `addPTDays(mostRecentChange.effectiveFrom, -1)` |

---

## Migration Strategy

### Migration 027c — Schema only (zero data risk)

```sql
CREATE TABLE IF NOT EXISTS versioned_field_values ( ... );  -- see Data Model section
-- No existing tables touched
```

### Backfill Script — `backfill-versioned-fields.mjs` (one-time, idempotent)

```
For each employee in employees WHERE is_active = true AND qbt_id IS NOT NULL:
  For each critical field (qbt_pay_rate, qbo_bill_rate, qbo_cost_rate, work_schedule):

    1. Find all history rows for this (entity_id, field_name) in master_data_history
       ordered by changed_at ASC

    2. If no history rows: create ONE entry
         effective_from = hire_date (if exists) OR '2024-01-01' sentinel
         value          = current live value from employees table
         source         = 'backfill'
         source_metadata = { note: 'single snapshot, no history available' }

    3. If history rows exist: create one versioned entry per history row
         effective_from = toPTDate(changed_at)  ← approximation (see caveat below)
         value          = new_value from history row
         source         = 'backfill'
         source_metadata = { backfill: true, note: 'effective_from approximated from changed_at',
                             original_changed_at: changed_at }

    4. ON CONFLICT (entity_type, entity_id, field_name, effective_from)
       WHERE superseded_at IS NULL → DO NOTHING  (idempotent)

For company (id = 'COMPANY-1'):
  Backfill cycles.ppAnchor, cycles.invoiceAnchor, mileageRate from current enrichment
  effective_from = '2024-01-01' sentinel (pre-dates all known operations)
```

**Backfill caveat:** Historical `master_data_history` rows used `changed_at` (wall-clock) as a
proxy for `effective_from`. The backfill acknowledges this with `source_metadata.backfill = true`.
Future entries entered via ControlTower will have accurate user-specified `effective_from` values.
The system is therefore "accurate going forward, approximate going back."

### Phase 3 — Cron update (batch VFV load pattern above)

Replace live empMap rate lookups with batch `vfvMap` approach. Fallback to live value when
no versioned row exists. Monitor for 2 PPs before disabling fallback logging.

### Phase 4 — ControlTower UI timeline component

Gate behind `FEATURE_EFFECTIVE_DATING_UI` flag. Roll out to Employee and Company pages first
(highest priority fields). Vendor, Jobcode, Property pages follow.

### Phase 5 — BB Buddy routing

Add `isVersionedField` check to BB Buddy temporal query classifier. Route designated fields
to `getEffectiveValue`. Leave `getFieldAsOf` unchanged for all other fields.

---

## Re-Projection Protocol

When a versioned value is corrected retroactively, the projection table has stale snapshots.
Re-projection is **never automatic** — it is triggered explicitly by an authorized admin action.

```
ControlTower shows warning: "This change affects timesheets from [effective_from] to [today].
Re-project those timesheets to update pay rate snapshots? [Yes, Re-project] [No, Skip]"

If yes → POST /api/admin/ct/projection/refresh
           ?start=<effective_from>&end=<todayPT()>&force=true
         → cron runs in targeted mode, overwrites rate snapshot columns only
           (billing_amount, cost_amount, employee_pay_rate, employee_bill_rate, employee_cost_rate)
```

**What re-projection does NOT change:** notes, jobcode_id, hours, locked status, lifecycle_stage,
QBO assignment, or any column that isn't derived from the corrected versioned field.

---

## What Does NOT Change

| Component | Status |
|---|---|
| `master_data_history` table and schema | Untouched |
| `master-data-helper.js` (v1) | Untouched — `updateMasterData`, `getFieldAsOf` keep working |
| All master data entity tables | No new columns |
| `timesheet_projection_v1` schema | No new columns needed (existing rate columns used) |
| Existing cron logic | Additive change only — new batch lookup alongside existing |
| `trace_id` threading conventions | Unchanged |
| All existing API endpoints | Unchanged |
| Migration numbering 001–027b | Unchanged |

---

## Appendix: Design Decisions

| Decision | Alternative | Rationale |
|---|---|---|
| Single universal table | Separate table per entity type | Universal helpers; no schema change to add new versioned fields |
| JSONB `value` column | Typed columns | Handles numeric rates AND complex objects (work_schedule) uniformly |
| Compute `effective_to` in app code | Store `effective_to` | Avoids cascading updates when a retroactive row is inserted mid-timeline |
| Supersede (soft-delete) on correction | Hard delete | Preserves full correction audit trail |
| DATE for `effective_from` | TIMESTAMPTZ | Payroll is calendar-day granularity. DATE avoids PT↔UTC timezone ambiguity entirely |
| Config object for field registry | DB table | Zero-latency lookups; version-controlled; no migration for new fields |
| Batch VFV load in cron | Per-row `getEffectiveValue` calls | 2,400 queries → 1 query per cron run for rate lookups |
| UTC noon anchor for all date arithmetic | T00:00:00Z midnight | DST-safe: PT noon is always noon ± 1h, never crosses calendar day boundary |
| `recorded_at = NOW()` always UTC | Store PT timestamp | UTC is the correct convention for wall-clock events; PT conversion is display-only |
