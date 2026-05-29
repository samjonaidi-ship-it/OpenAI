# BB Platform Architecture Analysis | v1.2 | 2026-03-15 | BB

> **Purpose:** Critical analysis of the current Neon Serverless Postgres + Drizzle ORM + Two-Compartment architecture plan, informed by the fully verified BB_PLATFORM_SCHEMA-v2.24 (21 waves, 500+ gaps resolved, all 11 apps at 3-zero).
>
> **Changelog v1.2 (2026-03-15):** Added Section 12 (Authentication Strategy). Replaced Clerk with two-phase lightweight auth: WebAuthn/Face ID + PIN for field crew (DB-2), Clerk deferred to DB-4+ for admin apps. Evaluated Neon Auth/Authorize — not recommended for BB's single-tenant architecture. Updated Supabase comparison note.

---

## 1. EXECUTIVE SUMMARY

**Verdict: The current architecture is well-suited for BB's needs. Proceed with confidence.**

The two-compartment model with Neon Serverless Postgres, Drizzle ORM, and enrichment JSONB is a strong fit for a small construction company's internal tool suite. The verified schema reveals a system that is surprisingly well-bounded — 39 tables, ~105 MB Year 1, ~500 master records, 11 apps (9 with database tables). There are no red flags that would justify a different database, ORM, or architectural approach. Below are the details.

---

## 2. SIZING ANALYSIS

### 2.1 Compartment 1: Shared Master Data (7 tables)

| Table | Est. Row Count | Enrichment Fields | JSONB Size/Row | Apps Reading | Apps Writing Enrichment |
|-------|---------------|-------------------|----------------|-------------|------------------------|
| `employees` | ~15-20 active, ~30 total | 28 fields (alias, payType, payRate, billRate, costRate, workSchedule×6, lunch×5, mileage×3, payPeriod×2, cardLast4, role, certs, etc.) | ~1.5 KB | 6 apps | 4 apps (Cal, TS, Rev, Chase) |
| `customers` | ~100-200 | 6 fields (preferredContact, referralSource, customerType, tags, revenueCategory, paymentTerms) | ~200 B | 4 apps | 2 apps (DocEngine, RevExp5) |
| `vendors` | ~150-300 | 12 fields (trade, license, isSub, inVendorsDir, autoTrade, keywords, aliases, _userEdited, defaultJobcode, receiptPatterns, chaseCategory, notes) | ~500 B avg, up to 5 KB for vendors with aliases | 5 apps | 4 apps (DocEngine, PorjExp5, GS_Receipts, Chase) |
| `work_jobcodes` | ~50-80 active, ~150 total | 12 fields (color, sortOrder, excludeFromProcessing, excludeReason, receiptAliases, propertyAddress, customerName, customerLastName, propertyId, revenueCategory, projectStatus, estimateNumber) | ~400 B | 5 apps | 4 apps (Cal, TS, GS_Receipts, RevExp5) |
| `properties` | ~100-200 | ~8 fields in enrichment (tags, notes, streetView, zillowUrl, redfinUrl, salesHistory, photos) | ~1 KB | 3 apps | 2 apps (DocEngine, PorjExp5) |
| `trades` | 39 (static lookup) | N/A | N/A | 2 apps | Manual |
| `master_items` | ~80-120 | N/A | N/A | 3 apps | Manual |

**Compartment 1 Totals:**
- **~600-1,100 rows** across all tables
- **~2-5 MB** total storage including enrichment JSONB and indexes
- **66 unique enrichment fields** across 5 entity types (employees, customers, vendors, work_jobcodes, properties)
- **Heaviest entity:** employees (28 enrichment fields, most apps dependent)

**Row Stability (Approach B — No SCD2):** C1 tables are a simple cache of QBO/QBT data + enrichment JSONB + enrichment_version integer. No composite PKs, no valid_from/valid_to/is_current columns. Core QBO/QBT fields (names, addresses, contact info) change rarely (~1-4x/year per entity) and don't justify SCD2 row duplication at BB's scale. Note: QBO/QBT provide SyncToken + LastUpdatedTime + CDC (30-day lookback) but **no field-level change history or previous record versions via API**. If core field history is ever needed, Bridge can capture old→new diffs at sync time. Enrichment changes (the data BB owns) are tracked in enrichment_history table (estimated ~500-1,000 rows/year). Row counts stay stable at ~500-1,100 rows with no version multiplication. Storage impact: ~1 MB/year for enrichment_history.

Total C1 stays at ~600-1,100 rows indefinitely. Storage: ~2-5 MB. Well within Neon free tier. Transaction watermarking: 6 C2 tables with enrichmentSnapshotAt timestamp for point-in-time enrichment reconstruction. Survivorship rules are handled by Mini_API_Bridge at sync time (not in the database layer).

