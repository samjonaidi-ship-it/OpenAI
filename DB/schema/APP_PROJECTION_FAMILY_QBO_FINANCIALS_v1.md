# APP_PROJECTION_FAMILY_QBO_FINANCIALS_v1.md

## Purpose

This document defines the first concrete shared projection family for:
- Chase_Expense_Validator
- RevExp5
- future Track A financial read paths

The goal is one shared QBO financial projection family with app-specific read models built on top.

## Scope

Source systems:
- QBO

Primary entities:
- Purchase
- Bill
- Invoice
- Payment
- Attachable

Not in scope for v1:
- full QBT labor reconciliation
- raw binary PDF/blob storage
- full customer 360 composition

## Shared Canonical Financial Objects

Canonical tables assumed:
- `financial_document`
- `financial_document_line`
- `financial_attachment`
- `payment_event`
- `source_sync_watermark`
- `source_change_event`

### `financial_document`

Minimum normalized fields:
- `document_id`
- `source_system`
- `source_entity_type`
- `source_entity_id`
- `document_type`
- `doc_number`
- `txn_date`
- `due_date`
- `counterparty_name`
- `counterparty_source_ref`
- `total_amount`
- `balance_amount`
- `currency_code`
- `job_name_normalized`
- `billable_flag`
- `last_source_updated_at`
- `last_synced_at`

### `financial_attachment`

Minimum normalized fields:
- `attachment_id`
- `source_system`
- `source_entity_id`
- `source_parent_entity_type`
- `source_parent_entity_id`
- `file_name`
- `content_type`
- `size_bytes`
- `create_time`
- `temp_download_uri_present`
- `last_synced_at`

### `payment_event`

Minimum normalized fields:
- `payment_event_id`
- `source_system`
- `source_entity_id`
- `applies_to_document_id`
- `payment_date`
- `payment_amount`
- `last_synced_at`

## Projection Family Members

### 1. `proj_fin_purchase_match_v1`

Purpose:
- support Chase and Home Depot reconciliation

Grain:
- one row per Purchase or Bill candidate record

Fields:
- `projection_row_id`
- `entity_type` (`purchase` or `bill`)
- `source_entity_id`
- `txn_date`
- `total_amount`
- `counterparty_name`
- `doc_number`
- `job_name_normalized`
- `billable_flag`
- `has_attachments`
- `attachment_count`
- `last_source_updated_at`
- `last_projected_at`

Indexes:
- `(entity_type, txn_date)`
- `(entity_type, total_amount, txn_date)`
- `(counterparty_name)` if normalized matching expands later

Consumers:
- Chase_Expense_Validator
- future purchase/bill validation tools

### 2. `proj_fin_invoice_summary_v1`

Purpose:
- support RevExp5 invoice timeline and summary reads

Grain:
- one row per invoice

Fields:
- `projection_row_id`
- `invoice_source_id`
- `doc_number`
- `customer_name`
- `txn_date`
- `due_date`
- `total_amount`
- `balance_amount`
- `payment_date`
- `status_group`
- `has_attachments`
- `attachment_count`
- `last_source_updated_at`
- `last_projected_at`

Indexes:
- `(txn_date)`
- `(customer_name, txn_date)`
- `(status_group, txn_date)`
- `(doc_number)`

Consumers:
- RevExp5
- future invoice reporting apps

### 3. `proj_fin_attachment_summary_v1`

Purpose:
- support fast attachment presence/count checks without binary fetch

Grain:
- one row per parent financial document

Fields:
- `projection_row_id`
- `parent_entity_type`
- `parent_source_entity_id`
- `attachment_count`
- `first_attachment_created_at`
- `latest_attachment_created_at`
- `attachment_names_sample`
- `last_projected_at`

Indexes:
- `(parent_entity_type, parent_source_entity_id)` unique

Consumers:
- Chase_Expense_Validator
- RevExp5
- future finance portal views

## App-Specific Use

### Chase_Expense_Validator

First-pass modal should use:
- `proj_fin_purchase_match_v1`
- `proj_fin_attachment_summary_v1`

Live QBO should remain only for:
- actual attachment binary retrieval

### RevExp5

First-pass timeline should use:
- `proj_fin_invoice_summary_v1`
- `proj_fin_attachment_summary_v1`

Live QBO should remain only for:
- invoice PDF binary retrieval
- actual attachment binary retrieval

## Refresh Strategy

### Trigger Sources
- QBO webhooks
- CDC catch-up jobs
- targeted refresh after manual write-back when needed

### Incremental Flow
1. webhook arrives
2. affected source entity type is identified
3. raw source table updated
4. canonical financial tables upserted
5. affected projections marked dirty
6. projection worker refreshes only impacted rows

### Full Rebuild Flow
1. replay raw QBO source rows
2. rebuild canonical financial tables
3. truncate/rebuild projection family
4. validate row counts and freshness

## Freshness Targets

- `proj_fin_purchase_match_v1`: `interactive_hot`
  - target: under 2 minutes after source change
- `proj_fin_invoice_summary_v1`: `operational_warm`
  - target: under 5 minutes after source change
- `proj_fin_attachment_summary_v1`: `interactive_hot`
  - target: under 2 minutes after source change

## QBO Webhook And CDC Fit

Webhook role:
- notify the Bridge that Purchase, Bill, Invoice, Payment, or Attachable-related state changed

CDC role:
- pull changed entities since the last watermark where supported

Targeted refresh role:
- fill gaps where webhook payload or CDC coverage is not enough for exact downstream refresh

## Neon Impact

Expected impact of this family:
- moderate additional writes
- substantial reduction in request-time QBO dependency
- modest storage growth relative to current Launch capacity

This is the correct trade for app responsiveness.

## First Implementation Sequence

1. add raw QBO sync tables for Invoice, Purchase, Bill, Payment, Attachable
2. add canonical financial tables
3. add projection registry entries
4. build `proj_fin_attachment_summary_v1`
5. build `proj_fin_purchase_match_v1`
6. build `proj_fin_invoice_summary_v1`
7. cut Chase_Expense_Validator first-pass reads to projection
8. cut RevExp5 timeline reads to projection
9. keep binary PDF/attachment fetches live and lazy

## Recommendation

Adopt this projection family as the first shared app projection family.

It gives:
- one shared model for Chase and RevExp5
- a clean bridge into the broader new DB architecture
- a reusable pattern for future app projections
