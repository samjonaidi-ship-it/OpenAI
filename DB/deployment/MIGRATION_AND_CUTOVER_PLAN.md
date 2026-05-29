# Migration And Cutover Plan

This document defines the recommended path from the current production DB/state into the new Track A database.

## Decision

The recommended strategy is:

- create a new DB for the new architecture
- keep current production running on the existing DB
- use a new app/integration branch for Track A work
- migrate and validate in parallel
- cut over only after Track A is proven

This is preferred over in-place production mutation.

## Why

The new architecture changes:

- identity
- workflow governance
- source linkage
- projections
- telemetry handling

Trying to evolve the current production DB in place would create semantic overlap and higher operational risk.

## Migration Phases

### Phase 1. Architecture Freeze

Before any migration code:

- freeze glossary
- freeze Track A active scope
- freeze Track A table blueprint
- freeze source system boundaries

### Phase 2. New DB Bootstrap

Create:

- new Neon DB or strongly isolated schema set
- fresh migration history
- separate roles/credentials where practical

### Phase 3. Source Ingestion

Build one-way ingestion into the new DB from:

- QBO
- QBT
- current CalExp5 state where needed
- current crew-related operational sources

### Phase 4. Backfill And Mapping

Resolve:

- users and parties
- entities and relationships
- external links
- attribute history
- initial workflow and communications seeds

### Phase 5. Projection Bring-Up

Build and verify:

- crew 360
- approval queue
- workflow queue
- trace quality
- knowledge freshness

### Phase 6. Shadow Mode

Run Track A against the new DB while production stays on the old path.

Validate:

- query correctness
- workflow safety
- projection freshness
- cost/performance
- agent answer quality

### Phase 7. Controlled Write Activation

Enable writes gradually:

- low-risk internal actions first
- approval-gated actions second
- broader crew operations only after confidence

### Phase 8. Cutover

Cut over only when:

- data ingestion stable
- source lag acceptable
- workflow idempotency proven
- projections healthy
- Track A acceptance passed

## Cutover Gates

Minimum gates:

1. source sync stable
2. no critical identity-resolution failures
3. approval workflows proven
4. outbox/retry/compensation tested
5. projections within agreed freshness SLA
6. Track A role matrix enforced
7. production rollback plan written and rehearsed

## Rollback Plan

Rollback should mean:

- current production continues on the old DB/system
- new DB cutover can be disabled
- no destructive back-migration required during initial fallback

This is another reason a parallel DB strategy is safer.

## Data Migration Principles

1. Raw source truth should be preserved.
2. New canonical records should not erase legacy/source provenance.
3. Migration should be replayable where practical.
4. Identity resolution decisions should be auditable.
5. Backfills should be idempotent.

## Branching Strategy

Recommended:

- `main` remains production-safe
- `track-a-db-rebuild` integration branch for new DB work
- feature branches from that branch

## Testing Strategy

Required:

- migration dry runs
- data-count reconciliation
- source watermark reconciliation
- workflow execution tests
- projection freshness tests
- role/access tests

## Next Design Step

The next practical step is to write:

- source-by-source migration spec
- cutover checklist
- rollback checklist
- validation queries