### 2.2 Compartment 2: Per-App Working Data (26 tables)

| App | Tables | Est. Rows/Year | Est. Size/Year | Growth Pattern |
|-----|--------|---------------|----------------|----------------|
| **CalExp5** | 5 (manual_hours, selected_jobcodes, uploaded_timesheets, user_settings, audit_log) | ~5,000 manual hours + ~5,000 uploads + ~2,000 audit entries | ~6 MB | Linear (daily entries × employees) |
| **TS_Exp5** | 4 (timesheet_snapshots, auto_lunch_runs, auto_note_runs, timesheet_adjustments) | ~260 snapshots + ~26 AL runs + ~26 AN runs + ~100 adjustments | ~10 MB (AL entries JSONB is large) | Linear (biweekly × employees) |
| **RevExp5** | 2 (cycle_snapshots, estimates) | ~26 cycles + ~20 estimates | ~10 MB | Slow (biweekly cycles + occasional estimates) |
| **PorjExp5** | 3 (estimate_templates, projects, supplier_ignore_list) | ~20 templates + ~30 projects + ~50 ignored | ~15 MB (template items JSONB) | Slow (project-based) |
| **BB-DocEngine** | 3 (contracts, estimate_templates, qbo_notes_backup) | ~30 contracts + ~10 templates + ~200 backups | ~5 MB | Slow (contract-based) |
| **Invoice_Validate2** | 4 (validation_runs, validation_checks, receipt_matches, suppressions) | ~26 runs + ~520 checks + ~500 matches + ~50 suppressions | ~8 MB | Linear (biweekly) |
| **Chase_Validate** | 1 (validation_sessions) | ~50 sessions | ~5 MB (transactions JSONB) | Slow (weekly-ish) |
| **Adobe eSigner** | 3 (agreements, overlay_registry, signers) | ~30 agreements + ~15 overlays + ~5 signers | ~3 MB | Slow |
| **Landfill_Surcharge** | 1 (surcharge_calculations) | ~26 calculations | ~2 MB | Linear (biweekly) |
| **GS_Receipts** | 0 (stays in Google Sheets) | N/A | N/A | N/A |
| **Data_Manager** | 0 (infrastructure tables, not C2) | N/A | N/A | N/A |

**Compartment 2 Totals:**
- **26 tables** across 9 apps
- **~64 MB** Year 1 storage
- **Heaviest apps:** PorjExp5 (template JSONB), TS_Exp5 (AL entries JSONB), RevExp5 (cycle details JSONB)

### 2.3 Shared Infrastructure (6 tables)

| Table | Est. Rows | Est. Size |
|-------|----------|-----------|
| `enrichment_fields` | ~66 | <100 KB |
| `app_field_subscriptions` | ~120 | <100 KB |
| `app_settings` | ~40-50 categories | ~500 KB |
| `audit_log` | ~10,000/year | ~20 MB |
| `sync_log` | ~2,000/year | ~5 MB |
| `enrichment_history` | ~500-1,000/year | ~1 MB |

### 2.4 Grand Total

| Category | Tables | Year 1 Size |
|----------|--------|-------------|
| Compartment 1 | 7 | ~5 MB |
| Compartment 2 | 26 | ~64 MB |
| Infrastructure | 6 | ~27 MB |
| Indexes | — | ~15 MB |
| **TOTAL** | **39** | **~105 MB** |

**Neon Free Tier:** 0.5 GB (512 MB). BB uses ~105 MB Year 1. **Comfortable at ~20% capacity.** Even projecting 3 years with growth, BB stays under 300 MB — well within free tier.

---

## 3. COMPARTMENT 1 ANALYSIS (Shared Master Data + Enrichment)

### Strengths

1. **Clean entity boundaries.** The heatmap shows clear ownership: employees are Cal/TS/Rev territory, customers are DocEngine/PorjExp5/Rev territory, vendors are DocEngine/PorjExp5/GS/Chase territory. No table is a "junk drawer" — each has a clear QBO/QBT source and well-defined consumers.

2. **Enrichment superset eliminates data silos.** Before: Sam opens TS_Exp5 to set payRate, CalExp5 to set crew, RevExp5 to set costRate — three separate UIs for one employee. After: Data Manager shows ALL 28 fields in one view. This is a genuine workflow improvement.

3. **"Define, not migrate" for new fields.** Adding a new enrichment field (e.g., `preferredLanguage` for an employee) requires zero schema migration, zero code deployment. Insert a row in `enrichment_fields`, optionally subscribe apps, populate via Data Manager. This is extremely low-friction for a small operation.

4. **QBO/QBT sync separation is correct.** Typed columns are QBO-owned (synced every 15 min). Enrichment is Sam-owned (never touched by sync). This prevents data conflicts between external sync and internal enrichment — a real problem with naive designs. Survivorship rules are handled by Mini_API_Bridge at sync time (not in the database layer).

