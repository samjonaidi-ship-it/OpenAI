# BB Cross-Document Audit | v1.5 | 2026-03-14 | BB

> **Scope:** BB_PLATFORM_SCHEMA-v2.md (v2.23), BB_PLATFORM_SCHEMA.md (v1.0), BB_DB_STRATEGY.md (v1.4), BB_ARCHITECTURE_ANALYSIS.md (v1.1), BB_MDM_BEST_PRACTICES.md (v1.1), BB_DATA_MANAGER_SPEC.md (v1.1)
>
> **Purpose:** Identify contradictions, omissions, edge cases, and alignment gaps across all 6 documents.
>
> **Status:** All 17 original findings remedied (v1.1). Third-pass: 34 issues fixed (v1.2). Fourth-pass: 15 remaining issues fixed (v1.3). **Fifth-pass (v1.4): Approach B pivot** — entire architecture shifted from SCD2 to enrichment-first. Many earlier findings (C1, C2, O2, O3, O4, E1, E2, E3) are now MOOT. All documents aligned on Schema v2.23. Correct totals: 7 C1 + 26 C2 + 6 infra = **39 tables**.

---

## CRITICAL FINDINGS SUMMARY

| # | Category | Severity | Finding |
|---|----------|----------|---------|
| C1 | Contradiction | CRITICAL | SCD2 breaks unique constraints on qbo_id/qbt_id |
| C2 | Contradiction | HIGH | sync_conflicts column names differ between MDM doc and Schema v2.21 |
| C3 | Contradiction | HIGH | DB_STRATEGY has completely different Compartment 2 table names |
| C4 | Contradiction | HIGH | ts_auto_note_runs was missing from table count (corrected: 7 C1 + 26 C2 + 6 infra = 39) |
| C5 | Contradiction | MEDIUM | DB_STRATEGY deployment phases differ significantly from Schema v2.21 |
| O1 | Omission | HIGH | Data Manager Spec has zero MDM UI features |
| O2 | Omission | HIGH | Architecture Analysis sizing doesn't account for SCD2 row growth |
| O3 | Omission | MEDIUM | masterDataContext missing from several C2 tables that reference master data |
| O4 | Omission | MEDIUM | No documented query patterns for SCD2 point-in-time lookups |
| O5 | Omission | MEDIUM | MDM doc doesn't mention context_map enrichment pattern |
| O6 | Omission | LOW | No property enrichment fields in Section 5 seed data |
| E1 | Edge Case | HIGH | SCD2 + enrichment JSONB: entire blob duplicated on any field change |
| E2 | Edge Case | MEDIUM | trades table has no SCD2 but MDM doc says "all Compartment 1 tables" |
| E3 | Edge Case | MEDIUM | employeeVersion (integer) vs masterDataContext (JSONB) — inconsistent patterns |
| S1 | Stale Ref | HIGH | 4 documents reference Schema v2.18 — now v2.21 |
| S2 | Stale Ref | HIGH | DB_STRATEGY is massively outdated (19 tables vs 38) |

---

## 1. CONTRADICTIONS

### C1. SCD2 Breaks Unique Constraints on qbo_id / qbt_id [CRITICAL]

**The problem:** Schema v2.21 has these unique constraints:
- `employees.qbo_id` — `text('qbo_id').unique()`
- `employees.qbt_id` — `text('qbt_id').unique()`
- `customers.qbo_id` — `text('qbo_id').unique()`
- `vendors.qbo_id` — `text('qbo_id').unique()`
- `work_jobcodes.qbt_id` — `text('qbt_id').unique()`

With SCD2, when an employee record changes:
1. Old row: `{ id: 'EMP-001', qbo_id: '6', is_current: false, valid_to: NOW() }`
2. New row: `{ id: 'EMP-001', qbo_id: '6', is_current: true, valid_from: NOW() }`

Both rows have `qbo_id = '6'` — **the UNIQUE constraint will reject the INSERT**.

**Fix required:** Change all `.unique()` constraints on qbo_id/qbt_id to partial unique indexes:
```typescript
// Instead of: qboId: text('qbo_id').unique()
// Use column without .unique(), then add partial index:
uniqueIndex('idx_emp_qbo_current').on(table.qboId).where(sql`is_current = true`)
```

**Affected tables:** employees (qbo_id + qbt_id), customers (qbo_id), vendors (qbo_id), work_jobcodes (qbt_id)

**Documents affected:** BB_PLATFORM_SCHEMA-v2.md (fix schema), BB_MDM_BEST_PRACTICES.md (document this gotcha)

---

### C2. sync_conflicts Column Names Differ [HIGH]

**BB_MDM_BEST_PRACTICES.md** defines:
```
field, source_a, value_a, source_b, value_b
```

**BB_PLATFORM_SCHEMA-v2.md** (v2.21) defines:
```
field_name, qbo_value, qbt_value
```

These are the same table with different column names. The Schema v2.21 version is more specific (hardcodes QBO/QBT as the two sources), while the MDM version is more generic (source_a/source_b could be any pair).

**Recommendation:** Align on the Schema v2.21 version (`field_name`, `qbo_value`, `qbt_value`) since BB's only conflict source is QBO vs QBT. Update BB_MDM_BEST_PRACTICES.md to match.

---

### C3. DB_STRATEGY Compartment 2 Table Names Completely Different [HIGH]

**BB_DB_STRATEGY.md v1.4** lists these C2 tables (10 total):
```
cal_manual_hours, cal_selected_jobcodes, cal_uploaded_timesheets, cal_user_settings,
ts_time_entries, ts_pay_periods,
rev_invoices, rev_expenses,
proj_estimates, proj_change_orders
```

