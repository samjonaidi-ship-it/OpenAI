# UNIVERSAL_PROJECTION_ARCHITECTURE.md

## Purpose

This document defines the universal projection architecture for the platform.

A projection is a derived, read-optimized model built from canonical source domains.
It is not the source of truth.
It must be rebuildable.

This architecture exists so multiple apps can share one projection framework instead of inventing app-local caches and denormalized tables independently.

## Core Rule

Use three layers:

1. source ingest layer
2. canonical normalized domain layer
3. read projection layer

Do not skip directly from source APIs to app-specific caches unless the use case is strictly ephemeral and non-critical.

## Layer 1: Source Ingest

This layer stores source-native or near-source-native records plus sync metadata.

Examples:
- `qbo_invoice_raw`
- `qbo_purchase_raw`
- `qbo_bill_raw`
- `qbo_payment_raw`
- `qbo_attachable_raw`
- `qbt_timesheet_raw`
- `communication_message_raw`
- `gps_observation_raw`

Required fields:
- source system
- source entity type
- source id
- raw payload
- source last updated timestamp
- first seen timestamp
- last seen timestamp
- sync status
- sync watermark / cursor linkage

This layer supports:
- replay
- auditability
- rebuilds
- source diffing

## Layer 2: Canonical Domain

This layer converts source-native records into platform business objects.

Examples:
- `financial_document`
- `financial_document_line`
- `financial_attachment`
- `payment_event`
- `work_time_entry`
- `communication_thread`
- `communication_action_candidate`
- `stakeholder_contact_point`

This layer must:
- preserve stable business semantics
- survive source-system changes better than app-specific projections
- support cross-app joins
- support 360 views later

This layer is authoritative inside the product DB.

## Layer 3: Read Projections

This layer is optimized for app reads, search, dashboards, queues, and agents.

Examples:
- `proj_app_chase_reconciliation_v1`
- `proj_app_revexp_invoice_timeline_v1`
- `proj_fin_invoice_attachment_summary_v1`
- `proj_ops_workflow_queue_v1`
- `proj_360_customer_financial_snapshot_v1`

A projection may:
- denormalize
- precompute
- flatten joins
- include app-specific fields
- be rebuilt from lower layers

A projection may not:
- become the only copy of important business data
- hide provenance
- silently change semantics without versioning

## Projection Families

Use projection families by purpose.

### 1. Transaction Match Projections

Used by:
- Chase_Expense_Validator
- Bill reconciliation
- labor validation tools

Shape:
- amount/date/vendor-oriented matching
- attachment presence
- job / billable hints
- light-weight summaries

### 2. Timeline And Reporting Projections

Used by:
- RevExp5
- reporting UIs
- finance dashboards

Shape:
- invoice summary
- payment status
- attachment counts
- aging and bucket fields
- date/window grouping support

### 3. Workflow And Queue Projections

Used by:
- Track A crew workflows
- approvals
- reminders
- communications follow-up

### 4. 360 Projections

Used by:
- future customer/vendor/subcontractor/crew views
- agents
- portal summaries

## Refresh Model

Every projection must support:

1. incremental refresh
2. full rebuild

Incremental triggers:
- source webhook notification
- CDC changes
- explicit targeted refresh after write-back
- scheduled catch-up reconciliation

Full rebuild triggers:
- projection version change
- canonical mapping change
- corruption recovery
- migration replay

## Freshness Classes

Every projection must declare one freshness class.

- `interactive_hot`
  - target: seconds to low minutes
  - examples: Chase reconciliation, workflow queue
- `operational_warm`
  - target: minutes
  - examples: RevExp5 invoice summary
- `analytical_cold`
  - target: tens of minutes to hours
  - examples: broad trends, seasonal summaries

## Projection Versioning

Version projections explicitly.

Examples:
- `proj_app_chase_reconciliation_v1`
- `proj_app_chase_reconciliation_v2`
- `proj_app_revexp_invoice_timeline_v1`

Rules:
- semantic changes require a new version
- do not mutate old projections in place when consumer behavior would change
- cut consumers over deliberately
- retire older versions after validation

## Universal Metadata Requirements

Every projection row or projection batch must support:
- projection name
- projection version
- source refresh watermark
- last refreshed timestamp
- freshness class
- rebuildable indicator
- provenance summary

Store refresh state centrally as well:
- `projection_refresh_state`
- `projection_dependency_registry`
- `projection_dirty_queue`

## Recommended Shared Infrastructure Tables

- `source_sync_watermark`
- `source_change_event`
- `projection_refresh_state`
- `projection_dependency_registry`
- `projection_refresh_job`
- `projection_dirty_entity`

## App-Specific Guidance

### Chase_Expense_Validator

Should read from a match-oriented projection backed by QBO purchase and bill projections.
It should not depend on request-time live QBO reads for common first-pass matching.

### RevExp5

Should read from invoice/payment/attachment projections.
It should use live QBO only for binary PDF and attachment retrieval when needed.

### Track A

Should use workflow, queue, and crew-operational projections first.
Customer-facing 360 projections remain later-phase consumers.

## Architectural Boundary

Universal projection architecture does not mean one giant mega-projection.

Preferred pattern:
- small reusable domain projections
- composed app projections
- explicit ownership and versioning

Do not build:
- one table for every app and every question
- one universal denormalized monster table

## Recommendation

Adopt this projection architecture as the canonical platform rule:

1. ingest raw source records
2. normalize to canonical domain
3. publish named versioned projections
4. refresh incrementally from webhooks and CDC
5. rebuild from raw/canonical layers when needed
