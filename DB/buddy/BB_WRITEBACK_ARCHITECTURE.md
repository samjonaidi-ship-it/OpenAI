# BB Write-Back Architecture
# BB_WRITEBACK_ARCHITECTURE.md | v1.0.0 | 2026-04-14 | BB

---

## Overview

Write-back is the deliberate, admin-triggered reverse of the normal sync direction.

```
Normal sync (automatic, continuous):
  QBO ──────────────────────────────► Neon
  QBT ──────────────────────────────► Neon
                   (sync-runner.js)

Write-back (deliberate, one-at-a-time):
  Neon ──────────────────────────────► QBO
  Neon ──────────────────────────────► QBT
           (admin-writeback-v1.js)
```

When BB curates data in ControlTower — correcting an email, updating a pay rate, setting an alias — that change lives in Neon but is invisible to QBO and QBT. Write-back closes the loop: one button push in ControlTower propagates those Neon-curated values back to all applicable external systems simultaneously, then records full lineage in the audit trail.

**Write-back is never automatic.** It requires a deliberate admin action with a named actor (`changedBy`). Every push generates audit rows in `unified_audit_trail` and field-level rows in `master_data_history`.

---

## Source Files

| File | Role |
|---|---|
| `BB_Micro_Bridge/src/routes/admin-writeback-v1.js` | All write-back API endpoints + field ownership registry |
| `BB_Micro_Bridge/src/clients/qbo-v2.js` | `getEntity()`, `updateEntity()`, `clearQueryCache()` |
| `BB_Micro_Bridge/src/clients/qbt.js` | `updateUsers()`, `updateJobcodes()` (added v1.6.0) |
| `BB_Micro_Bridge/src/modules/data-manager/master-data-helper-v2.js` | `updateMasterData()` — Neon write + history rows |
| `BB_Micro_Bridge/src/modules/audit/write-audit-event.js` | `writeAuditEvent()` → `unified_audit_trail` |
| `BB_Micro_Bridge/src/modules/audit/write-activity-event.js` | `writeActivityEvent()` → `entity_activity_log` |
| `BB_ControlTower/src/pages/MasterDataList.jsx` | UI: "Push to QBO/QBT" button + `WritebackModal` |

**Registration:** `admin-writeback-v1.js` is registered in `index-v2.js` at prefix `/api/admin`:

```javascript
await app.register(writebackRoutes, { prefix: '/api/admin' });
```

Full URL base: `https://bb-micro-bridge-production.up.railway.app/api/admin/writeback`

---

## API Endpoints

### POST `/api/admin/writeback/:entity/:id`

Push one entity to all applicable external systems.

**Path params:**
- `entity` — one of: `employees`, `customers`, `vendors`, `work_jobcodes`, `properties`, `company`
- `id` — the Neon row `id` (e.g. `EMP-1`, `COMPANY-1`, UUID)

**Request body:**
```json
{
  "changes": {
    "email": "chad@example.com",
    "phone": "4083550713"
  },
  "changedBy": "Sam Jonaidi",
  "dryRun": false
}
```

- `changes` — one or more fields to push (values are taken from this object, not re-read from Neon)
- `changedBy` — required, attributed to this actor in all audit rows
- `dryRun` — optional (default false). When true: runs all pre-flight checks, builds the QBO/QBT payloads, returns what would be sent — but performs no writes. Safe to call any time.

**Success response:**
```json
{
  "success": true,
  "data": {
    "traceId": "tr-abc123",
    "entity": "employees",
    "id": "EMP-1",
    "overallStatus": "success",
    "results": {
      "qbo": { "attempted": true, "success": true, "error": null },
      "qbt": { "attempted": true, "success": true, "error": null },
      "neon": { "success": true, "historyRowsWritten": 2, "error": null }
    },
    "historyRowsWritten": 2,
    "neonOnlyFields": [],
    "changesRequested": ["email", "phone"]
  }
}
```

