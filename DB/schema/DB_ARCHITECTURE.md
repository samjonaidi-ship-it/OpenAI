# CalExp5 Database Architecture

## Purpose

This document defines the recommended database model for CalExp5 as the app expands from internal crew scheduling into a broader operational system used by employees, customers, suppliers, owners, subcontractors, crews, and properties/jobsites.

The main requirements are:

- Support many stakeholder types, including `property` and `jobsite`
- Support changing relationships over time
- Support nested assets / child entities up to at least 4 levels deep
- Support customer-facing workflows where a user can add a new entity onto a property at runtime
- Support universal 360 views for multiple stakeholder types, not just properties
- Support an immutable timeline of what happened over time
- Support cases where an event can also correspond to a durable business object
- Keep the model normalized enough for reporting, permissions, and scale
- Stay compatible with Neon Postgres and the existing Bridge-centered architecture


## Current App Context

Based on the current repo:

- `CalExp5` does not connect to Neon directly from the browser
- The app talks to a backend / Bridge layer, which owns persistence and integration logic
- Neon is already used for settings, employee data, hours/jobcodes migration, receipts, and telemetry

Relevant files:

- `C:\Users\samjo\Desktop\CalExp5\server.js`
- `C:\Users\samjo\Desktop\CalExp5\src\utils\calData.js`
- `C:\Users\samjo\Desktop\CalExp5\src\hooks\useNeonSync.js`
- `C:\Users\samjo\Desktop\CalExp5\src\utils\api-users.js`


## Neon Fit

Neon is a good fit for this system if used as the system of record for app-owned data.

What matters for CalExp5:

- Neon separates compute from storage, which is useful for spiky usage and non-prod environments
- Neon supports lightweight branching, which is useful for staging, schema tests, and preview environments
- Neon supports pooled and direct connections; app traffic should use pooled connections, migrations should use direct connections
- Neon can scale with standard Postgres patterns, so the main design risk is schema shape, not Neon itself

Current Neon references:

- `C:\Users\samjo\Desktop\CalExp5\.env.example`
- `C:\Users\samjo\Desktop\CalExp5\docs\CHANGELOG.md`

Neon references:

- https://neon.com/docs/get-started-with-neon/connect-neon
- https://neon.com/docs/introduction/compute-lifecycle/
- https://neon.com/flow/branches
- https://neon.com/flow/hierarchies


## Core Position

CalExp5 should not model the business as a simple tree and should not model it as a pile of type-specific silos either.

It should use a relational core with five distinct concepts:

1. `entities`
2. `entity_hierarchy`
3. `entity_relationships`
4. `events`
5. `event_entities`

This is the key design decision.


## Core Model

### 1. Entities

`entities` is the identity table for all first-class things in the system.

Examples:

- employee
- customer
- owner
- supplier
- property
- jobsite
- crew
- vehicle
- tool
- document set
- video submission
- drawing package

Recommended core columns:

- `id`
- `org_id`
- `entity_type`
- `display_name`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `deleted_at`

This table gives every important object a stable identity, regardless of type.

Examples of durable entities:

- employee
- customer
- supplier
- subcontractor
- property
- jobsite
- service_call
- claim
- invoice
- warranty ticket
- equipment
- appliance
- tool
- document package
- media submission


### 2. Hierarchy

`entity_hierarchy` is for structural containment or parent/child organization.

Use it when the meaning is:

- contains
- belongs under
- child of
- located within

Examples:

- property contains building
- building contains room
- jobsite contains staging area
- tool kit contains tools
- customer-owned document package belongs under property

Recommended columns:

- `id`
- `org_id`
- `parent_entity_id`
- `child_entity_id`
- `relationship_type`
- `sort_order`
- `valid_from`
- `valid_to`
- `metadata jsonb`

Important:

- do not hardcode `level_1_id`, `level_2_id`, etc.
- do not assume one global tree for all use cases
- allow multiple hierarchy types if needed


### 3. Relationships

