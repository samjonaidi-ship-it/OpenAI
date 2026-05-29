# Data Manager Merger Proposal v1
## BB_Data_Manager → BB_Micro_Bridge + ControlTower v2 | 2026-04-11

> **Forward reference (2026-04-11):** An execution plan now exists: [`CACHE_STRATEGY_IMPLEMENTATION_PLAN.md`](CACHE_STRATEGY_IMPLEMENTATION_PLAN.md) Phase 2. Read the plan for per-file sequencing. This proposal is the architectural source of truth; the plan is the execution document.

**This document describes the migration of BB_Data_Manager from a standalone local Express app into a module inside BB_Micro_Bridge, with its admin UI moving into the new standalone ControlTower v2 app.**

**This is a peer document to `PROJECTION_CACHE_STRATEGY_PROPOSAL.md` v3 and `CONTROLTOWER_STANDALONE_APP_SCOPE.md`. Read all three together.**

**Related:**
- `PROJECTION_CACHE_STRATEGY_PROPOSAL.md` v3 — the cache/freshness architecture this merger builds on
- `CONTROLTOWER_STANDALONE_APP_SCOPE.md` — the ControlTower v2 standalone app that hosts the Data Manager UI
- `SESSION_HANDOFF_2026-04-11.md` — cold-start briefing
- `DEEP_AUDIT_2026-04-11.md` — prior architecture audit
- `INCIDENTAL_FINDINGS_2026-04-11.md` — bugs found during investigation

---

## 0. The merger in one paragraph

**BB_Data_Manager is not an application — it's infrastructure that was developed locally before the bridge was ready to host it. Its server-side code (schema, sync-runner, admin routes) merges into the bridge as a new module. Its UI moves into the new standalone ControlTower v2 app as the "Data Manager" tab. The master data tables collapse from the current "raw upstream + JSONB enrichment sidecar" model into a single canonical table per entity, with a separate proposals history table recording the audit trail of every upstream change and admin decision. Dual-upstream reconciliation (QBO and QBT having different IDs for the same employee/vendor/customer) becomes a first-class concern — sync runs from both systems concurrently, and admins resolve matching conflicts through a ControlTower review queue. Admin edits to master data flow through the bridge's write-through response pattern from the cache strategy proposal, so enrichment updates are instantly visible to consumers. The net effect: one operator console (ControlTower v2), one bridge process doing everything, one canonical master data table per entity type, and full observability of both the automated sync and the manual enrichment workflow.**

---

## 1. What BB_Data_Manager is today

### 1.1 Current structure

Per my investigation of `C:\Users\samjo\Desktop\BB_Data_Manager`:

**Stack:** Express 4 server + vanilla HTML/CSS/JS frontend + Drizzle ORM + `@neondatabase/serverless`. Node 20+. Runs locally on port 3350. Not deployed to Railway.

**Server entry:** `src/server/server.js` — mounts route modules for employees, customers, vendors, jobcodes, properties, trades, master_items, company settings, sync-runner, and health.

**Schema ownership:** `src/db/schema.ts` — Drizzle schema definitions for 25+ tables in the `public` schema. This file is the canonical source of truth for the BB master data schema today. Tables include `employees`, `customers`, `vendors`, `jobcodes`, `properties`, `trades`, `master_items`, `company`, and operational tables like `cal_receipts`, `cal_assets`, etc.

**Sync runner:** `src/server/routes/sync-runner.js` — reads from the bridge (via `/api/qbo/*` endpoints) on a cron schedule, pulls upstream master data from QBO (and in some cases QBT via bridge passthrough), upserts into the `public.*` master tables, preserves admin enrichment stored in JSONB `enrichment` columns.

**Bridge fallback:** `src/server/bridge-fallback.js` — when Neon is unreachable, BB_Data_Manager's UI can still serve read-only data by proxying through the bridge. This is a clever resilience feature that becomes redundant when BB_Data_Manager is part of the bridge itself.

**Admin UI:** `src/public/js/*` — vanilla JS grid views for editing employees, customers, vendors, etc. `detail.js` shows per-entity detail panels with field-by-field enrichment forms. `app.js` handles layout, routing, and API calls to the server.

**Connection:** Currently connects to Neon as `neondb_owner` using `DATABASE_URL` environment variable. This is different from the bridge's runtime role (`bb_runtime_app`).

### 1.2 Current data model (the JSONB sidecar problem)

The existing schema stores admin enrichment in JSONB columns on the same row as upstream data:

```sql
public.employees (
  id UUID PRIMARY KEY,
  qbo_id TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  enrichment JSONB,                    -- admin-added fields
  enrichment_version INT,
  sync_source TEXT DEFAULT 'qbo',
  qbo_sync_token TEXT,
  qbo_last_updated TIMESTAMPTZ,
  synced_at TIMESTAMPTZ
)
```