`overallStatus` values:
- `"success"` — all attempted external writes succeeded; Neon updated
- `"partial_failure"` — one or more external writes failed; Neon NOT updated for that push; errors reported per-system

**Error responses:**
- `400 UNKNOWN_ENTITY` — entity type not in registry
- `400 NO_CHANGES` — `changes` object missing or empty
- `400 NO_CHANGED_BY` — `changedBy` not provided
- `400 UNKNOWN_FIELDS` — one or more field names not in the registry for this entity
- `404 NOT_FOUND` — entity ID not found in Neon
- `500 DB_ERROR` — Neon fetch failed

---

### GET `/api/admin/writeback/field-registry`

Returns the full `WRITEBACK_FIELDS` registry — which fields can be pushed and to which systems. Used by the ControlTower UI to build the field picker.

**Response:**
```json
{
  "success": true,
  "data": {
    "registry": {
      "employees": {
        "email": { "qbo": { "entity": "Employee", "mapKey": "PrimaryEmailAddr.Address" }, "qbt": { "mapKey": "email" } },
        "phone":  { "qbo": { "entity": "Employee", "mapKey": "PrimaryPhone.FreeFormNumber" }, "qbt": { "mapKey": "mobile_number" } },
        ...
      },
      ...
    }
  }
}
```

---

### GET `/api/admin/writeback/history/:entity/:id`

Recent write-back history for one entity from both tables.

**Response:**
```json
{
  "success": true,
  "data": {
    "historyRows": [
      { "field_name": "email", "old_value": "...", "new_value": "...", "changed_by": "Sam Jonaidi", "source": "writeback", "changed_at": "..." }
    ],
    "auditRows": [
      { "event_type": "writeback", "action": "writeback_complete", "status": "complete", "target_system": "qbo+qbt+neon", ... }
    ]
  }
}
```

---

### POST `/api/admin/writeback/bulk/:entity`

Push multiple entities of the same type in one call. Each item runs the full single-entity pipeline independently — failures do not abort remaining items.

**Request body:**
```json
{
  "items": [
    { "id": "EMP-1", "changes": { "email": "chad@example.com" } },
    { "id": "EMP-6", "changes": { "email": "evan@example.com" } }
  ],
  "changedBy": "Sam Jonaidi",
  "dryRun": false
}
```

- Max 50 items per call.

**Response:**
```json
{
  "success": true,
  "data": {
    "traceId": "tr-bulk-xyz",
    "entity": "employees",
    "total": 2,
    "successes": 2,
    "failures": 0,
    "dryRun": false,
    "itemResults": [
      { "id": "EMP-1", "status": "success", "data": { ... } },
      { "id": "EMP-6", "status": "success", "data": { ... } }
    ]
  }
}
```

---

## Field Ownership Registry (WRITEBACK_FIELDS)

The registry is the authoritative map of which Neon fields can be pushed to which external systems. It lives in `admin-writeback-v1.js` and is also served via `GET /writeback/field-registry`.

### Structure

Each field entry has up to three keys:
- `qbo: { entity, mapKey }` — which QBO entity type receives the push + the dotted-path JSON key in the QBO update body
- `qbt: { mapKey }` — the writable field name on the QBT users or jobcodes endpoint
- `neonOnly: true` — this field is never pushed externally (curated in Neon only)

### Employees

| Neon Field | → QBO | QBO Key | → QBT | QBT Key |
|---|---|---|---|---|
| `email` | Employee | `PrimaryEmailAddr.Address` | users | `email` |
| `phone` | Employee | `PrimaryPhone.FreeFormNumber` | users | `mobile_number` |
| `is_active` | Employee | `Active` (bool) | users | `active` (bool) |
| `hire_date` | Employee | `HiredDate` | users | `hire_date` |
| `qbt_pay_rate` | — (not in QBO) | — | users | `pay_rate` |
| `display_name` | — (composite, split needed) | — | — | — |
| `alias` | Neon-only | — | — | — |
| `role` | Neon-only | — | — | — |
| `enrichment` | Neon-only | — | — | — |

