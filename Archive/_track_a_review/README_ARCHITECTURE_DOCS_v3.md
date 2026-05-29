# BB Buddy Architecture Documentation (Canonical Map v3.0)

## Status
**This is the canonical entrypoint for all architecture and implementation docs.**

These docs are organized into **two tiers**:

### Tier 1 — Program Architecture / Delivery
1. `BB_BUDDY_CORE_ARCHITECTURE.md`
2. `BB_BUDDY_TRACK_0_DELIVERY_v1.7.md`
3. `BB_BUDDY_CREW_PLATFORM.md`
4. `BB_HOME_PLATFORM_EXPANSION.md`

### Tier 2 — Track 0 Companion Specs (Harness Control Plane)
5. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
6. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
7. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`

---

## Canonical Reading Order by Build Target

### Track 0 Agent (Test Harness + Control Plane)
Read in this exact order:

1. `BB_BUDDY_TRACK_0_DELIVERY_v1.7.md`
2. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
3. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
4. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
5. `BB_BUDDY_CORE_ARCHITECTURE.md`

**Rule:**  
- Track 0 Delivery = schedule, stage boundaries, deliverables, gates
- Control Plane API & Data Contracts = highest-precedence backend contracts
- UI Spec = highest-precedence frontend contracts
- Control & Autonomy Spec = system meaning, planner behavior, governance
- Core Architecture = broader architectural context and decisions

### Track A Agent (Crew Platform)
Read in this exact order:

1. `BB_BUDDY_CREW_PLATFORM.md`
2. `BB_BUDDY_CORE_ARCHITECTURE.md`
3. `BB_BUDDY_TRACK_0_DELIVERY_v1.7.md` (dependency gates + validation mapping only)
4. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md` (only if implementing Track A harness/control-plane dependencies)
5. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md` (only if implementing Track A-visible harness UI dependencies)

**Rule:**  
Track A agents must not read Track B design sections as implementation scope.

### Track B / Future Team
Read in this order **only after B-track gate opens**:

1. `BB_HOME_PLATFORM_EXPANSION.md`
2. `BB_BUDDY_CORE_ARCHITECTURE.md`
3. Relevant Track 0 trust/governance sections
4. Relevant Track A production learnings

**Rule:**  
B-track is design-only until A3 production validation + explicit approval.

---

## Program Partitioning

### Tier 1: Program Architecture / Delivery Docs
These explain what the program is building and when.

#### 1. BB_BUDDY_CORE_ARCHITECTURE.md
- Enduring architectural decisions
- Execution boundaries
- Dual orchestrator model
- RAG vs SQL split
- Tool registry
- Execution control backbone
- Security, lifecycle, cost, risks

#### 2. BB_BUDDY_TRACK_0_DELIVERY_v1.7.md
- Track 0 implementation sequence
- T0.1–T0.7 deliverables
- frozen schemas
- validation mapping
- dependency gates
- Track 0 companion-spec mapping

#### 3. BB_BUDDY_CREW_PLATFORM.md
- A0–A3 phases
- crew-only scope
- MCP, RAG, operations assistant
- governance and write workflows

#### 4. BB_HOME_PLATFORM_EXPANSION.md
- B1–B7 future design
- deferred until A3 production validation
- not buildable now by design

### Tier 2: Track 0 Companion Specs
These are lower-level execution docs for the harness control plane.

#### 5. BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md
- system-level control plane behavior
- planner search policy
- control modes
- stop conditions
- observability model

#### 6. BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md
- operator console pages
- layout
- component inventory
- interaction flows
- chart behavior
- role-based UI gating

#### 7. BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md
- canonical API contracts
- event stream schemas
- profile payload schemas
- analytics formulas
- planner scoring
- persistence schema
- highest-precedence public contract doc

---

## Track 0 Dashboard / Control Console Clarification (Canonical)

There are **not two separate dashboard products**.

They are the same subsystem at different maturity levels:

- **T0.2 = minimum observer implementation**
  - live progress
  - event stream
  - logs
  - transcripts
  - cost
  - pause / skip / rerun
- **T0.6 = expanded trend + cross-project visibility**
  - trend dashboard
  - pass-rate history
  - cost history
  - multi-project regression visibility
- **Harness Control Console v1.1 = canonical final operator surface**
  - Launch
  - Live Run
  - Failures
  - Capacity
  - Trends
  - Planner
  - Profiles
  - Admin

**Interpretation rule:**  
T0.2 and T0.6 are stage-specific slices of the final Harness Control Console.  
Agents must NOT treat the observer dashboard and the control console as separate products.

---

## Superseded / Historical Docs Policy

The file corpus may still contain older versions of:
- `README_ARCHITECTURE_DOCS.md`
- `BB_BUDDY_TRACK_0_DELIVERY.md`
- `BB_BUDDY_CORE_ARCHITECTURE.md`
- `BB_HOME_PLATFORM_EXPANSION.md`
- earlier harness control-plane docs

### Rule
If a file is not listed in this canonical map as the current version, it is **superseded** for implementation purposes.

### Implementation Rule for Agents
Agents must build only from:
- the files listed in this canonical map
- in the reading order above
- with local document precedence respected

---

## Precedence Rules

### Track 0 Companion Specs
1. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
2. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
3. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`

### Program Docs
- `BB_BUDDY_CORE_ARCHITECTURE.md` governs enduring architecture
- `BB_BUDDY_TRACK_0_DELIVERY_v1.7.md` governs Track 0 delivery sequencing
- `BB_BUDDY_CREW_PLATFORM.md` governs Track A execution scope
- `BB_HOME_PLATFORM_EXPANSION.md` governs Track B design intent only

If docs conflict:
- narrower, higher-precedence contract doc wins over broader prose
- active-track implementation docs win over deferred-track design docs
- canonical map wins over older README/index docs

---

## Build Readiness Summary

### Build Now
- Track 0
- Track A

### Do Not Build Yet
- Track B implementation

### Reason
Track B remains explicitly gated by A3 production validation and approval.

---

## Final Agent Rule

Before coding:
1. Read the canonical map
2. Read only the docs required for your assigned track
3. Ignore superseded files
4. Follow precedence exactly
5. Do not infer scope from deferred-track docs

