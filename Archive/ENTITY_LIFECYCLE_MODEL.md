# CalExp5 Entity Lifecycle Model

## Purpose

This document defines how lifecycle should be modeled across the CalExp5 platform.

Lifecycle management is a core architectural concern because almost all important objects in the system change over time:

- stakeholders mature, convert, disengage, or reactivate
- properties and jobsites change operationally over time
- service calls, claims, tickets, and subscriptions move through states
- estimates, contracts, invoices, drawings, photos, and videos are revised, superseded, edited, or archived
- equipment, appliances, tools, and systems are installed, maintained, repaired, replaced, and retired
- permissions and engagements are time-bound

This document complements:

- `C:\Users\samjo\Desktop\CalExp5\docs\DB_ARCHITECTURE.md`
- `C:\Users\samjo\Desktop\CalExp5\docs\MASTER_DATA_MANAGEMENT.md`


## Core Position

Lifecycle must not be treated as:

- a single `status` column
- only `updated_at`
- only soft-delete
- only document revision numbers

Lifecycle in CalExp5 includes four distinct concerns:

1. state
2. revision
3. effective dating
4. transition history

These concerns apply differently to different classes of entities.


## Lifecycle Categories

Most important objects fall into one or more of these categories:

### 1. Stateful Entities

These move through operational states.

Examples:

- prospect
- customer onboarding case
- service call
- warranty ticket
- insurance claim
- service subscription
- equipment item
- appliance
- tool
- project / jobsite

Common lifecycle traits:

- current state matters
- allowed transitions matter
- transition history matters
- child records and attachments accumulate over time


### 2. Revisioned Artifacts

These may be edited, revised, superseded, or replaced while preserving history.

Examples:

- estimate
- contract
- change order
- invoice
- drawing set
- inspection report
- photo
- video
- public-record package

Common lifecycle traits:

- versions matter
- supersession matters
- current effective version matters
- original artifact should often remain immutable


### 3. Reference / Master Entities

These are long-lived identities with changing attributes.

Examples:

- employee
- customer
- supplier
- subcontractor
- property
- account/contact entity

Common lifecycle traits:

- identity persists
- attributes change over time
- role and relationship changes matter
- attribute history may matter for selected fields


### 4. Temporal Relationships / Entitlements

These are not standalone “things” in the UI, but they have lifecycle.

Examples:

- customer owns property during a date range
- subcontractor engaged on jobsite for a period
- employee assigned to project for a period
- vendor granted document access for duration of engagement
- warranty covers appliance during a term

Common lifecycle traits:

- valid-from / valid-to matter
- revocation and expiry matter
- current effective scope matters


## Universal Lifecycle Rules

Use these rules everywhere:

1. Every important object keeps a stable identity.
2. Current state must be derivable without destroying history.
3. State transitions should be explicit and auditable.
4. Revisions must preserve predecessor/successor lineage.
5. Effective dates matter whenever validity changes over time.
6. Event history and lifecycle history are related but not identical.


## Lifecycle Data Model Concepts

Recommended reusable concepts:

- `state`
- `state_reason`
- `state_changed_at`
- `effective_from`
- `effective_to`
- `revision_no`
- `supersedes_id`
- `superseded_by_id`
- `archived_at`
- `retired_at`
- `transitioned_by`
- `transition_event_id`


## Current State vs History

The system should support both:

- **current effective view**
- **historical reconstruction**

Recommended pattern:

- current row or current projection for fast reads
- append-only transition/event history for audit and time travel

Do not rely only on replaying events for every operational screen.
Do not rely only on latest-row snapshots for audit or agentic reasoning.

You need both.


## Stateful Entity Lifecycle

### Recommended Fields

Stateful entities should usually have:

- `lifecycle_state`
- `lifecycle_stage`
- `state_reason`
- `opened_at`
- `closed_at`
- `cancelled_at`
- `completed_at`
- `archived_at`

### Recommended Companion Tables

- `entity_state_transitions`
- `events`
- `event_entities`

### Example: Service Call

Possible states:

- `draft`
- `opened`
- `scheduled`
- `in_progress`
- `awaiting_parts`
- `completed`
- `invoiced`
- `closed`
- `cancelled`
- `archived`

Important:

- a service call is usually a durable entity
- each lifecycle change should also create an event
- parts, invoices, files, notes, and media may attach as children or related entities


## Revisioned Artifact Lifecycle

Revisioned artifacts require stronger version lineage.

### Recommended Fields

- `artifact_family_id`
- `revision_no`
- `is_current_revision`
- `supersedes_id`
- `superseded_by_id`
- `issued_at`
- `withdrawn_at`
- `accepted_at`
- `rejected_at`
- `archived_at`

### Rules

1. Revisions should not overwrite prior artifacts.
2. Prior versions remain queryable.
3. Exactly one version may be current if the artifact family is active.
4. Acceptance/rejection may apply to a specific revision, not just the family.

### Example: Estimate

Estimate family:

- estimate v1 draft
- estimate v2 issued
- estimate v3 revised
- v2 accepted? no
- v3 accepted? yes

The customer or agent must be able to distinguish:

- latest revision
- issued revision
- accepted revision
- superseded revisions


## Media Lifecycle

Photos and videos often need their own lifecycle.

They are not just files.

Recommended distinction:

- original capture
- derived edits
- approved/published derivative
- archived/deprecated derivative

Suggested fields:

- `media_family_id`
- `variant_kind` = original | edit | thumbnail | publishable | redacted
- `derived_from_file_id`
- `is_current_variant`
- `approved_at`
- `rejected_at`

Important rule:

- do not destroy provenance of original media
- edits should be linked as derivatives, not destructive replacements


## Reference / Master Entity Lifecycle

Master entities usually should not be endlessly versioned as whole-record clones.

Instead:

- keep stable identity in `entities`
- keep selected attribute history for critical fields
- model relationship changes explicitly

Examples of important changing attributes:

- employee active status
- employee pay rate or tax configuration references
- supplier terms
- supplier credit line
- customer portal status
- property occupancy / ownership associations

Recommended companion tables:

- `attribute_history`
- `entity_relationships`
- `events`


## Temporal Relationship Lifecycle

Relationships and permissions often require their own lifecycle tracking.

Recommended fields:

- `valid_from`
- `valid_to`
- `granted_at`
- `revoked_at`
- `status`

Examples:

- subcontractor can access drawings only during active engagement
- customer owns property during a certain interval
- employee assigned to project during a period
- service plan active for one year

These should not be treated as permanent links with a generic status flag only.


## Entity Maturation

Some entities mature over time.

Examples:

- prospect -> customer
- draft service plan -> active subscription
- uploaded media submission -> classified document package

Recommended pattern:

- preserve one stable entity where possible
- track lifecycle stage transitions
- add roles/profiles/relationships as maturity increases

Do not create a second disconnected identity if the real-world thing is the same.


## Transition Logging

Every important lifecycle transition should be logged explicitly.

Recommended table:

- `entity_state_transitions`

Suggested columns:

- `id`
- `org_id`
- `entity_id`
- `from_state`
- `to_state`
- `reason`
- `transitioned_at`
- `transitioned_by`
- `event_id`
- `metadata jsonb`

This table complements the generic `events` ledger.

Difference:

- `events` records what happened in the business timeline
- `entity_state_transitions` records formal lifecycle transitions

Sometimes a single action should create both.


## Supersession Rules

Supersession is especially important for revisioned artifacts.

Use it when:

- a new estimate replaces a prior estimate
- a revised drawing set replaces an old set
- a corrected invoice replaces a prior issued invoice
- a newer media derivative becomes the approved current version

Recommended rules:

1. superseded objects remain readable
2. current object is easy to resolve
3. lineage is traversable forward and backward


## Current-State Resolution

Agents and UI screens often need current effective state quickly.

Recommended resolution rules:

- current state comes from canonical entity row or projection
- current revision comes from `is_current_revision = true`
- current relationship comes from `valid_to is null or in future`
- current entitlement comes from active grant + visibility policy

These rules should be formalized in service-layer queries and projections, not improvised per screen.


## Lifecycle + Events

Lifecycle and events are related but distinct.

Examples:

- `service_call` changes from `opened` to `scheduled`
  - lifecycle transition exists
  - event also exists

- `estimate` revised from v2 to v3
  - revision lineage exists
  - event also exists

- `subcontractor access` expires
  - entitlement validity changes
  - event may also exist

Rule:

- lifecycle state should not be inferred only from event text
- events should not be omitted just because lifecycle tables exist


## Lifecycle + MDM

Lifecycle must align with master data rules.

Examples:

- external source says supplier terms changed
- your MDM layer ingests new source watermark
- canonical supplier record updates
- attribute history records old and new values
- projections and alerts refresh

Lifecycle and MDM should share:

- provenance
- effective dates
- revision timestamps
- audit trail


## Lifecycle + Access

Permissions are also temporal lifecycle objects.

Examples:

- customer access granted after onboarding
- subcontractor reference-doc access limited to active engagement window
- employee role elevated temporarily

Recommended rule:

- access grants should behave like temporal stateful relationships

That means lifecycle modeling affects access control directly.


## Recommended Initial Tables

Minimum lifecycle-supporting set:

- `entity_state_transitions`
- `attribute_history`
- `artifact_families`
- `artifact_revisions`
- `engagements`
- `entitlements`
- `maintenance_schedules`

Depending on implementation, some of these may be folded into existing entity/profile models, but the concepts must exist.


## Design Rules

Use these rules going forward:

1. Stable identity first, lifecycle second.
2. State changes must be explicit.
3. Revisioned artifacts must preserve lineage.
4. Effective dates are required for temporal validity.
5. Events and lifecycle transitions should both exist where they serve different purposes.
6. Current-state resolution must be deterministic.
7. Original media and original imported records should preserve provenance.
8. Entity maturation should preserve identity.


## Near-Term Recommendation

The next concrete step should be:

1. decide which current CalExp5 concepts are stateful entities
2. decide which are revisioned artifacts
3. decide which fields require attribute history
4. define allowed lifecycle states for high-value entity types
5. define current-state resolution rules for agents and 360 projections