`entity_relationships` is for orthogonal business relationships that are not containment.

Use it when the meaning is:

- works at
- owns
- assigned to
- manages
- supplies
- serves
- responsible for
- linked to

Examples:

- employee works at jobsite
- client owns property
- owner associated with property
- supplier services jobsite
- customer uploads drawings to property

Recommended columns:

- `id`
- `org_id`
- `from_entity_id`
- `to_entity_id`
- `relationship_type`
- `valid_from`
- `valid_to`
- `metadata jsonb`
- `created_at`
- `created_by`

This is what lets relationships change over time without rewriting history.


### 4. Events

`events` is the immutable timeline ledger of what happened.

Use it to record facts such as:

- service call created
- bid submitted
- invoice issued
- payment posted
- crew assigned
- technician arrived
- warranty opened
- claim updated
- document uploaded
- public record discovered
- ownership changed

Recommended columns:

- `id`
- `org_id`
- `event_type`
- `occurred_at`
- `recorded_at`
- `actor_entity_id`
- `source_system`
- `source_record_id`
- `summary`
- `metadata jsonb`

`events` should be append-only in normal operation.


### 5. Event Participants

`event_entities` links events to the entities involved in them.

This is what makes universal 360 views possible.

Examples:

- event = `invoice_issued`
- participants:
  - supplier as `issuer`
  - customer as `billed_party`
  - property as `related_property`
  - jobsite as `related_jobsite`

Recommended columns:

- `id`
- `org_id`
- `event_id`
- `entity_id`
- `participant_role`
- `metadata jsonb`

This table is critical. Without it, every 360 view turns into custom feature glue.


## Eventful Entities

Some business concepts are both:

- durable graph entities
- sources of timeline events

Example: a `service_call`

It should usually be:

- an `entity` because it has lifecycle, children, files, assignments, and status
- also the subject of many `events`

Example service-call timeline:

- `service_call_created`
- `technician_assigned`
- `inspection_completed`
- `part_added`
- `invoice_issued`
- `service_call_closed`

This pattern should be called an **eventful entity**.

Rule of thumb:

- make something an `entity` when it has lifecycle, children, files, permissions, or independent identity
- make something an `event` when you need to record that something happened at a specific point in time
- many important business objects need both


## Properties And Jobsites

Properties and jobsites should both be first-class entities, but they should not be collapsed into the same concept.

Recommended distinction:

- `property` = enduring physical place
- `jobsite` = operational project instance at that property

Why:

- one property may have multiple jobs or project phases over time
- crews, receipts, tool movements, audits, and uploads usually attach to a jobsite or project context
- ownership and customer relationships may change independently of the physical property

Recommended relationship examples:

- `jobsite occurs_at property`
- `client owns property`
- `owner associated_with property`
- `employee assigned_to jobsite`
- `supplier services jobsite`

Property remains the strongest **spatial anchor**, but it is not the only important anchor.

Other important anchors:

- customer = ownership anchor
- employee = labor anchor
- supplier / subcontractor = vendor anchor
- jobsite / project = operational anchor
- event = historical anchor

The system must support all of these 360 views over the same underlying graph.


## Dynamic Entity Creation

One of the target use cases is that customers will be authenticated users of CalExp5 and may add new things onto a property or another stakeholder context at runtime.

Examples:

- upload a drawing set
- upload a realtor video
- add a new building, room, unit, area, or package
- add an ad hoc object that later becomes a formal entity type

This means the model must be elastic, but not shapeless.

### Recommendation

Use a controlled entity-type registry plus extensible metadata.

Do not use a raw EAV model for everything.

Do not put all fields for all types into one giant JSON blob.

Instead:

- keep `entities` as the stable identity layer
- maintain an `entity_types` registry
- allow `entities.metadata jsonb` for sparse or type-specific fields
- add typed profile tables only when a type becomes operationally important

Important ingest rule:

- every uploaded object must attach to something immediately
- uploads are classified later
- uploads may be re-linked later without losing provenance

Recommended ingest pattern:

