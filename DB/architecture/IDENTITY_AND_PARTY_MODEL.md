# Identity And Party Model

This document defines the canonical identity, stakeholder, contact, and membership model for the platform.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`
- `TRACK_A_DB_ALIGNMENT.md`

## Purpose

The platform needs a clean distinction between:

- authenticated principals
- people
- organizations
- properties and operational entities
- contact points
- memberships and roles

Without this, 360 views will fragment and duplicates will spread across:

- QBO
- QBT
- CalExp5
- communications
- uploads
- public records

## Core Principle

Do not collapse these concepts into one table:

- user account
- person
- company
- contact record
- stakeholder entity

They are related, but they are not the same thing.

## Canonical Layers

### 1. Principal

A principal is something that can authenticate and act.

Examples:

- crew user
- lead user
- admin user
- future customer portal user

Recommended table:

- `users`

Suggested fields:

- `user_id`
- `login_identifier`
- `auth_provider`
- `pin_hash` or auth credential reference
- `status`
- `last_login_at`

### 2. Party

A party is a real-world actor with durable identity.

Examples:

- person
- organization
- household
- subcontractor company
- supplier company

Recommended table:

- `parties`

Suggested fields:

- `party_id`
- `party_kind` = person | organization | household | public_body
- `display_name`
- `legal_name`
- `status`

### 3. Entity

An entity is the operational graph node used by the platform.

Examples:

- employee
- crew
- supplier
- subcontractor
- property
- jobsite
- service engagement

In many cases a party maps to one or more entities.

Examples:

- one person party may have an employee entity and a portal-user relationship
- one organization party may have supplier and subcontractor roles in different contexts

### 4. Contact Point

Contact points should be first-class, not buried in party blobs.

Examples:

- email
- phone
- mailing address
- notification endpoint

Recommended tables:

- `contact_points`
- `party_contact_points`

### 5. Membership / Role

Memberships link principals and parties/entities to scopes and roles.

Examples:

- user belongs to employee entity
- user belongs to subcontractor organization
- person is contact for supplier company
- customer user belongs to household domain

Recommended tables:

- `user_party_memberships`
- `user_entity_memberships`
- `party_roles`

Portal/domain context should remain separate from these identity layers.

Reason:

- a domain selects an entry context
- a principal authenticates
- memberships determine what the principal can act for

Do not collapse domain context into the `users` table.

## Why This Matters

This model lets you support:

- one person with multiple roles
- one company with multiple business relationships
- multiple users under one stakeholder organization
- communications resolved to contacts without breaking master identity
- future external portals without redoing core identity

## Recommended Core Tables

- `users`
- `parties`
- `party_roles`
- `entities`
- `user_party_memberships`
- `user_entity_memberships`
- `contact_points`
- `party_contact_points`
- `party_entity_links`

## Contact Model

Contact points need structure and history.

Recommended attributes:

- `contact_type` = email | phone | address | push_endpoint
- `contact_value`
- `normalized_value`
- `is_primary`
- `is_verified`
- `valid_from`
- `valid_to`

This is especially important for:

- communications
- MDM matching
- portal access
- notification delivery

## Role Model

Roles should be contextual.

Examples:

- employee
- crew_lead
- admin
- customer_contact
- supplier_contact
- subcontractor_estimator
- property_owner

Do not assume a party has one permanent role.

Use:

- `party_roles`
- `valid_from`
- `valid_to`
- `scope_entity_id` where needed

## Track A Activation

Track A should activate the minimum needed subset:

- `users`
- `parties`
- `entities`
- `user_entity_memberships`
- `contact_points`
- selected `party_roles`

Track A should not overbuild future household/homeowner complexity yet.

## MDM Alignment

This is the backbone for entity resolution.

Use it to reconcile:

- QBO customer/vendor identities
- QBT worker identities
- communication participants
- crew/app principals

## Access Alignment

Access should attach to:

- principal
- party
- entity scope

This model gives you a stable way to resolve who a user is acting for.

## Design Rules

1. Separate principals from parties.
2. Separate parties from operational entities.
3. Keep contact points first-class and reusable.
4. Model roles as contextual and temporal.
5. Let one party map to multiple entities when business roles differ.
6. Use this model as the foundation for MDM, communications, access, and portals.

## Next Design Step

The next practical step is to define:

- canonical party kinds
- canonical contextual role set
- user-to-party and party-to-entity mapping rules
- identity resolution priority rules
