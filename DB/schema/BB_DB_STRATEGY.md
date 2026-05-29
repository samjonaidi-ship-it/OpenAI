# BB Database Strategy | v1.5 | 2026-03-15 | BB

> **IMPORTANT: Table Definition Authority:** This document remains authoritative for architecture decisions (Neon rationale, Drizzle rationale, two-compartment model, connection pooling, pricing). However, **all table definitions, field lists, table counts, and deployment phases have been superseded by BB_PLATFORM_SCHEMA-v2.md (v2.23)**. The infrastructure table Drizzle schemas in Section 14 remain authoritative as the canonical Drizzle code. For current table definitions, column lists, enrichment field registries, and phase rollout plans, always refer to BB_PLATFORM_SCHEMA-v2.md.

## 1. EXECUTIVE SUMMARY

**Decision:** Neon Serverless Postgres as the database for all BB platform apps.
**ORM:** Drizzle (SQL-first, TypeScript, tiny bundle).
**Schema Pattern:** Two-compartment model — shared master data with superset enrichment + per-app working data. All tables use typed core columns + JSONB flexible columns.
**Enrichment Model:** Superset enrichment with a central registry. All enrichment fields defined and populated in one place (the Data Manager UI). Apps subscribe to the fields they need.
**Migration Philosophy:** Additive-only changes. No painful resets, no re-population, no downtime.

This document captures the database strategy decided on 2026-03-05 during CalExp5 multi-user architecture planning, evolved on 2026-03-14 to include the two-compartment model, superset enrichment registry, and Data Manager UI. It is the authoritative reference for all DB decisions across the BB platform.

> **Changelog v1.5 (2026-03-15):** Auth strategy overhaul. Replaced Clerk with two-phase lightweight auth: WebAuthn/Face ID + PIN for field crew at DB-2, Clerk deferred to DB-4+ for admin apps. Updated architecture diagram, env variables, Bridge internal architecture, and user-to-employee matching section. Evaluated Neon Auth/Authorize — not recommended. See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12 for full analysis.
>
> **Changelog v1.4 (2026-03-14):** Cross-doc reconciliation audit. Fixed Neon driver contradiction (use `@neondatabase/serverless`, not `pg`). Added QBT write path and composite endpoint pattern (Section 9). Added Clerk-to-employee matching logic (Section 9). Added Drizzle schemas for registry tables and shared infrastructure (Section 14). Clarified enrichment field archiving lifecycle. Removed unplanned `accounts` table. Standardized jobcodes endpoint to `/api/master/jobcodes`. Added phase prefix labels (DB-1 through DB-8). Fixed cross-reference to BB_PLATFORM_ARCHITECTURE.md (needs update). Deferred `object` field type. Added sync change notification concept.
>
> **Changelog v1.3 (2026-03-14):** Added two-compartment model (Sections 6-8 restructured), superset enrichment registry (Section 7), Data Manager UI (Section 8), app field subscriptions, `app_settings` table, working data compartment, enrichment key ownership rules, implementation phases. Reconciled with BB_PLATFORM_READINESS_REPORT.md v1.3 and BB_CALEXP5_SCHEMA.md v1.2.

---

## 2. WHY NEON (Not Railway Postgres, Supabase, or Render)

### The Evaluation (2026-03-05)

Four database options were evaluated against BB's requirements: internal business tools, Express/Node.js backend, JSONB hybrid schema, low maintenance, Railway deployment, elastic scaling without migration pain.

### Comparison Table

| | Railway Postgres | Neon | Supabase | Render Postgres |
|--|-----------------|------|----------|-----------------|
| **Type** | Containerized Postgres | Serverless Postgres | BaaS + Postgres | Managed Postgres |
| **JSONB support** | Full | Full | Full | Full |
| **Scale-to-zero** | No | Yes | No | No |
| **Auto-backups** | Manual | Built-in PITR (7 days) | Built-in (daily) | PITR (7 days) |
| **Dashboard/GUI** | None | Web console | Full Studio UI | pgAdmin-like |
| **Branching** | No | Yes (git-like) | Yes | No |
| **Extensions** | Limited | Full (PostGIS, pgvector) | Full | Full |
| **Connection pooling** | Manual (PgBouncer) | Built-in | Built-in (Supavisor) | Built-in |
| **Monthly cost (small)** | ~$5-10 | Free tier / $19 Launch | Free tier / $25 Pro | Free tier / $19 |
| **HA / Replicas** | Manual | Built-in | Built-in | Built-in |

### Why Neon Won

| Advantage | Why It Matters for BB |
|-----------|----------------------|
| **Scale-to-zero** | Internal tools used during business hours only. DB sits idle nights + weekends. Neon charges $0 during idle. Railway Postgres charges 24/7. |
| **Separation of compute and storage** | Railway goes down? Neon stays up. You can point a local dev server at the same DB instantly. Eliminates single point of failure. |
| **Database branching** | Test schema changes against real data by branching the DB like git. Verify migrations on the branch. Merge or delete. Zero risk to production. |
| **Built-in connection pooling** | Critical for serverless/intermittent workloads. No PgBouncer setup needed. |
| **PITR backups** | Free tier = 6 hours. Launch = 1 day default (configurable to 7 days). Scale = 30 days. Railway has no built-in PITR. |
| **Elastic without migration** | No container resizing, no downtime, no re-provisioning. Neon auto-scales compute up and down. |
| **BB's data volume is tiny** | Hundreds of records, not millions. Free tier may be enough for months. |
| **Centralized persistence for all apps** | Replaces fragile local JSON files, ephemeral Railway storage, and duplicated localStorage across apps. One persistent layer for everything. |

### Why Not the Others

| Option | Why Not |
|--------|---------|
| **Railway Postgres** | No scale-to-zero (pays 24/7), no branching, no PITR, DB is a container inside Railway (SPOF), manual PgBouncer setup |
| **Supabase** | Excellent product but BaaS overhead BB doesn't need. No scale-to-zero. $25/mo Pro tier. Auth/storage/APIs included but BB uses lightweight WebAuthn/PIN auth + Google Drive. |
| **Render Postgres** | No branching, no scale-to-zero. Solid but no differentiators over Neon for BB's use case. |

### Quick Decision Guide

| Factor | Best Choice |
|---|---|
| All-in-one backend (managed auth, APIs, storage) | Supabase |
| Low/intermittent usage, cost savings | **Neon** |
| Simple deploy with app hosting | Railway |
| Extension support (pgvector, PostGIS) | Supabase or Neon |
| Vendor portability | Neon or Railway |

---

## 3. NEON PRICING (as of 2026)

| Plan | Cost | Storage | Compute | Key Features |
|------|------|---------|---------|-------------|
| **Free** | $0 | 0.5 GB/project (5 GB across 10 projects) | 100 CU-hours, auto-scale to 2 CU | Scale-to-zero (5-min idle), unlimited branches, 6-hour PITR |
| **Launch** | $19/mo | 50 GB | 300 compute-hours | 7-day PITR |
| **Scale** | $69/mo | Larger | Larger | Private Link, SOC2 Type 2, HIPAA, SSO, 30-day PITR |
| **Business** | $700/mo | Enterprise | Enterprise | Full enterprise features |

**BB's sweet spot:** Free tier for development and early production. Move to Launch ($19/mo) when storage or compute hours need headroom. Storage costs dropped from $1.75 to $0.35/GB-month after Databricks acquisition (May 2025).

---

## 4. ARCHITECTURE: NEON + RAILWAY + DATA MANAGER

