# BB Enrichment & Data Quality Best Practices | v1.1 | 2026-03-14 | BB

> **Purpose:** Right-sized enrichment versioning and data quality practices for a small construction company (20 employees, ~300 vendors, ~150 customers, 11 internal apps). Core QBO/QBT fields (names, addresses, contact info) change rarely and don't justify SCD2 versioning at BB's scale. BB owns enrichment data, versions it independently via `enrichment_version` + `enrichment_history`, and stamps C2 records with enrichment timestamps for point-in-time reconstruction. If core field history is ever needed, Bridge can capture old→new diffs at sync time.

---

## 1. THE 8 PILLARS (Right-Sized for BB)

| # | Pillar | Enterprise Scale | BB Scale | Priority |
|---|--------|-----------------|----------|----------|
| 1 | **Golden Record** | Merge duplicates from 50+ systems | Merge QBO + QBT + enrichment into one truth | Critical |
| 2 | **Enrichment Versioning** | SCD Type 2 with surrogate keys across data warehouse | `enrichment_version` integer on C1 tables + `enrichment_history` table for field-level tracking | Critical |
| 3 | **Audit Trail** | SOX-compliant immutable logs with chain of custody | `enrichment_history` for enrichment changes + `audit_log` for general activity | Critical |
| 4 | **Data Lineage** | Automated lineage graphs across 100+ pipelines | Manual lineage map: QBO/QBT → Bridge → Neon → App | Important |
| 5 | **Transaction Watermarking** | Surrogate key pipeline stamping every fact row | `enrichment_snapshot_at` timestamp on key Compartment 2 records | Important |
| 6 | **Change Propagation** | Real-time CDC (Change Data Capture) to downstream | Version check on app read + sync notifications | Important |
| 7 | **Data Quality** | ML-driven cleansing, standardization engines | Filled %, completeness scores, stale data alerts | Nice-to-have |
| 8 | **Governance** | Data stewards, governance councils, policies | Sam is steward. Claude is governance. Rules in schema doc. | Built-in |

---

## 2. WHAT BB ALREADY HAS (Current Schema v2.23)

### Already Implemented

| Practice | Where | Status |
|----------|-------|--------|
| **Version column** | Every master data table has `version: integer('version').default(1)` | Exists — but never incremented in current JSON-file apps |
| **Audit log** | `audit_log` table with `old_value`, `new_value`, `user_id`, `action`, `entity_type`, `entity_id` | Defined in schema |
| **Sync log** | `sync_log` table tracks QBO/QBT sync operations with record counts, changes, errors | Defined in schema |
| **Timestamps** | `createdAt`, `updatedAt`, `syncedAt` on all tables | Exists |
| **QBO sync token** | `qboSyncToken` column for change detection | Exists |
| **Enrichment registry** | `enrichment_fields` + `app_field_subscriptions` govern what fields exist and who can write | Defined in schema |
| **Enrichment vs core separation** | QBO-synced columns (read-only) vs enrichment JSONB (app-managed) | Clean ownership boundary |

### What's MISSING

| Gap | Risk | Description |
|-----|------|-------------|
| **No enrichment version trail** | HIGH | When Sam changes an employee's payRate, the old value is gone from the enrichment JSONB. No historical enrichment state. |
| **No enrichment audit granularity** | HIGH | The `audit_log` captures general changes but doesn't provide field-level enrichment history with version tracking. Cannot answer: "What was Chad's payRate when we ran the Feb 14 auto-lunch cycle?" |
| **C2 tables don't know which enrichment version they used** | HIGH | Compartment 2 records (auto-lunch runs, cycle snapshots, contracts) reference master data by ID but don't stamp WHICH enrichment version was in effect when they were created. |
| **Version never incremented** | MEDIUM | The `version` column exists but there's no documented mechanism to increment it on enrichment updates. It's always `1`. |
| **No change propagation** | MEDIUM | When a vendor's trade changes in Compartment 1, PorjExp5 and DocEngine have no way to know until they next query. |
| **No data quality scoring** | LOW | "Filled %" for enrichment exists in the spec but no completeness/accuracy/consistency scoring. |

---

## 3. THE ENRICHMENT VERSIONING PROBLEM (Most Critical Gap)

### The Scenario

