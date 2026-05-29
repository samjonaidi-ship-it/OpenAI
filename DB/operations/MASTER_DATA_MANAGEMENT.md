# CalExp5 Master Data Management

## Purpose

This document defines how CalExp5 should manage master data across:

- internal system-of-record data
- external systems such as QBT and QBO
- human enrichment and correction
- AI-assisted enrichment
- stakeholder-specific visibility slices
- agent-facing reporting and proactive alerting

This document complements:

- `C:\Users\samjo\Desktop\CalExp5\docs\DB_ARCHITECTURE.md`


## Core Position

CalExp5 should become the canonical master for:

- stakeholder identity resolution
- property / jobsite graph
- cross-domain relationships
- event history
- uploaded collateral and evidence
- service, warranty, claim, and operational intelligence
- stakeholder 360 views

External systems such as QBT and QBO remain authoritative for selected source domains, but they are not the full master of the future platform.


## Source Of Truth Model

### QBT

QBT is authoritative for:

- imported labor/time records
- selected schedule or assignment facts that originate there
- source timestamps / change markers for QBT-originated records

QBT is not authoritative for:

- universal stakeholder graph
- customer-facing property intelligence
- service / warranty / claim intelligence
- cross-domain 360 views


### QBO

QBO is authoritative for:

- accounting-originated financial records
- supplier/customer accounting identities where they originate there
- selected terms, credit, payment, and accounting metadata
- source timestamps / change markers for QBO-originated records

QBO is not authoritative for:

- the full operational graph
- customer portal views
- equipment / property / event intelligence
- all enrichment and cross-links


### CalExp5 / Bridge / Neon

Your own platform should become authoritative for:

- canonical stakeholder resolution
- graph relationships
- property / jobsite context
- uploaded files and evidence
- service lifecycle
- claim and warranty lifecycle
- event ledger
- projections for agents and stakeholder-facing views


## MDM Layers

Recommended layers:

1. source records
2. master records
3. enrichment / overrides
4. projections / alerts


### 1. Source Records

These preserve imported truth from QBT, QBO, and other systems.

Recommended tables:

- `external_systems`
- `external_records`
- `external_change_log`
- `external_sync_cursors`

Minimum fields for `external_records`:

- `id`
- `org_id`
- `external_system`
- `external_type`
- `external_id`
- `external_parent_id`
- `source_version`
- `source_updated_at`
- `last_seen_at`
- `last_fetched_at`
- `payload_hash`
- `raw_payload jsonb`
- `linked_entity_id`


### 2. Master Records

These are your canonical resolved records.

They live in the graph model:

- `entities`
- `entity_relationships`
- `entity_hierarchy`
- typed profile tables

Master records should never depend on one external system alone if multiple sources and local enrichments exist.


### 3. Enrichment / Overrides

These capture Bainbridge-added intelligence and corrections.

Recommended tables:

- `entity_external_links`
- `entity_master_overrides`
- `attribute_history`
- `merge_candidates`
- `merge_decisions`
- `mdm_audit_events`

Examples:

- customer name corrected locally even though QBO has an older display name
- property linked to a customer and public-record parcel enrichment
- supplier terms imported from QBO but locally annotated for operational handling
- employee profile enriched with certifications, field skills, and assignment history


### 4. Projections / Alerts

Agents and stakeholder-facing experiences should not rely only on raw normalized tables.

Recommended projection-oriented tables or materialized views:

- `property_360_projection`
- `customer_360_projection`
- `employee_360_projection`
- `supplier_360_projection`
- `jobsite_360_projection`
- `alert_candidates`
- `notifications`
- `projection_refresh_state`


## Watermarks And Change Tracking

You should inherit and preserve upstream watermarks where available.

That means tracking at least four watermark concepts:

1. source watermark
2. ingestion watermark
3. master watermark
4. projection watermark


### Source Watermark

Comes from QBT / QBO or another upstream system.

Examples:

- sync token
- last modified timestamp
- row version
- change sequence


### Ingestion Watermark

Tracks when your system observed and ingested the upstream change.

Useful for:

- lag monitoring
- missed sync detection
- lazy refresh decisions


### Master Watermark

Tracks when the canonical resolved record changed after link, merge, enrichment, or override.

Useful for:

- event generation
- re-scoring alerts
- invalidating projections


### Projection Watermark

Tracks whether downstream views and agent-facing summaries are stale.

Useful for:

- refreshing stakeholder 360 views
- agent freshness checks
- push notification safety


## Revision And Provenance

Important data should preserve both current value and revision history.

At minimum, preserve:

- source system
- source record id
- source version
- source updated at
- imported at
- linked entity id
- enriched by
- reviewed by
- revision number
- confidence / verification status