```
┌─────────────────────────────────┐     ┌──────────────────────────────┐
│         RAILWAY                  │     │           NEON                │
│                                  │     │                              │
│  BB Micro-Bridge (Fastify 5)     │────>│  Postgres (managed)          │
│  |-- Auth (WebAuthn+PIN / Clerk) │conn │  |                           │
│  |-- API gateway + routing       │str  │  |-- COMPARTMENT 1:          │
│  |-- Master data CRUD            │     │  |   Master Data + Enrichment│
│  |-- Working data CRUD           │     │  |   (employees, customers,  │
│  |-- Enrichment registry         │     │  |    vendors, master_items,  │
│  |-- QBO/QBT sync (scheduled)    │     │  |    enrichment_fields,     │
│  |-- App settings API            │     │  |    app_field_subscriptions)│
│                                  │     │  |                           │
│  BB Data Manager (Express+Vanilla)│     │  |-- COMPARTMENT 2:          │
│  |-- Enrichment management UI    │     │  |   Working Data (per-app)  │
│  |-- Schema field manager        │     │  |   (cal_*, ts_*, rev_*,    │
│  |-- Master data grid            │     │  |    proj_* tables)         │
│  |-- Working data views          │     │  |                           │
│  |-- Sync status + settings      │     │  |-- SHARED INFRASTRUCTURE:  │
│                                  │     │  |   app_settings, audit_log,│
│  CalExp5 (React + Vite)          │     │  |   sync_log               │
│  TS_Exp5 (Express)               │     │  |                           │
│  RevExp5 (Express)               │     │  |-- PITR backups           │
│  ProjExp5 (Express)              │     │  |-- Connection pooling     │
│  Future apps...                  │     │  |-- Scale-to-zero          │
│                                  │     │  |-- DB branching           │
└─────────────────────────────────┘     └──────────────────────────────┘
       ^                                          ^
       |                                          |
  All apps connect                          Direct access
  via Bridge API ONLY                       (admin/migrations only)
```

### Key Architectural Principles

1. **Apps never talk directly to Neon.** Everything goes through Micro-Bridge. The Bridge is the single gateway. Neon is an external managed service connected via `DATABASE_URL` connection string.

2. **Two-compartment model.** Neon holds both shared master data (Compartment 1) and per-app working data (Compartment 2). This eliminates local file dependencies and duplicated settings UIs.

3. **Superset enrichment.** All enrichment fields for master data are defined in a central registry and populated in one place (the Data Manager UI). Apps subscribe to the fields they need and receive only those fields.

4. **Bridge does everything.** The Bridge handles auth (WebAuthn + PIN for crew, Clerk for admin apps at DB-4+), API routing, master data CRUD, working data CRUD, QBO/QBT sync, enrichment validation, and app settings. Single service with an internal scheduled sync. See Section 9 for the rationale.

### SPOF Mitigation

With Railway Postgres, the DB was a container inside Railway. If Railway had issues, both app AND database were down. With Neon:

- Railway goes down? Neon stays up. Point a local dev server at the same DB instantly.
- Neon goes down? Railway apps can serve cached data and queue writes.
- Complete separation of compute (Railway) and storage (Neon).

### Environment Variables

```
# On Micro-Bridge (Railway)
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.region.neon.tech/dbname?sslmode=verify-full  # Neon pooled connection
DATABASE_URL_DIRECT=postgresql://user:password@ep-xxx.region.neon.tech/dbname?sslmode=verify-full  # Direct (migrations only)
WEBAUTHN_RP_ID=bb-calexp5.railway.app                    # Relying Party ID for WebAuthn (your domain)
WEBAUTHN_RP_NAME=Bainbridge Builders                     # Display name shown during Face ID prompt
WEBAUTHN_ORIGIN=https://bb-calexp5.railway.app           # Expected origin for credential verification
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
# CLERK_SECRET_KEY=sk_live_...                           # Deferred to DB-4+ (admin apps)

# On app services (Railway)
BRIDGE_URL=http://bb-micro-bridge.railway.internal:3105  # Private Railway networking
# CLERK_PUBLISHABLE_KEY=pk_live_...                      # Deferred to DB-4+ (admin apps)
```

### Connection Patterns

Neon provides two connection types:
- **Direct:** `postgresql://user:password@ep-xxx.region.neon.tech/dbname` (for migrations, admin)
- **Pooled:** Via Neon's built-in connection pooler (recommended for app traffic)

Always use pooled connections from the Bridge. Direct connections only for migrations and admin tasks.

---

## 5. ORM: DRIZZLE (Not Prisma, Not Knex)

### Why Drizzle

| Factor | Drizzle | Prisma | Knex |
|--------|---------|--------|------|
| Schema language | TypeScript (code-first) | .prisma DSL (schema-first) | JS migration files |
| Bundle size | ~7kb min+gzip, zero binary deps | Larger (Rust engine removed in v7, still heavier) | Moderate |
| Serverless readiness | Excellent (tiny cold start) | Improved in Prisma 7 | OK |
| JSONB support | First-class (`jsonb()` column) | Supported | Manual |
| Migration tooling | `drizzle-kit generate` (SQL from schema diff) | `prisma migrate` (declarative) | Manual migration files |
| SQL closeness | "If you know SQL, you know Drizzle" | Higher abstraction | Query builder |
| TypeScript types | Generated from schema | Generated from schema | Manual |

**The deciding factor:** BB's "team" is Claude writing all the code. Claude knows SQL. Drizzle's SQL-first approach means less magic, fewer surprises, and readable SQL migrations you can audit. Prisma adds abstraction BB doesn't need.

### Drizzle Schema Example (Master Data)

```typescript
// schema/employees.ts
import { pgTable, text, boolean, date, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const employees = pgTable('employees', {
  id:              text('id').primaryKey(),
  qboId:           text('qbo_id').unique(),
  qbtId:           text('qbt_id').unique(),
  displayName:     text('display_name').notNull(),
  firstName:       text('first_name'),
  lastName:        text('last_name'),
  email:           text('email'),
  phone:           text('phone'),
  hireDate:        date('hire_date'),
  isActive:        boolean('is_active').default(true),
  role:            text('role').default('crew'),
  enrichment:      jsonb('enrichment').default({}),  // <-- superset enrichment (all apps)
  version:         integer('version').default(1),
  syncSource:      text('sync_source').default('qbo'),
  qboSyncToken:    text('qbo_sync_token'),
  qboLastUpdated:  timestamp('qbo_last_updated', { withTimezone: true }),
  syncedAt:        timestamp('synced_at', { withTimezone: true }),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
// NOTE: Schema v2.23 uses simple cache pattern for C1 tables (no SCD2). Enrichment changes tracked via enrichment_version integer + enrichment_history table. See BB_PLATFORM_SCHEMA-v2.md for current column definitions.
```

### Migration Workflow with Drizzle + Neon Branching

```
1. Edit schema file (e.g., add a typed column)
2. Run: drizzle-kit generate
   --> Generates readable SQL migration file
3. Branch the Neon DB (git-like, instant, free)
4. Run migration against the branch
5. Verify -- test app against branched DB
6. Merge branch to main (or delete if bad)
7. Apply migration to production
```

**Critical Drizzle gotcha:** Always use `strict: true` mode. Without it, Drizzle may interpret a column rename as "drop + add" which loses data.

**Neon driver:** Use `@neondatabase/serverless` (via `drizzle-orm/neon-serverless`) for BOTH edge and Node.js runtimes. It works on Railway's Node.js environment despite the "serverless" name. Do NOT use `pg` (node-postgres) -- `@neondatabase/serverless` is Neon's recommended driver and handles connection pooling and WebSocket connections natively.

---

## 6. TWO-COMPARTMENT MODEL

### Overview

Neon serves as the single persistent layer for the entire BB platform, organized into two compartments plus shared infrastructure:

```
+--------------------------------------------------------------+
|                        NEON DATABASE                          |
|                                                               |
|  COMPARTMENT 1: MASTER DATA (shared across all apps)          |
|  Synced from QBO/QBT. Enriched via Data Manager UI.           |
|  Read by all apps through Bridge API.                         |
|  Tables: employees, customers, vendors, work_jobcodes,        |
|  properties, trades, master_items                             |
|  (see BB_PLATFORM_SCHEMA-v2.md v2.23 for current definitions — 7 C1 tables) |
|                                                               |
|  COMPARTMENT 2: WORKING DATA (per-app operational)            |
|  Owned by individual apps. References master data via FKs.    |
|  Replaces local JSON files and ephemeral Railway storage.     |
|  Tables: cal_*, ts_*, rev_*, proj_* (prefixed per app)        |
|                                                               |
|  SHARED INFRASTRUCTURE                                        |
|  Enrichment registry, app settings, audit log, sync log.      |
|  Tables: enrichment_fields, app_field_subscriptions,          |
|          app_settings, audit_log, sync_log,                   |
|          enrichment_history                                   |
|  (6 tables — enrichment_history added v2.23, replaces sync_conflicts) |
+--------------------------------------------------------------+
```

### What This Eliminates