**Note on `display_name`:** QBO stores first+last name separately (`GivenName`, `FamilyName`). Splitting a freeform display name is lossy and error-prone. It is in the registry with a `note` but will not be pushed until a proper name-splitting helper is implemented.

**Note on `alias`:** Alias is a BB curation concept — a short display name BB uses internally. QBO and QBT have no alias field. It is permanently `neonOnly`.

### Customers

| Neon Field | → QBO | QBO Key |
|---|---|---|
| `display_name` | Customer | `DisplayName` |
| `email` | Customer | `PrimaryEmailAddr.Address` |
| `phone` | Customer | `PrimaryPhone.FreeFormNumber` |
| `is_active` | Customer | `Active` (bool) |
| `alias` | Neon-only | — |

### Vendors

| Neon Field | → QBO | QBO Key |
|---|---|---|
| `display_name` | Vendor | `DisplayName` |
| `email` | Vendor | `PrimaryEmailAddr.Address` |
| `phone` | Vendor | `PrimaryPhone.FreeFormNumber` |
| `is_active` | Vendor | `Active` (bool) |

### Work Jobcodes

| Neon Field | → QBT | QBT Key | Notes |
|---|---|---|---|
| `alias` | jobcodes | `name` | Alias pushed AS the QBT display name — deliberate override |
| `is_active` | jobcodes | `active` (bool) | |

**Note on alias → QBT name:** QBT has no alias concept. When BB sets an alias for a jobcode (e.g., "7th Ave" instead of "456 7th Ave Saratoga CA"), that preferred display name is pushed to QBT as the `name` field so it appears consistently in time entry. This is the only case where a `neonOnly`-equivalent field (alias) triggers an external write — the mapping key `__jobcode_name_override__` flags this special behavior in the code.

### Properties

All fields are `neonOnly`. Properties are a Neon-only concept linked to QBO Customers via `customer_id`. The QBO Customer record is separate and managed under the `customers` entity type.

### Company

| Neon Field | → QBO | QBO Key |
|---|---|---|
| `name` | CompanyInfo | `CompanyName` |
| `email` | CompanyInfo | `Email.Address` |
| `phone` | CompanyInfo | `PrimaryPhone.FreeFormNumber` |
| `address` | Neon-only | (QBO requires structured Address object, not stored as JSONB) |
| `enrichment` | Neon-only | — |

**Note on Company ID:** QBO CompanyInfo has no numeric ID — it is always fetched by type. The SyncToken is retrieved via `getEntity('CompanyInfo', '1')`.

---

## The Write-Back Pipeline

Every call to `POST /writeback/:entity/:id` runs this exact sequence:

```
PRE-FLIGHT
  1. Entity type validation (must be in ENTITY_TABLE)
  2. Field name validation (must be in WRITEBACK_FIELDS[entity])
  3. Separate neonOnly fields from pushable fields
  4. Fetch Neon row (confirms entity exists, provides qbo_id / qbt_id)
  5. Fetch fresh QBO SyncToken (if any QBO fields requested)
  6. Build QBO update body (sparse=true + SyncToken + mapped fields)
     Build QBT update body (id + mapped fields)

  → dryRun: return here with bodies shown, no writes

IN-FLIGHT
  7. Write QBO and QBT in parallel (Promise.allSettled)
     - QBT: check per-item _status_code (HTTP 200 ≠ item success)
     - QBO: auto-appends requestid UUID for idempotency

POST-FLIGHT
  8. If any external write failed → Neon is NOT updated
     If all external writes succeeded (or entity is neonOnly) → update Neon
     via updateMasterData() with source='writeback', changedBy=actor
  9. clearQueryCache() if QBO was written (prevents stale 5-min cache)
 10. Write audit event: writeback_complete to unified_audit_trail (tier=1)
 11. Write activity event: writeback_pushed to entity_activity_log
```

