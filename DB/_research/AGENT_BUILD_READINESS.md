# Agent Build Readiness

This document defines what an implementation agent needs before safely starting work on the new DB system.

## Readiness Status

The architecture set is now broad enough to start implementation planning.

It is not yet the final schema code, but it is sufficient to begin controlled agent implementation if the work is sequenced carefully.

## What Is Ready

Ready now:

- architecture direction
- Track A execution boundary
- glossary
- domain models
- workflow/governance model
- migration/cutover strategy
- data-domain boundaries

## What Agents Should Build First

Agents should start with:

1. schema module planning
2. Track A table implementation
3. source-link layer
4. workflow/approval layer
5. projection scaffolding

Agents should not start by activating future customer/homeowner product surfaces.

## Required Inputs For Agents

An implementation agent should read at minimum:

1. `README_DB_ARCHITECTURE.md`
2. `TRACK_A_DB_ALIGNMENT.md`
3. `CANONICAL_GLOSSARY.md`
4. `TRACK_A_TABLE_BLUEPRINT.md`
5. `DRIZZLE_MODULE_BREAKDOWN.md`
6. `FIRST_MIGRATION_SEQUENCE.md`
7. `MIGRATION_AND_CUTOVER_PLAN.md`
8. `WORKFLOW_AND_APPROVAL_MODEL.md`
9. `DB_ARCHITECTURE.md`
10. `MASTER_DATA_MANAGEMENT.md`
11. `AGENT_EXECUTION_ORCHESTRATION.md`

## Agent Constraints

Agents must assume:

- Track A only
- crew-only scope
- single-tenant
- current production remains live on old system
- new DB is parallel-build and cutover-based

## Recommended Agent Workstreams

### Workstream 1. Schema Foundation

Build:

- identity/core graph
- source linkage
- basic events

### Workstream 2. Workflow Governance

Build:

- workflow requests
- approvals
- executions
- idempotency
- outbox

### Workstream 3. Communications And Actions

Build:

- communications
- action items
- reminders
- notification records

### Workstream 4. Crew Scheduling And Telemetry

Build:

- work requests
- assignments
- engagements
- GPS/device traces
- basic derived signals

### Workstream 5. Projections

Build:

- crew 360
- workflow queue
- approval queue
- freshness tracking

## What Must Be Verified Before Coding

Before agents write schema code, humans should confirm:

1. new DB approach approved
2. Track A scope freeze approved
3. first-cut table blueprint approved
4. migration strategy approved
5. harness/product DB boundary approved

## What Is Still Human-Judgment Heavy

These items still need strong human judgment during implementation:

- exact role matrix details
- exact approval tier policy
- exact QBO/QBT linking rules
- exact projection refresh SLA
- exact geospatial depth in phase 1

## Ready-To-Start Statement

Agents are ready to begin implementation planning and staged schema work once the human team confirms:

- this DB folder as the active architecture source
- the new DB / parallel-cutover decision
- the Track A first-cut table blueprint
