# Superseded Docs Policy (Canonical)

## Purpose
Prevent agents from building against stale or superseded files.

---

## Canonical Current Files

### Program / Track Docs
- `README_ARCHITECTURE_DOCS_v3.md`
- `BB_BUDDY_CORE_ARCHITECTURE.md`
- `BB_BUDDY_TRACK_0_DELIVERY_v1.7.md`
- `BB_BUDDY_CREW_PLATFORM.md`
- `BB_HOME_PLATFORM_EXPANSION.md`

### Track 0 Companion Specs
- `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
- `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
- `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`

---

## Superseded by Policy
Any earlier version not listed above is superseded for implementation.

Examples:
- older `README_ARCHITECTURE_DOCS.md`
- older `BB_BUDDY_TRACK_0_DELIVERY.md`
- earlier harness control-plane drafts
- any doc without the latest version label listed above

---

## Agent Rule
If search results return both current and older versions:
1. Prefer the file listed in the canonical current files list
2. Ignore superseded versions for implementation
3. Use older versions only for historical context if explicitly requested

---

## Human Maintainer Rule
Keep older versions only if needed for history, but mark them clearly as:
`SUPERSEDED — DO NOT IMPLEMENT FROM THIS FILE`

