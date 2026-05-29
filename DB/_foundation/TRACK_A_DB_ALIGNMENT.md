# Track A DB Alignment

This document defines how the CalExp5 / BB Buddy database architecture should be interpreted for **Track A**, the first committed crew platform release.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ENTITY_LIFECYCLE_MODEL.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`
- `COMMUNICATIONS_AND_ACTION_MODEL.md`

Track A source scope is governed by:

- `C:\Users\samjo\Desktop\OpenAI\_track_a_review\BB_BUDDY_CREW_PLATFORM_v1.7.md`

## Purpose

The broader DB architecture describes the long-term universal stakeholder platform.

Track A is not that full platform yet.

Track A is the first production operating slice and must remain:

- crew-only
- single-tenant
- non-homeowner
- non-customer-upload
- non-property-intelligence

This document exists so the DB strategy remains future-compatible without causing Track A overbuild.

## Track A Canonical Scope

Track A is committed to:

- A0 SDK evaluation
- A1 MCP tool layer
- A2 crew-only knowledge system
- A3 crew-only operations assistant

From the DB perspective, that means Track A must support:

- crew identities and roles
- crew scheduling context
- QBO/QBT structured query support
- CalExp5 action routing
- governed write-back workflows
- approvals
- idempotency
- outbox and retry safety
- crew-only memory and communications support

## Hard Track A Boundaries

Forbidden for implementation in Track A:

- `tenant_id`
- RLS / multi-tenant isolation logic
- customer upload pipeline
- homeowner portal
- property intelligence product features
- customer-facing scheduling
- customer-facing notifications as a product surface
- Track B property/home-asset workflow activation

Allowed infrastructure that supports future domain rollout:

- host/domain resolution
- portal context/domain binding records
- future-safe principal/session shape

Important nuance:

The broader DB architecture may include structures that can support these future capabilities later.
That does **not** mean Track A should activate them now.

## How To Read The Broader DB Docs For Track A

Use this rule:

- architecture may be future-compatible
- implementation must be Track-A-bounded

That means:

- keep stable core concepts that will survive later
- do not activate deferred stakeholder experiences
- do not create Track B workflows just because the schema could support them

## Track A Active Domains

These domains are active now and should shape the first DB rollout.

### 1. Internal Identity And Crew Scope

Required now:

- users
- crew members
- leads
- admins
- PIN-linked role scope
- user-to-entity membership
- domain-aware request context for reserved internal portals

Future stakeholder expansion is deferred.

### 2. Structured Business Data Query Layer

Required now:

- QBO and QBT source ingestion
- external record linkage
- canonical crew-operational resolution where needed
- financial and operational query support for the crew assistant

### 3. Crew Knowledge Layer

Required now:

- unstructured crew knowledge storage references
- memory capture
- citations
- retrieval freshness

Important Track A rule:

- `knowledge` operates on unstructured crew docs only
- `query_data` operates on structured business data only
- those two retrieval systems must remain distinct

### 4. Workflow And Approval Layer

Required now:

- governed actions
- approval tiers
- idempotent write-back
- outbox
- retry
- compensation
- audit

### 5. Crew Communications And Reminders

Required now:

- internal and crew-facing communication records
- bid/vendor reminders where they support crew operations
- payment-follow-up support where relevant to internal operations
- daily action summaries for crew/lead/admin roles

Customer-facing communication as a product surface remains deferred.

### 6. Telemetry Relevant To Crew Operations

Required now:

- crew GPS traces
- device health diagnostics
- route/service verification support
- operational alerts derived from telemetry

## Track A Deferred But Architecture-Compatible Domains

These are valid parts of the long-term architecture but should remain latent in Track A.

- customer portal
- supplier portal
- subcontractor portal as a standalone product surface
- subscription tiers for external stakeholders
- property intelligence experience
- homeowner notifications
- customer uploads
- live media/security workflows as customer-facing products
- marketplace home-service platform

This means the DB can preserve clean extension points for them, but Track A should not spend build effort activating them.

## Track A First-Cut Canonical Table Families

The first DB rollout for Track A should prioritize:

- `users`
- `user_entity_memberships`
- `entities`
- `entity_relationships`
- `events`
- `event_entities`
- `external_records`
- `entity_external_links`
- `attribute_history`
- `communications`
- `communication_threads`
- `communication_participants`
- `action_items`
- `workflow_requests`
- `workflow_approvals`
- `workflow_executions`
- `idempotency_keys`
- `outbox_messages`
- `compensation_actions`
- `gps_traces`
- `device_health_traces`

Possible typed profiles needed early:

- `employees_profile`
- `crews_profile`
- `jobsites_profile`

Properties may still exist as reference context if CalExp5 already depends on them, but Track A should not expand into homeowner/product-intelligence workflows.

## Track A Projection Set

Track A should start with projections that serve crew operations only.

Recommended first projections:

- `crew_360_projection`
- `lead_team_projection`
- `workflow_queue_projection`
- `approval_queue_projection`
- `knowledge_freshness_projection`
- `crew_trace_quality_projection`

Do not prioritize:

- `customer_360_projection`
- `property_360_projection`
- `supplier_portal_projection`

unless strictly needed as internal support context.

## Access Model In Track A

The broader access architecture remains valid, but Track A should activate only the minimum needed roles:

- admin
- lead
- crew

Use:

- user identity
- home scope
- role scope
- approval tier
- visibility classification

Track A may also carry:

- reserved portal context such as `crew`, `admin`, or `app`

but must not turn that into tenant isolation logic.

Do not implement broad external stakeholder subscription plans in Track A.

## Communications Model In Track A

Track A should use the communications model mainly for:

- internal assistant context
- crew-facing operational reminders
- structured tracking of promises and follow-ups
- selected external communications that directly support crew workflows

Examples:

- reminder for a subcontractor to send a bid
- reminder for internal follow-up on missing invoice
- daily crew to-do summary
- lead notification about stalled approval

This is narrower than the full future stakeholder-communications model.

## Telemetry Model In Track A

Track A should use the telemetry model mainly for:

- crew GPS
- device-health diagnostics
- service/arrival verification
- route and shift confidence

Weather and other external signals may be used where they directly support crew operations, but Track A should not drift into homeowner-facing property intelligence.

## MDM Model In Track A

Track A should keep the full MDM architecture in mind, but activate only what is needed now:

- QBO/QBT ingestion
- source watermarks
- entity linkage
- selected attribute history
- crew-operational projections

Do not build generalized master-data machinery before it supports a concrete Track A use case.

## Design Rules

1. Track A is the first operating slice, not the final universal platform.
2. Preserve future-compatible core identity and graph concepts.
3. Activate only crew-only domains in Track A.
4. Keep unstructured knowledge and structured data querying separate.
5. Prioritize workflow, approval, and write-back safety over future portal breadth.
6. Treat Track B capabilities as deferred even if the schema could support them.
7. Build projections for crew operations first, not customer experiences.

## Next Design Step

The next practical step is to translate the DB docs into a Track A-first implementation pack:

- canonical glossary
- Track A table blueprint
- workflow and approval schema
- role matrix for admin / lead / crew
- first projection set for crew operations
