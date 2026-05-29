# BB Buddy Harness Validation Layer Specification (v1.0 — Agent-Executable)

## Status
- **Status:** FINAL FOR BUILD
- **Audience:** AI agents, QA engineers, backend engineers, reviewers
- **Track:** Track 0 companion spec
- **Purpose:** Formal specification for **testing the tester** — validating the harness, evaluators, analytics, and planner
- **Parent Docs:**
  - `BB_BUDDY_TRACK_0_DELIVERY_v1.8.md`
  - `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
  - `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
  - `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`

---

# 0. Canonical Role of This Document

This document defines the **Harness Validation Layer**: the subsystem that tests whether the test harness itself is trustworthy.

It formalizes:
- deterministic harness self-tests
- evaluator golden tests
- differential regression of the harness itself
- adversarial / chaos tests against the harness
- meta-confidence scoring
- agent-executable scenarios for running these suites
- gating rules for when harness outputs may be trusted

## Precedence
For Harness Validation Layer implementation:

1. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
2. `BB_Buddy_Harness_Validation_Layer_Spec_v1.0.md` (this document)
3. `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
4. `BB_BUDDY_TRACK_0_DELIVERY_v1.8.md`

If this document conflicts with the control-plane contracts doc on public contract shapes, the contracts doc wins.

---

# 1. Objective

Establish confidence that:

1. the harness executes correctly
2. the evaluator layer is trustworthy enough to gate decisions
3. analytics and trends are computed correctly
4. the planner obeys rules and boundaries
5. replay manifests reproduce results reliably
6. autonomous test agents can run validation against the harness itself

This layer exists to prevent **false confidence**.

---

# 2. Scope

The Harness Validation Layer covers four validation families:

1. **Deterministic Harness Validation**
2. **Golden Evaluator Validation**
3. **Differential Harness Regression**
4. **Adversarial / Chaos Harness Validation**

It also defines:
- confidence scoring
- escalation rules
- agent-run scenarios
- execution order across Track 0 stages

---

# 3. Track 0 Placement

The Harness Validation Layer spans Track 0 as follows:

| Track 0 Stage | Harness Validation Role |
|---|---|
| T0.1 | Validate harness mechanics and state flow |
| T0.2 | Validate live UI/event stream correctness |
| T0.3 | Validate scenario compilation and deterministic seeding |
| T0.4 | Validate synthetic data integrity and asset generation consistency |
| T0.5 | Validate evaluator correctness against golden sets |
| T0.6 | Validate analytics, trends, breakpoint summaries, and planner trust |
| T0.7 | Not allowed until prior confidence thresholds met |

## Hard Rule
T0.7 Fix Agent MUST NOT start until Harness Validation confidence thresholds for T0.1–T0.6 are satisfied.

---

# 4. Harness Validation Families

## 4.1 Deterministic Harness Validation

Purpose:
Verify the harness core works correctly independent of probabilistic evaluators.

### What must be tested
- run lifecycle state transitions
- orchestrator behavior
- retry/backoff behavior
- classification behavior
- budget accounting
- event persistence
- stream ordering
- replay manifest integrity
- CLI/API consistency

### Required outcome
If deterministic harness validation fails, the harness itself is untrusted and no higher-level evaluation results may be used as gates.

---

## 4.2 Golden Evaluator Validation

Purpose:
Verify that AI evaluator outputs are sufficiently aligned to human-verified ground truth.

### What must be tested
- voice evaluator agreement with golden sessions
- RAG evaluator agreement with golden retrieval questions
- judge stability across repeated runs
- hallucination detection correctness
- tolerance to harmless phrasing variation
- evaluator consistency across replay

### Required outcome
Golden evaluator tests determine whether evaluator outputs are:
- advisory only
- safe for gating
- blocked pending recalibration

---

## 4.3 Differential Harness Regression

Purpose:
Compare harness behavior across versions/configurations to detect drift in the tester itself.

### What must be compared
- previous harness build vs current
- previous evaluator version vs current
- previous analytics logic vs current
- previous planner logic vs current
- same replay manifest across versions

### Required outcome
If differential regression detects unexplained drift, confidence is reduced and gating authority may be downgraded.

---

## 4.4 Adversarial / Chaos Harness Validation

Purpose:
Verify the harness behaves correctly under bad inputs, degraded dependencies, and partial corruption.

### What must be injected
- duplicate events
- missing events
- out-of-order events
- delayed events
- corrupted transcript items
- invalid tool-call payloads
- evaluator timeout
- evaluator contradiction
- broken replay manifest
- partial analytics data
- websocket disconnect / fallback polling activation

### Required outcome
Harness must degrade safely, not silently corrupt results.

---

# 5. Required Repository Structure

Agents MUST implement this structure exactly:

```text
Auto_Test_Harness/
  harness-tests/
    deterministic/
    golden/
    differential/
    adversarial/
    fixtures/
    runners/
    reports/
    schemas/
