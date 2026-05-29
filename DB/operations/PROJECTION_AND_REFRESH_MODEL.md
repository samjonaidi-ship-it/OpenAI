# Projection And Refresh Model

This document defines how read models, 360 views, and agent-facing summaries should be maintained and refreshed.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ACTION_AND_NOTIFICATION_MODEL.md`
- `TRACK_A_DB_ALIGNMENT.md`

## Purpose

The normalized write model is not the same thing as the best serving model for:

- dashboards
- 360 views
- approval queues
- agent retrieval
- reminders and alerts

This document defines the projection strategy.

## Core Principle

Do not ask the UI or agents to reconstruct every answer from the raw normalized graph in real time.

Use:

1. canonical write models
2. projections
3. refresh tracking

## Projection Types

### 1. 360 Projections

Examples:

- `crew_360_projection`
- `customer_360_projection`
- `property_360_projection`

### 2. Operational Queue Projections

Examples:

- `approval_queue_projection`
- `workflow_queue_projection`
- `dispatch_queue_projection`

### 3. Monitoring Projections

Examples:

- `aging_projection`
- `warranty_risk_projection`
- `trace_quality_projection`

### 4. Agent Retrieval Projections

Examples:

- concise stakeholder summaries
- unresolved obligation summaries
- latest approved document summary

## Refresh Strategies

Use a hybrid model.

### Synchronous Refresh

Use only when:

- projection must be current inside the same transaction boundary
- record volume is low
- serving correctness is critical

### Event/Outbox-Driven Refresh

Use for most operational projections.

Pattern:

1. canonical write occurs
2. outbox/event emitted
3. projection worker updates read model

### Scheduled Refresh

Use when:

- projection is aggregate-heavy
- real-time freshness is not required
- upstream systems are batch-oriented

## Refresh Metadata

Each important projection should track:

- `projection_name`
- `subject_scope`
- `last_refreshed_at`
- `source_watermark`
- `master_watermark`
- `status`
- `error_state`

Recommended table:

- `projection_refresh_state`

## Freshness Rules

Agents should know whether they are reading:

- current enough data
- slightly stale but acceptable data
- stale data requiring refresh or explanation

This should not be hidden.

## Track A Priority Projections

Track A should prioritize:

- `crew_360_projection`
- `workflow_queue_projection`
- `approval_queue_projection`
- `knowledge_freshness_projection`
- `trace_quality_projection`

## Future Projections

Deferred but valid later:

- `customer_360_projection`
- `supplier_portal_projection`
- `property_intelligence_projection`

## Design Rules

1. Treat projections as first-class architecture, not ad hoc caches.
2. Keep projection freshness explicit.
3. Use outbox/event-driven refresh for most operational views.
4. Keep aggregate-heavy summaries on scheduled refresh where appropriate.
5. Let agents prefer projections first, canonical tables second, raw source payloads last.

## Next Design Step

The next practical step is to define:

- first projection inventory
- refresh SLA by projection type
- refresh workers and triggers
- stale-data behavior for agents and UI