Recommended provenance fields for enriched data:

- `origin_type` = imported | user_added | agent_added | inferred | merged
- `origin_actor_id`
- `origin_system`
- `verification_status`
- `confidence_score`
- `effective_from`
- `effective_to`


## Field Ownership Rules

Not every field should be owned by the same system.

You need explicit field-level ownership policies.

Examples:

- employee payroll details: external finance/HR source authoritative
- employee app role and feature scope: local authoritative
- supplier accounting terms: QBO authoritative, locally enriched
- property public-record attributes: local/public-record enrichment authoritative
- service lifecycle state: local authoritative
- claim workflow state: local authoritative
- customer portal visibility flags: local authoritative

This should be formalized in code as source-priority policy, not left implicit.


## Entity Resolution

The same real-world stakeholder may appear in:

- QBO
- QBT
- local app workflows
- uploaded documents
- public records
- AI extraction output

You need explicit entity resolution.

Recommended tables:

- `entity_external_links`
- `merge_candidates`
- `merge_decisions`

Do not rely only on names. Use:

- external IDs
- names
- email
- phone
- addresses
- tax IDs where permitted
- confidence scoring


## Stakeholder-Specific Visibility Slices

Every stakeholder may need a different 360 view over the same graph.

Examples:

- customer sees all their properties and customer-visible related records
- subcontractor sees only their bids, docs, invoices, and assigned property/jobsite context
- employee sees their work history and role-appropriate operational records
- admin sees cross-domain and restricted data

This means MDM is not only identity and enrichment. It is also about controlled exposure.

Recommended supporting concepts:

- `user_entity_memberships`
- `entity_access_grants`
- `visibility_classification`
- projection-level filtering by role and graph scope

Suggested visibility classifications:

- `public_record`
- `shared_external`
- `customer_visible`
- `vendor_visible`
- `crew_visible`
- `internal`
- `restricted_financial`

Examples:

- crew compensation = `restricted_financial`
- competing subcontractor bids = `internal`
- customer-uploaded media = `customer_visible`
- public parcel filings = `public_record`


## Agent-First Reporting Model

The system is not being designed around hardcoded report templates.

It is being designed around agents that can:

- answer ad hoc stakeholder questions
- generate standard reports on demand
- proactively generate alerts and notifications

This means the data model must support:

1. current-state queries
2. historical/time-slice queries
3. monitor/rule queries
4. provenance-aware explanations

Examples:

- "Show me everything that has happened to this property since escrow"
- "What changed for this supplier in the last 12 months?"
- "What claims, warranties, and service calls are still open?"
- "Which appliances are nearing warranty expiration?"
- "Which filters are overdue for replacement?"

Agents should not be forced to reconstruct this from raw external records every time.

They should query:

- canonical master graph
- event ledger
- projections
- alert candidates
- provenance metadata


## Monitoring And Proactive Notification

To support proactive agent behavior, add:

- `maintenance_schedules`
- `monitoring_rules`
- `alert_candidates`
- `notifications`
- `notification_deliveries`

Examples:

- dishwasher warranty expires in 30 days
- furnace filter replacement overdue by 5 days
- supplier insurance certificate expiring soon
- subcontractor invoice aging beyond threshold

These should be generated from:

- entity state
- event history
- schedules / rules
- visibility rules


## Recommended Initial Tables

Minimum MDM-supporting set:

- `external_systems`
- `external_records`
- `external_change_log`
- `external_sync_cursors`
- `entity_external_links`
- `entity_master_overrides`
- `attribute_history`
- `merge_candidates`
- `merge_decisions`
- `mdm_audit_events`
- `maintenance_schedules`
- `monitoring_rules`
- `alert_candidates`
- `notifications`
- `projection_refresh_state`


## Design Rules

Use these rules going forward:

1. Preserve upstream watermarks when available.
2. Never erase raw external truth when enriching locally.
3. Canonical master records must be separable from imported snapshots.
4. Overrides must be explicit and auditable.
5. Important changing attributes need history, not just latest value.
6. Stakeholder-facing slices must be derived from graph scope plus visibility classification.
7. Agent-facing answers should come from canonical and projection layers, not ad hoc direct parsing of raw external payloads.
8. QBT and QBO are authoritative for selected source fields, but CalExp5 owns the master graph and enrichment layer.


## Near-Term Recommendation

The next concrete step should be:

1. define external source boundaries for QBT and QBO
2. design `external_records` + `entity_external_links`
3. define watermark ingestion policy
4. define override/provenance model
5. define visibility classifications and slice rules
6. define first alert candidate types for agent-driven notifications

