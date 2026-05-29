# Architecture Review Findings

This document captures the main findings from a distance review of the DB architecture set and a research pass over relevant platform constraints.

Reviewed inputs:

- all DB docs in this folder
- `Track_A_Docs_Bundle.zip`
- relevant Neon, PostgreSQL, PostGIS, pgvector, and Intuit developer documentation

## Overall Assessment

The strategy is directionally strong.

The platform architecture is converging on the right backbone:

- identity and party model
- universal entity graph
- event ledger
- lifecycle model
- access and entitlement model
- communications model
- observations and telemetry model
- workflow and approval model

The biggest remaining risk is no longer “wrong database”.
The biggest risk is architectural spread without enough implementation prioritization and canonical term consolidation.

## Main Findings

### 1. Neon/Postgres remains the right foundation

Neon/Postgres is still a good fit for the target architecture because the platform is fundamentally:

- relational
- temporal
- audit-heavy
- graph-like but still join-oriented
- document and evidence linked

Important platform capabilities are available in the current ecosystem:

- `pgvector`
- `postgis`
- `pg_cron`
- logical replication
- full-text search
- exclusion constraints and range types

Implication:

- no immediate need for a separate graph database
- no immediate need for a separate vector database
- no immediate need for a separate time-series database if telemetry is modeled carefully

### 2. Track A must remain the first implementation envelope

Track A is explicitly:

- crew-only
- single-tenant
- non-homeowner
- non-property-intelligence
- non-customer-upload

The DB set now acknowledges that, but the architecture should continue to be reviewed through this rule:

- future-compatible schema is allowed
- future-facing product activation is not

### 3. The most important missing implementation-first spine was workflow governance

That gap is now addressed by `WORKFLOW_AND_APPROVAL_MODEL.md`.

This is critical because Track A A3 depends on:

- governed write-back
- approval tiers
- idempotency
- outbox
- retry
- compensation

Without that subsystem, the assistant would not be operationally safe.

### 4. Identity remains the most important long-term anti-chaos control

The most common failure mode in a platform like this is not graph shape.
It is identity fragmentation.

The addition of `IDENTITY_AND_PARTY_MODEL.md` was necessary.

This should be treated as foundational for:

- communications
- MDM
- access
- portals
- financial obligations

### 5. Scheduling is still the next critical operational model

The scheduling/dispatch doc now exists, but it remains one of the highest-risk future areas because many other domains depend on it:

- crew scheduling
- CalExp5 write-back
- route verification
- weather-aware rescheduling
- future provider marketplace

This model should be kept deliberately modular so Track A can use the crew-scheduling subset first.

## Remaining Blind Spots

### 1. Canonical glossary is still missing

You now have enough docs, but not enough term governance.

Examples of terms that should be normalized across the set:

- party
- entity
- principal
- stakeholder
- engagement
- assignment
- visit
- work request
- service engagement
- signal
- alert candidate
- reminder
- notification
- workflow request
- obligation

Without a glossary, different docs can stay individually reasonable while drifting collectively.

### 2. Document-family strategy is still under-specified

The lifecycle doc covers revisioned artifacts well, but you still need one explicit rule for document families:

- estimate family
- invoice family
- drawing-set family
- report family
- media family

Otherwise revision logic may fragment across modules.

### 3. Security and privacy policy is still architectural, not operational

The access model is strong, but the doc set still lacks one concrete policy layer for:

- retention by data class
- legal hold
- HR-sensitive telemetry
- surveillance/video/audio access
- communication redaction
- export/audit boundaries

This is especially important because the platform will hold:

- GPS traces
- device diagnostics
- financial obligations
- communications
- media evidence

### 4. Search strategy is not yet explicit enough

The system will need at least three search modes:

- structured relational search
- full-text search
- semantic/vector retrieval

These are implied across docs, but not yet formalized.

That matters because:

- Track A requires hard `knowledge` vs `query_data` separation
- future 360 views will need unified search behavior
- agents need deterministic retrieval rules

### 5. Reporting/projection refresh mechanics are still conceptual