### Concerns

1. **Employee enrichment is heavy (28 fields).** Most of those fields are TS_Exp5-specific (workSchedule, lunch, mileage — 18 of 28 fields). If TS_Exp5 were ever rewritten or replaced, those 18 fields become dead weight. **Mitigation:** The archival system (is_archived flag) handles this cleanly. Low risk.

2. **Vendor aliases JSONB could grow.** GS_Receipts aliases are a keyed lookup object (`{ "HOME DEPO": "Home Depot", "HD": "Home Depot" }`). For vendors with many aliases, this blob could reach 5-10 KB. **Mitigation:** At BB's scale (<300 vendors), this is negligible. A vendor with 50 aliases = ~2 KB.

3. **No database-level JSONB validation.** Enrichment is validated at the app/Bridge layer via the registry, not by Postgres CHECK constraints. A bug in the Bridge could write malformed enrichment. **Mitigation:** Acceptable risk at BB's scale. The audit_log captures old_value/new_value for recovery. Adding `pg_jsonschema` extension later is an option if needed.

### Verdict: Compartment 1 is well-designed. No changes recommended.

---

## 4. COMPARTMENT 2 ANALYSIS (Per-App Working Data)

### Strengths

1. **Consistent naming convention** (`cal_*`, `ts_*`, `rev_*`, etc.) makes the schema self-documenting. Any developer (or Claude) can instantly identify which app owns which table.

2. **JSONB `details` columns are used appropriately.** Complex nested data (AL entries, cycle breakdowns, transaction arrays) goes in JSONB. Simple fields (dates, statuses, counts) get typed columns. This is the right balance — not everything is JSONB, not everything is normalized.

3. **Cross-app FKs are clean.** The contract lifecycle (PorjExp5 → RevExp5 → DocEngine → eSigner) uses proper FK references (`doc_contracts.estimateId → rev_estimates.id`, `esign_agreements.contractId → doc_contracts.id`). This enables cross-app queries that were impossible with JSON files.

4. **"Forward-looking" tables are clearly marked.** inv_* and lf_* tables are documented as forward-looking — the current code doesn't write to them yet. This avoids confusion during DB-7/DB-8 implementation.

### Concerns

1. **TS auto_lunch_runs entries JSONB can be large.** Each AL run may have 30+ entries with full payload/curl/correction data. At ~500 bytes per entry × 30 entries = ~15 KB per run × 26 runs/year = ~390 KB/year just for entries JSONB. Still small, but this is the largest JSONB blob in the system. **Mitigation:** Acceptable. Even 10 years of data = <4 MB. Consider archiving old runs after 2 years if needed.

2. **CalExp5 audit_log could grow unbounded.** The localStorage version caps at 2,000 entries with 365-day retention. The Neon version has no documented retention policy. **Recommendation:** Add a cron job or retention policy to prune `cal_audit_log` rows older than 2 years, consistent with the localStorage precedent.

3. **Chase transactions JSONB is denormalized.** Each session stores ALL transactions as a JSONB array rather than individual rows. This works for read-all-or-nothing access patterns but makes queries like "find all Home Depot transactions in January" require JSONB array scanning. **Mitigation:** At ~50 sessions/year with ~20 transactions each, full-table scan on JSONB is still sub-millisecond. Only worth normalizing if Chase grows to thousands of sessions — unlikely.

4. **PorjExp5 and DocEngine have SEPARATE estimate_templates tables** (`proj_estimate_templates` and `doc_estimate_templates`). They share the same item schema structure. Could these be unified? **Analysis:** They serve different purposes — PorjExp5 templates are for Gantt/scheduling (with `milestones`, `payments`), DocEngine templates are for binder assembly (with `sections`). The overlap is in item structure, not in purpose. Keeping them separate is correct.

### Verdict: Compartment 2 is well-designed. Minor housekeeping recommendations (audit retention, monitoring JSONB growth) but no structural changes needed.

---

## 5. NEON SERVERLESS POSTGRES EVALUATION

### Why Neon is RIGHT for BB

| Factor | Assessment |
|--------|-----------|
| **Scale-to-zero** | BB's apps are used during business hours (7am-6pm). That's ~11 hours of potential compute out of 24. Neon costs $0 during the other 13 hours + weekends. Railway Postgres would charge 24/7 for the same workload. |
| **Data volume** | ~105 MB Year 1. Neon Free Tier = 512 MB. BB fits 4x over. Even at Year 5 with aggressive growth, BB stays under 500 MB. |
| **Concurrent connections** | Sam + 10-12 crew using CalExp5 + maybe 2-3 apps open simultaneously = ~15 max connections. Neon's built-in pooler handles this trivially. |
| **Branching** | Test schema migrations against production data without risk. For a one-person dev team (Claude), this eliminates "I hope this migration doesn't break prod" anxiety. |
| **Cost** | $0/month for likely 1-2 years. Then $19/month (Launch) when storage crosses 500 MB or compute hours exceed 100. Compared to Railway Postgres at ~$5-10/month from day 1. |
| **Reliability** | Neon is a managed service independent of Railway. If Railway goes down, the database is still accessible. Local dev can connect directly to Neon. |