```
March 1:  Chad's payRate = $55.00 (in employees.enrichment)
March 5:  TS_Exp5 runs auto-lunch for Feb 24-Mar 7 pay period
          → Calculates billing using Chad's payRate = $55.00
March 8:  Sam raises Chad's payRate to $59.00 via Data Manager
March 15: RevExp5 calculates Cycle 5 revenue
          → Uses Chad's payRate = $59.00 for ALL of Cycle 5
          → But Feb 24-Mar 7 should use $55.00!
```

**The problem:** RevExp5 Cycle 5 now shows revenue calculated with $59.00 for the entire period, but Chad was actually at $55.00 for the first week. The auto-lunch run from March 5 used the correct rate, but there's no record of which rate it used — it just references `employees.id`.

### Solution: Enrichment Versioning (No SCD2 Needed)

Core QBO/QBT fields (names, addresses, contact info) change rarely — maybe 1-4x/year per entity. SCD2 versioning for these fields is over-engineered at BB's scale (~500-1,100 C1 rows). QBO/QBT provide `SyncToken` (optimistic lock counter), `MetaData.LastUpdatedTime`, and CDC (30-day lookback, current state only) — but **no field-level change history and no previous record versions via API**. BB only needs to version **enrichment data** — the custom fields that BB apps create and manage (payRate, trade, aliases, schedules, etc.). These change frequently and BB needs point-in-time reconstruction for them. If core field history is ever needed, Bridge can capture old→new diffs during sync by comparing incoming QBO/QBT data against the current C1 cache — no SCD2 required.

#### A. Add `enrichment_version` integer to C1 tables

```typescript
// Add to employees, customers, vendors, work_jobcodes, properties, master_items
enrichmentVersion: integer('enrichment_version').default(1),
```

When any enrichment field changes on a record, bump `enrichment_version` by 1. The record is updated **in place** — no row duplication, no closing/reopening rows. The version integer simply tracks how many times enrichment has changed.

#### B. `enrichment_history` table for field-level tracking

This table captures every individual enrichment field change with full before/after values:

```typescript
export const enrichmentHistory = pgTable('enrichment_history', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fieldName: text('field_name').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  enrichmentVersion: integer('enrichment_version').notNull(),
  changedBy: text('changed_by').default('system'),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_eh_entity').on(table.entityType, table.entityId),
  index('idx_eh_version').on(table.entityId, table.enrichmentVersion),
  index('idx_eh_date').on(table.changedAt),
]);
```

This means when Chad's payRate changes from $55.00 to $59.00:

```
enrichment_history:
id       | entity_type | entity_id | field_name | old_value | new_value | enrichment_version | changed_by | changed_at
EH-001   | employee    | EMP-002   | payRate    | 55.00     | 59.00     | 4                  | sam        | 2026-03-08 10:30:00
```

And on the `employees` table:
```
id       | display_name    | enrichment.payRate | enrichment_version
EMP-002  | Chad Buthker    | 59.00              | 4
```

**Query for current enrichment:** Read `employees.enrichment` directly.
**Query for point-in-time enrichment:** Query `enrichment_history` to reconstruct state at any timestamp.

#### C. Stamp C2 records with `enrichment_snapshot_at` timestamp

Add an `enrichment_snapshot_at` timestamp to key Compartment 2 tables. When a C2 record is created, stamp it with `NOW()`. To reconstruct the enrichment that was in effect:

```sql
SELECT * FROM enrichment_history
WHERE entity_id = 'EMP-002'
  AND changed_at <= (SELECT enrichment_snapshot_at FROM ts_auto_lunch_runs WHERE id = 'RUN-123')
ORDER BY changed_at
```

This replay approach reconstructs the exact enrichment state at any point in time without duplicating rows in C1 tables.

#### D. Enrichment History Query Cookbook

Common query patterns for working with enrichment versioning:

**Get current enrichment:**
```sql
SELECT enrichment FROM employees WHERE id = ?
```

**Get enrichment at point in time:**
```sql
SELECT * FROM enrichment_history
WHERE entity_id = ?
  AND changed_at <= $ts
ORDER BY enrichment_version
```
Then apply changes sequentially to reconstruct the enrichment state at that timestamp.

**Get all changes for an entity:**
```sql
SELECT * FROM enrichment_history
WHERE entity_id = ?
ORDER BY changed_at DESC
```

**Get what changed between versions:**
```sql
SELECT * FROM enrichment_history
WHERE entity_id = ?
  AND enrichment_version BETWEEN $v1 AND $v2
ORDER BY enrichment_version
```

