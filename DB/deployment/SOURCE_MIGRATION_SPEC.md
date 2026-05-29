# Source Migration Spec

This document defines the source-by-source migration approach for bringing data into the new Track A database.

It is a companion to:

- `MIGRATION_AND_CUTOVER_PLAN.md`
- `TRACK_A_TABLE_BLUEPRINT.md`
- `MASTER_DATA_MANAGEMENT.md`

## Purpose

The new DB will be built in parallel.

That means migration must be explicit about:

- source systems
- ingestion strategy
- linkage strategy
- replayability
- validation

## Migration Principles

1. Preserve raw source truth.
2. Preserve source provenance and watermarks.
3. Build canonical records without erasing imported history.
4. Make source ingestion idempotent where possible.
5. Prefer replayable backfills over one-off manual transformations.

## Source Inventory

### 1. Current CalExp5 / Bridge Operational Data

Purpose:

- provide current operational context needed for Track A
- seed crew-related entities and workflows

Likely source domains:

- users/employee references
- current scheduling/assignment state
- receipts/logs where relevant
- existing operational notes

Target tables:

- `entities`
- `employees_profile`
- `crews_profile`
- `jobsites_profile`
- `entity_relationships`
- `events`

Strategy:

- one-time backfill
- then selective sync or freeze depending on cutover timing

### 2. QBO

Purpose:

- financial and accounting-originated source data
- customer/vendor/accounting identity references
- invoices, payments, terms, credit metadata where relevant

Target tables:

- `external_records`
- `external_change_log`
- `entity_external_links`
- `attribute_history`
- selected finance-linked tables

Strategy:

- webhook-first where available
- CDC or bounded pull as catch-up
- preserve source version and updated timestamps

### 3. QBT

Purpose:

- labor/time-originated source data
- worker/time activity references
- assignment/time evidence where applicable

Target tables:

- `external_records`
- `entity_external_links`
- selected operational tables or projections

Strategy:

- incremental pull based on source capabilities
- explicit validation of change-tracking assumptions
- preserve source markers and fetch history

### 4. Communications Sources

Purpose:

- seed communication history required for Track A operational assistant behavior

Possible sources:

- email
- SMS
- internal notes/messages

Target tables:

- `communications`
- `communication_threads`
- `communication_participants`
- `communication_entity_links`

Strategy:

- start narrow
- only ingest channels in active Track A scope
- do not attempt universal communications migration in phase 1 unless required

### 5. Telemetry Sources

Purpose:

- seed crew GPS and device-health data if needed for validation or continuity

Target tables:

- `gps_traces`
- `device_health_traces`
- `derived_signals`

Strategy:

- migrate only if needed for current-state continuity or validation
- otherwise start new ingestion on new system at Track A activation

## Mapping Strategy

### Step 1. Raw Source Landing

Land source payloads into:

- `external_records`
- source-specific raw import staging where needed

### Step 2. Entity Resolution

Resolve imported records to:

- `parties`
- `entities`
- `entity_external_links`

### Step 3. Canonical Enrichment

Apply:

- attribute history
- relationship creation
- selected lifecycle state initialization

### Step 4. Projection Refresh

Update:

- queue projections
- crew 360
- freshness markers

## Ordering

Recommended migration order:

1. identity and parties
2. core entities
3. QBO/QBT source landing
4. entity external links
5. crew scheduling/assignment context
6. workflows/communications
7. projections

## Watermark Rules

For each imported source record, capture:

- `source_system`
- `source_record_id`
- `source_watermark`
- `source_updated_at`
- `last_fetched_at`
- `payload_hash`

## Replayability

Backfills should be:

- scriptable
- rerunnable
- idempotent where possible

Avoid one-off spreadsheet or manual edits as the primary migration path.

## Validation Expectations

For each source, validate:

- row counts
- linked-entity counts
- unmatched record counts
- stale watermark counts
- sample record fidelity

## Explicit Risks

1. identity mismatches between QBO, QBT, and current operational data
2. incomplete source-change tracking assumptions
3. over-migrating low-value legacy records too early
4. communications/telemetry volume expanding migration scope unnecessarily

## Next Design Step

The next practical step is to turn this into:

- source-specific field mapping sheets
- import job specs
- reconciliation query pack
