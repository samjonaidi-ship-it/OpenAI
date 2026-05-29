# Scheduling And Dispatch Model

This document defines the scheduling, dispatch, assignment, and recurring-service model.

It is a companion to:

- `TRACK_A_DB_ALIGNMENT.md`
- `DB_ARCHITECTURE.md`
- `ENTITY_LIFECYCLE_MODEL.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`

## Purpose

The platform needs to support both:

- Track A crew scheduling and assignment
- future marketplace-style home-service dispatch

Those are related, but not identical.

## Core Principle

Do not model scheduling as only a calendar row.

You need distinct concepts for:

1. demand
2. time window
3. assignment
4. execution
5. recurrence

## Core Objects

### 1. Service Request / Work Request

The demand for work.

Examples:

- crew task
- service visit needed
- recurring maintenance occurrence

### 2. Schedule Window

The acceptable time range.

Examples:

- Tuesday AM
- within 7 days
- exact booked slot

### 3. Assignment

Who is expected to perform the work.

Examples:

- crew assignment
- technician assignment
- provider assignment

### 4. Engagement / Visit

The operational execution object.

This should usually be an eventful entity.

### 5. Recurrence Policy

How repeating work is generated.

Examples:

- monthly
- quarterly
- annual
- custom cadence

## Track A Scheduling Scope

Track A should prioritize:

- crew schedules
- team assignments
- jobsite windows
- shift/work-day context
- governed schedule write-back via CalExp5

Track A does not need full customer-facing marketplace scheduling yet.

## Future Marketplace Extension

Later, this same model can support:

- provider availability
- dispatch opportunities
- acceptance / rejection
- reassignment
- route-aware scheduling

## Recommended Core Tables

- `work_requests`
- `schedule_windows`
- `assignments`
- `service_engagements`
- `recurrence_policies`
- `schedule_occurrences`
- `availability_rules`
- `availability_exceptions`
- `dispatch_opportunities`
- `dispatch_candidates`

## Availability Model

Availability should support:

- recurring weekly patterns
- exceptions
- territory constraints
- service-type eligibility
- capacity limits

## Dispatch Model

For future marketplace scenarios:

- request becomes dispatch opportunity
- eligible candidates are ranked
- one is assigned or self-accepts
- reassignment is possible

## Lifecycle

Scheduling objects need explicit states.

Examples:

- request: `draft`, `requested`, `approved`, `cancelled`
- assignment: `proposed`, `accepted`, `declined`, `revoked`
- engagement: `scheduled`, `en_route`, `in_progress`, `completed`, `no_show`, `cancelled`

## Telemetry Alignment

Scheduling should consume:

- GPS traces
- device health
- weather
- ETA signals

But those should remain in telemetry layers, not inside schedule tables.

## Workflow Alignment

Schedule changes are governed writes.

Use workflow and approval model for:

- assignment changes
- dispatch actions
- write-back to CalExp5

## Design Rules

1. Separate request, window, assignment, and execution.
2. Use recurrence policies to generate work, not hand-created future rows only.
3. Keep dispatch as a distinct layer, not a status flag on an appointment.
4. Let Track A use the crew-scheduling subset first.
5. Feed scheduling with telemetry-derived signals, not raw traces directly.

## Next Design Step

The next practical step is to define:

- Track A crew scheduling table set
- future provider-dispatch extension points
- recurrence policy schema
- assignment state machine