You correctly call for projections and refresh state, but there is still no canonical projection maintenance strategy.

You need a clear rule for whether projections are updated by:

- synchronous transaction-side writes
- outbox/event processing
- scheduled refresh
- hybrid model

This matters directly for agent freshness and trust.

### 6. Geospatial implementation depth is still undecided

The geospatial doc correctly frames the model, but one important technical decision is still open:

- plain lat/lng plus app-side geo logic first
- or PostGIS as a first-class extension early

Given telemetry, service areas, weather regions, and geofences, this decision should be made deliberately.

### 7. Financial obligations need tighter boundary rules

The finance doc is directionally right, but still needs explicit boundaries between:

- QBO source truth
- local obligation state
- operational follow-up state
- stakeholder-visible state

This will become a source of confusion if not pinned down before implementation.

## Research-Backed Constraints And Recommendations

### Neon / Postgres

Neon publicly documents support for:

- `pgvector`
- `postgis`
- `pg_cron`
- logical replication

This supports the current architecture direction.

Implication:

- use `pgvector` for the crew knowledge system and future semantic retrieval
- consider `postgis` when geofencing, service-area, and region logic becomes operationally central
- use `pg_cron` only for bounded scheduled maintenance jobs, not as the whole workflow engine

### PostgreSQL Range Types And Exclusion Constraints

PostgreSQL’s range types and exclusion constraints are directly relevant to:

- temporal entitlements
- active-assignment overlap protection
- booking/scheduling conflict rules

Implication:

- use range-aware modeling where overlap matters
- do not reinvent all temporal conflict logic in application code

### QBO Change Tracking

QuickBooks Online supports:

- webhooks
- CDC

Important constraint:

- CDC has a 30-day lookback
- responses can cap out
- shorter windows are recommended

Important nuance:

- documentation has historically treated `TimeActivity` specially in CDC behavior
- release notes indicate support has changed over time

Implication:

- do not design ingestion assuming one universal CDC strategy for all entities
- use webhooks first where available
- use CDC as bounded catch-up
- explicitly test `TimeActivity` behavior in your exact current integration path

### Knowledge Search

PostgreSQL full-text search and `pgvector` together are strong enough for the current knowledge architecture.

Implication:

- keep Track A rule intact:
  - `knowledge` = unstructured docs
  - `query_data` = structured SQL
- avoid mixing semantic retrieval directly into operational SQL answers

## Areas That Are Still Slightly Over-Engineered

### 1. External-stakeholder subscription tiers are ahead of Track A

The entitlement model is correct for the future, but customer/supplier/subcontractor subscription tiers are not needed for Track A implementation.

Keep them architectural, not active.

### 2. Full universal portal thinking is ahead of the first execution slice

The long-term 360 platform vision is coherent.
It just needs to stay clearly partitioned from the crew-platform-first rollout.

### 3. Some duplicated action language still exists

Even after the new action consolidation doc, the older docs still reference:

- alert candidates
- reminders
- notifications
- action items

The concepts are now unified, but the wording across older docs should be normalized in a later cleanup pass.

## Areas That Are Not Over-Engineered

These may feel heavy, but they are warranted:

- lifecycle as first-class
- workflow governance
- identity separation
- telemetry/observation split from business events
- access vs capability separation
- MDM with source watermarks

These are necessary if the platform is going to support:

- agent trust
- proactive reminders
- safe write-back
- stakeholder-specific 360 views
- cross-system reconciliation

## Recommended Next Review Sequence

Before any schema drafting:

1. create a canonical glossary
2. mark each doc section as:
   - Track A active
   - future-compatible but deferred
   - future-only
3. normalize action/reminder/notification terminology across the set
4. define the projection refresh strategy
5. decide geospatial depth for phase 1
6. explicitly test QBO/QBT change-tracking assumptions

## Bottom Line

The architecture is now broad enough and coherent enough to review from a distance.

There are still blind spots, but they are now mostly:

- implementation-priority blind spots
- canonical-term blind spots
- operational-policy blind spots

They are no longer “missing whole architecture domains” blind spots.
