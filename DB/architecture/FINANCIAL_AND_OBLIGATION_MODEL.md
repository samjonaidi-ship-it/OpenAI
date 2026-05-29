# Financial And Obligation Model

This document defines how the platform should model financial records, obligations, terms, balances, and payment-related workflows.

It is a companion to:

- `MASTER_DATA_MANAGEMENT.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`
- `COMMUNICATIONS_AND_ACTION_MODEL.md`
- `WORKFLOW_AND_APPROVAL_MODEL.md`

## Purpose

The platform needs to reason about:

- estimates
- invoices
- receipts
- payments
- terms
- credit and aging
- payables and receivables
- reminders and obligations

This is required for:

- QBO integration
- stakeholder 360 views
- payment reminders
- bid and invoice follow-up
- agent explanations

## Core Principle

Do not rely only on raw QBO records for operational reasoning.

Preserve QBO as authoritative where appropriate, but maintain:

- canonical linked entities
- obligation state
- reminder state
- visibility-safe projections

## Core Objects

### Financial Document

Examples:

- estimate
- invoice
- receipt
- credit memo

### Obligation

A payable, receivable, or commitment the system cares about.

Examples:

- customer owes invoice
- Bainbridge owes subcontractor payment
- supplier invoice pending review

### Payment

Money movement or recorded settlement.

### Terms Snapshot

Time-bound terms relevant to an obligation.

Examples:

- net 30
- due on receipt
- credit line
- late fee policy

## Recommended Core Tables

- `financial_documents`
- `financial_document_revisions`
- `obligations`
- `obligation_parties`
- `payments`
- `payment_allocations`
- `terms_history`
- `aging_snapshots`

## Visibility

Financial data is highly sensitive.

Visibility must support:

- internal financial views
- stakeholder-safe subsets
- customer-visible invoice/payment context
- subcontractor-visible own invoice/payment context

Do not expose raw internal margin or unrelated payables broadly.

## QBO Alignment

QBO remains authoritative for selected accounting facts, but the platform should track:

- external source record
- linked obligation
- local workflow state
- reminder / notification state
- visibility-safe interpretation

## Communications Alignment

Financial obligations often generate communications.

Examples:

- payment reminder
- invoice clarification
- aging follow-up
- missing bid/invoice reminder

Those should link back to obligations and documents.

## Lifecycle

Financial records need lifecycle.

Examples:

- estimate: draft -> issued -> revised -> accepted -> superseded
- invoice: draft -> issued -> due -> paid -> voided
- obligation: open -> partially satisfied -> satisfied -> disputed -> written_off

## Track A Activation

Track A should activate the subset needed for:

- QBO/QBT query support
- internal crew/lead/admin operations
- governed financial follow-up support

Do not overbuild customer-facing billing product flows in Track A.

## Design Rules

1. Separate documents from obligations.
2. Separate obligations from payments.
3. Preserve terms and credit history over time.
4. Keep QBO linkage explicit.
5. Filter financial visibility aggressively by stakeholder scope.
6. Link financial state to communications and reminders.

## Next Design Step

The next practical step is to define:

- canonical obligation types
- invoice/payment visibility rules
- QBO linking strategy
- first aging and reminder projections
