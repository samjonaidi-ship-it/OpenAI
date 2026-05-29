# BB Buddy Track 0 Delivery Plan | v1.8 | 2026-04-03 | FINAL FOR BUILD

**Track 0 = Quality Infrastructure + Harness Control Plane.**  
Nothing ships from Track A without passing Track 0 gates.

---

# 0. Canonical Status

This file is the **Track 0 execution doc**.

## Track 0 companion specs (same subsystem, higher detail)
For harness control-plane implementation, use these companion specs in this exact order:

1. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
2. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
3. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
4. `BB_BUDDY_TRACK_0_DELIVERY_v1.8.md` (this file)
5. `BB_BUDDY_CORE_ARCHITECTURE.md`

## Authority split
This file is canonical for:
- Track 0 stage sequencing
- deliverables
- stage scope boundaries
- dependency gates
- validation mapping
- when each slice is built

This file is **not** canonical for:
- control-plane public API field names
- WebSocket stream envelopes
- final UI component behavior
- analytics formulas
- planner scoring logic

Those are owned by the companion specs above.

---

# 1. Objective

Build an autonomous harness system that provides:

- deterministic test orchestration
- synthetic data generation
- AI evaluation
- cross-platform validation
- live operator observation
- controlled remote operation via UI/API
- bounded autonomous experiment planning

Track 0 is the quality foundation for Track A.

---

# 2. Execution Boundary Matrix

| Area | Status | Build Now? | Gate | Notes |
|---|---|---|---|---|
| Harness core (runner, waves, manifest) | Committed | YES | None | T0.1 |
| Observer / Control Console foundation | Committed | YES | T0.1 complete | T0.2 first slice |
| Synthetic data (relational) | Committed | YES | T0.1 complete | T0.3 |
| Synthetic data (SDV + assets) | Committed | YES | T0.3 complete | T0.4 |
| AI evaluators (voice + RAG + judge) | Committed | YES | T0.3 complete | T0.5 |
| Scale + cross-platform + console trends | Committed | YES | T0.5 complete | T0.6 |
| Universal project discovery | Future | NO | A3 + T0.6 stable | post-launch |
| Fix agent | Post-launch | NO | A3 production stable 4+ weeks | T0.7 only |

---

# 3. Dashboard / Control Console Clarification

There is **one harness control product**, not two.

## T0.2 = first usable slice of final console
T0.2 must build the minimum observer/control surface required to operate a live run:
- live progress
- WebSocket event stream
- logs
- transcripts
- cost visibility
- pause / skip / rerun / open-in-editor
- operator shell

## T0.6 = expanded slice of same console
T0.6 must extend that same console with:
- trends
- pass-rate history
- cost history
- cross-project regression visibility
- capacity/scale summary sufficient to interpret load and platform results

## Final target shape
The final control plane is defined by the companion specs and includes:
- Launch
- Live Run
- Failures
- Capacity
- Trends
- Planner
- Profiles
- Admin

### Hard rule
Agents must **not** create a second dashboard product.  
T0.2 and T0.6 are staged implementations of the same final console.

---

# 4. Scenario Authority (Canonical)

Track 0 owns the scenario model.

## Scenario schema owner
`Auto_Test_Harness/schemas/scenario-dsl.ts` is the canonical source of truth for:
- scenario identity
- seeding
- scale
- distributions
- edge cases
- correlations

## Control-plane relationship
The control-plane contracts may reference:
- `scenario_id`
- `scenario_version`

but they do **not** redefine the full scenario DSL.  
Agents must treat the scenario DSL as owned by Track 0.

### Hard rule
Do not invent a second scenario schema in the control-plane backend.

---

# 5. Stage Plan

## Stage 1 — Freeze Contracts (Day 1)

### Deliverables
- `Auto_Test_Harness/schemas/manifest.ts`
- `Auto_Test_Harness/schemas/result-classification.ts`
- `Auto_Test_Harness/schemas/scenario-dsl.ts`
- `Auto_Test_Harness/schemas/evaluator-api.ts`
- `Auto_Test_Harness/schemas/patch-proposal.ts`

### DONE WHEN
- all 5 files exist
- no `any`
- standalone validation passes
- exported from `schemas/index.ts`
- merged to `main`

---

## Stage 2 — Harness Core (T0.1) | Weeks 1–2

### Goal
Rcodex-aligned harness core running overnight with 3-zero completion.

### Deliverables
- `Auto_Test_Harness/core/orchestrator.js`
- `Auto_Test_Harness/core/cost-tracker.js`
- `Auto_Test_Harness/core/reporter.js`
- `Auto_Test_Harness/node-tests/`
- `Auto_Test_Harness/harness.js`
- `.harness/` runtime state

