# Canonical Glossary

This document defines the canonical vocabulary for the DB architecture set.

Its purpose is to reduce drift across documents and prevent multiple reasonable-but-conflicting interpretations of the same term.

## Core Identity Terms

### Principal

An authenticated actor that can log in, request actions, and receive permissions.

Usually maps to:

- `users`

### Party

A real-world actor with durable identity.

Examples:

- person
- organization
- household

### Entity

A first-class operational graph node in the platform.

Examples:

- employee
- crew
- supplier
- property
- jobsite
- service engagement

### Stakeholder

A broad business term for a party or entity that participates in the platform and may need a 360 view.

Examples:

- customer
- employee
- supplier
- subcontractor
- property

## Graph Terms

### Hierarchy

Structural containment or parent/child organization.

### Relationship

Non-containment business link between entities.

### Event

An immutable business fact in the historical timeline.

### Eventful Entity

A durable entity that also produces or accumulates events over time.

## Lifecycle Terms

### Lifecycle State

Current operational state of a lifecycle-bearing object.

### Lifecycle Stage

Broader maturity or process stage.

### Revision

A new version of an artifact that preserves prior lineage.

### Supersession

The relationship where one artifact/version replaces another.

## Access Terms

### Scope

The domain or graph region over which access is evaluated.

### Home Scope

The durable domain a stakeholder normally retains access to.

### Engagement Scope

A temporary access scope created by an operational relationship.

### Visibility Classification

Sensitivity or audience label on data.

Examples:

- `customer_visible`
- `internal`
- `restricted_financial`

### Capability

What a user or stakeholder is allowed to do in the product.

This is distinct from data visibility.

## Workflow Terms

### Workflow Request

Durable record of intended assistant-driven or human-driven action.

### Approval

Policy-governed decision allowing or denying a workflow request.

### Execution

An attempt to perform the requested action.

### Outbox Message

Durable side-effect record emitted for downstream processing.

### Compensation

Corrective action taken after partial failure or divergence.

## Communication Terms

### Communication

Raw inbound or outbound message artifact.

### Thread

Contextual grouping of related communications.

### Extraction

Structured interpretation derived from communication content.

### Action Item

Operational task created from communication, telemetry, workflow, or other signals.

### Reminder

Time-oriented follow-up record.

### Notification

A concrete outbound or in-app message delivered to a stakeholder.

## Telemetry Terms

### Observation

Point-in-time external or system-generated reading.

### Telemetry

High-volume continuous trace data.

### Derived Signal

Explainable conclusion inferred from observations, telemetry, or events.

### Alert Candidate

A normalized candidate for action or notification derived from signals.

## Financial Terms

### Financial Document

An artifact such as estimate, invoice, receipt, or credit memo.

### Obligation

A payable, receivable, or other tracked financial commitment.

### Payment

A settlement or money movement.

## Scheduling Terms

### Work Request

Demand for work to be performed.

### Schedule Window

Acceptable time range for work.

### Assignment

Link between work and performing person/team/provider.

### Service Engagement

The operational execution object for a scheduled task or visit.

### Dispatch Opportunity

A work item offered to candidate providers or crews for assignment.

## Projection Terms

### Projection

A read-optimized representation derived from canonical write models.

### Refresh State

Metadata that indicates how fresh a projection or summary is.

## Boundary Rule

Harness terms such as:

- run
- planner
- replay manifest
- harness event stream

belong to the harness domain, not the product operational graph, unless explicitly bridged for analysis.