**Reconstruct enrichment at C2 snapshot time:**
```sql
SELECT * FROM enrichment_history
WHERE entity_id = ?
  AND changed_at <= (SELECT enrichment_snapshot_at FROM ts_timesheet_snapshots WHERE id = ?)
ORDER BY enrichment_version
```

---

## 4. AUDIT TRAIL BEST PRACTICES

### What to Audit

| Event | Priority | Details to Capture |
|-------|----------|-------------------|
| **Enrichment field change** | Critical | Captured in `enrichment_history`: entity_type, entity_id, field_name, old_value, new_value, changed_by, changed_at |
| **QBO/QBT sync update** | Critical | Logged in `audit_log`: which fields changed, old vs new values, sync timestamp |
| **Enrichment field definition change** | Important | New field added, field archived, options changed |
| **App settings change** | Important | Which app, which category, old vs new settings |
| **Record create/delete** | Important | Full record snapshot on create, reason on delete |
| **Failed sync** | Important | Error details, which records failed, retry count |
| **Data Manager access** | Nice-to-have | Who viewed what (future, multi-user) |

### Audit Architecture

The audit system has two components:

1. **`enrichment_history`** — The dedicated enrichment audit trail. Every enrichment field change is recorded with field-level granularity, version numbers, and timestamps. This IS the enrichment audit trail.

2. **`audit_log`** — General activity tracking for non-enrichment events (sync updates, record creation/deletion, settings changes). Keep the `change_source` column for categorizing activity:

```typescript
// audit_log keeps:
changeSource: text('change_source'),  // 'qbo_sync', 'qbt_sync', 'manual', 'system'
```

> **context_map audit granularity:** For context_map enrichment fields (e.g., vendor aliases), the `enrichment_history.field_name` should include the context key: `aliases.gs_receipts` rather than just `aliases`. This enables filtering history by which app's context was modified.

### Retention Policy

| Log Type | Retention | Rationale |
|----------|-----------|-----------|
| Enrichment history | **Indefinite** | Small volume, high value — always need history |
| Sync logs | **2 years** | Diagnostic value decreases over time |
| Cal audit log | **2 years** | Match localStorage precedent (365 days), extend for Neon |
| App settings changes | **1 year** | Low volume, moderate value |

---

## 5. DATA LINEAGE MAP

For BB's scale, a manual lineage map is sufficient. No need for automated lineage tools.

### Source → Neon → App Data Flow

```
QBO (Cloud)                     QBT (Cloud)
    │                               │
    ▼                               ▼
┌──────────────────────────────────────────────┐
│           Mini_API_Bridge (Port 3100)         │
│  OAuth tokens, rate limiting, error handling  │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│              Neon Postgres                    │
│                                              │
│  COMPARTMENT 1 (shared)                      │
│  ┌──────────────────────────────────────┐    │
│  │ employees ◄── QBO Employee + QBT User│    │
│  │ customers ◄── QBO Customer           │    │
│  │ vendors   ◄── QBO Vendor             │    │
│  │ jobcodes  ◄── QBT Jobcode            │    │
│  │ properties◄── QBO Customer (derived) │    │
│  │ items     ◄── QBO Item (future)      │    │
│  │ trades    ◄── Manual / seed data     │    │
│  └──────────────────────────────────────┘    │
│       ▲ enrichment writes                    │
│       │                                      │
│  ┌────┴─────────────────────────────────┐    │
│  │ enrichment_fields (registry)         │    │
│  │ app_field_subscriptions              │    │
│  │ app_settings                         │    │
│  │ audit_log    ◄── ALL changes logged  │    │
│  │ sync_log     ◄── ALL syncs logged    │    │
│  │ enrichment_history ◄── enrichment    │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  COMPARTMENT 2 (per-app)                     │
│  ┌──────────────────────────────────────┐    │
│  │ cal_*   ◄── CalExp5                  │    │
│  │ ts_*    ◄── TS_Exp5                  │    │
│  │ rev_*   ◄── RevExp5                  │    │
│  │ proj_*  ◄── PorjExp5                 │    │
│  │ doc_*   ◄── BB-DocEngine             │    │
│  │ inv_*   ◄── Invoice_Validate2        │    │
│  │ chase_* ◄── Chase_Validate           │    │
│  │ esign_* ◄── Adobe eSigner            │    │
│  │ lf_*    ◄── Landfill_Surcharge       │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│       Bridge API (Express on Railway)         │
│  GET /api/employees?app=calexp5               │
│  POST /api/employees/:id/enrichment           │
│  GET /api/sync/status                         │
└──────────────────┬───────────────────────────┘
                   │
          ┌────────┼────────┬───────────┐
          ▼        ▼        ▼           ▼
       CalExp5  TS_Exp5  RevExp5   ...10 apps
```