**Problems with this model:**
1. **JSONB fields aren't queryable the same way columns are.** Filtering, indexing, foreign keys — all harder with JSONB.
2. **No separation between upstream-owned and admin-owned fields** at the schema level. A blind UPSERT from sync can wipe enrichment if the code isn't careful.
3. **Schema evolution is invisible.** Adding a new enrichment field doesn't require a migration — it just starts appearing in the JSONB — which means admin-added fields don't get type checking, column defaults, NOT NULL constraints, or any of the schema discipline that real columns provide.
4. **Cross-entity queries are harder.** Joining employees to customers where both have JSONB enrichment means parsing JSONB in SQL which is slow and brittle.
5. **It doesn't match the admin workflow.** Admin doesn't think "these fields are upstream, those are enrichment." Admin thinks "this is my employee record, every field is canonical, some came from QBO and I approved, others I typed." The data model should reflect that.

Per Sam's D18 answer: collapse to a single canonical table per entity, with every field being a column, and a separate proposals history table recording the audit trail. v2 of the cache strategy proposal was going to split into `public.employees` + `public.employee_enrichment` + views. That's rejected. v3 uses the single-table model described in section 2.

### 1.3 The dual-upstream reality (QBO + QBT have different IDs)

Per Sam's D20 answer, a previously-missed concern: the same person/entity can exist in both QBO and QBT with different IDs, and the master data must reconcile both.

**QBO Employee vs QBT User:**
- QBO's `Employee` entity has ID, given name, family name, email, phone, hire date, pay details, 1099 status, active flag
- QBT's `User` entity has id, first_name, last_name, email, payroll_id, pay_rate, group_id, mobile_number, username, active flag
- The same person exists as BOTH — a QBO Employee row (for payroll/HR) AND a QBT User row (for time tracking)
- **Nothing in Intuit automatically links them.** A human has to match them.

**QBO Vendor vs QBT jobcode / customer:**
- QBO Vendor represents a company that BB pays
- QBT's jobcode hierarchy represents what crew members clock time against — a project, a subcontractor, a customer billing category
- Some QBO vendors appear as QBT jobcodes. Some don't. The overlap is partial.

**QBO Customer vs QBT Customer:**
- Both systems have a `Customer` entity
- They're conceptually the same thing (who we bill) but IDs can drift because one side gets updated outside the other
- A customer created in QBO doesn't automatically appear in QBT unless admin syncs it

**Matching is done by fuzzy name + email + admin-curated aliases.** There's no authoritative key shared between systems.

**QBO side is fully webhook-covered for the master data entities we care about.** Per the verified Intuit webhook subscription list (see `PROJECTION_CACHE_STRATEGY_PROPOSAL.md` v3 section 3.2), QBO fires webhooks on Create / Update / Delete / Merge for `Customer`, `Vendor`, and `Employee` — meaning master data changes on the QBO side propagate to the bridge within seconds of the change. **QBT side has no webhooks**, so QBT-originated master data changes come via the 2-minute polling cadence from cache strategy v3 section 3.5. The dual-upstream reconciliation logic below handles both channels writing into the same canonical row.

**Implication for the master data schema:** every entity table needs BOTH upstream identifiers as nullable columns:

```sql
public.employees (
  id UUID PRIMARY KEY,
  qbo_employee_id TEXT UNIQUE NULL,  -- null if person is QBT-only
  qbt_user_id TEXT UNIQUE NULL,      -- null if person is QBO-only
  -- ...canonical fields
);
```

An employee can be QBO-only (office staff, maybe), QBT-only (1099 contractor using time tracking without payroll), or both (most crew). The master table is the canonical record of who this person is, regardless of which upstream systems track them.

**Matching logic is non-trivial.** The sync runner has to:
1. Pull from QBO → for each Employee, check if a master row already has `qbo_employee_id = X`. If yes, update. If no, look for a match by fuzzy name/email — if confident, link. If unsure, queue for admin review.
2. Pull from QBT → for each User, check if a master row already has `qbt_user_id = X`. If yes, update. If no, look for match — same logic.
3. When a match conflict or mismatch is detected, create a row in `public.master_data_proposals` with `status = 'pending'` awaiting admin resolution.

---

## 2. The revised schema (single-table canonical)

Per Sam's D18: one table per entity type, all fields canonical, separate proposals history table.

### 2.1 Employees (the template for all master data tables)