**BB_PLATFORM_SCHEMA-v2.md** (v2.21) lists these C2 tables (26 total):
```
cal_manual_hours, cal_selected_jobcodes, cal_uploaded_timesheets, cal_user_settings, cal_audit_log,
ts_timesheet_snapshots, ts_pay_periods, ts_auto_lunch_runs, ts_auto_note_runs,
rev_cycle_snapshots, rev_estimates,
proj_estimate_templates, proj_projects, proj_supplier_ignore_list,
doc_contracts, doc_estimate_templates, doc_qbo_notes_backup,
inv_validation_runs, inv_validation_checks, inv_receipt_matches, inv_validation_suppressions,
chase_validation_sessions,
esign_agreements, esign_overlay_registry, esign_signers,
lf_surcharge_calculations
```

**Key mismatches:**
| DB_STRATEGY | Schema v2.21 | Issue |
|-------------|-------------|-------|
| `ts_time_entries` | `ts_timesheet_snapshots` | Different name, different purpose |
| `rev_invoices` | `rev_cycle_snapshots` | Different name, different purpose |
| `rev_expenses` | (none) | Removed — expenses not stored |
| `proj_estimates` | `proj_estimate_templates` | Different name |
| `proj_change_orders` | (none) | Removed — embedded in details JSONB |
| (missing) | 15 more tables | DB_STRATEGY is unaware of doc_*, inv_*, chase_*, esign_*, lf_* |

**Root cause:** DB_STRATEGY v1.4 was written before the 11-app deep analysis that produced Schema v2. The C2 table names were placeholders.

**Recommendation:** DB_STRATEGY needs a v1.5 update to align with Schema v2.21.

---

### C4. ts_auto_note_runs Missing from Table Count [HIGH]

**Schema v2.21 Section 3.2** defines 4 TS_Exp5 tables:
1. ts_timesheet_snapshots
2. ts_pay_periods
3. ts_auto_lunch_runs
4. ts_auto_note_runs

**REMEDIED in v2.21:** ts_auto_note_runs added to Section 8 count and DB-6 phase. Correct count: C2 = 26, Total = 39.

---

### C5. Deployment Phases Differ Between DB_STRATEGY and Schema v2.21 [MEDIUM]

| Phase | DB_STRATEGY v1.4 | Schema v2.21 |
|-------|-------------------|-------------|
| DB-1 | employees, work_jobcodes, Bridge, Clerk auth | employees, work_jobcodes, ALL 6 infra tables, sync_conflicts |
| DB-2 | enrichment_fields, app_field_subscriptions, cal_* tables, app_settings | cal_* tables only (5) |
| DB-3 | Data Manager v1 (no new tables) | Same |
| DB-4 | CalExp5 migration (no new tables) | customers, vendors, properties, trades, master_items + doc_* + proj_* (11 tables) |
| DB-5 | TS_Exp5 (ts_time_entries, ts_pay_periods) | RevExp5 (rev_cycle_snapshots, rev_estimates) |
| DB-6 | PorjExp5 (proj_estimates, proj_change_orders, customers, vendors) | TS_Exp5 (ts_* tables) |
| DB-7 | RevExp5 (rev_invoices, rev_expenses) | InvVal2 + Chase (inv_*, chase_*) |
| DB-8 | Data Manager v2 | Adobe eSigner + Landfill (esign_*, lf_*) |

**Root cause:** DB_STRATEGY phases were designed before the full app analysis. Schema v2.21 reorganized phases after understanding actual dependencies. Also, Architecture Analysis recommended splitting DB-4 into 4a/4b.

**Recommendation:** DB_STRATEGY needs phase alignment with Schema v2.21. Architecture Analysis recommendation for DB-4a/4b split should be incorporated.

---

## 2. OMISSIONS

### O1. Data Manager Spec Has Zero MDM UI Features [HIGH]

**BB_DATA_MANAGER_SPEC.md v1.0** was written before MDM additions (references v2.18). The schema now has SCD2 versioning, sync_conflicts, survivorship rules, masterDataContext, and data quality infrastructure — but the Data Manager has no UI for any of it.

**Missing screens/features:**

| Feature | Schema Support | Data Manager UI |
|---------|---------------|-----------------|
| Version history per entity | SCD2 valid_from/valid_to | NOT PRESENT |
| Conflict resolution queue | sync_conflicts table | NOT PRESENT |
| Survivorship rules display | Documented in schema | NOT PRESENT |
| Audit trail viewer | audit_log + MDM columns | Mentioned once, no screen |
| Data quality dashboard | completeness/freshness/consistency | Only "Filled %" |
| masterDataContext inspection | JSONB on 4 C2 tables | NOT PRESENT |
| context_map editor | context_map field type | NOT PRESENT |
| Point-in-time reconstruction | SCD2 query patterns | NOT PRESENT |

**Recommendation:** Add to Data Manager Spec:
1. **Version History panel** — expand any entity row to see version timeline (valid_from/valid_to)
2. **Conflicts tab** — sidebar item showing pending sync_conflicts with resolve/dismiss actions
3. **Audit Trail screen** — filterable log viewer (by entity, by source, by date range)
4. **Data Quality cards** — per-entity completeness + freshness + consistency scores
5. **context_map editor** — when editing a context_map field, show tabs for each context (gs_receipts | chase | invoice)

---

### O2. Architecture Analysis Sizing Doesn't Account for SCD2 [HIGH]

**BB_ARCHITECTURE_ANALYSIS.md** sizes Compartment 1 at ~2-5 MB for ~600-1,100 rows.

With SCD2, every master data change creates a new row (old row kept with `is_current=false`). Over 3 years:
- If each employee record changes ~4x/year (pay rate, schedule, etc.): 30 employees x 12 versions = 360 rows (vs 30 without SCD2)
- If each vendor changes ~2x/year: 300 vendors x 6 versions = 1,800 rows (vs 300)
- Total C1 could be ~3,000-5,000 rows vs ~1,100

