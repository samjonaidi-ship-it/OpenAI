# Access And Entitlement Model

This document defines how CalExp5 should control:

- who can see which parts of the graph
- who can act on which entities and workflows
- which apps and features each stakeholder can use
- how subscription tiers and overrides shape the user experience

This model is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ENTITY_LIFECYCLE_MODEL.md`

It should be read as a core part of the platform architecture, not as a UI-only permission layer.

## Purpose

CalExp5 is building a universal stakeholder graph.
That means the same underlying system will hold data about:

- customers
- prospects
- employees and crew
- suppliers
- subcontractors
- properties
- jobsites and projects
- documents, service calls, claims, subscriptions, and assets

Those stakeholders must not all see the same graph slice.

Examples:

- a customer should see their properties, property-related history, and customer-visible documents
- a subcontractor should see their own bids, work history, invoices, payments, and time-bound project references
- a crew member should see assigned jobsites and operational artifacts, but not payroll for other people unless explicitly allowed
- an internal admin may see broad financial and operational data

Access control therefore needs to support:

- graph-scoped visibility
- temporal access windows
- sensitivity classification
- stakeholder home domains
- engagement-scoped access
- product subscription tiers
- per-app and per-feature capability control

## Core Principle

Access is not determined only by table or row ownership.

Effective access is determined by:

1. who the principal is
2. which stakeholder/domain/entity scopes they belong to
3. what graph path connects them to the target data
4. what visibility classification applies to the target data
5. what entitlement tier and feature policy applies
6. whether the access is currently active in time

Inbound domain or portal context may influence default scope selection, but it must not be treated as the full permission decision by itself.

## Conceptual Layers

There are four related but separate control layers.

### 1. Identity

Identity answers:

- who is the user?
- which account or actor is making the request?

Examples:

- customer portal user
- subcontractor office manager
- crew member
- internal admin
- Buddy agent acting on behalf of an entitled user

## 2. Scope

Scope answers:

- which domains or entities does this principal belong to?
- what stakeholder home domain should they always see?

Examples:

- customer belongs to customer entity and related owned properties
- subcontractor user belongs to subcontractor company entity
- employee belongs to Bainbridge internal org and possibly crews

## 3. Access

Access answers:

- which records in the graph may this principal read or modify?
- for how long?
- under which visibility policy?

Examples:

- customer can see customer-visible property collateral
- subcontractor can see reference drawings during active engagement only
- internal admin can see restricted financial records

## 4. Capability

Capability answers:

- which apps, features, workflows, and agent actions may this principal use?

Examples:

- basic customer plan can upload media and view property history
- premium customer plan can ask Buddy for proactive maintenance reports
- supplier portal tier may allow invoice upload but not advanced analytics

These four layers should be modeled separately and resolved together.

## Access Scope Types

The platform should support three main access scope types.

### Home Scope

A stakeholder's home scope is the durable domain they should always retain access to unless explicitly suspended.

Examples:

- customer home domain
- subcontractor home domain
- supplier home domain
- employee home domain

Home scope should support longitudinal history such as:

- all bids submitted by a subcontractor
- all work performed by a crew member
- all owned properties for a customer
- all invoices and payments for a supplier

### Relationship Scope

Relationship scope comes from an active graph relationship.

Examples:

- customer owns property
- employee assigned to crew
- supplier approved for business unit
- owner associated with property

Relationship scope is often temporal.

### Engagement Scope

Engagement scope comes from a temporary operational relationship.

Examples:

- subcontractor invited to bid on jobsite
- subcontractor awarded work package
- insurer reviewing claim
- crew assigned to active jobsite

Engagement scope should normally have:

- `valid_from`
- `valid_to`
- explicit role in the engagement
- revocation path

This is the correct mechanism for temporary visibility into project/property collateral.

## Visibility Classification

Graph reachability alone is not enough.

Every sensitive or shareable record should also carry a visibility classification or inherit one from a governing policy.

Suggested classifications:

- `public_record`
- `shared_external`
- `customer_visible`
- `vendor_visible`
- `crew_visible`
- `internal`
- `restricted_financial`
- `restricted_hr`
- `legal_privileged`

Examples:

- public parcel data may be `public_record`
- signed contract intended for customer view may be `customer_visible`
- subcontractor reference drawings may be `vendor_visible`
- payroll records should be `restricted_hr`
- margin analysis and internal compensation should be `restricted_financial`

The same entity may have mixed visibility across its attachments and related events.

## Temporal Entitlements

Permissions are temporal.

That means access grants should be modeled as lifecycle-bearing records.

Examples:

- subcontractor can view project docs only during active engagement
- employee can access a jobsite while assigned there
- customer portal access may be suspended when account is delinquent
- premium reporting may expire when a subscription downgrades

Minimum temporal fields:

- `valid_from`
- `valid_to`
- `granted_at`
- `granted_by`
- `revoked_at`
- `revoked_by`
- `revocation_reason`

## Product Entitlements

Data visibility and product capability must not be conflated.

A user may have access to a property but not to premium features over that property.

Examples:

- customer can view property dossier but cannot use proactive Buddy reports on tier 1
- supplier can upload invoices but cannot access advanced analytics
- crew foreman can view assigned work but cannot export sensitive financial summaries

Product entitlements should be catalog-based, not freeform per-user flags.

## Catalog Model

The platform should maintain structured catalogs for:

- apps
- features
- plans
- plan feature mappings
- overrides
- effective entitlements

Suggested concepts:

- `apps`
- `features`
- `plans`
- `plan_features`
- `subscriptions`
- `feature_limits`
- `entity_entitlements`
- `user_entitlements`

### Apps

Examples:

- `calexp5_internal`
- `customer_portal`
- `supplier_portal`
- `subcontractor_portal`
- `crew_mobile`
- `buddy_console`

### Features

Examples:

- `view_property_360`
- `upload_media`
- `view_service_history`
- `view_estimates`
- `submit_bid`
- `upload_invoice`
- `ask_buddy`
- `receive_proactive_alerts`
- `warranty_monitoring`
- `advanced_export`
- `view_internal_financials`

### Plans

Three tiers are sufficient to start.

Examples:

- `tier_1`
- `tier_2`
- `tier_3`

These may later be branded differently by stakeholder type, but the architecture should support a clean three-tier starting model.

## Subscription Model

Subscriptions should generally attach to an entity domain, not only to an individual user.

Examples:

- customer account entity subscribes to premium property intelligence tier
- subcontractor company subscribes to vendor portal tier
- Bainbridge internal org holds enterprise/internal entitlements

Users then inherit capabilities from:

- their entity membership
- the entity's active subscription
- any role-based additions
- any explicit user override

Suggested subscription attributes:

- plan
- billing status
- effective start
- effective end
- trial status
- suspension status
- renewal state

## Effective Capability Resolution

Effective entitlement should be computed using a predictable order.

Recommended resolution order:

1. platform defaults
2. app defaults
3. plan defaults
4. active entity subscription
5. role-based grants
6. engagement-based temporary grants
7. user-specific overrides
8. suspension or revocation rules

This prevents entitlement drift and makes support/debugging easier.

## Settings Versus Entitlements

Do not store business-critical capability control as generic settings blobs.

Use structured entitlements for:

- app access
- premium feature access
- workflow permissions
- agent permissions
- usage limits

Use settings for:

- UI preferences
- notification preferences
- display defaults
- minor customization

This distinction is important for auditability and predictable behavior.

## Control Dashboard

The control dashboard should manage entitlement policy intentionally.

It should allow internal operators to:

- define apps and features
- define plans
- map plans to features
- assign subscriptions to stakeholder entities
- grant or revoke temporary access
- apply user-level overrides
- inspect effective entitlements
- inspect visibility conflicts

The dashboard should show:

- why a user has access
- why a feature is enabled or disabled
- which subscription or grant created that access
- when it expires

## Agent-Safe Access

Agents must not operate over the unrestricted graph for stakeholder-facing outputs.

They should query:

- stakeholder-scoped projections
- visibility-filtered graph traversals
- entitlement-aware retrieval endpoints
- alert candidates already filtered by access policy

Examples:

- customer-facing Buddy can answer questions only from customer-visible slices
- subcontractor-facing Buddy can summarize only that subcontractor's bids, invoices, and active engagement context
- internal Buddy may access wider operational and financial context depending on role

This is necessary to avoid accidental leakage of:

- payroll
- internal notes
- competing bids
- restricted financials
- legal-sensitive artifacts

## Recommended Table Set

The exact schema may evolve, but the architecture should support at least these concepts:

- `users`
- `user_entity_memberships`
- `entities`
- `entity_relationships`
- `engagements`
- `entitlements`
- `entity_access_grants`
- `entity_subscriptions`
- `apps`
- `features`
- `plans`
- `plan_features`
- `user_feature_overrides`
- `visibility_policies`

High-value supporting fields include:

- `visibility_classification`
- `valid_from`
- `valid_to`
- `status`
- `granted_by`
- `revoked_by`
- `source_reason`
- `policy_reason`

## Example Access Patterns

### Customer

Customer should see:

- all properties linked to their customer domain
- all customer-visible property events
- all customer-visible contracts, estimates, invoices, receipts, claims, warranties, and service history
- all child entities under the property that are approved for customer view
- uploaded collateral they submitted

Customer should not see:

- crew payroll
- internal notes
- internal vendor comparison
- competing bids

### Subcontractor

Subcontractor should always see in home domain:

- all bids submitted by their company
- all work history
- all invoices submitted
- all payments received

Subcontractor may temporarily see in engagement scope:

- reference drawings
- assignment documents
- project instructions
- approved jobsite-specific collateral

Subcontractor should not see:

- competing subcontractor bids
- unrelated property records
- internal financial analysis

### Employee / Crew

Employee should see:

- own profile and work history according to policy
- assigned crews, jobsites, schedules, and operational documents
- safety and compliance documents required for their role

Employee should not automatically see:

- compensation of other employees
- broad vendor financials
- unrelated customer legal documents

## Alignment With Other Documents

This model depends on the other architectural layers being implemented correctly.

### With `DB_ARCHITECTURE.md`

- access is applied over the universal entity graph and event ledger
- graph traversal must be filtered by scope plus visibility
- projections such as `property_360_projection` or `supplier_360_projection` should be permission-aware

### With `MASTER_DATA_MANAGEMENT.md`

- external source systems do not define final stakeholder-facing visibility
- locally curated entitlements and visibility policies control what users and agents can see
- watermark changes in source systems may trigger entitlement recalculation if relevant fields changed

### With `ENTITY_LIFECYCLE_MODEL.md`

- subscriptions have lifecycle
- entitlements have lifecycle
- engagements have lifecycle
- visibility windows have lifecycle

Access and capability control are therefore lifecycle-bearing operational records.

## Architectural Rules

1. Separate identity, scope, access, and capability.
2. Model temporary access explicitly with time windows.
3. Use visibility classification in addition to graph reachability.
4. Use catalog-driven plans and features instead of ad hoc flags.
5. Attach subscriptions to stakeholder entities where possible.
6. Compute effective entitlements predictably and audibly.
7. Keep critical capability control out of generic settings blobs.
8. Ensure all stakeholder-facing agent retrieval is entitlement-aware.
9. Treat access grants and subscriptions as lifecycle-managed records.
10. Make the control dashboard explain why any access or capability exists.

## Next Design Step

The next practical step is to turn this model into:

- a role and visibility matrix
- a concrete table blueprint
- effective entitlement resolution rules
- first-pass API contracts for entitlement-aware graph retrieval