- upload creates a `submission` or `media_submission` entity
- files are stored in `entity_files`
- the initial link is to the uploader or the current root context
- later review may attach it to a property, jobsite, equipment, claim, or service call
- original provenance must remain intact

Examples:

- a new uploaded drawing package can start as `entity_type = 'document_package'`
- a new realtor video can start as `entity_type = 'media_submission'`
- if later that concept becomes core to workflows, add a dedicated profile table

This gives you runtime flexibility without destroying queryability.


## Recommended Type Strategy

### Stable types

These deserve first-class treatment early:

- employee
- customer
- owner
- supplier
- property
- jobsite
- tool
- vehicle
- crew
- document_package
- media_submission

### Type registry

Create `entity_types` to track:

- `key`
- `label`
- `category`
- `is_user_creatable`
- `is_hierarchical`
- `default_parent_type`
- `schema_version`

This allows customer-created types in a controlled way.


## Attachments And Uploaded Objects

For customer uploads such as drawings and videos, use dedicated records rather than hiding them only in metadata.

Recommended supporting tables:

- `entity_files`
- `entity_media`
- `entity_annotations`

Suggested columns for `entity_files`:

- `id`
- `org_id`
- `entity_id`
- `file_kind`
- `storage_provider`
- `storage_key`
- `mime_type`
- `filename`
- `size_bytes`
- `uploaded_by`
- `created_at`
- `metadata jsonb`

This lets a property have many files, while a specific uploaded package can also be its own entity in hierarchy if needed.


## Universal 360 Views

The future product requires universal 360 views for multiple stakeholder types.

Examples:

- property 360
- customer 360
- employee / crew 360
- supplier 360
- subcontractor 360
- project/jobsite 360

These views should not come from isolated feature silos.

They should be projections over:

- `entities`
- `entity_hierarchy`
- `entity_relationships`
- `events`
- `event_entities`
- `entity_files`

Examples of what a 360 view needs to show:

- current state
- historical state
- direct children
- cross-linked relationships
- timeline of events
- attached files and collateral
- related documents and operational records

This implies a normalized write model plus optimized read models.


## Access Slicing

The graph is universal, but visibility is not.

Different stakeholders must see different slices of the same underlying graph.

Examples:

- customer can see their properties, approved child entities, approved documents, services, claims, warranties, and related activity
- customer must not see crew compensation, internal-only notes, or other customers' records
- subcontractor can see records related to their own bids, work, invoices, and assigned property/jobsite context
- subcontractor must not see competing subcontractor bids or unrelated property records
- employee can see their own work history and role-appropriate operational context
- admin can see broader cross-domain views

This means access control must be graph-aware.

Recommended access model:

- `users`
- `user_entity_memberships`
- `entity_access_grants`
- inherited access rules from selected root entities such as a property or jobsite
- explicit visibility classification on sensitive records

Suggested visibility levels:

- `public_record`
- `shared_external`
- `customer_visible`
- `vendor_visible`
- `crew_visible`
- `internal`
- `restricted_financial`

Important rule:

- access should not be determined only by table
- access should be determined by:
  - who the user is
  - which entity scope they belong to
  - the relationship path to the record
  - the visibility classification of the record

The service layer should enforce this. Do not rely on UI-only filtering.


## Sensitive Domain Separation

Some categories of data are structurally more sensitive and should be easy to exclude from customer/vendor views.

Examples:

- payroll
- taxes
- internal margin calculations
- internal notes
- competing bids
- internal review artifacts

Recommended pattern:

- keep sensitive financial and HR data in clearly separated modules
- link them into the graph through relationships and events
- classify them as `internal` or `restricted_financial`
- expose only filtered projections to non-internal users

This is especially important if agents will generate stakeholder-facing reports.


## Projections / Read Models

The normalized graph is the canonical write model.

The UI should not always query the raw graph directly for complex dashboards.

Recommended projections:

- `property_360_projection`
- `customer_360_projection`
- `employee_360_projection`
- `supplier_360_projection`
- `jobsite_360_projection`