| Current Problem | How Two-Compartment Neon Solves It |
|---|---|
| **Every app duplicates QBO/QBT queries** | One sync process (Bridge) pulls from QBO/QBT once. All apps read shared master data. |
| **Every app has its own settings UI for master data** | Superset enrichment managed in one Data Manager UI. Apps just read what they need. |
| **ProjExp5/TS_Exp5/RevExp5 store data in local JSON files** | Working data moves to Compartment 2. Persistent, backed up, accessible from anywhere. |
| **Railway ephemeral storage wipes on redeploy** | All data in Neon. Railway can redeploy freely. Nothing lost. |
| **Enrichment siloed per app** | All enrichment in one JSONB column per entity. Any app can read any enrichment field. |
| **Cross-app queries impossible** | Both compartments in the same database. Bridge can JOIN across master data and working data. |
| **No backups for local JSON files** | Neon PITR covers master data + working data + settings. One backup for everything. |
| **Apps are not truly stateless** | Apps store nothing locally (except IndexedDB read cache). Deploy anywhere, reconnect to Bridge, everything is there. |

### Working Data Table Pattern

Every working data table follows the same hybrid pattern as master data:

```
+----------------------------------------------------------+
|  ts_timesheet_snapshots (TS_Exp5 working data)            |
|                                                           |
|  TYPED COLUMNS (stable, queryable, indexed):              |
|  id, employee_id (FK), date, hours, status, project_id,  |
|  created_at, updated_at, version                          |
+----------------------------------------------------------+
|  JSONB "details" COLUMN (flexible, app-evolves-freely):   |
|  {                                                        |
|    "breakMinutes": 30,                                    |
|    "overtimeApproved": true,                              |
|    "gpsLocation": { "lat": 47.6, "lng": -122.3 },        |
|    "notes": "Rained out at 3pm",                          |
|    "anyFutureField": "no migration needed"                |
|  }                                                        |
+----------------------------------------------------------+
```

### App Settings Table

Replaces per-app localStorage settings and file-based settings persistence:

```
app_settings
  id:         text PK
  app_name:   text ('calexp5', 'ts_exp5', '_global')
  category:   text ('display', 'sync', 'defaults', 'payroll')
  settings:   jsonb  -- entire settings object, no migration needed
  updated_at: timestamp
  updated_by: text (employee ID or Clerk user ID at DB-4+)
```

- `_global` settings apply to all apps (company name, timezone, fiscal year)
- Per-app settings override globals where needed
- Entire `settings` column is JSONB -- apps add whatever settings they want, no migrations

---

## 7. SUPERSET ENRICHMENT MODEL

### The Problem It Solves

Previously, each app enriched master data independently:
- CalExp5 had a settings UI for employee crew assignments
- TS_Exp5 had a settings UI for employee pay rates
- RevExp5 had a settings UI for employee cost rates
- Sam had to open 4 different apps to fully enrich one employee

### The Solution: Central Enrichment Registry

All enrichment fields are defined in a registry and populated through one UI. Apps declare which fields they need (subscribe) and receive only those fields from the Bridge API.

```
ENRICHMENT REGISTRY (in Neon)

enrichment_fields (defines what CAN exist)
  id:            text PK
  entity_type:   text ('employee', 'customer', 'vendor', 'item')
  field_key:     text (unique per entity_type)
  display_name:  text
  field_type:    text ('text', 'number', 'boolean', 'select', 'tags', 'color', 'date', 'object', 'context_map')
  -- 9 field types. 'object' and 'context_map' added in Schema v2.23.
  options:       jsonb (for select/tags: dropdown choices)
  default_value: jsonb
  is_required:   boolean
  is_archived:   boolean (soft delete, never hard delete)
  sort_order:    integer
  created_at:    timestamp
  updated_at:    timestamp

app_field_subscriptions (what each app NEEDS)
  id:            text PK
  app_name:      text ('calexp5', 'ts_exp5', 'revexp5', 'projexp5')
  entity_type:   text
  field_key:     text (FK to enrichment_fields)
  is_required:   boolean (app-level: must this field be filled for the app to function?)
  created_at:    timestamp
```

### How It Works

```
1. DEFINE: Data Manager UI creates enrichment fields
   "Track 'mileageRate' on employees. Type: number."
   --> Row added to enrichment_fields

2. SUBSCRIBE: Apps declare what they need
   "TS_Exp5 needs mileageRate, overtimeOK, costRate on employees."
   --> Rows added to app_field_subscriptions

3. POPULATE: Data Manager UI lets Sam fill values per entity
   "Mike Johnson -> mileageRate: 85, overtimeOK: true, costRate: 45"
   --> Written to employees.enrichment JSONB

4. CONSUME: Apps call Bridge and get only subscribed fields
   GET /api/master/employees?app=ts_exp5
   --> Returns typed QBO fields + { mileageRate: 85, overtimeOK: true, costRate: 45 }
   --> Does NOT return defaultCrew, scheduleColor (not subscribed by ts_exp5)

5. VALIDATE: Bridge checks field types on write
   PATCH /api/master/employees/mike-1/enrichment { mileageRate: "not a number" }
   --> Bridge checks enrichment_fields: mileageRate type is "number"
   --> Rejects with 400 error
```

### Enrichment JSONB Structure

All enrichment fields live in a flat structure within the `enrichment` JSONB column. No per-app namespacing -- the registry controls access:

```json
// employees.enrichment for "Mike Johnson"
{
  "defaultCrew": "A",
  "scheduleColor": "#FF5733",
  "mileageRate": 85,
  "overtimeEligible": true,
  "costRate": 45.00,
  "certifications": ["OSHA-30", "First Aid"],
  "vehicleAssignment": "TRK-003",
  "emergencyContact": "206-555-9999",
  "tShirtSize": "XL"
}
```

**All apps can READ all enrichment** (full visibility). **Writes are validated** against the registry (type checking, required fields). The Data Manager UI is the primary interface for enrichment, not individual app settings UIs.

### Field Lifecycle

```
STAGE 1: Sam creates field via Data Manager UI
  "Track 'truckPreference' on employees. Type: select. Options: F-150, F-250, Ram 2500."
  --> Zero migration, zero code change, immediately available

STAGE 2: Sam populates values
  Mike -> F-250, Dave -> F-150, Tom -> Ram 2500
  --> Stored in employees.enrichment JSONB

STAGE 3: Apps subscribe
  CalExp5 subscribes to truckPreference (for dispatch planning)
  --> Bridge returns it in CalExp5's API responses

STAGE 4: Field used across 3+ apps with heavy querying --> Consider graduation
  ALTER TABLE employees ADD COLUMN truck_preference TEXT;
  UPDATE employees SET truck_preference = enrichment->>'truckPreference';
  --> Now indexed, constrained, first-class. Enrichment copy kept for backward compat.

STAGE 5: Sam archives unused field via Data Manager UI
  --> enrichment_fields row: is_archived = true
  --> Bridge STOPS returning this field in API responses (filtered out)
  --> Data Manager HIDES the field column (but shows in "Archived" tab)
  --> JSONB data is NEVER deleted (may be needed for audit/recovery)
  --> app_field_subscriptions for this field are deactivated
  --> To restore: set is_archived = false (data is still there)
```

---

## 8. DATA MANAGER UI

### Purpose

The Data Manager is the central admin panel for the entire BB platform data layer. It replaces per-app settings UIs for master data and provides schema management without requiring code changes.

### Where It Lives

Deployed as its own Railway service (Express + vanilla HTML/CSS/JS). Connects to the Bridge API like any other app. At DB-2/DB-3: uses WebAuthn/PIN auth (Sam logs in same as crew). At DB-4+: upgraded to Clerk auth with admin role requirement.

### Core Features

| Feature | What It Does |
|---------|-------------|
| **Master Data grid** | All entities (employees, customers, vendors) with QBO fields + enrichment columns. Inline editing. |
| **Enrichment field manager** | Create, edit, archive enrichment fields. Define types, options, defaults. No code change needed. |
| **App subscription manager** | View/edit which apps subscribe to which enrichment fields. |
| **New-from-QBO indicator** | After sync, new entities appear with empty enrichment (dashes). Sam fills them in. |
| **Bulk edit** | Select multiple entities, set a field value for all at once. |
| **Sync controls** | View last sync status, trigger manual QBO/QBT sync. |
| **"Filled %" metric** | Shows what percentage of entities have each enrichment field populated. |
| **Working data views** | Read-only views of per-app working data (schedules, timesheets, invoices, estimates). |
| **App settings** | Manage per-app and global settings. |
| **Audit log viewer** | Browse audit trail by entity, user, action, date range. |

