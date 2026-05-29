# Track 0 DB Reconciliation

This document reconciles the Track 0 harness/control-plane docs from a persistence and implementation-readiness perspective.

It does not replace the canonical source specs.
It exists to make the Track 0 database obligations internally coherent for implementation agents.

## Canonical Source Set

The canonical Track 0 source docs remain:

1. `README_ARCHITECTURE_DOCS_v3.1.md`
2. `BB_BUDDY_TRACK_0_DELIVERY_v1.9.md`
3. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
4. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
5. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
6. `BB_Buddy_Harness_Validation_Layer_Spec_v1.0.md`

This reconciliation doc exists because the validation layer was added after the original control-plane contract freeze and creates real persistence gaps.

## Main Reconciliation Issue

Track 0 now has a mandatory Harness Validation Layer.

That layer requires:

- validation runs
- confidence reports
- differential comparisons
- adversarial cases
- validation visibility in the existing control console

However, the canonical control-plane API and persistence spec does not yet define the persisted objects or public visibility contracts for those validation records.

## Reconciliation Decision

Treat the existing control-plane contracts as the canonical base, and add a Track 0 persistence addendum for the validation layer.

That means:

- do not rewrite the frozen v1.1 contract doc
- do define the missing persistence tables and visibility requirements in a separate addendum
- do treat those addenda as required for implementation

## Reconciled Interpretation

### 1. Existing control-plane tables remain canonical

Keep as-is:

- runs
- run_profiles
- run_validation_results
- run_stage_states
- run_events
- run_logs
- run_transcripts
- run_tool_calls
- failure groups/details
- replay manifests
- profiles
- planner tables
- alerts
- audit logs

### 2. Validation layer introduces an additional persistence family

Add:

- validation manifests
- validation runs
- confidence reports
- differential comparisons
- golden cases
- adversarial cases
- validation artifacts/index records

### 3. Validation visibility belongs in the same control plane

No second dashboard.

Validation data should appear through:

- existing console surfaces where possible
- added detail views if needed
- same auth and audit discipline as Track 0

### 4. Stream ordering needs stronger persistence support

The event-stream contract requires per-stream ordering.

Implementation should therefore persist deterministic ordering metadata for:

- logs
- tool calls
- transcripts
- validation events if streamed

even where the original persistence table sketch is weaker.

## Implementation Rule

Track 0 implementation agents should use:

- the frozen source docs for public behavior
- `TRACK_0_PERSISTENCE_ADDENDUM.md` for missing validation/persistence detail
- `TRACK_0_IMPLEMENTATION_READINESS.md` for execution priorities

## Things That Remain Frozen

Do not reinterpret:

- public envelopes
- planner scoring
- role matrix
- existing stream names
- existing analytics formulas

This reconciliation is for persistence completeness, not product-contract invention.