### Potential Issues

| Concern | Severity | Analysis |
|---------|----------|----------|
| **Cold start latency** | Low | ~500ms-2s after 5-min idle. First morning query may be slightly slow. Sam and crew won't notice a 1-second delay on the first CalExp5 load. Can add a health-check cron during business hours if needed. |
| **PgBouncer transaction mode** | Low | No LISTEN/NOTIFY, no session-level state. BB doesn't need these. Drizzle prepared statements need testing, but standard queries will work fine. |
| **Free tier PITR = 6 hours** | Medium | If corruption happens at 3am and isn't noticed until 9am, 6-hour PITR isn't enough. **Recommendation:** Move to Launch ($19/mo) once in production to get 7-day PITR. Or implement nightly `pg_dump` to a file as insurance. |
| **pg_stat_statements wipe** | Low | Stats are lost on scale-to-zero. Not critical for BB — this matters for performance tuning at scale, which BB doesn't need. |
| **Vendor lock-in** | Low | Neon is standard Postgres. Migration to any Postgres host (Railway, Supabase, RDS, self-hosted) is a `pg_dump` + `pg_restore` + change `DATABASE_URL`. Drizzle works with any Postgres driver. |

### Alternative Databases: Would Any Be Better?

| Alternative | Verdict |
|-------------|---------|
| **SQLite (local file)** | Eliminates network latency entirely. But: no multi-user access, no cloud backup, no branching, no cross-device access. BB has 10-12 crew using CalExp5 — SQLite is a non-starter for multi-user. |
| **Supabase** | More features (Auth, Storage, Realtime) but BB doesn't need BaaS overhead. Supabase doesn't scale-to-zero. $25/mo Pro tier vs Neon's $0. Over-provisioned for BB. |
| **PlanetScale (MySQL)** | MySQL, not Postgres. Would require rewriting all Drizzle schemas. No advantage over Neon for BB's use case. Also, PlanetScale removed their free tier. |
| **Railway Postgres** | No scale-to-zero, no branching, no PITR, no connection pooler. Cheaper if BB needed always-on compute, but BB doesn't. |
| **Turso (SQLite edge)** | Interesting for edge-first apps, but BB's architecture is Bridge-centric (all apps go through one Express API). Edge distribution doesn't help when there's a single Bridge server. |
| **MongoDB** | Document DB would eliminate the enrichment JSONB pattern (everything would be documents). But: BB's data is fundamentally relational (employees → jobcodes → timesheets → uploads). MongoDB would add complexity without benefit. |

### Verdict: Neon is the right choice. No alternative offers a better fit for BB's specific combination of: small data, intermittent usage, multi-user, relational data, and budget sensitivity.

---

## 6. ENRICHMENT JSONB PATTERN EVALUATION

### The Pattern

Each Compartment 1 entity (employees, customers, vendors, work_jobcodes, properties) has:
- **Typed columns** for QBO/QBT-synced fields (identity, address, status)
- **One `enrichment` JSONB column** for app-managed fields (pay rates, crew assignments, aliases)
- **A registry table** (`enrichment_fields`) defining what can go in the JSONB
- **A subscription table** (`app_field_subscriptions`) defining which apps can read/write which fields

### Pros

1. **Zero-migration field addition.** Adding `preferredLanguage` to employees = one INSERT into `enrichment_fields`. No `ALTER TABLE`, no Drizzle migration, no app redeployment. For a system with 66 enrichment fields and counting, this saves significant migration overhead.

2. **Single source of truth for all app-specific metadata.** Today, CalExp5 has its own crew color data, TS_Exp5 has its own pay rate data, RevExp5 has its own cost rate data — all for the same employee, stored in different JSON files. Consolidating into one enrichment blob per employee eliminates redundancy.

3. **Graduated promotion path.** If `payRate` becomes heavily queried and needs an index, promote it to a typed column with `ALTER TABLE employees ADD COLUMN pay_rate`. Keep the enrichment copy for backward compat. Clean migration path.

4. **Audit-friendly.** The audit_log captures old_value/new_value for enrichment changes. Combined with the registry defining field metadata (type, options), this gives full traceability.

### Cons

