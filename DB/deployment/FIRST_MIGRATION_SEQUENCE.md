# First Migration Sequence

This document defines the recommended first migration sequence for the new Track A database.

It is not the final migration SQL.
It is the canonical order agents should implement.

## Goal

Bring up the smallest coherent Track A database that supports:

- identities
- graph
- source linkage
- workflow governance
- communications/actions
- scheduling subset
- telemetry subset
- projections

## Sequence

### Migration 001. Core Identity

Create:

- `users`
- `parties`
- `contact_points`
- `party_contact_points`
- `entity_types`
- `entities`
- `user_entity_memberships`

Why first:

- everything else depends on identity and scope

### Migration 002. Core Graph

Create:

- `entity_relationships`
- `events`
- `event_entities`

Why second:

- core operational linkage and eventing foundation

### Migration 003. Track A Profiles

Create:

- `addresses`
- `employees_profile`
- `crews_profile`
- `jobsites_profile`

Why now:

- Track A needs crew and jobsite context early

### Migration 004. Source Linkage / MDM

Create:

- `external_systems`
- `external_records`
- `external_change_log`
- `external_sync_cursors`
- `entity_external_links`
- `attribute_history`

Why now:

- source landing and canonical linkage are required before real migration/backfill

### Migration 005. Workflow Governance

Create:

- `workflow_requests`
- `workflow_approvals`
- `workflow_executions`
- `idempotency_keys`
- `outbox_messages`
- `workflow_failures`
- `compensation_actions`
- `workflow_audit_events`

Why now:

- Track A A3 depends on governed write-back

### Migration 006. Communications And Actions

Create:

- `communications`
- `communication_threads`
- `communication_participants`
- `communication_entity_links`
- `communication_extractions`
- `signals`
- `action_candidates`
- `action_items`
- `reminders`
- `notifications`
- `notification_deliveries`

Why now:

- crew assistant behavior depends on structured follow-up/actioning

### Migration 007. Scheduling Subset

Create:

- `work_requests`
- `schedule_windows`
- `assignments`
- `service_engagements`

Why now:

- Track A crew scheduling integration depends on this subset

### Migration 008. Telemetry Subset

Create:

- `gps_traces`
- `device_health_traces`
- `derived_signals`

Why now:

- Track A uses crew GPS and device confidence signals

### Migration 009. Projection Refresh State

Create:

- `projection_refresh_state`

Why now:

- needed before projection workers and refresh tracking

### Migration 010. First Projection Tables / Views

Create:

- `crew_360_projection`
- `workflow_queue_projection`
- `approval_queue_projection`
- `knowledge_freshness_projection`
- `trace_quality_projection`

Implementation note:

- may be materialized views
- may be projection tables
- may be hybrid

## Seed Data

Early seed data should include:

- Track A role-related `entity_types`
- source-system rows for QBO/QBT/current CalExp5
- minimal status/enum reference records if stored as tables

## Design Rules

1. Keep each migration reviewable.
2. Do not front-load deferred customer/homeowner tables into phase 1.
3. Do not build projection tables before their source domains exist.
4. Do not build workflow-heavy actions without idempotency/outbox support.