### Data Manager Wireframe

```
+------------------------------------------------------------------+
|  BB Data Manager                                     Sam Jones v  |
+---------------+--------------------------------------------------+
|               |                                                   |
|  MASTER       |  EMPLOYEES  v       [+ Add Field]  [Sync Now]    |
|  DATA         |                                                   |
|  ----------   |  Name          | QBO | Crew | Rate | OT | Certs  |
|  Employees    |  Mike Johnson  |  Y  |  A   |  85  |  Y | OSHA.. |
|  Customers    |  Dave Peters   |  Y  |  B   |  75  |  Y | --     |
|  Vendors      |  Tom Wilson    |  Y  |  A   |  65  |  N | FA     |
|  Master Items |  *New from QBO |  Y  |  --  |  --  | -- | --     |
|               |                                                   |
|  WORKING      |  Legend: QBO = synced (read-only). Others = edit. |
|  DATA         |  -- = not yet set (needs enrichment)              |
|  ----------   |                                                   |
|  Schedules    |  [Click entity row to open edit panel]            |
|  Timesheets   |                                                   |
|  Invoices     |  +--- Edit: Mike Johnson -------------------+     |
|  Estimates    |  | QBO Fields (read-only):                  |     |
|  Expenses     |  |   Display Name: Mike Johnson             |     |
|               |  |   Phone: 206-555-1234                    |     |
|  SCHEMA       |  |   Email: mike@bb.com                     |     |
|  ----------   |  |                                          |     |
|  Fields       |  | Enrichment Fields:                       |     |
|  App Subs     |  |   Default Crew:   [A v]                  |     |
|  Settings     |  |   Mileage Rate:   [85       ]            |     |
|               |  |   Overtime OK:    [Y]                    |     |
|  SYSTEM       |  |   Cost Rate:      [45.00    ]            |     |
|  ----------   |  |   Certifications: [OSHA-30 x][FA x]      |     |
|  Sync Log     |  |   Vehicle:        [TRK-003 v]            |     |
|  Audit Log    |  |                                          |     |
|  Health       |  | Used by: CalExp5, TS_Exp5, RevExp5, Proj |     |
|               |  |          [Save]  [Cancel]                 |     |
|               |  +------------------------------------------+     |
+---------------+--------------------------------------------------+
```

### Schema Field Manager

```
SCHEMA > Fields                              [+ New Field]

Entity: Employees v

Field Key       | Display Name   | Type   | Apps   | Filled %
defaultCrew     | Default Crew   | select | 2 apps | 100%
mileageRate     | Mileage Rate   | number | 1 app  | 85%
costRate        | Cost Rate      | number | 2 apps | 85%
overtimeOK      | Overtime OK    | bool   | 1 app  | 100%
certifications  | Certifications | tags   | 2 apps | 40%
vehicleAssign   | Vehicle        | select | 1 app  | 60%

"Filled %" = how many entities have this field populated.
Low % = field may need bulk-fill or may be unnecessary.
```

### New Field Dialog

When Sam clicks "+ Add Field":
1. Select entity type (Employee, Customer, Vendor, Item)
2. Enter field key and display name
3. Select field type (text, number, boolean, select, tags, color, date, object, context_map)
4. For select/tags: define dropdown options
5. Set default value (optional)
6. Subscribe apps that need this field
7. Click "Create Field"

**Result:** Row added to `enrichment_fields`. Subscriptions added to `app_field_subscriptions`. No migration. No code change. Data Manager immediately shows new column. Apps receive the field on next API call.

---

## 9. BRIDGE ARCHITECTURE: SINGLE SERVICE MODEL

### Why One Service (Not Two)

The Bridge handles all three responsibilities: API gateway, data layer, and QBO/QBT sync. This was evaluated against alternatives (separate Data Server, separate Sync Worker) and chosen for BB's scale:

| Factor | Why Single Service Wins for BB |
|--------|-------------------------------|
| **BB's scale** | ~500 records, 4-5 apps, one company. Not a microservices problem. |
| **Bridge already exists** | Already has QBO integration, Railway deployment, circuit breakers. Auth (WebAuthn+PIN) adds minimal complexity. |
| **Cost** | One Railway service, not two or three. |
| **Complexity** | Claude maintains all code. One codebase is easier than two. |
| **Upgrade path** | If sync gets heavy, extract into a separate Railway worker later. Same code, different process. |

### Bridge Internal Architecture

```
Micro-Bridge (single Railway service)
|
|-- Gateway Layer
|   |-- Auth middleware (WebAuthn/PIN verify at DB-2; Clerk JWT at DB-4+)
|   |-- Rate limiting
|   |-- CORS
|   |-- Route handlers
|
|-- Data Layer
|   |-- Drizzle ORM --> Neon (pooled connection)
|   |-- Master data CRUD (Compartment 1)
|   |-- Working data CRUD (Compartment 2)
|   |-- Enrichment validation (against registry)
|   |-- App field filtering (subscriptions)
|   |-- App settings read/write
|
|-- Sync Layer (internal scheduler)
|   |-- node-cron: every 15 min during business hours
|   |-- QBO pull (modified_since last sync)
|   |-- QBT pull (modified_since last sync)
|   |-- Reconciliation engine
|   |-- Sync log writer
|
|-- API Surface
    |-- Master data endpoints (/api/master/*)
    |-- Enrichment registry endpoints (/api/registry/*)
    |-- Per-app working data endpoints (/api/cal/*, /api/ts/*, etc.)
    |-- Settings endpoints (/api/settings/*)
    |-- Sync endpoints (/api/sync/*)
    |-- System endpoints (/api/health, /api/audit/*)
```

### Sync Strategy

```
SYNC CYCLE (every 15 min during business hours)

1. Pull from QBO/QBT
   GET /employees?modified_since={last_sync}
   (only changed records, not full pull)

2. For each record from QBO:
   - Find matching row in Neon (by qbo_id/qbt_id)
   - Compare sync token
   - If changed --> update TYPED COLUMNS ONLY
   - NEVER TOUCH enrichment column (apps own that data)
   - Bump version + synced_at timestamp

3. For new QBO records (no match):
   - INSERT with typed columns from QBO
   - enrichment = {} (empty, Sam fills via Data Manager)

4. Log sync results to sync_log table

5. Update last_sync timestamp
```

**The Critical Rule: QBO owns typed columns, apps/Sam own enrichment.** Sync never overwrites enrichment data.

### QBT Write Path (Transactional Operations)

Apps read master data from the Bridge. But apps also need to **write** to QBT (creating timesheets, PTO entries). These transactional writes go through the Bridge as **composite endpoints**:

```
CalExp5 user submits timesheet:
  1. CalExp5 calls POST /api/cal/timesheets/submit
     Body: { userId, date, jobcodeId, hours }

  2. Bridge performs composite operation:
     a. CREATE timesheet in QBT via QBT API
     b. On success: INSERT into cal_uploaded_timesheets (Neon)
        with the QBT timesheet ID returned from step (a)
     c. On failure: return error, do NOT write to Neon

  3. Response includes: { qbtTimesheetId, status: 'created' }
```

**Critical:** Steps (a) and (b) are NOT a database transaction (QBT is external). If step (a) succeeds but step (b) fails (Neon down), the Bridge must retry step (b) or log for manual reconciliation. The sync_log captures these edge cases.

This pattern applies to all QBT write operations:
- `POST /api/cal/timesheets/submit` -- create/update QBT timesheet + record in Neon
- `POST /api/cal/timesheets/delete` -- delete QBT timesheet + remove record in Neon
- Future: `POST /api/ts/entries/submit` -- TS_Exp5 equivalent

**Apps NEVER call QBT directly.** All QBT interactions (reads and writes) go through the Bridge.

### Two-Phase Authentication Strategy

> **Full analysis:** See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12.

**Phase 1 (DB-2): WebAuthn + PIN for Field Crew**

When a field worker opens CalExp5 on their phone:

```
FIRST TIME (one-time setup, ~10 seconds):
1. Worker opens CalExp5 on phone
2. Taps their name from employee dropdown
3. App prompts: "Set up quick login"
4. Face ID / fingerprint scan → credential stored
5. Sets a 4-digit backup PIN
6. Bridge stores: webauthnCredentials[] in employee enrichment, pinHash in employee enrichment

EVERY LOGIN AFTER:
1. Worker opens CalExp5
2. Face ID prompt fires automatically (WebAuthn challenge/response)
3. Bridge verifies assertion against stored public key
4. If Face ID fails → enter 4-digit PIN
5. Bridge verifies PIN hash → returns employee context
```