1. **No database-level validation.** Postgres doesn't validate JSONB structure against a schema. A bug could write `"payRate": "not a number"` and Postgres would accept it. **Mitigation:** Bridge validates via registry before writing. Acceptable at BB's trust boundary (all writes go through Bridge). **Risk level:** Low.

2. **No JSONB sub-field indexes by default.** Queries like `WHERE enrichment->>'cardLast4' = '2145'` require a full table scan unless you add a GIN index. The schema already adds one for `cardLast4` (Chase reverse lookup). **Mitigation:** At <50 employees, full scan is sub-millisecond anyway. Add GIN indexes as needed. **Risk level:** Very low.

3. **Enrichment blob could become opaque.** With 28 fields on employees, the JSONB is a large blob that's hard to inspect in a SQL client. `SELECT enrichment FROM employees WHERE id = 'EMP-001'` returns a wall of JSON. **Mitigation:** Data Manager UI is the intended interface, not raw SQL. For debugging, `SELECT enrichment->>'payRate' FROM employees` works fine. **Risk level:** Low (cosmetic).

4. **All-or-nothing reads.** When CalExp5 fetches an employee, it gets ALL 28 enrichment fields even though it only needs `defaultCrew` and `scheduleColor`. Wasteful? **Mitigation:** At ~1.5 KB per enrichment blob × 20 employees = 30 KB. Negligible bandwidth. The Bridge's `?app=calexp5` filter can strip fields server-side if needed. **Risk level:** Negligible.

### Alternative Patterns Considered

| Pattern | Why NOT for BB |
|---------|----------------|
| **EAV (Entity-Attribute-Value)** | More normalized but much slower for reads. Fetching 28 fields = 28 rows joined. JSONB is better for read-heavy, write-light enrichment. |
| **Per-app enrichment columns** | `employees.cal_enrichment`, `employees.ts_enrichment`, etc. Isolates apps but prevents cross-app visibility. Defeats the "superset" concept. |
| **Normalized sub-tables** | `employee_compensation`, `employee_schedule`, `employee_mileage`. More relational, but: 18 tables instead of 1 JSONB column. Migration nightmare. Over-normalized for ~20 employees. |
| **JSONB with JSON Schema validation** | `pg_jsonschema` extension can validate JSONB against a JSON Schema. Neon may not support this extension. Would require maintaining schemas in two places (Drizzle + JSON Schema). Bridge validation is sufficient. |

### Verdict: The enrichment JSONB pattern is appropriate. The tradeoffs (no DB-level validation, no sub-field indexes, opaque blobs) are all manageable at BB's scale. The benefits (zero-migration field addition, single source of truth, graduated promotion) outweigh the costs.

---

## 7. TWO-COMPARTMENT MODEL ASSESSMENT

### The Model

```
┌─────────────────────────────────────────┐
│          COMPARTMENT 1                   │
│    Shared Master Data + Enrichment       │
│                                          │
│  employees │ customers │ vendors         │
│  jobcodes  │ properties│ trades          │
│  master_items                            │
│                                          │
│  QBO/QBT-synced ←→ App-enriched          │
│  READ by all apps │ WRITE by owners      │
└─────────────────────────────────────────┘
           ↕ FK references ↕
┌─────────────────────────────────────────┐
│          COMPARTMENT 2                   │
│     Per-App Working Data                 │
│                                          │
│  cal_*  │ ts_*  │ rev_*  │ proj_*       │
│  doc_*  │ inv_* │ chase_*│ esign_*      │
│  lf_*   │                                │
│                                          │
│  OWNED by individual apps                │
│  References C1 via FKs                   │
└─────────────────────────────────────────┘
           ↕ metadata ↕
┌─────────────────────────────────────────┐
│     SHARED INFRASTRUCTURE               │
│  enrichment_fields │ app_settings       │
│  app_field_subscriptions │ audit_log    │
│  sync_log     │ enrichment_history  │
└─────────────────────────────────────────┘
```

### Strengths

1. **Clean separation of concerns.** Master data (what) is separate from working data (how apps use it). An employee's identity (name, QBO ID) is Compartment 1. How CalExp5 tracks that employee's hours is Compartment 2. This is textbook good schema design.

2. **Eliminates data duplication.** Today, PorjExp5 and DocEngine maintain IDENTICAL copies of `db/clients.json`, `db/properties.json`, `db/subs.json`, `db/trades.json`, and `db/master-items.json`. After migration, they share one set of Compartment 1 tables. One update propagates to both apps instantly.

3. **Cross-app queries become possible.** "Show me all contracts for customers who have an active RevExp5 estimate" is now a simple JOIN: `doc_contracts JOIN rev_estimates ON doc_contracts.estimateId = rev_estimates.id`. Impossible with JSON files.

4. **App isolation is maintained.** CalExp5 can't accidentally corrupt TS_Exp5's data — they have different table prefixes and separate app logic. An app can only write to its own Compartment 2 tables.

