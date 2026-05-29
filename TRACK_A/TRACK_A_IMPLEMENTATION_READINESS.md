# Track A Implementation Readiness

This document defines the implementation-ready interpretation of Track A after reconciling it with the new DB package.

## Ready-To-Build Statement

Track A is ready for implementation planning if agents build from:

1. `BB_BUDDY_CREW_PLATFORM_v1.7.md`
2. this folder's reconciliation docs
3. the DB package in `..\DB`

## What Track A Agents Should Build

Track A agents should focus on:

- crew-only identities and roles
- MCP/server-side tool support dependencies
- crew knowledge system support
- structured business-data query support
- governed CalExp5 write-back support
- crew scheduling integration
- approval and workflow safety

## What Track A Agents Must Not Activate

- homeowner/customer product surfaces
- customer uploads
- property-intelligence product features
- external portal subscriptions
- marketplace dispatch activation beyond what Track A directly needs

## Required DB Inputs

Track A implementation depends on:

- Track A DB alignment
- Track A table blueprint
- workflow and approval model
- MDM/source-link model
- projection and refresh model
- migration/cutover strategy

## Recommended Track A Work Order

1. confirm Track A active DB subset
2. scaffold schema foundation
3. implement workflow/approval tables
4. implement source linkage for QBO/QBT/CalExp5
5. implement Track A projections
6. validate shadow-mode migration path

## Final Rule

Track A should be implemented as the first operating slice of the new DB, while current production remains on the existing system until cutover criteria are met.