**Bridge Auth Endpoints (DB-2):**
```
POST /api/auth/webauthn/register    -- store credential public key in employee enrichment
POST /api/auth/webauthn/challenge   -- generate challenge for login
POST /api/auth/webauthn/verify      -- validate assertion, return employee context + session token
POST /api/auth/pin/verify           -- validate PIN hash, return employee context + session token
```

**Session token:** Simple signed token (HS256 with server secret) containing `{ employeeId, exp }`. Short-lived (8 hours, matches work day). Sent as `Authorization: Bearer <token>` on all subsequent API calls. Bridge middleware validates on every request.

**New enrichment fields on `employees`:**

| Field | Type | Purpose |
|-------|------|---------|
| `webauthnCredentials` | JSONB array | Registered device public keys (supports multiple devices per employee) |
| `pinHash` | string | bcrypt-hashed 4-digit PIN |

**Edge cases:**
| Scenario | Handling |
|----------|---------|
| New employee added in QBO | Sync imports to employees table. Employee appears in dropdown. First login triggers setup. |
| Employee uses a different phone | Face ID won't match (device-bound). PIN fallback works immediately. Can re-register Face ID on new device. |
| Employee forgets PIN | Sam resets via Data Manager (clears pinHash, forces re-setup on next login). |
| Employee leaves company | Set `isActive = false` in QBO → sync propagates → employee removed from dropdown. |
| Admin user (Sam) | Sam uses the same WebAuthn/PIN flow at DB-2. Gets Clerk login at DB-4+ with admin role. |
| Android users | WebAuthn triggers fingerprint scanner on Android — same flow, same code. |

**Phase 2 (DB-4+): Clerk for Admin Apps**

When DocEngine, PorjExp5, and RevExp5 migrate, Sam gets Clerk-based login with proper sessions, admin role separation, and OAuth. Crew apps (CalExp5) keep WebAuthn + PIN unchanged. Bridge middleware checks: if request has Clerk JWT → use Clerk identity; if request has session token → use lightweight identity. See BB_ARCHITECTURE_ANALYSIS.md v1.2 Section 12 for details.

### Data Manager: Read-Only for QBO/QBT Data

**Design decision:** The Data Manager is read-only for QBO/QBT source data (typed columns like name, phone, email). These fields are synced from QBO/QBT and should only be changed in QuickBooks.

The Data Manager CAN:
- View all master data (QBO fields + enrichment)
- Edit enrichment fields (the JSONB portion)
- Create/edit/archive enrichment field definitions
- Manage app subscriptions
- Trigger sync, view sync status
- Manage app settings

The Data Manager CANNOT:
- Edit employee names, phones, emails (QBO source of truth)
- Create new employees (must be done in QBO, then synced)
- Delete employees (must be deactivated in QBO)

**Exception:** In the future, if BB needs to create entities that DON'T come from QBO (e.g., subcontractors not in payroll), the Data Manager could support direct creation with `sync_source='manual'`.

### Bridge API Surface

```
MASTER DATA + ENRICHMENT
  GET    /api/master/employees                    -- all employees
  GET    /api/master/employees?app=calexp5        -- filtered to CalExp5 subscribed fields
  GET    /api/master/employees/:id                -- single employee, full enrichment
  PATCH  /api/master/employees/:id/enrichment     -- update enrichment (validated)
  GET    /api/master/customers                    -- all customers
  GET    /api/master/vendors                      -- all vendors
  GET    /api/master/jobcodes                     -- all active jobcodes (from QBT)

ENRICHMENT REGISTRY
  GET    /api/registry/fields?entity=employee     -- all defined fields for entity
  POST   /api/registry/fields                     -- create new field
  PATCH  /api/registry/fields/:id                 -- edit field
  DELETE /api/registry/fields/:id                 -- archive (soft delete)
  GET    /api/registry/subscriptions?app=calexp5  -- app's subscriptions
  POST   /api/registry/subscriptions              -- subscribe app to field
  DELETE /api/registry/subscriptions/:id          -- unsubscribe

WORKING DATA (per-app namespaced)
  GET    /api/cal/schedules                       -- CalExp5 schedules
  POST   /api/cal/schedules                       -- create schedule entry
  GET    /api/cal/manual-hours                    -- CalExp5 manual hours
  POST   /api/cal/manual-hours                    -- create/update manual hours
  GET    /api/cal/uploaded-timesheets             -- CalExp5 upload tracking
  GET    /api/ts/entries                          -- TS_Exp5 time entries
  POST   /api/ts/entries                          -- create time entry
  ... (each app gets its own namespace)

SETTINGS
  GET    /api/settings/:app_name                  -- all settings for app
  PUT    /api/settings/:app_name/:category        -- update settings category
  GET    /api/settings/_global                    -- global BB settings

SYNC
  POST   /api/sync/trigger                        -- manual sync
  GET    /api/sync/status                         -- last sync info

SYSTEM
  GET    /api/health                              -- Bridge + Neon health
  GET    /api/audit?entity=employee&id=mike-1     -- audit trail
```

---

## 10. SCHEMA STRATEGY: TYPED CORE + JSONB

### The Two-Zone Pattern (Applied to Both Compartments)

Every table in both compartments follows this pattern:

```
+----------------------------------------------------------+
|  ZONE 1: TYPED COLUMNS (stable, queryable, indexed)      |
|  id, qbo_id, display_name, phone, email,                 |
|  status, role, created_at, updated_at, synced_at,         |
|  version (optimistic concurrency)                         |
+----------------------------------------------------------+
|  ZONE 2: JSONB FLEXIBLE COLUMN (extensible, no migration) |
|  Master data tables:  "enrichment" column                 |
|  Working data tables: "details" column                    |
+----------------------------------------------------------+
```

### Master Data: `enrichment` column
- Populated via Data Manager UI (superset model)
- Validated against enrichment_fields registry
- Read by all apps, filtered by subscription
- Sync NEVER overwrites this column

### Working Data: `details` column
- Populated by the owning app
- No registry validation (app-internal flexibility)
- Only read by the owning app (and Data Manager in read-only mode)

### Field Graduation Lifecycle

```
STAGE 1: New field --> JSONB enrichment
  App needs "mileageRate" on employees
  --> Sam creates it in Data Manager UI
  --> enrichment.mileageRate = 85
  --> Zero migration, zero downtime

STAGE 2: Field used by 3+ apps --> Consider graduating
  CalExp5, TS_Exp5, RevExp5 all read mileageRate
  --> Candidate for typed column

STAGE 3: Graduated --> Typed column
  ALTER TABLE employees ADD COLUMN mileage_rate NUMERIC;
  UPDATE employees SET mileage_rate = (enrichment->>'mileageRate')::numeric;
  --> Now indexed, constrained, first-class
  --> Keep in enrichment for backward compatibility during transition
```

**Rule:** If you query/filter by it often AND it exists across 3+ apps, graduate it. Otherwise, JSONB is fine.

### Sync Change Notifications

When QBO/QBT sync updates a master data record (typed columns change), the sync engine should log what changed. This helps Sam notice when QBO changes might invalidate enrichment assumptions:

```
sync_log entry:
  entity_type: 'employee'
  entity_id: 'emp-mike-1'
  changes: { "role": { "old": "crew", "new": "foreman" } }
  synced_at: '2026-03-15 07:15:00'
```

**Future enhancement:** Data Manager v2 could surface a "Recently Changed by QBO" alert panel showing master data changes from the latest sync. This helps Sam review and update enrichment if needed (e.g., employee promoted from crew to foreman might need different enrichment values).

---

## 11. MIGRATION PHILOSOPHY: ADDITIVE-ONLY

### Core Principles

1. **Additive-only changes** -- Never remove or rename columns. Only add new ones.
2. **Backward compatibility** -- Backward-compatible changes deploy without coordination.
3. **Expand and Contract pattern** -- For breaking changes: add new schema + backfill, run both, remove old when safe.
4. **Decouple schema from app deploys** -- Deploy schema changes before apps rely on them.
5. **JSONB as the escape hatch** -- Most new fields go straight to JSONB. No migration needed at all.

### Change Type Decision Table