```sql
CREATE TABLE public.employees (
  -- Identity / cross-reference
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qbo_employee_id TEXT UNIQUE NULL,
  qbt_user_id TEXT UNIQUE NULL,

  -- Canonical person fields (admin-approved, may differ from raw upstream)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT NOT NULL,     -- preferred display (admin may override)
  email TEXT,                      -- canonical email
  phone TEXT,                      -- admin-normalized phone format
  role TEXT,                       -- 'lead', 'crew', 'office', 'admin', etc.
  trade_id UUID REFERENCES public.trades(id),  -- Normalized FK to public.trades (decided 2026-04-11). Admin-only.
  crew_id TEXT,                    -- which crew this person is on
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hire_date DATE,
  termination_date DATE,
  pay_rate NUMERIC(10,2),
  pay_type TEXT,                   -- 'hourly', 'salary', '1099'
  notes TEXT,                      -- admin notes

  -- Provenance + sync bookkeeping
  qbo_sync_token TEXT,
  qbt_sync_token TEXT,
  qbo_last_updated TIMESTAMPTZ,
  qbt_last_updated TIMESTAMPTZ,
  last_synced_from_qbo_at TIMESTAMPTZ,
  last_synced_from_qbt_at TIMESTAMPTZ,
  last_admin_approved_at TIMESTAMPTZ,
  last_admin_approved_by TEXT,     -- admin user who last approved a change

  -- Review state
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reasons JSONB,            -- {'phone': 'format_differs_from_upstream', 'email': 'upstream_changed'}

  -- Standard metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_qbo ON public.employees (qbo_employee_id) WHERE qbo_employee_id IS NOT NULL;
CREATE INDEX idx_employees_qbt ON public.employees (qbt_user_id) WHERE qbt_user_id IS NOT NULL;
CREATE INDEX idx_employees_needs_review ON public.employees (needs_review) WHERE needs_review = TRUE;
CREATE INDEX idx_employees_active ON public.employees (is_active) WHERE is_active = TRUE;
```

**Key design points:**
- Single row per canonical person, regardless of upstream source
- Both `qbo_employee_id` and `qbt_user_id` are nullable — handles QBO-only, QBT-only, and both cases
- Every business field is a real column with a type — no JSONB for data, only for structured metadata (`review_reasons`)
- Provenance columns track when each upstream source last touched this row
- `needs_review` flag is a queryable indicator for admin attention, indexed partial
- Admin approval history is in a separate table (see 2.4)

### 2.2 Vendors (same template, simpler)

```sql
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qbo_vendor_id TEXT UNIQUE NULL,
  qbt_customer_id TEXT UNIQUE NULL,  -- QBT jobcode customers that are also vendors

  -- Canonical fields
  display_name TEXT NOT NULL,
  legal_name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  is_1099 BOOLEAN DEFAULT FALSE,
  tax_id TEXT,
  primary_trade TEXT,
  default_expense_account TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Provenance
  qbo_sync_token TEXT,
  qbt_sync_token TEXT,
  qbo_last_updated TIMESTAMPTZ,
  qbt_last_updated TIMESTAMPTZ,
  last_synced_from_qbo_at TIMESTAMPTZ,
  last_synced_from_qbt_at TIMESTAMPTZ,
  last_admin_approved_at TIMESTAMPTZ,
  last_admin_approved_by TEXT,

  -- Review state
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reasons JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_qbo ON public.vendors (qbo_vendor_id) WHERE qbo_vendor_id IS NOT NULL;
CREATE INDEX idx_vendors_qbt ON public.vendors (qbt_customer_id) WHERE qbt_customer_id IS NOT NULL;
CREATE INDEX idx_vendors_needs_review ON public.vendors (needs_review) WHERE needs_review = TRUE;
CREATE INDEX idx_vendors_active ON public.vendors (is_active) WHERE is_active = TRUE;
```

### 2.3 Customers, Jobcodes, Items, Trades — same pattern

Each master data entity follows the same template:
- Nullable `qbo_*_id` and `qbt_*_id` cross-reference columns
- Canonical business fields as real columns
- Provenance columns for sync bookkeeping
- `needs_review` + `review_reasons` for admin queue
- Standard metadata

Specific tables to create/migrate:
- `public.customers` — QBO Customer + QBT Customer
- `public.jobcodes` — QBT Jobcode hierarchy (primary) + optional QBO Class linkage
- `public.items` — QBO Item (inventory, service, bundle)
- `public.trades` — BB-specific taxonomy of trades (mostly admin-managed, some from QBO Class)
- `public.master_items` — BB-specific construction line items (mostly admin-managed, with cost/labor/material breakdown)
- `public.properties` — BB-specific property records (not directly upstream; linked to QBO Customer via foreign key)

### 2.4 Proposals history table (the audit trail)

```sql
CREATE TABLE public.master_data_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,       -- 'employee' | 'vendor' | 'customer' | 'jobcode' | 'item'
  entity_id UUID NULL,             -- foreign key to canonical row, null if unlinked (new entity)
  source TEXT NOT NULL,            -- 'qbo_webhook' | 'qbo_cdc_poll' | 'qbt_poll' | 'admin_edit' | 'sync_initial'
  upstream_id TEXT,                -- the upstream ID this proposal refers to (qbo_employee_id, etc.)
  proposed_fields JSONB NOT NULL,  -- full field set as received from upstream or as entered by admin
  applied_fields JSONB,            -- what was actually applied (may differ if admin edited during review)
  status TEXT NOT NULL,            -- 'pending' | 'auto_applied' | 'admin_applied' | 'rejected' | 'conflict'
  review_reason TEXT,              -- 'format_differs' | 'field_conflict' | 'new_entity' | 'rejection_requested'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,                -- admin user or 'auto' if auto-applied
  metadata JSONB                   -- extensible for debug info
);

CREATE INDEX idx_proposals_pending ON public.master_data_proposals (status, created_at DESC) WHERE status = 'pending';
CREATE INDEX idx_proposals_entity ON public.master_data_proposals (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_proposals_source ON public.master_data_proposals (source, created_at DESC);
```