### Required output
`node harness.js --auto --project bb-micro-bridge` runs overnight and produces session summary with 3-zero on unit suites.

### Forbidden in T0.1
- AI evaluators
- synthetic generation
- real device testing
- full console build
- fix agent

---

## Stage 3 — Observer / Console Slice + Relational Seeder (T0.2 + T0.3) | Weeks 2–4

### Dependency
T0.1 must be complete.

### Worktree A: T0.2
Build the **Live Run slice** of the final console.

#### Required T0.2 UI surfaces
- top-level shell sufficient for operator use
- live run status
- event timeline
- logs
- transcripts
- core metrics
- pause / skip / rerun / open-in-editor

#### Required T0.2 backend capabilities
- live status endpoint
- event streaming
- run control endpoints for current-run operations
- enough state persistence for live observation and replay of current run summary

### Worktree B: T0.3
Build relational synthetic data factory:
- scenario files
- relational generators
- seeder
- cleaner
- validator
- snapshotter

### DONE WHEN
- T0.2 live slice works end-to-end
- T0.3 golden fixtures generate in <30s with all constraints satisfied

---

## Stage 4 — SDV + Asset Forge + AI Eval (T0.4 + T0.5) | Weeks 4–7

### T0.4
- SDV trainer
- SDV generator
- asset forge
- embedder

### T0.5
- voice evaluator
- rag evaluator
- judge
- nightly automation

### DONE WHEN
- statistically realistic portfolio generated
- voice pass rate >80%
- RAG faithfulness >0.7
- zero hallucinated citations in golden set

---

## Stage 5 — Scale + Integration + Console Expansion (T0.6) | Weeks 7–9

### Goal
Cross-platform validation + all 3 core projects + expanded control-plane visibility.

### Required T0.6 additions
- BrowserStack integration
- k6 load suite
- cross-project regression
- trend dashboard
- cost/pass history
- scale/capacity summary
- enough analytics backend to support the Capacity and Trends views defined in companion specs

### DONE WHEN
- all 3 projects have nightly suites
- BrowserStack passes iOS Safari + Android Chrome + Firefox desktop
- trend views show 4+ weeks of history
- 200 VUs sustained with zero 5xx and acceptable p95

---

## Stage 6 — Post-Launch Hardening (T0.7) | Deferred

Do not build until:
- A3 production stable 4+ weeks
- 10+ sessions/day
- cost stable
- T0.6 >95% pass rate
- Sam approval

---

# 6. Track 0 → Track A Validation Mapping

| A Phase | Validated By | Pass Criteria | Blocks If Fails |
|---|---|---|---|
| A0 | Manual measurement only | first-audio latency ≤ v3.17 baseline; zero iOS Safari console errors | A1 |
| A1 | `node-tests/bb-buddy-session.test.js` | 3-zero | A2 |
| A1 | latency suite | p95 tool-call latency <5s | A2 |
| A1 | cost tracking accuracy test | ±10% | A2 |
| A2 | `projects/bb-buddy/rag-accuracy.suite.js` | 50 queries, faithfulness >0.7, hallucination=0 | A3 |
| A2 | `node-tests/rag-accuracy.test.js` | 3-zero | A3 |
| A3 | workflow suite | state transitions verified; idempotency proven | launch |
| A3 | `scale/k6-load.js` | 200 VUs, zero 5xx, p95 <3s | launch |
| A3 | `node-tests/scheduling-engine.test.js` | 3-zero | launch |

---

# 7. Dependency Gates into Track A

| Track A Phase | Requires |
|---|---|
| A0 | None |
| A1 | T0.1 COMPLETE + A0 COMPLETE |
| A2 | T0.3 COMPLETE + T0.5 COMPLETE |
| A3 | T0.5 COMPLETE + T0.6 COMPLETE |

All are hard stops.

---

# 8. Track 0 API Layer Status

## Answer
**Yes — the harness control-plane API layer is now fully defined for Track 0 at the contract level.**

The canonical API/data contracts doc defines:
- HTTP endpoints
- request/response envelopes
- auth rules
- idempotency
- stream envelopes
- event payloads
- analytics payloads
- profile payloads
- planner contracts
- persistence schema

That is sufficient for:
- agents building the harness backend
- frontend agents building the console
- humans or service accounts operating the harness through the documented API

## Important nuance
“Fully defined” means:
- the public contract surface is defined
- the UI/API relationship is defined
- the persistence obligations are defined

It does **not** mean the implementation work is trivial.

---

# 9. Track 0 Build Readiness

Track 0 is **build-ready** for agents.

Use this reading order:
1. this file
2. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
3. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`
4. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
5. `BB_BUDDY_CORE_ARCHITECTURE.md`

## Final rule
Agents must build the current stage slice only, not the entire final console up front.

