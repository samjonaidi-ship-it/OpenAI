# BB Buddy Test Harness Control & Autonomy Specification (v3.1 — Final / Agent-Executable)

## Document Info
- **Version:** v3.1
- **Status:** FINAL FOR BUILD KICKOFF
- **Owner:** Sam / Team
- **Audience:** AI agents, backend engineers, frontend engineers, reviewers
- **Purpose:** End-to-end system specification for the harness control plane, autonomy system, dashboard, and governance model

---

# 0. Document Precedence (CANONICAL)

These documents MUST be interpreted in this exact precedence order:

1. **BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md**
2. **BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md**
3. **BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md** (this document)

## Precedence Rules
- If two documents differ, the higher-precedence document wins.
- UI behavior MUST NOT override API/data contracts.
- High-level prose in this document MUST NOT be used to change frozen schemas, endpoint contracts, event payloads, permissions, or analytics formulas.
- Agents must treat this document as the system-level design and orchestration guide, not the source of truth for low-level public contracts.

---

# 1. Objective

Build a governed test harness system that:
- executes deterministic, AI-eval, and scale tests
- supports stakeholder and persona-based pressure testing
- allows human-assisted and agent-assisted control
- performs bounded autonomous experiment planning
- provides real-time observation and post-run analysis
- enforces explicit safety, budget, governance, and replayability rules

---

# 2. System Layers

## 2.1 Logical Stack

1. **Harness Execution Engine**
2. **Autonomous Experiment Planner (AEP)**
3. **Control Plane Backend**
4. **Harness Control Console UI**
5. **Safety & Governance Layer**

## 2.2 Responsibilities

### Harness Execution Engine
- Executes runs deterministically
- Emits structured run, suite, tool, transcript, and failure events
- No UI logic
- No product authorization logic

### Autonomous Experiment Planner (AEP)
- Chooses the next run configuration within constraints
- Searches the test space according to explicit goal contracts
- Stops on configured stop conditions
- Emits rationale and mutation diffs

### Control Plane Backend
- Stores run profiles, events, results, analytics, and replay manifests
- Exposes HTTP APIs and WebSocket streams
- Enforces authorization and idempotency

### Harness Control Console UI
- Composes runs
- Monitors live execution
- Investigates failures
- Operates the planner safely

### Safety & Governance Layer
- Budget caps
- environment controls
- role-based access
- confirmation requirements
- audit logs
- profile immutability
- replay guarantees

---

# 3. Run Lifecycle

## 3.1 States
- `draft`
- `validated`
- `queued`
- `running`
- `paused`
- `failed`
- `completed`
- `aborted`
- `archived`

## 3.2 Transition Rules
Only these transitions are allowed:

- `draft -> validated`
- `validated -> queued`
- `queued -> running`
- `running -> paused`
- `running -> failed`
- `running -> completed`
- `running -> aborted`
- `paused -> running`
- `paused -> aborted`
- `failed -> archived`
- `completed -> archived`
- `aborted -> archived`

All transitions MUST be logged in the audit log with:
- actor id
- actor role
- prior state
- next state
- timestamp
- trace id

---

# 4. Control Modes

## 4.1 Modes
- `observe`
- `recommend`
- `supervised`
- `bounded_autonomy`
- `full_autonomy_nonprod`

## 4.2 Meaning

### observe
- Human may read only
- Planner may not launch or mutate runs

### recommend
- Planner may propose
- Human must approve next mutation before execution

### supervised
- Planner may execute only within already-approved presets and envelopes

### bounded_autonomy
- Planner may mutate allowed fields within a hard safety envelope

### full_autonomy_nonprod
- Planner controls nonprod runs entirely within documented envelopes
- Never allowed in prod

---

# 5. Pressure Profiles

## 5.1 Concept
Pressure profiles are immutable, versioned presets that scale:
- concurrency
- session count
- data volume
- RAG corpus size
- write density
- run duration

## 5.2 Sizes
- XS
- S
- M
- L
- XL
- MAX

## 5.3 Rules
- Built-ins cannot be edited in place
- Clones are versioned and mutable
- MAX requires explicit confirmation
- Pressure profiles must remain reproducible across replay runs

---

# 6. Stakeholder & Persona Matrix

## 6.1 Actor Model
Each simulated actor is:

`Stakeholder Role + Persona Overlay + Pressure Size`

## 6.2 Stakeholder Roles
- crew
- crew_lead
- admin
- customer
- supplier
- approver
- dispatcher

## 6.3 Persona Overlays
- passive
- cooperative
- neutral
- impatient
- adversarial
- confused
- detail_oriented
- careless
- budget_sensitive
- escalation_prone