```

## 5.1 Directory meanings

### deterministic/
Deterministic tests for harness mechanics

### golden/
Golden truth evaluator tests

### differential/
Cross-version/cross-config comparison tests

### adversarial/
Fault-injection and chaos tests against the harness

### fixtures/
Frozen known-good fixture data for harness validation

### runners/
Entry points that execute harness validation suites

### reports/
Validation output artifacts and summaries

### schemas/
Validation-specific schemas for confidence summaries and result bundles

---

# 6. Required Validation Schemas

Agents MUST create these schemas:

- `harness-validation-manifest.ts`
- `confidence-report.ts`
- `golden-case.ts`
- `differential-comparison.ts`
- `adversarial-case.ts`

## 6.1 Harness Validation Manifest

```ts
{
  validation_run_id: string,       // uuid
  family: string,                  // deterministic | golden | differential | adversarial
  suite: string,                   // suite name
  build_sha: string,
  scenario_id?: string,
  replay_manifest_id?: string,
  trace_id: string,
  started_at: string,              // ISO 8601 UTC
  completed_at?: string,
  status: string,                  // pending | running | passed | failed | inconclusive
  artifacts: string[],
}
```

## 6.2 Confidence Report

```ts
{
  confidence_report_id: string,    // uuid
  validation_run_id: string,
  structural_confidence: number,   // 0-1
  evaluator_confidence: number,    // 0-1
  analytics_confidence: number,    // 0-1
  planner_confidence: number,      // 0-1
  overall_confidence: number,      // 0-1
  gating_status: string,           // blocked | advisory | conditional | gating_allowed
  rationale: string[],
  generated_at: string,
}
```

## 6.3 Golden Case

```ts
{
  golden_case_id: string,
  domain: string,                  // voice | rag | workflow | classification
  prompt_or_input: string,
  expected_result: string,
  expected_metrics: Record<string, number | string>,
  tolerance: Record<string, number>,
  source_of_truth: string,         // human_verified | replay_locked
  version: string,
}
```

## 6.4 Differential Comparison

```ts
{
  comparison_id: string,
  baseline_build_sha: string,
  candidate_build_sha: string,
  replay_manifest_id: string,
  compared_dimensions: string[],
  observed_deltas: Record<string, number | string>,
  drift_classification: string,    // none | acceptable | warning | blocking
  notes: string[],
}
```

## 6.5 Adversarial Case

```ts
{
  adversarial_case_id: string,
  fault_type: string,              // duplicate_event | timeout | corrupted_payload | etc
  injection_point: string,         // stream | persistence | evaluator | planner
  expected_safe_behavior: string,
  severity: string,                // low | medium | high | critical
  version: string,
}
```

---

# 7. Deterministic Harness Validation (Detailed)

## 7.1 Required deterministic suites

Agents MUST implement these suites:

1. `run-lifecycle.suite.js`
2. `event-ordering.suite.js`
3. `retry-backoff.suite.js`
4. `budget-accounting.suite.js`
5. `result-classification.suite.js`
6. `replay-integrity.suite.js`
7. `cli-vs-api-parity.suite.js`

## 7.2 Deterministic pass criteria

### run-lifecycle
- all allowed transitions succeed
- all invalid transitions fail with `INVALID_STATE_TRANSITION`

### event-ordering
- `sequence_no` strictly increases per `(run_id, stream)`
- duplicate sequence numbers rejected
- persisted order matches emitted order

### retry-backoff
- retries follow documented timing policy
- final classification is correct after bounded retries

### budget-accounting
- projected vs actual cost delta within ±10%
- warnings at 70%
- hard stop at 90% or configured cap

### result-classification
- known PASS/WARN/FAIL fixtures classify exactly as expected

### replay-integrity
- exact replay preserves:
  - profile versions
  - seed
  - suites
  - environment
  - planner version if applicable

### cli-vs-api-parity
- equivalent run launched via CLI and API produce same manifest envelope

## 7.3 Deterministic gating rule
Deterministic suites must all pass before golden evaluator tests may be trusted for gating.

---

# 8. Golden Evaluator Validation (Detailed)

## 8.1 Required golden domains

Agents MUST implement golden sets for:

1. voice
2. RAG
3. workflow
4. classification

## 8.2 Voice golden set
Each case must include:
- known transcript input
- expected completion behavior
- expected timing envelope
- expected classification

## 8.3 RAG golden set
Each case must include:
- query
- context corpus
- expected answer
- expected citation set
- acceptable faithfulness range
- hallucination threshold

## 8.4 Workflow golden set
Each case must include:
- starting state
- action sequence
- expected terminal state
- expected approvals / denials

## 8.5 Classification golden set
Each case must include:
- known harness artifacts
- expected result class
- expected explanation category

## 8.6 Golden pass criteria

### Voice
- agreement with expected completion ≥ 0.90
- evaluator variance low across 3 repeat runs

### RAG
- average faithfulness ≥ 0.70
- hallucination score = 0 on frozen golden set
- citation agreement ≥ 0.95

### Workflow
- expected terminal states match 100%

### Classification
- exact match with frozen golden labels ≥ 0.98

## 8.7 Golden truth sourcing rule
Initial golden truth may be seeded by humans, but once frozen and versioned, agents must treat it as canonical until explicitly revised.

---

# 9. Differential Harness Regression (Detailed)

## 9.1 Required differential suites

Agents MUST implement:

1. `harness-version-diff.suite.js`
2. `evaluator-version-diff.suite.js`
3. `analytics-version-diff.suite.js`
4. `planner-version-diff.suite.js`

## 9.2 Required comparison inputs
Each comparison must specify:
- baseline build SHA
- candidate build SHA
- replay manifest(s)
- acceptable tolerance envelope

## 9.3 Differential pass criteria
- no blocking drift on deterministic results
- no unexplained change in replay outputs
- no analytics summary drift beyond documented tolerances
- no planner-policy violation under same constraints

## 9.4 Differential blocking rule
If deterministic or replay-critical drift is detected, gating status becomes `blocked`.

---

# 10. Adversarial / Chaos Harness Validation (Detailed)

## 10.1 Required adversarial suites

Agents MUST implement:

1. `duplicate-events.suite.js`
2. `out-of-order-events.suite.js`
3. `missing-events.suite.js`
4. `stream-disconnect.suite.js`
5. `evaluator-timeout.suite.js`
6. `corrupted-transcript.suite.js`
7. `broken-replay-manifest.suite.js`
8. `partial-analytics-data.suite.js`
9. `planner-envelope-violation.suite.js`

## 10.2 Pass criteria
For each suite:
- harness must not crash
- harness must emit explicit degraded/error signal
- harness must not silently mark run green
- audit/event records must remain consistent enough for diagnosis

## 10.3 Severity handling
- low/medium faults may degrade to advisory
- high/critical faults block gating

---

# 11. Meta-Confidence Model

Each harness validation run MUST produce a confidence report.

## 11.1 Confidence dimensions
- structural_confidence
- evaluator_confidence
- analytics_confidence
- planner_confidence
- overall_confidence

## 11.2 Gating status values
- `blocked`
- `advisory`
- `conditional`
- `gating_allowed`

## 11.3 Minimum thresholds

### gating_allowed
- structural_confidence >= 0.98
- evaluator_confidence >= 0.90
- analytics_confidence >= 0.95
- planner_confidence >= 0.90
- no blocking deterministic drift
- no unresolved critical adversarial failures

### conditional
- structural_confidence >= 0.95
- evaluator_confidence >= 0.80
- analytics_confidence >= 0.85
- planner_confidence >= 0.80

### advisory
- any lower non-blocking confidence band

### blocked
- deterministic harness validation failed
- replay integrity failed
- analytics formulas contradicted raw results
- planner violated envelope
- confidence report incomplete

## 11.4 Overall confidence formula
```text
overall_confidence =
  0.35 * structural_confidence +
  0.30 * evaluator_confidence +
  0.20 * analytics_confidence +
  0.15 * planner_confidence