5. **Clear migration path per app.** The 8-phase deployment (DB-1 through DB-8) lets each app migrate independently. CalExp5 can be on Neon while TS_Exp5 is still on JSON files. Dual-write with feature flags enables safe rollback.

### Concerns

1. **PorjExp5 and DocEngine share Compartment 1 heavily.** Both apps write to customers, vendors, and properties. If PorjExp5 updates a vendor's trade while DocEngine updates the same vendor's keywords simultaneously, there could be a write conflict on the enrichment JSONB. **Mitigation:** This is currently impossible — PorjExp5 and DocEngine are desktop tools used by Sam sequentially, not concurrently. If this changes (e.g., multi-user), the Bridge should implement optimistic locking via the `version` column.

2. **The Bridge is a single point of failure.** All 11 apps go through one Express server on Railway. Bridge down = all apps lose Neon access. **Mitigation:** Railway auto-restarts crashed services. Apps can cache recent reads for read-only mode. The Bridge is a simple Express server with no complex state — restart time is ~5 seconds.

3. **8-phase deployment is a long journey.** DB-1 through DB-8 could take 6-12 months of progressive migration. During this time, some apps will be on Neon while others are on JSON files. The system will be in a hybrid state. **Mitigation:** This is by design — phased migration reduces risk. Each phase is independently valuable (DB-1 alone gives CalExp5 multi-user). The hybrid state is manageable because apps are independent.

4. **No schema enforcement across compartments.** Nothing in Postgres prevents CalExp5 from writing to `ts_*` tables if the Bridge endpoint is misconfigured. **Mitigation:** Use Postgres ROLE-based access control (create `calexp5_role` with only `cal_*` permissions) or enforce at the Bridge routing layer. Low priority given the single-developer team.

### Verdict: The two-compartment model is architecturally sound. The separation is clean, the migration path is clear, and the concerns are all manageable.

---

## 8. DRIZZLE ORM ASSESSMENT

### Why Drizzle Works for BB

1. **TypeScript-native schema.** The schema IS the code. No `.prisma` file, no separate SDL. Claude writes the schema in TypeScript, gets type inference automatically. For a team where Claude writes all code, this is ideal.

2. **Tiny bundle.** ~7 KB min+gzip. No Rust engine (Prisma), no heavy runtime. Important for serverless cold starts and Railway container size.

3. **First-class JSONB.** `jsonb('enrichment').default({})` just works. Drizzle's JSONB support is critical for the enrichment pattern. No serialization hacks needed.

4. **SQL-transparent.** Drizzle queries look like SQL. `db.select().from(employees).where(eq(employees.isActive, true))` reads naturally. When debugging, you see the SQL, not an abstraction layer.

5. **Migration safety.** `drizzle-kit` generates SQL migration files that can be reviewed before applying. With `strict: true`, column renames are detected (not treated as drop+add). Combined with Neon branching, migrations are very safe.

### Concerns

| Concern | Severity | Notes |
|---------|----------|-------|
| Drizzle is younger than Prisma | Low | v0.28+ is stable. Active development, strong community. BB's queries are simple CRUD — no exotic ORM features needed. |
| `strict: true` must be enforced | Medium | Without it, a column rename could be interpreted as drop+add, losing data. Document as a hard rule in project standards. |
| JSONB type safety is partial | Low | TypeScript types from Drizzle don't enforce JSONB sub-field types at compile time. You get `unknown` or a manually-typed interface. Acceptable — Bridge validates at runtime. |

### Verdict: Drizzle is the right ORM. No reason to consider Prisma or Knex.

---

## 9. DEPLOYMENT PLAN ASSESSMENT (DB-1 through DB-8)

### Current Plan

| Phase | Focus | Tables | Complexity |
|-------|-------|--------|-----------|
| DB-1 | Bridge + Auth + Master Data | 8 (employees + work_jobcodes + 6 infra) | High (foundation) |
| DB-2 | CalExp5 migration | 5 | Medium (first app) |
| DB-3 | Data Manager UI | 0 (registry population) | High (new UI) |
| DB-4 | DocEngine + PorjExp5 | 11 | High (shared data, most tables) |
| DB-5 | RevExp5 | 2 | Low |
| DB-6 | TS_Exp5 | 4 | Medium (complex JSONB) |
| DB-7 | InvVal2 + Chase | 5 | Medium (chrome extensions) |
| DB-8 | eSigner + Landfill | 4 | Low |

### Analysis

**DB-1 is critical path.** Everything depends on the Bridge connecting to Neon and the master data tables existing. QBO/QBT sync must work before any app can migrate. This phase should be the most carefully tested.