### Field-Level Lineage (Critical Fields)

| Field | Source System | Source Field | Transform | Neon Column | Consumed By |
|-------|-------------|-------------|-----------|-------------|-------------|
| Employee name | QBO | `Employee.DisplayName` | None | `employees.display_name` | All apps |
| Employee name | QBT | `User.first_name + last_name` | Concat | Used for crossref matching only | Bridge |
| Pay rate | TS_Exp5 | `unified-settings.json → compensation.payRate` | Flatten | `employees.enrichment.payRate` | TS_Exp5, RevExp5 |
| Cost rate | RevExp5 | `settings.json → employees[name]` | Name→ID lookup | `employees.enrichment.costRate` | RevExp5 |
| Vendor trade | DocEngine | `subs.json → trade` | None | `vendors.enrichment.trade` | DocEngine, PorjExp5 |
| Jobcode color | CalExp5 | `JOBSITE_COLORS` array | Assign on add | `cal_selected_jobcodes.color` | CalExp5 |
| Card mapping | Chase | `content-v27.js → CARDHOLDERS` | Hardcoded→enrichment | `employees.enrichment.cardLast4` | Chase |

---

## 6. CHANGE PROPAGATION

### The Problem

When Sam changes a vendor's trade from "plumbing" to "electrical" in the Data Manager, PorjExp5's sub directory still shows "plumbing" until the next page refresh that re-queries the Bridge.

### BB-Scale Solution: Version Check on Read

Apps already query the Bridge for master data. Add a **lightweight version check**:

```
GET /api/employees?app=calexp5&since_version=3
```

Bridge returns:
- If no changes since version 3: `{ changed: false }`
- If changes exist: `{ changed: true, records: [...], currentVersion: 5 }`

This is **pull-based** (app asks "anything new?"), not push-based (server notifies apps). Pull is simpler, sufficient for BB's update frequency (~1-2 master data changes per day).

### Future Option: Webhook Notifications

If BB grows to need real-time propagation:
1. Apps register webhook URLs with Bridge
2. On master data change, Bridge POSTs notification to registered apps
3. Apps refresh their cached data

**Not needed now.** Pull-based is fine for 11 internal apps used by one person.

---

## 7. BRIDGE SYNC DELEGATION (QBO ↔ QBT)

### Conflict Resolution at Sync Time

QBO vs QBT conflict resolution is handled by the Bridge at sync time. No separate conflict tracking table is needed — the Bridge applies these rules automatically and logs the result to `audit_log`.

**5 delegation categories:**

| Category | Examples | Winner | Rationale |
|----------|----------|--------|-----------|
| **HR/Identity** | name, email, hire date, active status | **QBO** | HR system of record |
| **Time/Scheduling** | timesheets, jobcodes, PTO | **QBT** | Time tracking system of record |
| **Financial** | pay rates, billing, invoicing | **QBO** | Accounting system of record |
| **Enrichment** | custom fields, app-specific data | **BB Platform** | Enrichment is platform-managed, never synced from either system |
| **Conflicting** | both systems changed same field in same sync window | **Survivorship rule** | Bridge applies the category rule above and logs to `audit_log` |

Not applicable for enrichment fields — Bridge resolves QBO vs QBT conflicts at sync time using the category rules above. Enrichment fields are BB-owned and never conflict with external data.

---

## 8. DATA QUALITY METRICS

### Scoring Model (Simple, 3 dimensions)

| Dimension | Calculation | Target |
|-----------|------------|--------|
| **Completeness** | (filled fields / total applicable fields) x 100 | >80% for Tier 1 entities |
| **Freshness** | Hours since last sync | <6h during business hours |
| **Consistency** | Cross-system match rate (QBO name = QBT name) | 100% for crossref entities |

### Data Manager Dashboard Metrics

```
ENRICHMENT DATA HEALTH
─────────────────────────────────────────
Employees    ████████░░ 82%  │ Synced 2h ago  │ 12/12 matched
Customers    ███████░░░ 71%  │ Synced 2h ago  │ N/A
Vendors      ████░░░░░░ 38%  │ Synced 2h ago  │ N/A
Jobcodes     ██░░░░░░░░ 18%  │ Synced 2h ago  │ N/A
Properties   █████░░░░░ 52%  │ Geocoded       │ N/A
```