```

---

# 12. Agent-Executable “Test the Tester” Scenarios

Agents MUST be able to run the Harness Validation Layer without waiting for a human.

## 12.1 Scenario A — Deterministic self-check
Purpose: validate harness mechanics before normal nightly runs

### Trigger
- on every merge to Track 0 control-plane code
- before any nightly full harness run

### Command
```bash
node Auto_Test_Harness/harness-tests/runners/run-deterministic-validation.js
```

### Expected behavior
- runs deterministic suites only
- emits confidence report
- blocks further harness trust if failed

---

## 12.2 Scenario B — Golden evaluator check
Purpose: validate evaluator trust before using evaluator output as gates

### Trigger
- after evaluator changes
- before promoting evaluator config
- nightly at lower cadence than deterministic checks

### Command
```bash
node Auto_Test_Harness/harness-tests/runners/run-golden-validation.js
```

### Expected behavior
- runs golden voice/RAG/workflow/classification suites
- compares to frozen truth
- updates evaluator confidence score

---

## 12.3 Scenario C — Differential regression
Purpose: ensure the tester itself has not drifted

### Trigger
- before merge to main for harness core/evaluator/analytics/planner changes
- before changing formulas or planner scoring

### Command
```bash
node Auto_Test_Harness/harness-tests/runners/run-differential-validation.js --baseline <sha> --candidate <sha>
```

### Expected behavior
- executes replay manifests across both builds
- emits drift report
- blocks if replay-critical drift is unexplained

---

## 12.4 Scenario D — Chaos validation
Purpose: verify safe degradation

### Trigger
- nightly
- before enabling bounded autonomy
- before enabling full autonomy in nonprod

### Command
```bash
node Auto_Test_Harness/harness-tests/runners/run-adversarial-validation.js
```

### Expected behavior
- injects defined faults
- ensures degraded/error paths behave correctly
- updates analytics/planner confidence

---

## 12.5 Scenario E — Agent-autonomous validation cycle
Purpose: allow an agent to run all test-the-tester suites automatically until target confidence is reached

### Trigger
- after major Track 0 changes
- before declaring harness “gating_allowed”
- before T0.7 activation

### Command
```bash
node Auto_Test_Harness/harness-tests/runners/run-confidence-cycle.js --target gating_allowed --max-iterations 10
```

### Expected behavior
- runs deterministic → golden → differential → adversarial in sequence
- recomputes confidence after each cycle
- stops when:
  - target confidence achieved
  - budget exceeded
  - iteration cap reached
  - blocking failure detected

### Hard rule
This scenario is the canonical “agents can run the test-the-tester suites” path.

---

# 13. Agent Roles and Ownership

## 13.1 Pod A — Deterministic Harness Validation
Owns:
- run-lifecycle
- event-ordering
- retry/backoff
- budget accounting
- replay integrity
- CLI/API parity

## 13.2 Pod B — Golden Evaluator Validation
Owns:
- golden corpora
- evaluator runners
- repeat-run stability checks

## 13.3 Pod C — Differential Regression
Owns:
- baseline/candidate comparison
- drift classification
- comparison reporting

## 13.4 Pod D — Adversarial / Chaos
Owns:
- fault injectors
- degraded-mode assertions
- resilience checks

## 13.5 Pod E — Confidence Aggregation
Owns:
- confidence report generation
- gating-status decisions
- escalation output

---

# 14. Required Output Artifacts

Every harness validation family MUST emit:

- validation manifest
- raw suite results
- confidence report
- replay manifest references where applicable
- drift/fault report where applicable
- final gating recommendation

Output location:
```text
Auto_Test_Harness/harness-tests/reports/<validation_run_id>/
```

---

# 15. Required API / UI Integration

The Harness Validation Layer MUST integrate into the existing Track 0 control plane.

## 15.1 Backend integration
The control-plane backend must expose validation-run visibility via:
- run status
- events/logs
- alerts
- trends
- capacity/analytics where relevant

## 15.2 UI integration
The console must be able to show:
- validation run state
- confidence report summary
- latest gating status
- latest drift report
- latest adversarial failures

## 15.3 No separate dashboard
Harness validation results appear in the same Harness Control Console, not a new standalone UI.

---

# 16. Escalation Rules

## 16.1 Automatic block
The following force `blocked`:
- failed deterministic self-check
- replay-integrity failure
- broken event ordering
- planner envelope violation
- critical adversarial corruption not handled safely

## 16.2 Human review required
The following require human review before restoring `gating_allowed`:
- golden evaluator drift beyond tolerance
- analytics mismatch vs raw results
- unexplained differential regression
- repeated inconclusive confidence cycles

---

# 17. Acceptance Criteria

The Harness Validation Layer is DONE only when:

1. all four validation families exist
2. all required schemas exist
3. all required runners exist
4. agents can launch each validation family independently
5. agents can launch the full confidence cycle autonomously
6. confidence reports are generated on every validation run
7. blocking conditions downgrade gating status correctly
8. replay integrity is verified
9. validation results are visible in the Harness Control Console
10. T0.7 remains blocked until required confidence thresholds are met

---

# 18. Explicit Non-Goals

Not part of v1:
- self-modifying fix agent
- autonomous merge approval
- production autonomy
- customer-facing trust dashboard

---

# 19. Final Rules for Agents

1. Do not use evaluator output as a hard gate until deterministic harness validation passes.
2. Do not treat golden truth as mutable unless a human explicitly versions a new golden set.
3. Do not invent extra validation families.
4. Do not create a second UI for harness validation.
5. Do not declare `gating_allowed` unless all required thresholds are met.
6. Do not start T0.7 until this layer reports sufficient confidence.

