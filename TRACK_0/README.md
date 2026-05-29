# Track 0 Readme

This folder contains the canonical Track 0 harness/control-plane documentation set.

## Canonical Current Set

Read in this order:

1. `README_ARCHITECTURE_DOCS_v3.1.md`
2. `BB_BUDDY_TRACK_0_DELIVERY_v1.9.md`
3. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
4. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
5. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
6. `BB_Buddy_Harness_Validation_Layer_Spec_v1.0.md`
7. `TRACK_0_DB_RECONCILIATION.md`
8. `TRACK_0_PERSISTENCE_ADDENDUM.md`
9. `TRACK_0_IMPLEMENTATION_READINESS.md`

## Notes

- `README_ARCHITECTURE_DOCS_v3.1.md` supersedes `README_ARCHITECTURE_DOCS_v3.md`
- `BB_BUDDY_TRACK_0_DELIVERY_v1.9.md` supersedes `BB_BUDDY_TRACK_0_DELIVERY_v1.8.md`
- superseded files are kept in `SUPERSEDED` for history only

## Implementation Rule

Agents should implement only from the canonical current set unless explicitly asked to inspect historical versions.

## Track 0 DB Note

The validation layer introduced additional persistence obligations after the original base control-plane schema sketch.
For implementation readiness, agents should also use:

- `TRACK_0_DB_RECONCILIATION.md`
- `TRACK_0_PERSISTENCE_ADDENDUM.md`
- `TRACK_0_IMPLEMENTATION_READINESS.md`