Completeness is low for vendors and jobcodes because enrichment fields are mostly Phase 2/3 — they'll fill up as apps migrate to Neon.

---

## 9. PRACTICAL SCHEMA CHANGES NEEDED

### Priority 1: Enrichment Versioning (Before DB-1)

Add to **6 of 7 Compartment 1 entity tables (trades excluded as a static lookup with 39 rows that rarely change)** (employees, customers, vendors, work_jobcodes, properties, master_items):

```typescript
enrichmentVersion: integer('enrichment_version').default(1),
```

**Bridge/Data Manager enrichment update logic:**
```
ON ENRICHMENT UPDATE:
  1. Record each changed field in enrichment_history (old_value, new_value)
  2. Bump enrichment_version on the entity record
  3. Update the enrichment JSONB in place
```

**App read logic (unchanged):**
```sql
SELECT * FROM employees
```

No filtering needed — records are always current. No row duplication.

### Priority 2: Enrichment History Table (DB-1)

Add the `enrichment_history` table (replaces the need for a separate `sync_conflicts` table):

```typescript
export const enrichmentHistory = pgTable('enrichment_history', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  fieldName: text('field_name').notNull(),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
  enrichmentVersion: integer('enrichment_version').notNull(),
  changedBy: text('changed_by').default('system'),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_eh_entity').on(table.entityType, table.entityId),
  index('idx_eh_version').on(table.entityId, table.enrichmentVersion),
  index('idx_eh_date').on(table.changedAt),
]);
```

### Priority 3: Transaction Watermarking (DB-2 onward)

Add `enrichment_snapshot_at` timestamp to key Compartment 2 tables:

| Table | Add Column | What It Captures |
|-------|-----------|------------------|
| `ts_timesheet_snapshots` | `enrichmentSnapshotAt timestamp` | Enrichment state at snapshot time |
| `ts_auto_lunch_runs` | `enrichmentSnapshotAt timestamp` | Enrichment state (employee rates) at run time |
| `rev_cycle_snapshots` | `enrichmentSnapshotAt timestamp` | Enrichment state (cost rates) at snapshot time |
| `doc_contracts` | `enrichmentSnapshotAt timestamp` | Enrichment state at contract creation |
| `cal_uploaded_timesheets` | `enrichmentSnapshotAt timestamp` | Enrichment state at upload time |
| `inv_validation_runs` | `enrichmentSnapshotAt timestamp` | Enrichment state at validation time |

To reconstruct enrichment at snapshot time:
```sql
SELECT * FROM enrichment_history
WHERE entity_id = 'EMP-002'
  AND changed_at <= (SELECT enrichment_snapshot_at FROM ts_auto_lunch_runs WHERE id = 'RUN-123')
ORDER BY enrichment_version
```

#### Watermark Inclusion/Exclusion Criteria

**Criteria:** Watermark tables that CREATE analytical snapshots or run automated processes against master data. Exclude simple CRUD, user settings, lookup/config, and template tables.

**INCLUDED (6 tables):**

| Table | Reason |
|-------|--------|
| `ts_timesheet_snapshots` | Employee time data |
| `ts_auto_lunch_runs` | Processes all employees |
| `rev_cycle_snapshots` | Revenue uses employee rates |
| `doc_contracts` | References customers/vendors at creation |
| `inv_validation_runs` | Validates against vendor/item data |
| `cal_uploaded_timesheets` | Uses employee enrichment at upload time |

**EXCLUDED (19 tables):**

| Table | Reason |
|-------|--------|
| `cal_manual_hours` | Simple hour entries, low value |
| `cal_selected_jobcodes` | UI preference |
| `cal_user_settings` | UI preference |
| `cal_audit_log` | Meta |
| `ts_pay_periods` | Period metadata, no entity data |
| `ts_auto_note_runs` | Derives from snapshots which are watermarked |
| `rev_estimates` | Static after creation |
| `proj_*` | Project metadata |
| `doc_estimate_templates` | Templates, not transactions |
| `doc_qbo_notes_backup` | Backup record |
| `inv_validation_checks` | Detail of watermarked parent |
| `inv_receipt_matches` | Detail of watermarked parent |
| `inv_validation_suppressions` | User override |
| `chase_validation_sessions` | Ephemeral |
| `esign_*` | Document lifecycle |
| `lf_surcharge_calculations` | Ephemeral calc |