**DB-2 (CalExp5) is the right first app.** CalExp5 is the most actively used app (daily by 10+ crew), has the clearest multi-user requirement, and has the best-documented schema (BB_CALEXP5_SCHEMA.md v1.2). Success here proves the architecture.

**DB-3 (Data Manager) could be deferred.** The Data Manager UI is a significant build but isn't blocking any app migration. Apps can function with direct Neon writes via Bridge endpoints before the Data Manager exists. **Recommendation:** Consider merging DB-3 into a later phase or building it incrementally alongside DB-4/DB-5.

**DB-4 is the largest batch.** 11 tables, two apps (DocEngine + PorjExp5) that share data. This is where the "same Compartment 1 tables" promise gets tested. **Recommendation:** Split DB-4 into DB-4a (Compartment 1 shared tables: customers, vendors, properties, trades, master_items) and DB-4b (Compartment 2 per-app tables: doc_* and proj_*). Validate shared data first.

**DB-6 (TS_Exp5) could move earlier.** TS_Exp5 has the richest employee enrichment data (18 of 28 fields). Migrating it sooner would populate enrichment data that other apps benefit from. **Counter-argument:** TS_Exp5 has complex JSONB (auto-lunch runs, corrections, billedLunches). Moving it after DocEngine/PorjExp5 gives more migration experience.

**DB-7/DB-8 are low-risk.** Chrome extensions (InvVal2, Chase) and low-complexity apps (eSigner, Landfill) are straightforward. These phases are more about wiring than architecture.

### Revised Recommendation

| Phase | Focus | Change from Current |
|-------|-------|-------------------|
| DB-1 | Bridge + Auth + Master Data | Same |
| DB-2 | CalExp5 migration | Same |
| DB-3 | Data Manager UI (lightweight v1) | Reduced scope — basic entity list + edit form only |
| DB-4a | Shared master data tables (customers, vendors, properties, trades, master_items) | Split from DB-4 |
| DB-4b | DocEngine + PorjExp5 working data (doc_*, proj_*) | Split from DB-4 |
| DB-5 | TS_Exp5 | Same |
| DB-6 | RevExp5 | Same |
| DB-7 | InvVal2 + Chase | Same |
| DB-8 | eSigner + Landfill + Data Manager v2 | Moved Data Manager v2 here |

---

## 10. RISK MATRIX

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Neon cold start causes user-visible delay | Medium | Low | Health check cron during business hours; users tolerate 1-2s on first load |
| Bridge outage blocks all apps | Low | High | Railway auto-restart; apps cache recent reads; Bridge is stateless (fast restart) |
| JSONB enrichment data corruption | Very Low | Medium | Bridge validates via registry; audit_log captures old/new values; Neon PITR for worst case |
| Migration breaks an app | Medium | Medium | Neon branching for safe testing; dual-write with feature flags; rollback plan per phase |
| Free tier exceeded | Low | Low | 105 MB of 512 MB Year 1; years of headroom; $19/mo Launch tier as escape hatch |
| PorjExp5/DocEngine shared data conflicts | Very Low | Medium | Sequential single-user usage; version column for optimistic locking if needed |
| TS_Exp5 AL entries JSONB grows too large | Very Low | Low | ~15 KB per run × 26 runs/year; archive after 2 years; trivially manageable |
| Drizzle ORM breaking change | Low | Medium | Pin version; migration files are plain SQL (ORM-independent) |

---

## 12. AUTHENTICATION STRATEGY

### Decision: Two-Phase Lightweight Auth (No Clerk at Launch)

BB's auth needs are unusual: 10-12 construction workers on jobsite phones submitting hours, plus Sam as admin. This is NOT a SaaS multi-tenant problem. A full auth provider (Clerk, Auth0) is over-engineered for Phase 1.

### Phase 1: WebAuthn + PIN (DB-2, CalExp5 Multi-User)

**Primary: Face ID / Fingerprint (WebAuthn/Passkeys)**
- Web Authentication API works in mobile Safari (iOS 16+) and Chrome (Android)
- Crew member taps their name from dropdown, Face ID authenticates instantly
- Device-bound credential stored as public key in employee enrichment
- No typing required — critical for dirty/gloved hands on jobsites
- HTTPS required (Railway provides this automatically)
- Works offline (device-local biometric, no network needed for the challenge)

**Fallback: 4-Digit PIN**
- For borrowed phones, Face ID failures, new device before re-registration
- bcrypt-hashed PIN stored in employee enrichment
- Entered via simple numeric keypad UI

**First-Time Setup (~10 seconds):**
1. Open CalExp5 → tap name from employee dropdown
2. Prompt: "Set up quick login" → Face ID scan → done
3. Set a 4-digit backup PIN

**Every Subsequent Login:**
1. Open CalExp5 → Face ID prompt fires → authenticated
2. If Face ID fails → enter 4-digit PIN