### Neon-only fields in a mixed push

If a request includes both pushable fields (e.g., `email`) and neonOnly fields (e.g., `alias`):

- The pushable fields go to QBO + QBT
- If external writes succeed, Neon is updated with the **full** changes set (both pushable + neonOnly)
- If external writes fail, Neon is NOT updated — even for the neonOnly fields in that same request

This keeps the systems consistent: if the external push failed, the admin should retry the full push rather than having Neon drift ahead of the external systems.

### Failure behavior

```
Scenario: QBO succeeds, QBT fails
  results.qbo.success = true
  results.qbt.success = false
  externalFailures = ['QBT item status 417 for user 12345']
  overallStatus = 'partial_failure'
  → Neon is NOT updated
  → QBO query cache is cleared (QBO write did happen)
  → Audit row written: status='partial_failure', errorContext='QBT item status 417...'
  → Activity event: NOT written (Neon was not updated)
```

The admin sees per-system status in the ControlTower modal: `QBO ✓ | QBT ✗ | Neon —`.

---

## QBO SyncToken Safety

QBO uses optimistic concurrency: every write requires a fresh `SyncToken` from the current record. Stale tokens cause `400 Conflict` errors. The write-back pipeline always fetches a live SyncToken immediately before building the write body:

```javascript
// Fetch live token from QBO right before the write
const freshSyncToken = await fetchFreshSyncToken(entity, neonRow.qbo_id);
// Body always uses sparse=true + fresh token
const body = { Id: qboId, sparse: true, SyncToken: freshSyncToken, ...fields };
```

The `qbo_sync_token` stored in Neon is NOT used for write-back — it may be days old by the time an admin pushes. Fetching fresh adds one API call but eliminates all concurrency conflicts.

---

## QBT Per-Item Status Check

QBT's batch endpoints return HTTP 200 even when individual items fail. Write-back checks the per-item `_status_code`:

```javascript
const itemStatus = res?._status?.items?.[String(qbtUserId)]?.status;
if (itemStatus && itemStatus !== 200) {
  results.qbt.error = `QBT item status ${itemStatus} for user ${qbtUserId}`;
}
```

Known QBT status codes:
- `200` — success
- `404` — item not found (QBT ID mismatch)
- `417` — validation error (field value rejected by QBT)

---

## Audit Trail

Every write-back generates exactly three audit records:

### 1. `unified_audit_trail` — START event (written before any external call)
```
source_app:    'bb_writeback'
event_type:    'writeback'
action:        'writeback_start'
tier:          1 (standard — always written)
status:        'start'
entity_type:   e.g. 'employees'
entity_id:     e.g. 'EMP-1'
target_system: 'qbo+qbt' (or 'neon_only')
before_state:  { changes: [...field names...], neonRow: { id, display_name } }
user_name:     changedBy
trace_id:      unique per call
```

### 2. `unified_audit_trail` — COMPLETE event (written after all writes finish)
```
action:        'writeback_complete'
status:        'complete' | 'partial_failure' | 'fail'
target_system: 'qbo+qbt+neon' (systems actually written successfully)
after_state:   { results: {...}, changesApplied: [...] }
error_context: 'QBT item status 417...' (if any failure)
```

### 3. `entity_activity_log` — ACTIVITY event (only written if Neon updated)
```
entity_type: 'employees'
entity_id:   'EMP-1'
event:       'writeback_pushed'
actor_type:  'admin'
actor_name:  'Sam Jonaidi'
summary:     'Sam Jonaidi pushed email, phone to QBO + QBT + Neon'
source_app:  'bb_writeback'
```

The START event means a crash mid-flight is detectable: if a START has no matching COMPLETE, something went wrong between the pre-flight and the post-flight. The trace_id ties them together.

---

## `master_data_history` Lineage

When Neon is successfully updated, `updateMasterData()` generates one row per changed field in `master_data_history`:

```sql
SELECT field_name, old_value, new_value, changed_by, source, source_metadata, changed_at
FROM master_data_history
WHERE entity_type = 'employees'
  AND entity_id   = 'EMP-1'
  AND source      = 'writeback'
ORDER BY changed_at DESC;
```

`source_metadata` on write-back rows:
```json
{
  "writeback": true,
  "qboWritten": true,
  "qbtWritten": true,
  "dryRun": false
}
```

This makes it possible to distinguish write-back changes from sync-runner changes from admin edits in the history table — `source` values:
- `'writeback'` — pushed via write-back API
- `'sync_runner'` — arrived from QBO/QBT sync
- `'controlTower'` — admin field edit via ControlTower PUT /master/:table/:id
- `'ts_exp5_settings_migration'` — migrated from TS_Exp5 settings file

---

## ControlTower UI

### "Push to QBO/QBT" Button

Located in the detail panel top-right (BB red, bold). Appears only for entity types that have at least one pushable field (`WRITEBACK_PUSHABLE[tableId].length > 0`). Properties show no button because all their fields are Neon-only.

### WritebackModal — Three Phases

**Phase 1: Pre-flight field picker**

Each pushable field rendered as a labeled checkbox card showing:
- Field label (human-readable)
- Current value from the Neon row (or `(empty)` if null)
- System badge(s): QBO / QBT

Fields with values are pre-checked by default. Fields with null/empty values are unchecked (but can be force-checked to push a null/clear).

Push summary banner updates dynamically: "Will push 2 fields to QBO + QBT + Neon. External systems first — Neon only updated on success."

**Phase 2: Pushing (spinner)**

The button shows "Pushing…" and is disabled. A single POST fires to `/api/admin/writeback/:entity/:id`.

**Phase 3: Results**

Per-system result badges: `QBO ✓` (green), `QBT ✓` (green), `Neon ✓` (green), or `✗` (red) with error text below.

Shows: history rows written + full trace ID for debugging.

### UI Field Registry (`WRITEBACK_PUSHABLE` in MasterDataList.jsx)

The UI maintains its own simplified pushable-field list (separate from the backend `WRITEBACK_FIELDS`). These must be kept in sync when the backend registry changes.

```javascript
const WRITEBACK_PUSHABLE = {
  employees: [
    { field: 'email',        systems: ['QBO', 'QBT'], label: 'Email' },
    { field: 'phone',        systems: ['QBO', 'QBT'], label: 'Phone' },
    { field: 'is_active',    systems: ['QBO', 'QBT'], label: 'Active status' },
    { field: 'hire_date',    systems: ['QBO', 'QBT'], label: 'Hire date' },
    { field: 'qbt_pay_rate', systems: ['QBT'],        label: 'Pay rate' },
  ],
  customers: [ ... ],
  vendors:   [ ... ],
  jobcodes:  [
    { field: 'alias',     systems: ['QBT'], label: 'Alias → QBT name' },
    { field: 'is_active', systems: ['QBT'], label: 'Active status' },
  ],
  company:   [ ... ],
  properties: [],  // empty → no button shown
};
```

---

## QBT `updateJobcodes()` (added v1.6.0)

Prior to write-back, `qbt.js` had `updateUsers()` but no jobcode write function. Added in v1.6.0:

```javascript
/**
 * PUT /jobcodes — update one or more QBT jobcodes
 * Writable fields: name, active, short_code, billable, billable_to_all,
 *   required_customfields, filtered_customfielditems
 */
export async function updateJobcodes(jobcodesArray) {
  return qbtMutate('PUT', '/jobcodes', { data: jobcodesArray });
}
```

Used by write-back when `entity === 'work_jobcodes'`. The same `qbtMutate` path as all other QBT writes — token handling, retry on 401, per-item status checking all apply.

---

## Dry Run

All three endpoints support `dryRun: true`. On a dry run:

1. All pre-flight checks run normally (entity validation, field validation, Neon fetch, SyncToken fetch)
2. QBO + QBT payloads are built and returned in the response
3. No writes to QBO, QBT, or Neon
4. No audit events written
5. Response includes `qboBody`, `qbtUserBody`, `qbtJobcodeBody` showing exact what would be sent

Use dry run to verify the payload before committing, or to debug why a field isn't being pushed.

```bash
curl -X POST /api/admin/writeback/employees/EMP-1 \
  -H "X-API-Key: ..." \
  -H "Content-Type: application/json" \
  -d '{ "changes": { "email": "test@example.com" }, "changedBy": "Sam", "dryRun": true }'
```

---

## Extending Write-Back

### Adding a new pushable field

1. Add the field to `WRITEBACK_FIELDS` in `admin-writeback-v1.js`:
   ```javascript
   employees: {
     new_field: { qbo: { entity: 'Employee', mapKey: 'QboJsonKey' }, qbt: { mapKey: 'qbt_field' } },
   }
   ```
2. If the field needs special value transformation (type coercion, format conversion), add a case in `buildQbtUserBody()` or `buildQboBody()`.
3. Add the field to `WRITEBACK_PUSHABLE.employees` in `MasterDataList.jsx` so it appears in the UI.
4. Bump both file version numbers.

### Adding a new entity type

1. Add the entity to `ENTITY_TABLE` and `WRITEBACK_FIELDS` in `admin-writeback-v1.js`.
2. Add dispatch logic in the main handler (the `if (entity === 'employees')` block) to build the correct external bodies.
3. Add a `fetchFreshSyncToken()` case if the entity has QBO.
4. Add to `WRITEBACK_PUSHABLE` in `MasterDataList.jsx`.

### Fields not yet supported

| Field | Reason | Path to support |
|---|---|---|
| `display_name` (employees) | QBO requires split GivenName+FamilyName; lossy from freeform | Add name-split helper, expand `buildQboBody` |
| `address` (company) | QBO Address is a structured object; Neon stores JSONB | Map JSONB → QBO Address structure |
| `qbo_bill_rate` (employees) | QBO stores bill rates on Items, not Employee objects | Requires separate QBO Item write path |
| Jobcode name (non-alias) | Write-back only supports alias → QBT name override today | Extend `buildQbtJobcodeBody` |

---

## Security

All write-back endpoints are behind the standard `X-API-Key` middleware that protects all `/api/admin/*` routes. The `changedBy` field is taken from the request body (not a header or session) — it is the admin's responsibility to pass their correct name. ControlTower pre-populates it from `localStorage.getItem('ct_changedBy')` which defaults to `'Sam Jonaidi'` and persists across sessions.

Write-back does NOT implement rate limiting beyond the standard Bridge rate limiter. Bulk calls are capped at 50 items per request.

---

## Verification Queries

```sql
-- See all write-back pushes for an entity
SELECT event_type, action, status, target_system, user_name, created_at, error_context
FROM unified_audit_trail
WHERE source_app = 'bb_writeback'
  AND entity_type = 'employees'
ORDER BY created_at DESC
LIMIT 20;

-- See field-level changes from write-back
SELECT field_name, old_value, new_value, changed_by, changed_at
FROM master_data_history
WHERE source = 'writeback'
ORDER BY changed_at DESC
LIMIT 20;

-- See write-back activity events
SELECT entity_type, entity_id, event, actor_name, summary, occurred_at
FROM entity_activity_log
WHERE source_app = 'bb_writeback'
ORDER BY occurred_at DESC
LIMIT 20;

-- Find partial failures (external wrote, Neon did not)
SELECT action, status, target_system, error_context, user_name, created_at
FROM unified_audit_trail
WHERE source_app = 'bb_writeback'
  AND status = 'partial_failure'
ORDER BY created_at DESC;

-- Confirm an employee write-back reached QBT
-- (check qbt_last_updated bumped after the push)
SELECT id, display_name, email, phone, qbt_last_updated, qbo_last_updated
FROM employees
WHERE id = 'EMP-1';
```
