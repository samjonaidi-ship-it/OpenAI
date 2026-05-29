# Track 0 Implementation Readiness

This document defines the implementation-ready interpretation of Track 0 after reconciling the validation-layer additions.

## Ready-To-Build Statement

Track 0 is buildable if implemented from:

1. the canonical Track 0 source docs
2. `TRACK_0_DB_RECONCILIATION.md`
3. `TRACK_0_PERSISTENCE_ADDENDUM.md`

## Priority Build Order

### Phase 1. Base Control Plane Persistence

Build:

- runs
- run profiles
- validation result
- run stage states
- event/log/transcript/tool call persistence
- failure groups/details
- replay manifests
- profile version tables
- planner tables
- alerts
- audit logs

### Phase 2. Validation Layer Persistence

Build:

- validation runs
- confidence reports
- golden cases
- differential comparisons
- adversarial cases
- validation artifact index

### Phase 3. UI/Backend Visibility Completion

Add:

- validation run visibility in control plane
- confidence report visibility
- gating status visibility
- drift/adversarial visibility

### Phase 4. Ordering/Retention Hardening

Harden:

- stream ordering persistence
- retention rules
- replay integrity support

## Track 0 Implementation Rules

1. Do not invent new product scope.
2. Do not remove frozen v1.1 public contracts.
3. Do implement the validation-layer persistence addendum.
4. Do not create a second validation dashboard.
5. Do treat validation as a gating-quality subsystem, not an optional reporting add-on.