**New Enrichment Fields on `employees`:**

| Field | Type | Purpose |
|-------|------|---------|
| `webauthnCredentials` | JSONB array | Registered device public keys (supports multiple devices per employee) |
| `pinHash` | string | bcrypt-hashed 4-digit PIN |

**Bridge Auth Endpoints (DB-2):**

```
POST /api/auth/webauthn/register    -- register Face ID credential for employee
POST /api/auth/webauthn/challenge   -- generate challenge for login
POST /api/auth/webauthn/verify      -- validate assertion, return employee context
POST /api/auth/pin/verify           -- validate PIN, return employee context
```

**What This Replaces:** The Clerk SMS OTP flow previously documented in BB_DB_STRATEGY.md v1.4 Section 9. No Clerk dependency, no SMS costs, no external auth provider, no JWT complexity at this phase.

**What This Does NOT Provide:** Sessions, role-based access control, admin vs. crew separation, token refresh, OAuth. These are not needed for CalExp5 crew usage at DB-2.

### Phase 2: Clerk (DB-4+, Admin Apps)

When DocEngine, PorjExp5, and RevExp5 migrate to Neon, Sam needs:
- Proper login sessions (not just identity verification)
- Admin role separation (Sam can edit enrichment; crew cannot)
- Audit trails tied to authenticated identities
- Potential future: Neon Authorize (RLS) with Clerk as JWT provider

Clerk is introduced at DB-4 as a **progressive enhancement** on top of the lightweight auth:
- Crew apps (CalExp5) keep WebAuthn + PIN (no change for field workers)
- Admin apps (Data Manager, DocEngine, PorjExp5, RevExp5) use Clerk
- Bridge middleware checks: if request has Clerk JWT → use Clerk identity; if request has WebAuthn/PIN token → use lightweight identity

### Why NOT Neon Auth / Neon Authorize

| Factor | Assessment |
|--------|-----------|
| **Neon Auth (Beta)** | Built on Better Auth 1.4.18. SDKs target Next.js/React — BB is vanilla HTML/JS. Beta status vs. BB's verified architecture. Solves multi-tenant SaaS problems BB doesn't have. |
| **Neon Authorize (RLS)** | Requires JWT-per-user passed through connection. BB's Bridge uses a shared connection pool. RLS can't filter within JSONB sub-fields (enrichment pattern). Would require abandoning the Bridge pattern. |
| **Both** | BB has ~15 users, single tenant, one company. The complexity-to-benefit ratio of database-level auth is terrible at this scale. Bridge-level auth is sufficient and far simpler. |

**Future consideration:** At DB-4+, Neon Authorize with Clerk JWTs could add defense-in-depth RLS on CalExp5 tables (crew members only see their own `cal_manual_hours` rows). This is an incremental add, not a rearchitecture.

---

## 13. FINAL ASSESSMENT

### What's Right (Keep As-Is)

- **Neon Serverless Postgres** — Perfect fit for BB's usage pattern and budget
- **Drizzle ORM** — Right tool for Claude-as-developer, TypeScript codebase, serverless deployment
- **Two-compartment model** — Clean separation, clear ownership, enables cross-app queries
- **Enrichment JSONB pattern** — Zero-migration extensibility, single source of truth, graduated promotion
- **Table count (39)** — Not over-normalized, not under-normalized. Just right for the domain
- **Phased deployment (DB-1 through DB-8)** — Reduces risk, each phase independently valuable
- **Bridge as single gateway** — Simple, auditable, secure
- **Two-phase auth** — WebAuthn/PIN for crew (DB-2), Clerk for admin (DB-4+). Right tool at the right time

### What Could Be Better (Minor Improvements)

1. **Add retention policy for cal_audit_log** — Match localStorage's 2,000 entry / 365-day limit
2. **Consider splitting DB-4** — Shared master data (DB-4a) before per-app working data (DB-4b)
3. **Defer Data Manager v2 to DB-8** — Build lightweight v1 earlier, full UI later
4. **Add nightly pg_dump** — Insurance against 6-hour PITR window on free tier
5. **Document optimistic locking strategy** — For PorjExp5/DocEngine shared Compartment 1 writes

### What Would Require a Rethink (None Found)

There are no architectural red flags. The schema, the database choice, the ORM, the compartment model, and the enrichment pattern are all appropriate for BB's scale, usage patterns, and team structure. The verified schema (v2.23) is comprehensive and accurate. The deployment plan is phased and reversible.

**Proceed with DB-1 implementation with confidence.**

---

*Based on: BB_PLATFORM_SCHEMA-v2.24 (verified clean across 21 waves, 11 apps, 500+ gaps resolved)*
*Based on: BB_DB_STRATEGY.md v1.5*
*Analysis date: 2026-03-15*