**Impact:** Storage grows from ~5 MB to ~15-20 MB for C1. Still well within Neon free tier (512 MB), but the analysis should note this.

Also missing: sizing for `sync_conflicts` table and 3 additional `audit_log` columns.

**Recommendation:** Add SCD2 growth note to Architecture Analysis. Verdict doesn't change but numbers should be accurate.

---

### O3. masterDataContext Missing from Several C2 Tables [MEDIUM]

**Tables WITH masterDataContext:** ts_timesheet_snapshots, ts_auto_lunch_runs, rev_cycle_snapshots, doc_contracts, inv_validation_runs

**Tables that reference master data but lack watermarking:**

| Table | Master Data Referenced | Why It Might Need Watermarking |
|-------|----------------------|-------------------------------|
| cal_manual_hours | employees (user_id), jobcodes (jobcode_id) | Low value — simple hour entries |
| rev_estimates | customers (customer_id) | Medium — estimates reference customer at creation time |
| proj_projects | customers, properties, jobcodes | Medium — project references at creation |
| chase_validation_sessions | employees (via cardLast4) | Low — ephemeral validation |
| ~~ts_timesheet_snapshots~~ | ~~employees (employee_id)~~ | **REMEDIED** — masterDataContext added in v2.21 |

**MDM doc says:** watermark "key" C2 tables. But doesn't explicitly document which tables were excluded and why.

**Recommendation:** Document the inclusion/exclusion criteria in BB_MDM_BEST_PRACTICES.md. Add `masterDataContext` to `ts_timesheet_snapshots` (it captures employee time data and would benefit from knowing which employee version was active).

---

### O4. No Documented SCD2 Query Patterns [MEDIUM]

The schema has SCD2 comments like:
```sql
-- Point-in-time query: WHERE id='EMP-002' AND valid_from <= $ts AND (valid_to IS NULL OR valid_to > $ts)
```

But there are no documented patterns for common operations:

| Operation | Query Pattern | Documented? |
|-----------|-------------|-------------|
| Get current record | `WHERE id = ? AND is_current = true` | Yes (inline) |
| Point-in-time lookup | `WHERE id = ? AND valid_from <= $ts AND (valid_to IS NULL OR valid_to > $ts)` | Yes (inline) |
| Get all versions of entity | `WHERE id = ? ORDER BY valid_from DESC` | No |
| Get what changed between versions | Join version N to N-1, diff fields | No |
| Reconstruct master data at transaction time | Join C2.masterDataContext with C1 SCD2 | No |
| Bridge sync: close old + insert new | BEGIN; UPDATE SET valid_to, is_current=false; INSERT new row; COMMIT | No |
| Delete entity (soft) | Set is_active=false on current version (not SCD2 close) | No |

**Recommendation:** Add a "SCD2 Query Cookbook" section to BB_MDM_BEST_PRACTICES.md or BB_PLATFORM_SCHEMA-v2.md.

---

### O5. MDM Doc Doesn't Mention context_map [MEDIUM]