These can be implemented later as:

- materialized views
- denormalized projection tables
- cached read models updated by event/outbox processing


## Temporal Design

Relationships change over time, so temporal fields are required on important edges.

Use:

- `valid_from`
- `valid_to`

Examples:

- a client owns a property from one date to another
- an employee is assigned to a jobsite for a specific window
- a supplier is preferred for a property only during an active project

This prevents history loss and makes reporting credible.


## Normalization Guidance

### Normalize

Use normal columns and foreign keys for:

- IDs
- names used in lookup
- statuses
- dates used in filters
- ownership and role links
- permissions
- workflow state

### JSONB is acceptable for

- AI extraction payloads
- sparse optional fields
- external provider payload snapshots
- low-value display metadata

### Do not use JSONB for

- core relationships
- permission rules
- primary workflow state
- fields you filter and join on constantly


## Recommended Initial Tables

Minimum domain set for the next phase:

- `organizations`
- `users`
- `user_sessions`
- `entity_types`
- `entities`
- `entity_hierarchy`
- `entity_relationships`
- `addresses`
- `properties_profile`
- `jobsites_profile`
- `employees_profile`
- `customers_profile`
- `suppliers_profile`
- `entity_files`
- `assets`
- `asset_events`
- `timesheet_entries`
- `timesheet_sync_links`
- `pto_requests`
- `receipts`
- `audit_events`


## Indexing Guidance

Add these early:

- `entities (org_id, entity_type, status)`
- `entity_hierarchy (org_id, parent_entity_id, valid_to)`
- `entity_hierarchy (org_id, child_entity_id, valid_to)`
- `entity_relationships (org_id, from_entity_id, relationship_type, valid_to)`
- `entity_relationships (org_id, to_entity_id, relationship_type, valid_to)`
- `entity_files (org_id, entity_id, created_at)`

If temporal overlap rules matter, consider Postgres exclusion constraints and `btree_gist`.

Reference:

- https://neon.com/docs/extensions/btree_gist


## Query Pattern Guidance

### Use hierarchy when asking

- what is under this property?
- what children belong to this jobsite?
- what assets are nested under this parent?

### Use relationships when asking

- who works here?
- who owns this property?
- which suppliers serve this jobsite?
- which customer is linked to this property right now?

This split is what keeps the design comprehensible at scale.


## Operational Guidance For Neon

Recommended Neon usage:

- one Neon project for CalExp5
- one production branch as source of truth
- staging branch
- ephemeral preview / dev branches
- pooled connection strings for app traffic
- direct connection strings for migrations and admin tasks

For production:

- avoid scale-to-zero if the app is customer-facing and latency matters
- use branches for schema testing before applying migrations

For non-prod:

- keep scale-to-zero enabled
- use schema-only branches if production data contains sensitive material


## Design Rules

Use these rules going forward:

1. Every important business thing gets an `entity` row.
2. Structural nesting goes in `entity_hierarchy`.
3. Cross-cutting business links go in `entity_relationships`.
4. Historical facts go in `events`.
5. Event participants go in `event_entities`.
6. Files and uploads get dedicated tables, not just JSON blobs.
7. Dynamic user-created entities are allowed through `entity_types`, not through unrestricted schema chaos.
8. Relationships that can change over time must be temporal.
9. Some objects are eventful entities and should exist in both the graph and the timeline.
10. External systems such as QBT and QBO are integrations, not automatically the source of truth for CalExp5-owned domain state.


## Near-Term Recommendation

The next concrete step should be a real schema draft for the Bridge / Neon layer covering:

- `entities`
- `entity_types`
- `entity_hierarchy`
- `entity_relationships`
- `events`
- `event_entities`
- `entity_files`
- `properties_profile`
- `jobsites_profile`
- `customers_profile`
- `employees_profile`

That schema should include:

- primary keys
- foreign keys
- unique constraints
- temporal fields
- initial indexes
- a small set of canonical relationship types