| Change Type | How You Handle It | Migration Needed? |
|-------------|-------------------|-------------------|
| New flexible field | Add to JSONB (or create via Data Manager UI) | **No** |
| New stable field | `ALTER TABLE ADD COLUMN` | Yes, but additive = safe |
| Rename field | Add new column, backfill, deprecate old | Expand-and-contract |
| Remove field | Stop reading it. Leave the column. | **No** |
| New entity type | New table | Yes, but additive = safe |
| New enrichment field | Create via Data Manager UI | **No** (JSONB) |
| New working data field | Add to `details` JSONB | **No** |

### Neon Branching for Safe Migrations

Before running any migration against production:

1. **Branch** the Neon DB (instant, uses copy-on-write)
2. **Run** the migration against the branch
3. **Test** the app against the branched DB
4. **Verify** data integrity
5. **Apply** to main (or delete branch if problems found)

### Migration from JSON Files

No big-bang migration. Gradual approach:

```
Phase 1: Create Neon tables (master data + enrichment registry)
Phase 2: Bridge connects to Neon, QBO/QBT sync populates master data
Phase 3: Data Manager UI enables enrichment management
Phase 4: CalExp5 working data migrates (localStorage --> Neon via Bridge)
Phase 5: TS_Exp5 working data migrates (JSON files --> Neon via Bridge)
Phase 6: ProjExp5 working data migrates (json-db-v2.js --> Neon via Bridge)
Phase 7: RevExp5 working data migrates
(see BB_PLATFORM_SCHEMA-v2.md v2.23 for current phase rollout plans)
Phase 8: JSON files become read-only backup, then deprecated
```

---

## 12. ELASTIC DATABASE -- NO MIGRATION PAIN

This section addresses BB's core requirement: **the DB must be elastic without the pains of migration, resetting, re-population, etc.**

### How Two-Compartment Neon + Superset Enrichment Delivers This

| Pain Point | How It's Eliminated |
|-----------|-------------------|
| **Schema migrations** | 90% of new fields go to JSONB (enrichment or details). Sam creates enrichment fields via Data Manager UI -- zero migration, zero code change, zero downtime. The remaining 10% (graduated fields) use additive-only ALTER TABLE ADD COLUMN. |
| **Database resets** | Never needed. JSONB is schemaless within the column. Old data keeps working. |
| **Re-population** | Never needed. Additive changes don't require data re-import. QBO sync continuously seeds core fields. Enrichment accumulates over time. |
| **Scaling up/down** | Neon auto-scales compute. Scale-to-zero when idle. |
| **Testing schema changes** | Neon branching. Branch, test, merge or delete. |
| **Rollback** | Neon PITR (7-30 days depending on plan). |
| **Multi-app different schemas** | JSONB enrichment/details is per-app flexible. Each app stores what it needs. |
| **Duplicated settings UIs** | Eliminated. Superset enrichment via Data Manager. One place to enrich, all apps read. |
| **Local file dependencies** | Eliminated. Working data in Compartment 2 replaces JSON files and localStorage. |
| **Development vs Production** | Neon branching gives instant dev copies. |

### The Elasticity Guarantee

```
Today's schema:
  employees table has 15 typed columns + enrichment JSONB  (see BB_PLATFORM_SCHEMA-v2.md v2.23 for current counts)

Tomorrow's need:
  New app needs "vehicleAssignment" on employees

Sam's action:
  1. Open Data Manager UI
  2. Click "+ Add Field"
  3. Entity: Employee, Key: vehicleAssignment, Type: select, Options: [TRK-001, TRK-002, TRK-003]
  4. Subscribe the new app
  5. Fill in values for each employee

Migration required: NONE
Downtime: NONE
Code change: NONE
Risk: NONE
Other apps affected: NONE
```

---

## 13. KNOWN TRADEOFFS

### Cold Start Latency (Scale-to-Zero)

Neon's free tier idles after 5 minutes of inactivity. Expected cold start: **~500ms-2s** for the first query.

**Impact for BB:** First employee checking hours in the morning may see a brief delay.

**Mitigations:**
| Option | Complexity | Cost |
|--------|-----------|------|
| Accept the delay | None | Free |
| Health check cron (ping every 4 min during business hours) | Low | Uses compute hours |
| Upgrade to Launch plan ($19/mo) | None | $19/mo |
| Bridge returns cached data while Neon wakes | Medium | Free |

**Recommendation:** Accept the delay for now. Add cron ping if noticeable.

### Free Tier Storage Threshold

Neon free tier: **0.5 GB per project** (up to 5 GB across 10 projects).

**BB storage estimate (Year 1) -- updated for two-compartment model:**

| Data | Est. Size | Notes |
|------|----------|-------|
| Master data tables (employees, customers, vendors, work_jobcodes, properties, trades, master_items) | ~5 MB | ~500 records total (see BB_PLATFORM_SCHEMA-v2.md v2.23 for current counts — 7 C1 tables) |
| Enrichment registry + subscriptions | ~1 MB | ~100 field definitions |
| CalExp5 working data | ~6 MB | See BB_CALEXP5_SCHEMA.md v1.1 |
| TS_Exp5 working data (post-migration) | ~10 MB | Time entries + pay periods |
| RevExp5 working data (post-migration) | ~10 MB | Invoices + expenses |
| ProjExp5 working data (post-migration) | ~15 MB | Estimates with JSONB line items |
| App settings | ~1 MB | Per-app JSONB settings |
| Audit log (~10,000 entries/year) | ~20 MB | JSONB details per entry |
| Sync log | ~5 MB | Stats per sync run |
| Indexes (B-tree + GIN) | ~15 MB | Roughly matches data size |
| **Total Year 1 estimate** | **~88 MB** | Well under 0.5 GB |

### Bridge as Single Gateway

All apps go through the Bridge. Bridge down = all apps lose data access.

**Mitigations:** Circuit breakers, health checks, Railway auto-restart. Apps cache recent data for read-only mode during outage.

### JSONB Limitations