**How the proposal table gets used:**

**Auto-apply path (happy case):**
1. Sync pulls an Employee from QBO
2. Bridge finds the matching master row by `qbo_employee_id`
3. Compares QBO fields to current master fields
4. All differing fields are ones admin hasn't explicitly set (or the master value matches QBO's prior version)
5. Bridge updates the master row with QBO values
6. Bridge inserts a proposal row with `status = 'auto_applied'`, `source = 'qbo_webhook'`, `resolved_by = 'auto'`, `resolved_at = NOW()`
7. No admin action needed

**Needs-review path:**
1. Sync pulls an Employee from QBO
2. Bridge finds the matching master row
3. Compares — discovers that QBO's phone is "4155551234" but the master has admin-approved "(415) 555-1234"
4. Bridge does NOT update the phone on the master row
5. Bridge sets `public.employees.needs_review = TRUE`, `review_reasons = {"phone": "format_differs"}`
6. Bridge inserts a proposal row with `status = 'pending'`, `review_reason = 'format_differs'`, the QBO data in `proposed_fields`
7. ControlTower's Data Manager tab shows "1 pending review on employee Ross Bainbridge" in the queue
8. Admin opens the review, sees the conflict, decides:
   - **Accept upstream:** bridge applies QBO's version to the master row, updates the proposal to `status = 'admin_applied'`, clears the `needs_review` flag
   - **Reject:** bridge updates the proposal to `status = 'rejected'`, clears `needs_review` but keeps the master's value. The next sync will see the same conflict and create a new pending proposal (per Sam's Q3 answer — rejections don't stick)
   - **Edit:** admin types a different value (neither QBO's nor the current master value), bridge applies the edited value, proposal gets `status = 'admin_applied'` with `applied_fields` containing the edit

**Unlinked-entity path:**
1. Sync pulls a QBT User that doesn't match any existing master row
2. Fuzzy-match attempts using name + email
3. **Option A confidence threshold** (per Sam's Q3 on matching): if name+email match is high confidence (>90% score), auto-link — create master row with both `qbo_employee_id = null, qbt_user_id = X`, status `auto_applied`
4. If low confidence, queue as `pending` with `review_reason = 'new_entity'` — admin decides whether to link or create
5. Admin resolves via ControlTower UI

### 2.5 Migration from current schema

**Prerequisite:** the dual-schema cleanup from the cache strategy proposal (prerequisite 2.1) must be resolved first — dropping the `bb_runtime_app.trades` and `bb_runtime_app.master_items` shadows and schema-qualifying existing code to `public.*`.

**Migration steps (one PR):**

1. **Create new canonical tables.** `public.employees_v2`, `public.vendors_v2`, `public.customers_v2`, etc. The `_v2` suffix is temporary during migration; gets renamed at cutover.
2. **Create `public.master_data_proposals` table.**
3. **Backfill from current tables.** For each row in the current `public.employees`, INSERT into `public.employees_v2` with:
   - `qbo_employee_id` from current `qbo_id`
   - `qbt_user_id` — NULL initially (to be populated by next QBT sync)
   - Extract canonical fields from current columns + JSONB `enrichment`
   - `last_admin_approved_at` = `updated_at` if enrichment was applied; else NULL
4. **Run a reconciliation pass.** For each new master row, search for a matching QBT User by name/email and populate `qbt_user_id` if high-confidence match.
5. **Verify row counts and spot-check.** Admin reviews a handful of rows side-by-side to make sure nothing got lost in translation.
6. **Cut over.** Rename `employees` → `employees_old`, `employees_v2` → `employees`. Same for other tables. Old tables retained for 30 days as rollback target.
7. **Update bridge code** to read from new schema. Since the bridge is being extended in the same PR, this is a coordinated change.
8. **Update consumer apps** — most consumer apps read via bridge endpoints, not directly from Neon, so they don't need code changes. ProjExp5 (which has its own Express server calling the bridge) needs one-line changes to expect the new response shape if field names change.
9. **Archive old tables** after 30 days of stable operation.

Time: ~6 hours for migration scripts + ~2 hours for verification + spot-check.

---

## 3. Dual-upstream reconciliation logic

The heart of the sync runner under the merged architecture. This section specifies exactly how the bridge decides which upstream "wins" for which field, and when admin review is required.

### 3.1 Field ownership rules

For each canonical field on each entity, declare which upstream source owns it, or if both do:

**Employee field ownership:**

| Field | QBO owns | QBT owns | Admin-only | Notes |
|---|---|---|---|---|
| first_name | ✓ | ✓ (if QBO null) | — | QBO is primary; QBT fills in if QBO-only person |
| last_name | ✓ | ✓ (if QBO null) | — | Same |
| display_name | — | — | ✓ | Admin explicitly sets preferred display |
| email | ✓ | ✓ (if QBO null) | ✓ (override) | QBO primary; admin can override |
| phone | ✓ | ✓ | ✓ (override/format) | Both sources; admin resolves conflicts + normalizes format |
| role | — | — | ✓ | BB-specific, admin-only |
| trade_id | — | — | ✓ | BB-specific, admin-only. FK to public.trades (confirmed 2026-04-11). |
| crew_id | — | — | ✓ | BB-specific, admin-only |
| is_active | ✓ (if set) | ✓ (if set) | ✓ (override) | Either upstream can deactivate; admin can override |
| hire_date | ✓ | — | — | QBO only |
| termination_date | ✓ | — | — | QBO only |
| pay_rate | ✓ | ✓ | — | Both sources; need to pick which is primary |
| pay_type | ✓ | — | — | QBO only |
| notes | — | — | ✓ | Admin-only |

**Vendor field ownership:** similar breakdown, with QBO as primary for most fields and admin-only for BB-specific columns like `primary_trade`, `default_expense_account`, and `notes`.

**The field-ownership map lives in code**, in a new file `src/modules/data-manager/field-ownership.js`:

```js
export const EMPLOYEE_FIELD_OWNERSHIP = {
  first_name: { primary: 'qbo', fallback: 'qbt', admin_override: false },
  last_name: { primary: 'qbo', fallback: 'qbt', admin_override: false },
  display_name: { primary: 'admin_only', fallback: null, admin_override: true },
  email: { primary: 'qbo', fallback: 'qbt', admin_override: true },
  phone: { primary: 'qbo', fallback: 'qbt', admin_override: true, normalize: 'phone' },
  role: { primary: 'admin_only' },
  // ...
};
```

The sync logic consults this map to decide:
1. Whether an upstream change can auto-apply (primary source matches + no admin override set)
2. Whether a conflict with existing admin values blocks auto-apply (admin_override: true + current value differs)
3. Whether a field is admin-only and should ignore upstream entirely (primary: 'admin_only')

### 3.2 The sync flow

**When a QBO webhook fires for Employee 1234:**

1. Verify HMAC, dedupe by delivery_hash (existing bridge logic)
2. Fetch current QBO state via CDC `SELECT * FROM Employee WHERE Id = '1234'`
3. Look up master row by `qbo_employee_id = '1234'`
   - If found, proceed to merge
   - If not found, attempt fuzzy-match by name+email among existing master rows
     - High confidence → auto-link, populate `qbo_employee_id`, proceed to merge
     - Low confidence → create new master row with `qbo_employee_id = '1234'` and other fields from QBO, status `auto_applied` (new entity)
4. **Merge logic:**
   - For each field in the QBO entity:
     - Look up field ownership in `EMPLOYEE_FIELD_OWNERSHIP`
     - If `primary: 'admin_only'` → skip this field
     - If `admin_override: true` AND current master value differs from "prior QBO value" (i.e., admin has touched it) → queue as pending proposal, don't apply
     - Otherwise → apply directly, mark master row updated
5. Apply normalization rules (e.g., phone format) to admin-override fields
6. If any fields were applied, update `qbo_last_updated`, `qbo_sync_token`, `last_synced_from_qbo_at`
7. If any fields were queued, set `needs_review = TRUE` and `review_reasons`
8. Insert proposal row(s)
9. If row was changed, bump `cache_epoch:employees_domain`
10. Insert observability row in `bridge_freshness_events` with `event_type: 'webhook'`, affected_domains `['employees_domain']`

**When the QBT poll cron runs:**

Same logic as above but:
- Source is QBT `/users` endpoint with `modified_since` parameter
- Updates `qbt_user_id`, `qbt_sync_token`, `qbt_last_updated`, `last_synced_from_qbt_at`
- Field ownership map indicates which fields QBT can update vs. QBO-primary
- For QBT-only people (no matching QBO), creates master row with `qbo_employee_id = NULL`

**When admin edits via ControlTower:**

Consumer (ControlTower) sends `PUT /api/admin/master-data/employees/:id` through the bridge's write-through path (section 3.4 of cache strategy proposal).

Bridge:
1. Validates the edit
2. Applies to master row directly (admin writes bypass the field-ownership map — admin can override anything)
3. Updates `last_admin_approved_at` and `last_admin_approved_by`
4. Clears `needs_review` if all review_reasons are resolved
5. Inserts proposal row with `source: 'admin_edit'`, `status: 'admin_applied'`, `proposed_fields` and `applied_fields` equal
6. Returns write-through response with `_invalidates.updatedProjections[employees_domain]` containing the fresh row
7. ControlTower's UI updates instantly from the response

### 3.3 Matching confidence for unlinked entities

Per Sam's THIRD-set Q3 answer: Option A (automatic matching with admin override).

**Matching algorithm:**

```
For a new upstream entity without an existing master row:
1. Normalize name: lowercase, trim, strip punctuation
2. Normalize email: lowercase, trim
3. For each existing master row of the same entity type:
   a. Compare normalized name: exact match = 1.0, token-overlap = 0.0-0.9, nothing = 0.0
   b. Compare normalized email: exact match = 1.0, domain match = 0.3, nothing = 0.0
   c. Combined score: 0.6 * name_score + 0.4 * email_score
4. Pick highest-scoring candidate
5. If score >= 0.90 → auto-link, auto-apply
6. If score >= 0.70 → queue as pending with review_reason = 'likely_match', include candidate in metadata
7. If score < 0.70 → queue as pending with review_reason = 'new_entity', no suggested match
```

**The 0.90 and 0.70 thresholds are configurable.** They live in `bridge_entity_sync_config` under each entity type, so admin can tune based on observed accuracy.

**Admin tooling:** ControlTower's Data Manager tab shows pending matches with the suggested candidate and the confidence score. Admin can accept, reject (create new entity instead), or manually pick a different existing master row.

### 3.4 Alias tracking

When admin resolves a match, the alias gets recorded so future syncs don't re-trigger the review:

```sql
CREATE TABLE public.master_data_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL REFERENCES public.employees(id),  -- (or vendors, customers, etc.)
  alias_type TEXT NOT NULL,              -- 'qbo_name_variation' | 'qbt_name_variation' | 'email_alias' | 'explicit_link'
  alias_value TEXT NOT NULL,
  confidence NUMERIC(3,2),               -- 1.0 for explicit admin link, lower for learned
  created_by TEXT NOT NULL,              -- admin user or 'auto' for learned
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aliases_entity ON public.master_data_aliases (entity_type, entity_id);
CREATE INDEX idx_aliases_lookup ON public.master_data_aliases (entity_type, alias_type, alias_value);
```

**How aliases are used:**
- When sync runs and does fuzzy match, it first checks `master_data_aliases` for any exact matches on name or email variations
- Alias hits are high-confidence and skip the fuzzy score
- Admin can manually add aliases ("this vendor is also called 'HD Supply' on some receipts")
- Aliases prevent repeated review prompts for the same recurring upstream variation

**Note:** `master_data_aliases` is a separate table, not per-entity, because aliases are a cross-cutting concern used by the matching logic. A single table with `entity_type` discriminator is cleaner than N per-entity alias tables.

**Retention:** None — admin decisions are permanent and the table grows with every linking action. At BB's scale (100 users, thousands of entities) the row count should stay well under 1K in year 1 and under 10K in year 3. If row count ever exceeds 10K, revisit to add retention or archival.

---

## 4. ControlTower Data Manager tab specification

The UI for master data management lives in ControlTower v2 as a dedicated tab. Full ControlTower v2 spec is in `CONTROLTOWER_STANDALONE_APP_SCOPE.md`; this section focuses on the Data Manager tab specifically.

### 4.1 Tab navigation structure

```
ControlTower v2
├── Overview (existing)
├── Bridge Health (existing)
├── Freshness (new, from cache strategy v3)
├── Data Manager (new, from this proposal)
│   ├── Employees
│   ├── Vendors
│   ├── Customers
│   ├── Jobcodes
│   ├── Items
│   ├── Trades / Master Items
│   └── Review Queue
├── Observability (new, from cache strategy v3)
└── Settings
```

### 4.2 Entity list view (per entity type)

A data grid showing all rows of the selected entity type with:
- **Canonical fields displayed as columns** — first_name, last_name, email, phone, role, trade, active
- **Needs-review badge** — red dot on rows with `needs_review = TRUE`
- **Source indicators** — icons showing whether this entity has QBO, QBT, or both upstream links (📎 for QBO, ⏱ for QBT)
- **Last sync info** — small text showing "QBO synced 2m ago, QBT synced 45s ago"
- **Filter bar** — filter by active/inactive, trade, crew, needs-review, source (QBO-only / QBT-only / both)
- **Search** — by name, email, phone, notes
- **Sort** — by any column

**Bulk actions:** select multiple rows to perform bulk operations (bulk deactivate, bulk approve pending reviews, bulk assign trade, etc.).

### 4.3 Entity detail / edit view

Click on a row → detail panel opens showing:

**Header:**
- Canonical display name
- Last sync from each source with timestamps
- `needs_review` banner if applicable, listing review_reasons

**Field-by-field editor:**
Each field is a form input with:
- Current canonical value (editable)
- "Source" tooltip showing where the current value came from (QBO, QBT, admin-set, admin-override)
- "History" link that opens the proposal history for this specific field
- "Reset to upstream" button (if there's a pending proposal or if admin override is set) — reverts to QBO's or QBT's current value

**Change log panel (right side):**
Shows the 10 most recent proposals for this entity, each with:
- Source (QBO webhook, QBO CDC, QBT poll, admin edit)
- Timestamp
- Fields that were affected
- Status (auto_applied, admin_applied, rejected, pending)
- Resolved by

**Save button:** applies the admin's edits via `PUT /api/admin/master-data/employees/:id`, which goes through the bridge's write-through response path from cache strategy section 3.7. The UI gets updated projection data back instantly.

### 4.4 Review queue view

A dedicated sub-tab (and a badge on the main Data Manager tab showing pending count).

**Layout:**
- Left pane: list of pending proposals, sorted by detection time
- Right pane: detailed view of the selected proposal

**For each pending proposal:**
- Entity type and link to entity detail
- Source of the upstream change
- The conflict reason (format_differs, field_conflict, new_entity, etc.)
- Side-by-side field comparison: "Current master" vs. "QBO says" vs. "QBT says"
- Actions:
  - **Accept upstream** — apply QBO's (or QBT's) value to the master row
  - **Keep current** — reject the proposal, keep admin-approved value, record rejection in history
  - **Edit** — open a field editor to enter a custom value (neither upstream nor current), save that

**Bulk actions:** select multiple proposals, "accept all," "reject all."

**The queue is the admin's daily workflow.** When BB's admin opens ControlTower in the morning, they see:
- "12 new pending reviews" badge on Data Manager
- Click in → review queue
- Process each (typically auto-accept upstream, occasionally edit or reject)
- Clears the queue until next sync detects more changes

### 4.5 Bulk sync operations panel

A utility section for admin-initiated bulk syncs:
- "Full resync from QBO" — triggers a complete pull of all QBO entities, bypassing watermarks. Used after long Neon outages or initial setup.
- "Full resync from QBT" — same for QBT
- "Detect drift" — runs a comparison pass between master data and upstream for every entity, creates proposals for any discrepancies
- "Rebuild aliases" — clears `master_data_aliases` and re-runs fuzzy matching on all entities

Each operation shows a progress bar and writes observability rows to `bridge_freshness_events`. Admin can monitor progress in real time.

### 4.6 Matching assistance panel

Shows unlinked entities (QBO with no QBT counterpart, QBT with no QBO counterpart) and suggests possible matches:

- "5 QBO vendors have no QBT match" → list → admin can link each to an existing QBT customer or mark as QBO-only
- "2 QBT users have no QBO match" → list → admin can link each to an existing QBO employee or mark as QBT-only

This is the primary workflow for handling the dual-upstream reality described in section 1.3.

---

## 5. The merger implementation plan

### 5.1 Phase B0 — Prerequisites (Week 0, shared with cache strategy)

Same as cache strategy Phase 0. Dual-schema cleanup, operator reaper, etc.

### 5.2 Phase B1 — Schema migration (Week 1)

- Write migration `013_master_data_consolidation.sql` that creates the new `public.*_v2` tables
- Write backfill script that moves data from current tables to v2 tables, extracting JSONB enrichment into columns
- Create `public.master_data_proposals` and `public.master_data_aliases` tables
- Run on a Neon dev branch first, verify row counts and spot-check 20 rows per entity type
- Apply to production Neon via `psql` during a brief maintenance window
- Do NOT yet cut over reads — keep the bridge reading from old tables until code changes land

### 5.3 Phase B2 — Port BB_Data_Manager into the bridge (Weeks 1-3)

- Copy `BB_Data_Manager/src/server/routes/*` into bridge under `src/modules/data-manager/`
- Adapt route handlers to use bridge's Fastify patterns instead of Express
- Copy `BB_Data_Manager/src/db/schema.ts` into bridge as the authoritative schema (or port to bridge's migration format — TBD based on whether the bridge is going to adopt Drizzle)
- Port `sync-runner.js` into a bridge cron that runs per Sam's D19/D20 cadences
- Create new bridge routes: `/api/admin/master-data/*` for ControlTower to call
- Each write endpoint uses `afterQboWrite`-equivalent write-through pattern from cache strategy section 3.7
- Write tests for the dual-upstream reconciliation logic with synthetic QBO + QBT data

### 5.4 Phase B3 — Webhook integration (Week 2-3, overlapping B2)

- Extend the bridge's QBO webhook handler (`src/routes/qbo-change-v1.js`) to also update master data tables for webhook entities that are part of Population A (Employee, Customer, Vendor)
- Same handler, one more upsert stage — after `ingestCdcPayloadToProjections`, call `syncMasterDataFromQbo(entityType, entity)` for the same entity
- `syncMasterDataFromQbo` applies the field ownership rules from section 3.1
- Conflicts queue as proposals; auto-applicable changes apply directly
- Observability: each master data update writes to `bridge_freshness_events` with `event_type: 'master_sync'`

### 5.5 Phase B4 — Field ownership rules and proposal logic (Week 3-4)

- Implement `src/modules/data-manager/field-ownership.js` with rule maps for each entity
- Implement the merge logic in `src/modules/data-manager/sync-merge.js`
- Implement the fuzzy-matching logic in `src/modules/data-manager/entity-matcher.js`
- Implement the proposal management endpoints
- Tests: simulate a variety of conflict scenarios and verify the right fields get queued vs. auto-applied

### 5.6 Phase B5 — ControlTower Data Manager tab (Weeks 4-7, overlapping ControlTower v2)

Per `CONTROLTOWER_STANDALONE_APP_SCOPE.md`:
- Port existing BB_Data_Manager vanilla JS UI logic into React components
- Build the tab structure (entity list → detail → review queue → sync operations → matching assistance)
- Wire to new `/api/admin/master-data/*` bridge endpoints
- Use TanStack Query for cache management of list/detail/queue
- Write-through response handling for admin edits

### 5.7 Phase B6 — Cutover and deprecation (Weeks 7-8)

- Verify ControlTower v2 Data Manager tab is feature-complete against local BB_Data_Manager's capabilities
- Update bridge to read master data from new `_v2` tables
- Rename tables: `employees_old`, `employees_v2` → `employees`, etc.
- Deploy bridge update
- Announce cutover to admin(s); local BB_Data_Manager stays running as parallel fallback for 2-4 weeks
- After stable operation, archive the local BB_Data_Manager repo to a `_retired/` folder
- Update `CLAUDE.md` and related documentation to reflect the new architecture

### 5.8 Total timeline

~8 weeks of calendar time, overlapping heavily with cache strategy phases. ~40 engineering hours.

> **⚠ Note (2026-04-11):** this estimate is from the initial DM merger draft and reflects ONLY the merger work in isolation. The consolidated v3 execution estimate is ~399h / 13 weeks across all four architectural proposals combined — see `CACHE_STRATEGY_IMPLEMENTATION_PLAN.md` Phase 2 for the authoritative per-file breakdown of the DM merger work within the combined plan.

---

## 6. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Backfill script loses data during JSONB-to-columns extraction | Low | High | Dry-run on Neon branch, spot-check 20 rows per entity, retain old tables 30 days |
| Dual-upstream matching incorrectly auto-links different people with similar names | Medium | High | Confidence threshold tuning, admin-visible review queue, ability to unlink after the fact |
| Admin enrichment lost during sync merge if field ownership rules are wrong | Low | High | Comprehensive test suite with conflict scenarios, canary test in dev before production |
| Local BB_Data_Manager and new bridge-hosted Data Manager diverge during parallel operation | Medium | Medium | Clear communication to admin: "do enrichment in new ControlTower only during transition" |
| Webhook-driven master data updates race with admin edits | Low | Medium | Row-level lock on master data writes; first writer wins per cache strategy conflict handling |
| ControlTower v2 Data Manager tab isn't feature-complete at cutover time | Medium | Medium | Keep local BB_Data_Manager running in parallel until admin confirms feature parity |
| New master data schema doesn't meet a use case we haven't discovered | Low | Low | Schema evolution via additive migrations; columns can be added as needs emerge |

---

## 7. What this proposal does NOT solve

1. **Rules engine for format normalization** (Sam's Q2 on format normalization): admin normalizes phone numbers manually for v3. A rules engine that can learn and auto-apply normalization patterns is deferred.
2. **Drizzle migration path for the bridge**: the bridge doesn't currently use Drizzle. Whether to adopt Drizzle as the bridge's ORM is a larger architectural decision not covered here. For now, the bridge uses hand-written SQL in migrations and the `sql` tagged template for queries.
3. **Audit trail of admin login activity**: who logged into ControlTower and when. Part of the authentication story for ControlTower v2, covered there.
4. **Cross-tenant multi-company support**: the entire proposal assumes a single BB company (one QBO realm, one QBT account). Multi-tenant is a future initiative.
5. **Automated conflict resolution via ML**: using ML to learn admin preferences and auto-apply fields that historically get approved. Out of scope.
6. **Real-time collaboration on admin edits**: two admins editing the same master row simultaneously use the same SyncToken conflict handling from the cache strategy. No operational-transform-style merging.

---

## 8. Open questions (zero)

All design questions were resolved with Sam during the investigation. Implementation-specific questions (which entity gets migrated first, what the initial `bridge_entity_sync_config` seed looks like, etc.) belong in an `IMPLEMENTATION_PLAN.md` that follows this proposal.

---

## 9. What the next Claude instance should do with this doc

1. **Read section 0** — the merger in one paragraph.
2. **Read section 2** — the revised schema. Understanding the single-table canonical model is load-bearing for everything else.
3. **Read section 3** — the reconciliation logic. This is the most nuanced part of the merger and most likely to have hidden edge cases.
4. **Read section 5** — the implementation plan. Sequence matters.
5. **Cross-reference cache strategy v3 and ControlTower standalone scope.** They're peer documents. Don't implement in isolation.
6. **When ready to implement, write IMPLEMENTATION_PLAN.md.** Combined plan across all three proposals. Then Sam reviews. Then code.

---

**End of Data Manager Merger Proposal v1.**