### Priority 4: Audit Log Enhancement (DB-1)

Add column to `audit_log`:

```typescript
// Add to audit_log:
changeSource: text('change_source'),  // 'qbo_sync', 'qbt_sync', 'manual', 'system'
```

This lets you answer: "Show me everything that changed during the 09:15 QBO sync."

---

## 10. CONTEXT_MAP PATTERN

The `context_map` pattern for enrichment fields (e.g., vendor aliases per app) is unchanged. Each app stores its own context under a namespaced key in the enrichment JSONB. The `enrichment_history` table tracks changes to context_map fields using dot-notation in `field_name` (e.g., `aliases.gs_receipts`).

---

## 11. WHAT BB DOES NOT NEED (Avoid Over-Engineering)

| Enterprise Pattern | Why BB Skips It |
|-------------------|-----------------|
| **Automated lineage tools** (Atlan, Collibra, DataHub) | 11 apps, 1 developer, manual lineage map is sufficient |
| **CDC/Event streaming** (Debezium, Kafka) | ~1-2 master data changes/day. Pull-based polling is fine. |
| **Data stewardship committees** | Sam is the sole data steward. No committee needed. |
| **Master data matching/dedup engine** | <500 records per entity. Manual dedup in Data Manager. |
| **Data quality ML models** | Simple filled % and freshness metrics are enough |
| **Blockchain immutability** | `enrichment_history` + `audit_log` is sufficient proof |
| **Multi-domain MDM hub** | BB has one domain (construction). No cross-domain complexity. |
| **Real-time CDC to downstream** | Apps refresh on use. 15-min sync cycle is plenty. |
| **Row-duplication versioning** | Enrichment-first approach: version enrichment with history table, not row copies |
| **Data catalog / glossary tools** | BB_PLATFORM_SCHEMA-v2.23 IS the catalog |

---

## 12. SUMMARY: GAP → ACTION TABLE

| Gap | Schema Change | Where | Phase |
|-----|--------------|-------|-------|
| No enrichment version trail | Add `enrichment_version` integer to C1 tables | employees, customers, vendors, jobcodes, properties, master_items | DB-1 |
| No field-level enrichment history | Add `enrichment_history` table | New infrastructure table | DB-1 |
| No transaction watermark | Add `enrichmentSnapshotAt` timestamp to key C2 tables | ts_timesheet_snapshots, ts_auto_lunch_runs, rev_cycle_snapshots, doc_contracts, cal_uploaded_timesheets, inv_validation_runs | DB-2+ |
| Audit log incomplete | Add `changeSource` column | audit_log | DB-1 |
| No data quality dashboard | Add health metrics to Data Manager UI | BB Data Manager | DB-3 |
| No change propagation | Add `?since_version=N` to Bridge GET endpoints | Bridge API | DB-2 |

**New table count: 39** (7 C1 + 26 C2 + 6 infra = 39 total)

Infrastructure tables: `enrichment_fields`, `app_field_subscriptions`, `app_settings`, `audit_log`, `sync_log`, `enrichment_history`

(`enrichment_history` replaces the previously planned `sync_conflicts` table in the 39-table total)

---

*See: BB_PLATFORM_SCHEMA-v2.23 @ Sections 2-4 for current table definitions*
*See: BB_DB_STRATEGY.md v1.4 @ Section 14 for infrastructure table schemas*
*See: BB_DATA_MANAGER_SPEC.md v1.0 for UI specification*

Sources:
- [MDM Best Practices](https://www.esystems.fi/en/blog/master-data-management-best-practices-how-to-do-it-right)
- [Golden Record in MDM](https://profisee.com/blog/what-is-a-golden-record/)
- [Golden Record — Informatica](https://www.informatica.com/blogs/golden-record.html)
- [Data Lineage Best Practices 2025](https://seemoredata.io/blog/data-lineage-in-2025-examples-techniques-best-practices/)
- [Data Versioning Guide](https://bix-tech.com/data-versioning-explained-a-practical-guide-with-best-practices/)
- [Master Data vs Transactional Data](https://atlan.com/what-is/master-data-vs-transactional-data/)
- [MDM — Airbyte](https://airbyte.com/data-engineering-resources/master-data-management)
- [Data Lineage vs Traceability](https://atlan.com/data-lineage-vs-data-traceability/)