- No database-level constraints on JSONB sub-fields (app layer validates via registry)
- JSONB queries slower than typed column queries (fine at BB's scale, graduate when needed)
- Enrichment can become a large blob (manageable at 30-50 fields per entity)

### Superset Enrichment Risks

- Data Manager UI is a significant build (mitigated by phased delivery)
- Field type conflicts between apps (mitigated by registry being the single authority)
- "Filled %" can drop if new fields aren't populated (visible in Data Manager)

---

## 14. NEON SCHEMA (COMPLETE)

### Compartment 1: Master Data

> NOTE: Schema v2.23 defines 7 C1 tables. See BB_PLATFORM_SCHEMA-v2.md for complete Drizzle schemas for properties, trades, and master_items.

```
employees       { typed QBO/QBT columns + enrichment jsonb }  -- See Section 5 for Drizzle schema
customers       { typed QBO columns + enrichment jsonb }       -- DDL in BB_PLATFORM_ARCHITECTURE.md (TBD)
vendors         { typed QBO columns + enrichment jsonb }       -- DDL in BB_PLATFORM_ARCHITECTURE.md (TBD)
work_jobcodes   { typed QBT columns + enrichment jsonb }       -- See BB_CALEXP5_SCHEMA.md Section 3
```

**Note:** `customers` and `vendors` follow the same pattern as `employees` (typed QBO columns + enrichment JSONB). Their full Drizzle DDL is defined in BB_PLATFORM_SCHEMA-v2.md v2.23. For Phase 1, only `employees` and `work_jobcodes` are required.

**Previously deferred, now defined:** `master_items` (see Schema v2.23). `accounts` has been removed.

### Compartment 2: Working Data (per-app)

> **Note:** Table names below are aligned with BB_PLATFORM_SCHEMA-v2.md v2.23. See that document for full column definitions. Total: 26 C2 tables across 9 apps.

```
-- CalExp5 (5 tables)
cal_manual_hours        { user_id, date, jobcode_id, hours, details jsonb }
cal_selected_jobcodes   { user_id, jobcode_id, sort_order }
cal_uploaded_timesheets { user_id, date, jobcode_id, qbt_timesheet_id }
cal_user_settings       { user_id, display prefs, details jsonb }
cal_audit_log           { user_id, action, entity_type, details jsonb }

-- TS_Exp5 (4 tables)
ts_timesheet_snapshots  { employee_id, pay_period, snapshots jsonb, enrichmentSnapshotAt }
ts_pay_periods          { start_date, end_date, status, details jsonb }
ts_auto_lunch_runs      { pay_period, entries jsonb, enrichmentSnapshotAt }
ts_auto_note_runs       { pay_period, entries jsonb }

-- RevExp5 (2 tables)
rev_cycle_snapshots     { cycle_number, details jsonb, enrichmentSnapshotAt }
rev_estimates           { customer_id, project_name, line_items jsonb }

-- PorjExp5 (3 tables)
proj_estimate_templates { name, items jsonb, milestones jsonb }
proj_projects           { customer_id, property_id, status, details jsonb }
proj_supplier_ignore_list { vendor_id, reason }

-- BB-DocEngine (3 tables)
doc_contracts           { customer_id, estimate_id, status, enrichmentSnapshotAt }
doc_estimate_templates  { name, sections jsonb }
doc_qbo_notes_backup    { entity_type, entity_id, notes }

-- Invoice_Validate2 (4 tables)
inv_validation_runs     { run_date, summary jsonb, enrichmentSnapshotAt }
inv_validation_checks   { run_id, check_type, result }
inv_receipt_matches     { run_id, receipt_id, match_status }
inv_validation_suppressions { check_type, entity_id, reason }

-- Chase_Validate (1 table)
chase_validation_sessions { session_date, transactions jsonb }

-- Adobe eSigner (3 tables)
esign_agreements        { contract_id, status, details jsonb }
esign_overlay_registry  { template_name, overlays jsonb }
esign_signers           { agreement_id, name, email, status }

-- Landfill_Surcharge (1 table)
lf_surcharge_calculations { pay_period, surcharges jsonb }
```

### Shared Infrastructure -- Drizzle Schemas

```typescript
// ============================================================
// ENRICHMENT_FIELDS -- Registry of all enrichment field definitions
// ============================================================
export const enrichmentFields = pgTable('enrichment_fields', {
  id:            text('id').primaryKey(),                          // e.g., 'emp_defaultCrew'
  entityType:    text('entity_type').notNull(),                    // 'employee', 'customer', 'vendor'
  fieldKey:      text('field_key').notNull(),                      // 'defaultCrew', 'mileageRate'
  displayName:   text('display_name').notNull(),                   // 'Default Crew'
  fieldType:     text('field_type').notNull(),                     // 'text','number','boolean','select','tags','color','date','object','context_map'
  options:       jsonb('options').default(null),                    // For select/tags: ["A","B","C"] or [{value,label}]
  defaultValue:  jsonb('default_value').default(null),             // Default when field is first added to entity
  isRequired:    boolean('is_required').default(false),
  isArchived:    boolean('is_archived').default(false),            // Soft delete. Data preserved in JSONB.
  sortOrder:     integer('sort_order').default(0),                 // Display order in Data Manager UI
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_enr_fields_entity_key').on(table.entityType, table.fieldKey),
  index('idx_enr_fields_entity').on(table.entityType),
]);

// ============================================================
// APP_FIELD_SUBSCRIPTIONS -- Which apps need which enrichment fields
// ============================================================
export const appFieldSubscriptions = pgTable('app_field_subscriptions', {
  id:            text('id').primaryKey(),                          // e.g., 'calexp5_employee_defaultCrew'
  appName:       text('app_name').notNull(),                       // 'calexp5', 'ts_exp5', etc.
  entityType:    text('entity_type').notNull(),                    // matches enrichment_fields.entity_type
  fieldKey:      text('field_key').notNull(),                      // matches enrichment_fields.field_key
  isRequired:    boolean('is_required').default(false),            // App-level: must this field be filled?
  isActive:      boolean('is_active').default(true),               // Deactivated when field is archived
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  uniqueIndex('idx_app_subs_unique').on(table.appName, table.entityType, table.fieldKey),
  index('idx_app_subs_app').on(table.appName),
]);

// ============================================================
// APP_SETTINGS -- Per-app and global configuration
// ============================================================
export const appSettings = pgTable('app_settings', {
  id:            text('id').primaryKey(),                          // e.g., 'calexp5_display'
  appName:       text('app_name').notNull(),                       // 'calexp5', 'ts_exp5', '_global'
  category:      text('category').notNull(),                       // 'display', 'sync', 'defaults', 'payroll'
  settings:      jsonb('settings').default({}).notNull(),           // Entire settings object (JSONB)
  updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
  updatedBy:     text('updated_by'),                               // Clerk user ID
}, (table) => [
  uniqueIndex('idx_app_settings_unique').on(table.appName, table.category),
]);

// ============================================================
// AUDIT_LOG -- Platform-wide audit trail
// ============================================================
export const auditLog = pgTable('audit_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        text('user_id'),                                  // employees.id (null for system)
  userName:      text('user_name'),                                // Denormalized
  appName:       text('app_name'),                                 // Which app generated this entry
  action:        text('action').notNull(),                         // 'create', 'update', 'delete', 'sync', 'login'
  entityType:    text('entity_type').notNull(),                    // 'employee', 'timesheet', 'setting', etc.
  entityId:      text('entity_id'),                                // ID of affected entity
  oldValue:      jsonb('old_value'),                               // Previous state
  newValue:      jsonb('new_value'),                               // New state
  metadata:      jsonb('metadata').default({}),                    // Extra context
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_audit_user').on(table.userId),
  index('idx_audit_action').on(table.action),
  index('idx_audit_created').on(table.createdAt),
  index('idx_audit_entity').on(table.entityType, table.entityId),
  index('idx_audit_app').on(table.appName),
]);

// ============================================================
// SYNC_LOG -- QBO/QBT sync history
// ============================================================
export const syncLog = pgTable('sync_log', {
  id:            uuid('id').primaryKey().defaultRandom(),
  source:        text('source').notNull(),                         // 'qbo', 'qbt'
  entityType:    text('entity_type').notNull(),                    // 'employee', 'customer', 'vendor', 'jobcode'
  status:        text('status').notNull(),                         // 'success', 'partial', 'failed'
  recordsChecked:  integer('records_checked').default(0),
  recordsUpdated:  integer('records_updated').default(0),
  recordsInserted: integer('records_inserted').default(0),
  recordsSkipped:  integer('records_skipped').default(0),
  recordsFailed:   integer('records_failed').default(0),
  changes:       jsonb('changes').default([]),                     // Array of { entityId, field, old, new }
  errors:        jsonb('errors').default([]),                      // Array of { entityId, error }
  durationMs:    integer('duration_ms'),
  syncedAt:      timestamp('synced_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_sync_log_source').on(table.source),
  index('idx_sync_log_synced').on(table.syncedAt),
]);

// enrichment_history — field-level enrichment change tracking (v2.23)
// Full Drizzle schema defined in BB_PLATFORM_SCHEMA-v2.md v2.23 Section 4.
// Columns: id, entity_type, entity_id, field_name, old_value, new_value,
//          enrichment_version, changed_by, changed_at
```

### Full schema DDL: See BB_CALEXP5_SCHEMA.md v1.2 (CalExp5 working data) and BB_PLATFORM_SCHEMA-v2.md v2.23 (all master data, C2, and infrastructure table definitions)

---

## 15. IMPLEMENTATION PHASES

```
DB-1: Bridge Foundation
  |-- Bridge connects to Neon (Drizzle + pooled connection)
  |-- Create master data tables (employees, work_jobcodes)
  |-- QBO/QBT sync running on schedule (15-min cron)
  |-- Basic CRUD API for master data (/api/master/*)
  |-- WebAuthn + PIN auth on Bridge (crew apps)
  |-- CalExp5 reads master data from Bridge instead of QBO directly
  |-- Composite QBT write endpoints (timesheet submit/delete)

DB-2: Enrichment Registry + Working Data API
  |-- Create enrichment_fields + app_field_subscriptions tables
  |-- Registry CRUD API endpoints (/api/registry/*)
  |-- Bridge validates enrichment writes against registry
  |-- Field-filtered responses (?app=calexp5)
  |-- Create cal_* working data tables
  |-- CalExp5 working data API endpoints (/api/cal/*)
  |-- app_settings table + API (/api/settings/*)
  |-- Bulk-upsert endpoints for localStorage migration

DB-3: Data Manager UI (v1)
  |-- Entity grid views (employees, jobcodes)
  |-- Edit form with typed inputs from registry
  |-- Schema Manager: view/add/archive enrichment fields
  |-- App subscription management
  |-- Sync status + manual trigger

DB-4: CalExp5 Working Data Migration
  |-- Migrate uploadedTimesheetsByUser to Bridge (PRIORITY)
  |-- Migrate settings.json to app_settings via Bridge
  |-- Dual-write (localStorage + Bridge API) with feature flags
  |-- Migrate manual hours, selected jobcodes
  |-- See BB_CALEXP5_SCHEMA.md v1.2 for detailed table designs

DB-5: TS_Exp5 Migration
  |-- Create ts_* working data tables
  |-- Migrate JSON files --> Neon (one-time import)
  |-- Deploy TS_Exp5 to Railway
  |-- TS_Exp5 reads master data + writes working data through Bridge

DB-6: ProjExp5 Migration
  |-- Create proj_* working data tables + customers/vendors master data
  |-- Migrate json-db-v2.js data --> Neon
  |-- Deploy ProjExp5 to Railway

DB-7: RevExp5 + Remaining Apps

DB-8: Data Manager UI (v2)
  |-- Inline grid editing
  |-- Bulk operations
  |-- Working data read-only views
  |-- Audit log viewer
  |-- "Filled %" metrics + data quality dashboard
  |-- "Recently Changed by QBO" alert panel
```

---

## 16. APP DEPLOYMENT STATUS

| App | Current Deployment | Target Deployment | DB Migration Status |
|-----|-------------------|-------------------|-------------------|
| **BB Micro-Bridge** | Railway (live, port 3105) | Railway | DB-1: Neon connection + sync + enrichment registry |
| **BB Data Manager** | Does not exist | Railway (new app) | DB-3: central enrichment/schema management UI |
| **CalExp5** | Railway (live) | Railway | DB-4: localStorage --> Neon via Bridge |
| **TS_Exp5** | Local only (port 3035) | Railway (planned) | DB-5: JSON files --> Neon via Bridge |
| **RevExp5** | Local only (port 3150) | Railway (planned) | DB-7: JSON files --> Neon via Bridge |
| **ProjExp5** | Local only (port 3460) | Railway (planned) | DB-6: json-db-v2.js --> Neon via Bridge |
| **Mini_API_Bridge** | Local (port 3100) | Stays local | Shared infrastructure -- not migrated |
| **Adobe eSigner** | Local | TBD | No DB |
| **Binder_Exp** | Local | TBD | No DB |

---

## 17. OPERATIONAL NOTES (from Platform Readiness Review, 2026-03-13)

### Connection Security

- **Always use `sslmode=verify-full`** in connection strings. Default `sslmode=require` is vulnerable to MITM.
- Add `sslrootcert=system` if the client supports it.
- **IP allowlisting** available in Neon -- evaluate restricting to Railway's IP ranges.

### PgBouncer Transaction Mode Limitations

Neon's built-in pooler uses PgBouncer in **transaction mode**. This prohibits:
- `SET` / `RESET` statements across transactions
- `LISTEN` / `NOTIFY`
- SQL-level `PREPARE` / `DEALLOCATE` (test Drizzle prepared statements early)
- Session-level advisory locks
- Temporary tables with `PRESERVE` / `DELETE ROWS`

**Workaround for search_path:** Use `ALTER ROLE user1 SET search_path TO myschema, public;`

### Monitoring Constraints

- `pg_stat_statements` statistics wiped when compute suspends (scale-to-zero).
- OpenTelemetry export requires Scale plan ($69/mo).
- **Recommendation:** Accept periodic stats loss on Launch plan.

### PITR Window Configuration

- Free tier: 6 hours (not configurable)
- Launch tier: **1 day default** -- must explicitly configure to 7 days
- Scale tier: up to 30 days

### Seeding Best Practices

- Use `INSERT ... ON CONFLICT DO UPDATE` (idempotent upsert) for all seed scripts
- Wrap inserts in a single `transaction()` for atomicity
- BB's data volume (~500 records) fits in a single transaction per entity type

### Circuit Breakers for DB Calls

Add Cockatiel circuit breakers for Neon calls (same pattern as QBO/QBT breakers in Bridge).

### Neon Branch Management

```bash
# Create a dev branch
neonctl branches create --name dev/feature-x --parent main --project-id <id>

# Create an expiring branch
neonctl branches create --name dev/feature-x --expires-at "2026-03-21T00:00:00Z"

# Reset branch to parent state
neonctl branches reset dev/feature-x --parent

# Get connection string
neonctl connection-string dev/feature-x

# Delete when done
neonctl branches delete dev/feature-x
```

Branch billing: Storage is copy-on-write -- only delta counts toward billing ($0.35/GB-month).

---

## 18. DECISIONS SUMMARY

| # | Decision | Choice | Date | Rationale |
|---|----------|--------|------|-----------|
| 1 | Database provider | **Neon Serverless Postgres** | 2026-03-05 | Scale-to-zero, PITR, branching, SPOF separation, built-in pooling |
| 2 | ORM | **Drizzle** | 2026-03-05 | SQL-first, tiny bundle, excellent JSONB support |
| 3 | Schema strategy | **Typed core + JSONB hybrid** | 2026-03-04 | Zero-migration enrichment, elastic without pain |
| 4 | Migration philosophy | **Additive-only** | 2026-03-05 | Never remove/rename columns. JSONB for flex fields. |
| 5 | Migration safety | **Neon branching** | 2026-03-05 | Branch DB, test, merge or delete. Zero production risk. |
| 6 | Dev/test databases | **Neon branches** | 2026-03-05 | Instant copies of production data. |
| 7 | Database model | **Two-compartment** | 2026-03-14 | Shared master data + per-app working data. Eliminates local file deps, duplicated settings, siloed enrichment. |
| 8 | Enrichment model | **Superset with central registry** | 2026-03-14 | One place to define/populate enrichment. Apps subscribe. Replaces per-app settings UIs. |
| 9 | Enrichment management | **Data Manager UI (new app)** | 2026-03-14 | Central admin panel for enrichment, schema fields, settings, sync. Sam self-serves without code changes. |
| 10 | Bridge architecture | **Single service (gateway + data + sync)** | 2026-03-14 | Simplest for BB's scale. Extract sync worker later if needed. |
| 11 | App settings | **`app_settings` table with JSONB** | 2026-03-14 | Replaces localStorage + file-based settings. Per-app + global. |
| 12 | Auth (crew apps) | **WebAuthn/Face ID + PIN** | 2026-03-15 | Lightweight, no external provider. Face ID primary, 4-digit PIN fallback. Built at DB-2. |
| 13 | Auth (admin apps) | **Clerk (deferred to DB-4+)** | 2026-03-15 | Proper sessions, role separation, OAuth for Sam + admin-facing apps. |

---

## 19. CROSS-REFERENCES

- **Authoritative table definitions:** See BB_PLATFORM_SCHEMA-v2.md v2.24 (all C1/C2/infrastructure table definitions, column lists, enrichment registries, and phase rollout plans)
- **CalExp5 schema (working data):** See BB_CALEXP5_SCHEMA.md v1.3
- **Platform readiness audit:** See BB_PLATFORM_READINESS_REPORT.md v1.3
- **CalExp5 migration plan:** See BB_PLATFORM_READINESS_REPORT.md v1.3 @ Section 2
- **Field statistics:** See BB_FIELD_STATS.md v1.1
- **Bridge field audit:** See BB_BRIDGE_SUPERSET_AUDIT.md v1.1
- **Cross-document audit:** See BB_CROSS_DOC_AUDIT.md v1.5
- **Architecture analysis:** See BB_ARCHITECTURE_ANALYSIS.md v1.2 (includes auth strategy in Section 12)
- **MDM best practices:** See BB_MDM_BEST_PRACTICES.md v1.1
- **Data Manager spec:** See BB_DATA_MANAGER_SPEC.md v1.1
- **Implementation specs:** See BB_IMPLEMENTATION_SPECS.md v1.0

> **Note:** BB_PLATFORM_ARCHITECTURE.md (in TEMPLATES/) is the older architecture document. It has been superseded by BB_PLATFORM_SCHEMA-v2.md v2.24 for all table definitions, and by this document for architecture decisions.

---

*This document is the authoritative reference for all BB database decisions. It covers the WHY and the MODEL. BB_PLATFORM_SCHEMA-v2.md v2.23 covers the full schema DDL. BB_CALEXP5_SCHEMA.md v1.2 covers CalExp5-specific working data tables. BB_PLATFORM_READINESS_REPORT.md v1.3 covers implementation gaps and action items.*