## 6.4 Core Rule
Pressure size MUST amplify persona behavior, not merely traffic volume.

---

# 7. Goal Contracts

## 7.1 Supported Goal Types
- coverage
- reliability
- capacity
- adversarial
- regression

## 7.2 Semantics

### coverage
Maximize stakeholder/persona/scenario combination coverage

### reliability
Prove sustained green operation under a defined envelope

### capacity
Find safe operating envelope and breakpoints

### adversarial
Find reproducible failure-inducing configurations

### regression
Compare a code/config baseline to a candidate build and surface degradation

---

# 8. Autonomous Experiment Planner (AEP)

## 8.1 Inputs
- run history
- failure history
- explored-space memory
- active goal contract
- safety envelope
- remaining budget
- environment constraints

## 8.2 Outputs
- proposed next run profile
- mutation diff
- confidence score
- reasoning summary
- stop-condition evaluation

## 8.3 Search Policy
The planner MUST use this search order unless the goal contract explicitly overrides it:

1. Baseline validation
2. Single-dimension sweep
3. Pairwise interaction sweep
4. Breakpoint search
5. Focused exploitation of discovered weak regions
6. Confirmation / de-flaking runs

---

# 9. Allowed vs Forbidden Mutation

## 9.1 Allowed Mutations
- pressure profile
- persona weights
- persona sizes
- scenario seed
- suite ordering
- concurrency
- cache mode
- run duration within envelope

## 9.2 Forbidden Mutations
- contract schemas
- authorization rules
- control mode escalation
- environment escalation
- built-in profile mutation in place
- budget cap bypass
- audit logging disablement
- prod routing

---

# 10. Stop Conditions

Every autonomous run series MUST define all of:

- `max_cost_cents`
- `max_duration_minutes`
- `max_iterations`
- `failure_confirmations_required`
- `no_improvement_after_k_runs`

The planner MUST stop when the earliest stop condition is reached.

Precedence:
1. hard safety violation
2. budget exceeded
3. environment block
4. goal reached
5. time exceeded
6. no improvement threshold reached
7. max iterations reached

---

# 11. Observability Requirements

The system MUST expose:

- run state
- stage state
- ordered events
- live logs
- transcript items
- tool call records
- latency metrics
- cost metrics
- failure summaries
- planner state
- alert stream
- trace links

---

# 12. UI Summary

The console is desktop-first and supports:
- Launch
- Live Run
- Failures
- Capacity
- Trends
- Planner
- Profiles
- Admin

The UI spec is canonical for:
- layout
- page composition
- interaction flows
- loading/empty/error states
- chart placement
- component inventory

---

# 13. Control Plane Summary

The control plane contracts document is canonical for:
- endpoint schemas
- event payload schemas
- profile payload schemas
- analytics formulas
- planner scoring
- persistence schema
- authorization matrix
- pagination, filtering, sorting
- stream guarantees

---

# 14. Reproducibility Rules

Every replayable run MUST persist:
- scenario id and version
- pressure profile id and version
- persona matrix id and version
- goal contract id and version
- test suites
- execution mode
- environment
- fixed seed
- code SHA
- planner version

No replay run may mutate any of the above when clone mode is `exact_replay`.

---

# 15. Governance Rules

## Required
- audit log on every mutating action
- role-based controls
- explicit confirmation for destructive actions
- nonprod restriction for planner autonomy
- profile version immutability
- replay manifest generation
- stream ordering guarantees

## Forbidden
- hidden mutable state
- undocumented endpoints
- UI-only authorization
- undocumented chart formulas
- undocumented event payloads

---

# 16. Acceptance Criteria (System-Level)

The overall system is DONE only when:

1. API contracts validate against frozen schemas.
2. UI renders every required page with only documented fields.
3. Planner runs inside documented envelopes and stop conditions.
4. All operator mutations are audited.
5. Replay manifests reproduce historical runs exactly.
6. Capacity and trend analytics use documented formulas.
7. Role and control-mode restrictions are enforced both in UI and backend.
8. Live streams preserve per-run ordering.
9. No built-in profile is mutable in place.
10. Agents can implement without inventing undocumented public contracts.

---

# 17. Explicit Non-Goals

Not part of this system:
- customer-facing dashboard
- prod autonomous testing
- arbitrary user-created analytics formulas
- drag-and-drop dashboard builder
- mobile-first operator UI
- undocumented mutation freedom for AEP

---

# 18. Final Rules for Agents

1. Read the control-plane contracts document first.
2. Read the UI spec second.
3. Use this document for orchestration intent and system meaning only.
4. Do not override lower-level contracts with higher-level prose.
5. Do not invent public fields, events, analytics formulas, or permissions.