BB_MDM_BEST_PRACTICES.md was written before the context_map pattern (v2.21). The doc discusses enrichment extensively but doesn't address:
- Multi-context enrichment fields
- How context_map interacts with audit trail (which context changed?)
- How context_map interacts with SCD2 (version bump when only one context's aliases change?)

**Recommendation:** Add a note in MDM doc Section 4 (Audit Trail) about auditing context_map changes with `fieldPath` like `enrichment.aliases.gs_receipts`.

---

### O6. No Property Enrichment Fields in Section 5 Seed Data [LOW]

Schema v2.21 Section 5 has seed data for employees (28 fields), customers (6), vendors (13), jobcodes (12) — but **no Section 5.5 for properties**. Property enrichment fields (tags, streetView, zillowUrl, redfinUrl, salesHistory, photos, notes) are documented inline in the table definition (Section 2.5) but not in the enrichment_fields registry seed data.

**Recommendation:** Add Section 5.5 "Property Enrichment Fields" to match the other entities.

---

## 3. EDGE CASES

### E1. SCD2 + Enrichment JSONB Duplication [HIGH]

When SCD2 creates a new version row, the **entire enrichment JSONB blob** is copied to the new row. If a vendor has 500 bytes of enrichment and only `aliases.chase` changes, the full 500 bytes is duplicated.

**Scale impact:** Negligible at BB size. A vendor with 12 enrichment fields and 3 alias contexts might be ~1 KB. Even 300 vendors x 10 versions x 1 KB = 3 MB over years. Not a problem.

**But the edge case is:** Should an enrichment-only change trigger an SCD2 version bump?

**Options:**
1. **Yes, always** — any change to any field (core or enrichment) creates a new SCD2 version. Simple, consistent, full history. (RECOMMENDED for BB's scale)
2. **No, enrichment changes don't version** — only QBO/QBT sync changes create SCD2 versions. Enrichment changes only go to audit_log. Less row growth but loses point-in-time enrichment reconstruction.
3. **Configurable per field** — over-engineered for BB.

**Not documented anywhere.** Need to add this decision to BB_MDM_BEST_PRACTICES.md.

---

### E2. trades Table Has No SCD2 [MEDIUM]

**MDM doc says:** "SCD2 on all Compartment 1 tables"
**Schema v2.21:** trades table does NOT have valid_from/valid_to/is_current columns.

This is actually **correct behavior** — trades is a static 39-row lookup table that rarely changes. SCD2 would be overkill.

**But the MDM doc's blanket statement is inaccurate.** SCD2 is on 6 of 7 C1 tables (employees, customers, vendors, work_jobcodes, properties, master_items). Trades is excluded.

**Recommendation:** Update MDM doc to say "SCD2 on all Compartment 1 entity tables (6 of 7 — trades excluded as static lookup)."

---

### E3. employeeVersion (integer) vs masterDataContext (JSONB) — Inconsistent Patterns [MEDIUM]

**cal_uploaded_timesheets** uses: `employeeVersion integer` (lightweight, single entity)
**ts_auto_lunch_runs, rev_cycle_snapshots, doc_contracts, inv_validation_runs** use: `masterDataContext jsonb` (full snapshot)

Two different watermarking patterns on C2 tables with no documented criteria for when to use which.

**Recommendation:** Document the decision criteria:
- **Use integer** when the transaction references exactly one master entity (e.g., one employee's timesheet upload)
- **Use JSONB** when the transaction involves multiple master entities (e.g., an auto-lunch run processing all employees)

---

## 4. STALE REFERENCES

### S1. Four Documents Reference Schema v2.18 [HIGH]

| Document | References | Current Schema |
|----------|-----------|----------------|
| BB_ARCHITECTURE_ANALYSIS.md v1.0 | "BB_PLATFORM_SCHEMA-v2.18" | v2.21 |
| BB_MDM_BEST_PRACTICES.md v1.0 | "Current Schema v2.18" | v2.21 |
| BB_DATA_MANAGER_SPEC.md v1.0 | "BB_PLATFORM_SCHEMA-v2.18" | v2.21 |
| BB_DB_STRATEGY.md v1.4 | (no version ref, but content matches ~v1-era) | v2.21 |

**Impact:** These documents cite table counts, field lists, and features that are now outdated. The schema has gained:
- v2.19: SCD2 columns, masterDataContext, sync_conflicts table, audit_log enhancements, survivorship rules
- v2.21: context_map field type, enrichment field types table

---

### S2. BB_DB_STRATEGY.md Is Massively Outdated [HIGH]

| Metric | DB_STRATEGY v1.4 | Schema v2.21 |
|--------|-------------------|-------------|
| Total tables | 19 | 39 |
| C1 tables | 4 (2 active + 2 deferred) | 7 |
| C2 tables | 10 | 26 |
| Infrastructure | 5 | 6 |
| Enrichment field types | 7 | 9 (added object, context_map) |
| SCD2 | Not mentioned | On 6 C1 tables |
| sync_conflicts | Not mentioned | Full table schema |
| Survivorship rules | Not mentioned | Documented |
| masterDataContext | Not mentioned | On 5 C2 tables + 1 integer watermark |

DB_STRATEGY is the foundational architecture document. It was the FIRST document written, and all others were derived from it. But it has not been updated to reflect the 11-app deep analysis (Schema v2) or the MDM additions (v2.19-v2.21).

**Recommendation:** DB_STRATEGY needs a v2.0 overhaul, or (simpler) add a note at the top: "Table definitions superseded by BB_PLATFORM_SCHEMA-v2.md. This document remains authoritative for: architecture decisions, Neon rationale, Drizzle rationale, connection pooling, pricing, infrastructure table Drizzle schemas."

---

### S3. BB_PLATFORM_SCHEMA.md (v1.0) Still Exists [LOW]

The v1 file (30 tables) still sits alongside v2 (39 tables). It could cause confusion — someone might read v1 thinking it's current.

**Recommendation:** Either delete v1, rename to `BB_PLATFORM_SCHEMA-ARCHIVED.md`, or add a prominent "SUPERSEDED" banner.

---

## 5. DOCUMENT HIERARCHY (Proposed)

To prevent future drift, establish clear authority:

```
BB_DB_STRATEGY.md          → Architecture decisions, WHY (Neon, Drizzle, compartments)
                               Authoritative for: technology choices, connection patterns, pricing
                               NOT authoritative for: table definitions, field lists

BB_PLATFORM_SCHEMA-v2.md   → Table definitions, WHAT (every table, column, index, seed data)
                               Authoritative for: all schema details, enrichment registry,
                               field types, phase rollout, table counts

BB_MDM_BEST_PRACTICES.md   → MDM patterns, HOW (SCD2, watermarking, survivorship, quality)
                               Authoritative for: MDM implementation patterns, gap analysis,
                               audit/lineage/governance rules

BB_ARCHITECTURE_ANALYSIS.md → Sizing & evaluation, FITS? (storage, costs, pros/cons)
                               Authoritative for: sizing calculations, risk assessment,
                               technology evaluation

BB_DATA_MANAGER_SPEC.md    → UI specification, LOOKS LIKE (screens, interactions, navigation)
                               Authoritative for: Data Manager UI design, screen inventory,
                               API endpoint inventory
```

When documents conflict, Schema v2 wins for table definitions, MDM doc wins for MDM patterns, DB_STRATEGY wins for architecture rationale.

---

## 6. RECOMMENDED FIXES (Priority Order)

### Priority 1 — Must Fix (breaks functionality)

| # | Fix | Document |
|---|-----|----------|
| 1 | Change qbo_id/qbt_id from `.unique()` to partial unique index `WHERE is_current = true` | BB_PLATFORM_SCHEMA-v2.md |
| 2 | Add ts_auto_note_runs to Section 8 count and DB-6 phase (total: 39) | BB_PLATFORM_SCHEMA-v2.md |
| 3 | Align sync_conflicts column names (MDM doc -> match Schema v2.21) | BB_MDM_BEST_PRACTICES.md |

### Priority 2 — Should Fix (alignment & completeness)

| # | Fix | Document |
|---|-----|----------|
| 4 | Add MDM UI features to Data Manager Spec (version history, conflicts, audit, quality) | BB_DATA_MANAGER_SPEC.md |
| 5 | Add SCD2 growth note to sizing analysis | BB_ARCHITECTURE_ANALYSIS.md |
| 6 | Document SCD2 query cookbook (common patterns) | BB_MDM_BEST_PRACTICES.md |
| 7 | Document enrichment change = SCD2 version bump decision | BB_MDM_BEST_PRACTICES.md |
| 8 | Document watermarking inclusion/exclusion criteria | BB_MDM_BEST_PRACTICES.md |
| 9 | Document integer vs JSONB watermark criteria | BB_MDM_BEST_PRACTICES.md |
| 10 | Add Section 5.5 Property Enrichment Fields to seed data | BB_PLATFORM_SCHEMA-v2.md |
| 11 | Fix "all C1 tables" to "6 of 7 C1 tables (trades excluded)" | BB_MDM_BEST_PRACTICES.md |
| 12 | Add context_map to MDM audit trail section | BB_MDM_BEST_PRACTICES.md |
| 13 | Add masterDataContext to ts_timesheet_snapshots | BB_PLATFORM_SCHEMA-v2.md |

### Priority 3 — Housekeeping (version refs & staleness)

| # | Fix | Document |
|---|-----|----------|
| 14 | Update version references to v2.21 | Architecture Analysis, MDM, Data Manager Spec |
| 15 | Add "superseded by Schema v2" banner to DB_STRATEGY | BB_DB_STRATEGY.md |
| 16 | Archive or mark v1 schema as superseded | BB_PLATFORM_SCHEMA.md |
| 17 | Update table counts to 39 (7 C1 + 26 C2 + 6 infra) and infrastructure counts (5->6) everywhere | All docs |

---

## 7. THINGS THAT ARE WELL-ALIGNED

Not everything is broken. These aspects are consistent across documents:

- Compartment 1 entity list (7 tables: employees, customers, vendors, work_jobcodes, properties, trades, master_items) — consistent in Schema v2, Architecture Analysis, MDM doc, Data Manager Spec
- Enrichment JSONB pattern (single column per entity, registry-governed) — consistent everywhere
- Neon + Drizzle technology choice — consistent, well-justified in DB_STRATEGY and Architecture Analysis
- 11-app inventory — consistent across Schema v2 and Data Manager Spec
- QBO/QBT source mapping (QBO for customers/vendors/employees, QBT for jobcodes/timesheets) — consistent
- Dual ID pattern (qbo_id + qbt_id on employees) — consistent
- App prefixing convention (cal_*, ts_*, rev_*, etc.) — consistent in Schema v2 and Data Manager Spec
- Infrastructure table Drizzle schemas — DB_STRATEGY Section 14 is authoritative and Schema v2 correctly defers to it
- Enrichment field seed data — Schema v2 Section 5 is comprehensive and consistent with inline JSONB schemas

---

## 8. THIRD-PASS FINDINGS (v1.2) — All Remedied

Third-pass audit with per-document verification agents. All findings fixed.

### Schema v2.21 → v2.22

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| S1 | CRITICAL | SCD2 + PK conflict: `id.primaryKey()` prevents INSERT of version rows with same id | Changed to composite PK `primaryKey({ columns: [table.id, table.version] })` on all 6 SCD2 tables |
| S2 | HIGH | change_source missing 'system' | Added 'system' to enum list |

### MDM Best Practices (8 fixes)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| M1 | CRITICAL | Partial unique index example on `table.id` (wrong column) | Changed to `table.qboId` / `table.qbtId` |
| M2 | CRITICAL | SCD2 says rows share same `id` with no PK solution | Added composite PK explanation |
| M3 | CRITICAL | Watermark INCLUDED count 5 (should be 6) | Moved cal_uploaded_timesheets to INCLUDED, count 5→6, EXCLUDED 20→19 |
| M4 | HIGH | change_source has 'migration' (not in schema) | Replaced with 'merge' |
| M5 | HIGH | SCD2 list omits master_items | Added master_items (6th table) |
| M6 | HIGH | Watermark criteria too narrow | Updated to "CREATE analytical snapshots or run automated processes" |
| M7 | HIGH | Priority 2 table missing ts_timesheet_snapshots | Added with masterDataContext |
| M8 | MEDIUM | Survivorship summary only covers 2 of 5 categories | Expanded to all 5 |

### Architecture Analysis (7 fixes)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| A1 | HIGH | App name `Chase_Exp` | Changed to `Chase_Validate` |
| A2 | MEDIUM | `app_subscriptions` in diagram | Changed to `app_field_subscriptions` |
| A3 | MEDIUM | "4 entity types" with enrichment | Changed to 5 |
| A4 | MEDIUM | "10 active apps" | Changed to "11 apps (9 with database tables)" |
| A5 | MEDIUM | Survivorship rules absent | Added reference |
| A6 | MEDIUM | MDM watermarking absent | Added reference |
| A7 | MEDIUM | DB-1 = 9 tables (wrong) | Fixed to 8 with breakdown |

### Data Manager Spec (4 fixes)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| D1 | HIGH | No enrichment_fields/app_field_subscriptions screen | Added Screen 24 (Enrichment Registry), total 23→24 |
| D2 | MEDIUM | Chase Exp. name | Changed to Chase Val. |
| D3 | MEDIUM | Company under MASTER DATA without note | Added "(stored in app_settings, not a C1 table)" |
| D4 | MEDIUM | context_map editor unclear if standalone | Added note: inline within entity panels |

### DB Strategy (6 fixes)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| DS1 | CRITICAL | C1 list has removed `accounts`, wrong `items`, missing 3 tables | Updated to all 7 C1 tables with v2.22 ref |
| DS2 | CRITICAL | Enrichment field types missing object + context_map (7→9) | Added both types at all 3 locations |
| DS3 | HIGH | sync_conflicts completely absent | Added to infrastructure list with v2.19 note |
| DS4 | HIGH | Section 14 only lists 4 of 7 C1 tables | Added note referencing v2.22 for properties/trades/master_items |
| DS5 | HIGH | No SCD2 mention anywhere | Added reference note after employee example |
| DS6 | MEDIUM | `items` table name throughout | Changed to `master_items` at 4 locations |

### Schema v1 (1 fix)

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| V1 | HIGH | Line 7 "authoritative reference" contradicts SUPERSEDED banner | Changed to "WAS the original reference" |

---

## 9. FOURTH-PASS FINDINGS (v1.3) — All Remedied

Final verification pass. Mostly stale version references from the v2.21→v2.22 bump.

| # | Doc | Severity | Finding | Fix |
|---|-----|----------|---------|-----|
| 1 | Schema v1 | HIGH | SUPERSEDED banner said v2.21 | Updated to v2.22 |
| 2 | MDM | HIGH | change_source line 210 missing 'system' | Added (now 6 values) |
| 3 | MDM | HIGH | Summary table only listed 4 of 6 watermarked tables | Added ts_timesheet_snapshots + cal_uploaded_timesheets |
| 4 | MDM | MEDIUM | 3x stale "v2.21" references | All → v2.22 |
| 5 | MDM | MEDIUM | "39th table" wording implied sync_conflicts was new | Reworded to "included in 39-table total" |
| 6 | Arch | CRITICAL | BB_Desktop_Relay not in 11-app list | Changed to Data_Manager |
| 7 | Arch | HIGH | 3x stale "v2.21" references | All → v2.22 |
| 8 | DM Spec | HIGH | "Chase Exp." in Per-App Summary table | Changed to Chase Val. |
| 9 | DM Spec | MEDIUM | Stale v2.21 reference | → v2.22 |
| 10 | DM Spec | MEDIUM | Cmd+K (Mac) on Windows | → Ctrl+K |
| 11 | DM Spec | MEDIUM | Enrichment Registry missing from sidebar | Added under SYSTEM |
| 12 | DB Strat | CRITICAL | Authority banner said v2.21 | → v2.22 |
| 13 | DB Strat | HIGH | 2x more stale v2.21 refs | → v2.22 |
| 14 | DB Strat | HIGH | Section 14 missing sync_conflicts schema | Added schema note with columns |
| 15 | DB Strat | HIGH | Section 19 cross-refs missing Schema v2 | Added BB_PLATFORM_SCHEMA-v2.md v2.22 |
| 16 | DB Strat | MEDIUM | SCD2 note missing composite PK mention | Added "(id, version)" |
| 17 | DB Strat | LOW | "Deferred" wording for master_items | → "Previously deferred, now defined" |

---

## 10. FIFTH-PASS: APPROACH B PIVOT (v1.4)

### The Problem

Passes 1-4 (Sections 1-9) operated under a **SCD2 (Slowly Changing Dimensions Type 2)** approach: every C1 table had `valid_from`, `valid_to`, `is_current` columns, composite PKs `(id, version)`, partial unique indexes, a `sync_conflicts` table, and `masterDataContext` JSONB watermarks on C2 tables. This was enterprise-grade MDM applied to a 20-person construction company.

**Critical insight:** SCD2 versioning was over-engineered for BB's scale. Core QBO/QBT fields (names, addresses, contact info) change rarely (~1-4x/year per entity). QBO provides SyncToken (optimistic lock counter) + MetaData.LastUpdatedTime + CDC (30-day lookback, current state only, no old values) — but **no field-level change history and no previous record versions via API**. QBT provides last_modified timestamps and timesheet change logs (UI only, not API). Neither system offers true version history accessible via API. The real value-add is BB's **enrichment data** — the fields QBO/QBT don't have (payRate, trade, aliases, schedules, etc.) — which changes frequently and needs point-in-time reconstruction. If core field history is ever needed, Bridge can capture old→new diffs at sync time.

### The Decision: Enrichment-First Architecture (Approach B)

Instead of versioning all C1 data with SCD2, BB now:
1. **Uses C1 as a simple cache** of QBO/QBT data (no SCD2, no row duplication)
2. **Versions only enrichment data** (the data BB owns that QBO/QBT doesn't have)
3. **Delegates survivorship** to Mini_API_Bridge at sync time (not in the DB layer)

### What Changed (v2.22 → v2.23)

| Removed (SCD2) | Replaced With (Enrichment-First) |
|----------------|----------------------------------|
| `valid_from`, `valid_to`, `is_current` on 6 C1 tables | (removed — C1 rows updated in place) |
| Composite PK `(id, version)` on 6 C1 tables | Simple `id.primaryKey()` restored |
| Partial unique indexes `WHERE is_current = true` | Standard `.unique()` constraints restored |
| `sync_conflicts` table (infrastructure) | `enrichment_history` table (field-level enrichment tracking) |
| `masterDataContext` JSONB on 5 C2 tables | `enrichmentSnapshotAt` timestamp on 6 C2 tables |
| `employeeVersion` integer on 1 C2 table | `enrichmentSnapshotAt` timestamp (same pattern as all others) |
| `master_data_version` + `field_path` on `audit_log` | (removed — `enrichment_history` covers field-level tracking) |
| Survivorship rules in database layer | Delegated to Mini_API_Bridge |
| SCD2 query patterns (point-in-time via valid_from/valid_to) | Enrichment history queries (point-in-time via enrichment_history.changed_at) |

### New Infrastructure: enrichment_history

Replaces `sync_conflicts` in the 39-table total (6 infra tables unchanged count):

```
enrichment_history: id, entity_type, entity_id, field_name, old_value (jsonb),
                    new_value (jsonb), enrichment_version, changed_by, changed_at
```

Indexes: `(entity_type, entity_id)`, `(entity_id, enrichment_version)`, `(changed_at)`

### New C1 Pattern: enrichment_version

All 6 entity C1 tables (employees, customers, vendors, work_jobcodes, properties, master_items) gain:
```typescript
enrichmentVersion: integer('enrichment_version').default(1),
```
Bumps by 1 on any enrichment change. No row duplication — record updated in place.

### New C2 Pattern: enrichmentSnapshotAt

All 6 watermarked C2 tables use a single consistent pattern:
```typescript
enrichmentSnapshotAt: timestamp('enrichment_snapshot_at', { withTimezone: true }).defaultNow(),
```

**Watermarked tables (6):** ts_timesheet_snapshots, ts_auto_lunch_runs, rev_cycle_snapshots, doc_contracts, cal_uploaded_timesheets, inv_validation_runs

Point-in-time reconstruction: `SELECT * FROM enrichment_history WHERE entity_id = ? AND changed_at <= (SELECT enrichment_snapshot_at FROM ... WHERE id = ?)`

### Earlier Findings Now MOOT

| Finding | Status | Why |
|---------|--------|-----|
| **C1** (SCD2 breaks unique constraints) | MOOT | SCD2 removed. Simple `.unique()` restored. No version rows. |
| **C2** (sync_conflicts column names differ) | MOOT | sync_conflicts table removed. Replaced by enrichment_history. |
| **O2** (Architecture sizing for SCD2 growth) | MOOT | No SCD2 growth. C1 stays at ~500-1,100 rows indefinitely. |
| **O3** (masterDataContext missing from C2 tables) | MOOT | Replaced by enrichmentSnapshotAt. All 6 watermarked tables use same pattern. |
| **O4** (No SCD2 query patterns) | MOOT | SCD2 removed. Enrichment query cookbook added to MDM doc. |
| **E1** (SCD2 + enrichment JSONB duplication) | MOOT | No SCD2 row duplication. Enrichment updated in place. |
| **E2** (trades has no SCD2) | MOOT | No C1 table has SCD2 anymore. |
| **E3** (employeeVersion vs masterDataContext inconsistency) | MOOT | Both replaced by single enrichmentSnapshotAt pattern. |

### Findings Still Valid

| Finding | Status | Notes |
|---------|--------|-------|
| **C3** (DB_STRATEGY C2 table names different) | VALID | DB_STRATEGY still has placeholder C2 names from pre-analysis era. Authority banner defers to Schema v2.23. |
| **C4** (ts_auto_note_runs missing from count) | REMEDIED | Fixed in v2.21. Still correct at 39 tables. |
| **C5** (Deployment phases differ) | VALID | DB_STRATEGY phases still differ but authority banner defers to Schema. |
| **O1** (Data Manager needs MDM UI) | UPDATED | Reframed: needs enrichment history panel, audit trail, data quality — NOT conflict resolution or SCD2 version timeline. |
| **O5** (MDM doc missing context_map) | REMEDIED | MDM doc v1.1 now covers context_map and its interaction with enrichment_history. |
| **O6** (No property enrichment fields in seed data) | REMEDIED | Section 5.5 added in v2.21. |
| **S1-S3** (Stale references) | REMEDIED | All docs now reference v2.23. |

### Documents Updated for Approach B

| Document | Version | Key Changes |
|----------|---------|-------------|
| **BB_PLATFORM_SCHEMA-v2.md** | v2.23 | Removed SCD2 from all C1 tables. Restored simple PK + .unique(). Added enrichment_version to 6 C1 tables. Replaced sync_conflicts with enrichment_history. Changed 6 C2 watermarks to enrichmentSnapshotAt. Simplified audit_log. Updated Section 4 (survivorship → Bridge). Updated Section 8 counts. Added v2.23 changelog. |
| **BB_MDM_BEST_PRACTICES.md** | v1.1 | Rewritten as "BB Enrichment & Data Quality Best Practices". Removed all SCD2 content. Added enrichment versioning strategy, enrichment_history patterns, enrichment query cookbook, Bridge sync delegation note. |
| **BB_ARCHITECTURE_ANALYSIS.md** | v1.1 | Updated sizing (no SCD2 row growth). enrichment_history in infra diagram. enrichmentSnapshotAt watermarks. Survivorship delegated to Bridge. |
| **BB_DATA_MANAGER_SPEC.md** | v1.1 | Version History → Enrichment History panel. Removed Conflict Resolution Queue. Removed "Conflicts" from sidebar. |
| **BB_DB_STRATEGY.md** | v1.4 | sync_conflicts → enrichment_history in infrastructure. SCD2 note → simple cache pattern note. v2.23 references. |
| **BB_PLATFORM_SCHEMA.md** | v1.0 | SUPERSEDED banner updated to v2.23 with enrichment-first description. |

### Why This Is Better for BB

| Concern | SCD2 (Old) | Enrichment-First (New) |
|---------|-----------|----------------------|
| **Complexity** | Composite PKs, partial indexes, version rows, close/reopen logic | Simple PKs, standard indexes, in-place updates |
| **C1 row growth** | ~3,000-5,000 rows over 3 years | ~500-1,100 rows forever |
| **Core field history** | Tracked in C1 (duplicated from QBO/QBT) | Not needed at BB's scale; Bridge can capture diffs at sync time if ever required |
| **Enrichment history** | Embedded in SCD2 rows (whole JSONB duplicated) | Field-level in enrichment_history (granular, efficient) |
| **Conflict resolution** | sync_conflicts table + UI queue | Bridge handles at sync time (no DB involvement) |
| **Point-in-time reconstruction** | Complex SCD2 joins | Simple timestamp query on enrichment_history |
| **Storage** | ~15-20 MB C1 over 3 years | ~2-5 MB C1 forever + <1 MB enrichment_history/year |

---

## 11. SIXTH-PASS: 14-DOCUMENT FULL AUDIT (v1.5)

### Scope Expansion

Passes 1-5 (Sections 1-10) audited 6 documents. This pass expanded scope to all 14 BB documentation files: the original 6 + BB_FIELD_STATS.md, BB_BRIDGE_SUPERSET_AUDIT.md, BB_QBO_QBT_FIELD_SUPERSET.md, BB_PLATFORM_READINESS_REPORT.md, BB_CALEXP5_SCHEMA.md, BB_SCHEMA_VERIFICATION_LOG.md, BB_PLATFORM_SCHEMA.md (v1.0), and BB_DataManager_Mockup.html.

### Contradictions Found and Fixed

| # | Severity | Finding | Fix Applied |
|---|----------|---------|-------------|
| A1 | HIGH | BB_FIELD_STATS.md: 10 QBO Employee fields marked NOT USED are actually BRIDGE PASSTHROUGH per BB_BRIDGE_SUPERSET_AUDIT.md | Updated counts: BRIDGE 28→38, NOT USED 286→276, utilization 22.9%→25.6%. Bumped to v1.1. |
| A2 | MEDIUM | BB_MDM_BEST_PRACTICES.md line 261: `Chase_Exp` in lineage diagram | Changed to `Chase_Validate` |
| A3 | HIGH | BB_DATA_MANAGER_SPEC.md says "Express + vanilla HTML/CSS/JS" but BB_PLATFORM_READINESS_REPORT.md Section 8 says "React 19 + Vite 6 + TanStack Table" | Aligned Readiness Report + DB_STRATEGY to vanilla stack (confirmed by BB_DataManager_Mockup.html which is vanilla HTML) |
| A4 | HIGH | BB_DB_STRATEGY.md C2 tables still use placeholder names (ts_time_entries, rev_invoices, rev_expenses, proj_estimates, proj_change_orders) | Replaced with all 26 current C2 table names from Schema v2.23 |
| A5 | HIGH | BB_PLATFORM_READINESS_REPORT.md + BB_CALEXP5_SCHEMA.md + BB_DB_STRATEGY.md reference `BB_PLATFORM_ARCHITECTURE.md v1.7` (older template file) | Changed all references to `BB_PLATFORM_SCHEMA-v2.md v2.23`. Added note about older file in TEMPLATES/. |
| A6 | MEDIUM | BB_ARCHITECTURE_ANALYSIS.md sizes enrichment_history at ~100/year (line 69) but Section 2.1 says ~500-1,000/year | Fixed infrastructure table to ~500-1,000/year, ~1 MB. Consistent with Section 2.1. |

### Omissions Documented

| # | Gap | Resolution |
|---|-----|-----------|
| B1 | No Bridge Phase 1 (DB-1) implementation plan | Created BB_IMPLEMENTATION_SPECS.md Section 1 |
| B2 | No Clerk integration spec | Created BB_IMPLEMENTATION_SPECS.md Section 2 |
| B3 | No QBO/QBT sync specification | Created BB_IMPLEMENTATION_SPECS.md Section 3 |
| B4 | No enrichment migration plan (JSON files → Neon) | Created BB_IMPLEMENTATION_SPECS.md Section 4 |
| B5 | BB_DataManager_Mockup.html not reviewed | Reviewed. Confirms vanilla HTML/CSS/JS stack. Used to resolve A3. |
| B6 | No monitoring/alerting strategy | Created BB_IMPLEMENTATION_SPECS.md Section 5 |
| B7 | Properties table source system logic undocumented | Created BB_IMPLEMENTATION_SPECS.md Section 6 |
| B8 | No backup/DR procedure | Created BB_IMPLEMENTATION_SPECS.md Section 7 |

### Documents Modified in v1.5

| Document | Changes |
|----------|---------|
| **BB_FIELD_STATS.md** | v1.0 → v1.1. Corrected utilization counts (A1). |
| **BB_MDM_BEST_PRACTICES.md** | Fixed Chase_Exp → Chase_Validate (A2). |
| **BB_PLATFORM_READINESS_REPORT.md** | Fixed DM tech stack to vanilla (A3). Fixed BB_PLATFORM_ARCHITECTURE.md refs (A5). Fixed DM1 scaffold action. |
| **BB_DB_STRATEGY.md** | Fixed C2 table names to match v2.23 (A4). Fixed ts_time_entries example (A4). Fixed BB_PLATFORM_ARCHITECTURE.md refs (A5). Fixed DM tech stack label (A3). Updated cross-references section. |
| **BB_CALEXP5_SCHEMA.md** | Fixed BB_PLATFORM_ARCHITECTURE.md ref (A5). |
| **BB_ARCHITECTURE_ANALYSIS.md** | Fixed enrichment_history estimate (A6). |
| **BB_IMPLEMENTATION_SPECS.md** | NEW — Created v1.0 covering gaps B1-B4, B6-B8. |

---

*Cross-references: BB_PLATFORM_SCHEMA-v2.md v2.23, BB_DB_STRATEGY.md v1.4, BB_ARCHITECTURE_ANALYSIS.md v1.1, BB_MDM_BEST_PRACTICES.md v1.1, BB_DATA_MANAGER_SPEC.md v1.1, BB_FIELD_STATS.md v1.1, BB_IMPLEMENTATION_SPECS.md v1.0*
