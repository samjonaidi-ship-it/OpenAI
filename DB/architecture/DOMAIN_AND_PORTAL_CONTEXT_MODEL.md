# Domain And Portal Context Model

This document defines how inbound domains and subdomains should map into platform context.

It exists to keep the platform:

- single-org
- future-compatible for many stakeholder-facing domains
- explicitly not multi-tenant for Track A

## Purpose

The platform is expected to support many stakeholder-facing entry points under:

- `*.bainbridgebuilders.com`

Examples:

- `crew.bainbridgebuilders.com`
- `admin.bainbridgebuilders.com`
- `app.bainbridgebuilders.com`
- future client/property/supplier-specific subdomains

These domains should not be treated as separate database tenants.

They are:

- entry contexts
- branding contexts
- access bootstrap contexts
- default scope hints

They are not the primary data-partitioning key.

## Core Rule

For the current roadmap:

- one company
- one operational graph
- many domain contexts

This means:

- do not introduce `tenant_id` just to support stakeholder domains
- do not equate domain with tenant
- do not duplicate core records by portal

## Domain Context Concept

Every inbound request should resolve a `portal_context`.

Recommended responsibilities:

- determine the requested host
- classify reserved vs stakeholder-specific subdomain
- attach branding/profile hints
- attach default actor class
- attach default home-scope hint
- provide safe WebAuthn/origin validation inputs

Suggested logical fields:

- `portal_context_id`
- `host_pattern`
- `portal_key`
- `portal_type`
- `actor_class`
- `scope_entity_id` nullable
- `scope_slug` nullable
- `brand_name`
- `theme_key`
- `status`
- `auth_policy`
- `created_at`
- `updated_at`

## Entry Surface Configuration (Per Portal + Per Role)

The entry/landing surface is a **policy-driven, icon-first map UI** that can be customized
by both admin policy and the individual crew member. This prevents a brittle, single-layout
experience while keeping minimum safety and compliance data always visible.

Rules:
- **Admin minimums** are always on (cannot be hidden).
- **User toggles** can hide/show optional tiles, layers, and tooltips.
- **Privacy overrides** apply per user (e.g., “hide my location from other crew”).

Suggested config structure (policy + user overlay):
- `portal_context.defaults` (admin-required layers/slots)
- `portal_context.optional` (admin-approved, user-toggleable)
- `principal_settings.entry_overrides` (per-user choices)

Example minimums for crew:
- map base layer
- assigned jobsites
- safety/alert channel
- pay period summary

Example user toggles:
- store pins (Home Depot, Ace, Outdoor Supply)
- crew visibility (show others / share my location)
- tool checklist
- foreman notes
- traffic and weather advisories

## Location Visibility & Privacy

Location visibility is **not implied** by portal access.

Rules:
- A user can hide their own location from other crew.
- Admin may set a minimum visibility scope for job-critical roles.
- Crew location data should be displayed with “last seen” state, not just “live”.
- Map layers must respect per-user privacy flags before rendering.

## Map Layers (Crew Entry Context)

Entry map layers are composed from multiple sources:
- primary jobsite + proximity rings
- assigned sites
- nearby stores (pre-approved vendor list)
- crew members clocked in

Store pins should be constrained to an approved vendor list and proximity radius.
Do not rely on ad-hoc external places calls for the entry surface.

## Provisioning & Auth Code Issuance

Entry contexts must support a **provisioning path** for new users and devices.

Minimum provisioning steps:
- principal record created
- portal_context linked
- role + capability policies assigned
- initial device registration (optional)
- initial auth code or PIN setup issued

Auth code issuance should be:
- time-limited
- scope-limited to portal + role
- one-time use or rotating
- logged for audit

This keeps portal onboarding consistent across crew, homeowner, and supplier entry paths.

## Reserved Domains

Some subdomains should be reserved and platform-owned.

Examples:

- `crew`
- `admin`
- `app`
- `api`
- `www`

These should resolve to stable platform contexts rather than stakeholder-specific records.

## Stakeholder Domains

Stakeholder-specific subdomains should resolve to a scoped context in the same graph.

Examples:

- customer home domain
- supplier home domain
- subcontractor home domain
- property-facing portal

These contexts should normally point to:

- a home entity
- a party
- a role family
- or another explicit graph scope

## Access Interaction

`portal_context` does not replace access control.

It only contributes to effective access resolution.

Effective access should still be determined by:

- principal identity
- memberships
- home scope
- relationship scope
- engagement scope
- visibility classification
- capability policy

The domain context is the front door, not the whole permission system.

## Auth Interaction

The auth layer should become:

- domain-aware
- principal-aware
- membership-aware

It should not stay permanently employee-only in its internal model.

Recommended long-term auth outcome:

- principal authenticates
- principal resolves to memberships
- request resolves through `portal_context`
- effective scope and capabilities are computed

## WebAuthn Interaction

Because the expected future is wildcard subdomains under one parent domain, WebAuthn can remain tractable.

Recommended rule:

- use one parent RP ID where valid for the platform root domain
- validate exact request origin per active host
- keep fallback explicit for localhost and Railway service domains

This is much simpler than supporting arbitrary external custom domains.

## Track A Rule

Track A remains:

- crew-only
- single-tenant
- non-customer-facing as a product surface

So Track A should implement only the minimum domain architecture needed now:

- host propagation through CalExp5 proxy
- Bridge-side host/domain resolution
- reserved domain handling
- future-safe principal/session shape

Track A should not activate:

- external stakeholder auth flows
- customer-facing portal features
- subscription-tier activation by portal
- domain-driven RLS or tenant isolation

## Recommended First Schema Slice

The first DB-compatible slice may be minimal:

- `portal_contexts`
- optional `portal_context_entity_links`

If schema activation is deferred, the runtime should still expose the same concept in code so the DB model and runtime contract do not drift.

## Design Rules

1. Domain is context, not tenancy.
2. Keep one company graph unless business scope changes.
3. Resolve host once near the edge, then carry the context through the request.
4. Keep reserved and stakeholder-specific portals explicit.
5. Make auth and access domain-aware without prematurely activating external-user product surfaces.
