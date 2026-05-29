# BB Buddy Harness Control Plane API & Data Contracts (v1.1 — Final / Agent-Executable)

## Document Info
- **Status:** FINAL FOR BUILD
- **Audience:** AI agents, backend engineers, frontend engineers, reviewers
- **Scope:** Control plane backend contracts only
- **Parent Docs:** `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md`, `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
- **Rule:** This document is the highest-precedence source of truth for control-plane public contracts.

---

# 0. Purpose

This document freezes:
- HTTP APIs
- request/response envelopes
- event stream schemas
- analytics payloads and formulas
- profile payload schemas
- authorization rules
- pagination/filtering/sorting
- ordering guarantees
- persistence schema
- planner scoring / tie-break logic
- audit contracts

Agents MUST implement these exactly.

---

# 1. Global API Rules

## 1.1 Base Path
`/api/harness/v1`

## 1.2 Content Type
- request: `application/json`
- response: `application/json`

## 1.3 Authentication
All endpoints require authenticated identity except `/health`.

Allowed principals:
- human user session
- service account
- planner service account

## 1.4 Idempotency
These endpoints require `Idempotency-Key`:
- `POST /run/create`
- `POST /run/validate`
- `POST /run/launch`
- `POST /run/pause`
- `POST /run/resume`
- `POST /run/abort`
- `POST /run/clone`
- `POST /planner/approve-next`
- `POST /planner/reject-next`

Duplicate same-route, same-normalized-body requests within 24h must return original success response.

## 1.5 Traceability
Every response MUST include:
- `trace_id`
- `request_id`
- `timestamp`

## 1.6 Standard Success Envelope

```json
{
  "ok": true,
  "data": {},
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

## 1.7 Standard Error Envelope

```json
{
  "ok": false,
  "error": {
    "code": "NOT_AUTHORIZED",
    "message": "Human-readable message",
    "retryable": false,
    "details": {}
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

Allowed error codes:
- INVALID_INPUT
- NOT_AUTHENTICATED
- NOT_AUTHORIZED
- INVALID_STATE_TRANSITION
- IDEMPOTENCY_CONFLICT
- RATE_LIMITED
- NOT_FOUND
- BUDGET_BLOCKED
- CONTROL_MODE_BLOCKED
- ENVIRONMENT_BLOCKED
- VALIDATION_FAILED
- CONFLICT
- UPSTREAM_UNAVAILABLE
- INTERNAL_ERROR

---

# 2. Authorization Matrix

## 2.1 Roles
- admin
- lead
- crew
- observer_service
- planner_service

## 2.2 Control Modes
- observe
- recommend
- supervised
- bounded_autonomy
- full_autonomy_nonprod

## 2.3 Endpoint Authorization

| Endpoint Group | admin | lead | crew | observer_service | planner_service |
|---|---|---|---|---|---|
| read runs | yes | yes | yes (restricted) | yes | yes |
| create draft run | yes | yes | no | no | yes |
| validate run | yes | yes | no | no | yes |
| launch run | yes | yes | no | no | yes (mode-bounded) |
| pause/resume/abort run | yes | yes | no | no | yes (mode-bounded) |
| profiles read | yes | yes | yes | yes | yes |
| profiles write | yes | yes (clone/update mutable only) | no | no | no |
| admin settings | yes | no | no | no | no |
| planner state read | yes | yes | no | no | yes |
| planner mutation approve/reject | yes | yes | no | no | no |

## 2.4 Additional Rules
- crew can only read runs explicitly shared to crew role.
- planner_service can act only in supervised, bounded_autonomy, full_autonomy_nonprod.
- staging launch requires admin.
- planner_service cannot update profiles, budgets, permissions, or environments.

---

# 3. Pagination, Filtering, Sorting

## 3.1 Standard Query Parameters
All list endpoints support:
- `page` (default 1)
- `page_size` (default 50, max 200)
- `sort_by`
- `sort_order` (`asc`, `desc`)
- filter fields per endpoint

## 3.2 Standard List Response

```json
{
  "ok": true,
  "data": {
    "items": [],
    "page": 1,
    "page_size": 50,
    "total_items": 0,
    "total_pages": 0
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

## 3.3 Default Sort Order
- runs: `created_at desc`
- events: `sequence_no asc`
- failures: `latest_seen desc`
- profiles: `updated_at desc`
- alerts: `timestamp desc`

---

# 4. Profile Payload Schemas (Frozen)

## 4.1 Pressure Profile Payload

```json
{
  "size": "L",
  "concurrency": 50,
  "session_count": 200,
  "data_volume_multiplier": 5,
  "rag_corpus_size": 10000,
  "write_density": 0.30,
  "duration_minutes": 30
}
```

Rules:
- size ∈ {XS,S,M,L,XL,MAX}
- write_density range = 0.0 to 1.0
- duration_minutes >= 1
- immutable once version published

## 4.2 Persona Preset Payload

```json
{
  "entries": [
    {
      "role": "customer",
      "persona": "adversarial",
      "size": "XL",
      "weight": 0.25,
      "traits": {
        "interruption_rate": 0.80,
        "ambiguity_rate": 0.60,
        "escalation_rate": 0.90,
        "patience_seconds": 5,
        "completion_rate": 0.40,
        "contradiction_rate": 0.50
      }
    }
  ]
}
```

Rules:
- weights across entries must sum to 1.00 ± 0.001
- role allowed values:
  - crew
  - crew_lead
  - admin
  - customer
  - supplier
  - approver
  - dispatcher
- persona allowed values:
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

## 4.3 Goal Contract Payload

```json
{
  "goal_type": "capacity",
  "success_metric": {
    "metric": "last_safe_preset",
    "operator": ">=",
    "target_value": "L_v1"
  },
  "priority_weights": {
    "failure_severity": 0.35,
    "novelty": 0.20,
    "reproducibility": 0.25,
    "cost_efficiency": 0.20
  },
  "run_strategy": "breakpoint_search",
  "stop_conditions": {
    "max_cost_cents": 50000,
    "max_duration_minutes": 120,
    "max_iterations": 20,
    "failure_confirmations_required": 2,
    "no_improvement_after_k_runs": 4
  }
}
```

## 4.4 Run Template Payload

```json
{
  "scenario_id": "bainbridge-200",
  "pressure_profile_id": "L_v1",
  "persona_matrix_id": "customer_stress_v2",
  "goal_contract_id": "capacity_goal_v1",
  "test_suites": ["voice_sessions", "workflow_engine", "scale_k6"],
  "execution_mode": "scale",
  "environment": "nonprod",
  "control_mode": "supervised"
}
```

---

# 5. Core Domain Objects

## 5.1 RunProfile

```json
{
  "run_id": "uuid",
  "run_name": "string",
  "scenario_id": "string",
  "scenario_version": "string",
  "pressure_profile_id": "string",
  "pressure_profile_version": "string",
  "persona_matrix_id": "string",
  "persona_matrix_version": "string",
  "goal_contract_id": "string",
  "goal_contract_version": "string",
  "test_suites": ["node_tests"],
  "execution_mode": "deterministic",
  "environment": "nonprod",
  "seed_mode": "fixed",
  "seed_value": 12345,
  "control_mode": "supervised",
  "created_by": "user_or_service_id",
  "created_at": "ISO8601"
}
```

## 5.2 RunValidationResult

```json
{
  "run_id": "uuid",
  "valid": true,
  "blocking_errors": [],
  "warnings": [],
  "computed_projection": {
    "projected_cost_cents": 1200,
    "projected_duration_minutes": 25
  },
  "validated_at": "ISO8601"
}
```

## 5.3 RunStatusSnapshot

```json
{
  "run_id": "uuid",
  "state": "running",
  "progress_ratio": 0.42,
  "current_stage": "suites",
  "current_subtask": "voice_sessions",
  "started_at": "ISO8601",
  "elapsed_seconds": 380,
  "environment": "nonprod",
  "budget": {
    "max_cost_cents": 50000,
    "used_cost_cents": 6100,
    "warn_threshold_hit": false,
    "hard_cap_hit": false
  },
  "summary": {
    "pass_count": 120,
    "warn_count": 3,
    "fail_count": 1,
    "active_sessions": 12
  }
}
```

## 5.4 StageCardState

```json
{
  "stage_name": "suites",
  "state": "running",
  "started_at": "ISO8601",
  "completed_at": null,
  "duration_ms": 381200,
  "pass_count": 20,
  "warn_count": 1,
  "fail_count": 0,
  "active_subtask": "rag_accuracy"
}
```

## 5.5 TranscriptRecord

```json
{
  "transcript_item_id": "uuid",
  "run_id": "uuid",
  "session_id": "uuid",
  "sequence_no": 17,
  "speaker": "customer",
  "content_type": "text",
  "content": "Where is my invoice?",
  "tool_name": null,
  "request_id": null,
  "timestamp": "ISO8601",
  "trace_id": "uuid"
}
```

## 5.6 ToolCallRecord

```json
{
  "tool_call_id": "uuid",
  "run_id": "uuid",
  "request_id": "uuid",
  "tool_name": "query_data",
  "status": "success",
  "latency_ms": 1820,
  "cost_cents": 7,
  "fallback_used": false,
  "fallback_type": null,
  "timestamp": "ISO8601",
  "trace_id": "uuid"
}
```

## 5.7 FailureGroup

```json
{
  "failure_group_id": "uuid",
  "failure_class": "deterministic_fail",
  "title": "Workflow state machine invalid transition",
  "count": 8,
  "first_seen": "ISO8601",
  "latest_seen": "ISO8601",
  "affected_suites": ["workflow_engine"],
  "severity": "high"
}
```

## 5.8 FailureDetail

```json
{
  "failure_id": "uuid",
  "failure_group_id": "uuid",
  "failure_class": "deterministic_fail",
  "title": "Workflow state machine invalid transition",
  "description": "queued -> completed observed",
  "first_seen": "ISO8601",
  "latest_seen": "ISO8601",
  "repro_count": 3,
  "likely_root_cause_domain": "operations",
  "impacted_personas": ["customer:adversarial:XL"],
  "impacted_pressure_profiles": ["L_v1", "XL_v1"],
  "environment": "nonprod",
  "associated_commit_shas": ["abc123"],
  "replay_manifest_id": "uuid"
}
```

## 5.9 PlannerState

```json
{
  "planner_id": "uuid",
  "state": "running",
  "goal_contract_id": "capacity_goal_v1",
  "iterations_used": 8,
  "remaining_budget_cents": 18200,
  "confidence": 0.76,
  "current_hypothesis": "Latency break occurs when adversarial customer mix exceeds 0.35 at XL.",
  "last_mutation_id": "uuid",
  "next_mutation_proposal_id": "uuid"
}
```

## 5.10 PlannerMutationProposal

```json
{
  "proposal_id": "uuid",
  "base_run_id": "uuid",
  "proposed_run_profile_id": "uuid",
  "mutation_diff": {
    "pressure_profile_id": ["L_v1", "XL_v1"],
    "persona_matrix_changes": [
      {
        "role": "customer",
        "persona": "adversarial",
        "weight_before": 0.20,
        "weight_after": 0.35
      }
    ],
    "suite_changes": ["workflow_engine added"]
  },
  "confidence": 0.82,
  "reasoning_summary": "Escalate pressure and adversarial mix to confirm breakpoint knee.",
  "status": "pending_review"
}
```

## 5.11 ProfileVersion

```json
{
  "profile_id": "L_v1",
  "profile_type": "pressure",
  "name": "Large",
  "version": "v1",
  "built_in": true,
  "mutable": false,
  "payload": {},
  "created_by": "system",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

## 5.12 AlertRecord

```json
{
  "alert_id": "uuid",
  "run_id": "uuid",
  "type": "budget_warning",
  "severity": "warning",
  "message": "Run has exceeded 70% of budget.",
  "timestamp": "ISO8601",
  "trace_id": "uuid"
}
```

## 5.13 AuditLogEntry

```json
{
  "audit_id": "uuid",
  "actor_id": "user_or_service_id",
  "actor_role": "admin",
  "action_type": "launch_run",
  "target_type": "run",
  "target_id": "uuid",
  "before_payload": null,
  "after_payload": {
    "state": "queued"
  },
  "timestamp": "ISO8601",
  "trace_id": "uuid"
}
```

---

# 6. HTTP API Endpoints

## 6.1 Health

### GET /health
Response:
```json
{
  "ok": true,
  "data": {
    "status": "healthy",
    "websocket": "healthy",
    "planner": "healthy"
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

## 6.2 Run Composition

### POST /run/create
Request:
```json
{
  "run_name": "Nightly breakpoint sweep",
  "scenario_id": "bainbridge-200",
  "scenario_version": "v3",
  "pressure_profile_id": "L_v1",
  "persona_matrix_id": "customer_stress_v2",
  "goal_contract_id": "capacity_goal_v1",
  "test_suites": ["voice_sessions", "workflow_engine", "scale_k6"],
  "execution_mode": "scale",
  "environment": "nonprod",
  "seed_mode": "fixed",
  "seed_value": 12345,
  "control_mode": "supervised"
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "run_profile": {
      "run_id": "uuid",
      "state": "draft"
    }
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### POST /run/validate
Request:
```json
{
  "run_id": "uuid"
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "validation": {
      "run_id": "uuid",
      "valid": true,
      "blocking_errors": [],
      "warnings": [],
      "computed_projection": {
        "projected_cost_cents": 3200,
        "projected_duration_minutes": 42
      }
    }
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### POST /run/launch
Request:
```json
{
  "run_id": "uuid"
}
```

Response:
```json
{
  "ok": true,
  "data": {
    "run_id": "uuid",
    "state": "queued"
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

### POST /run/clone
Request:
```json
{
  "source_run_id": "uuid",
  "clone_mode": "exact_replay"
}
```

Allowed values:
- exact_replay
- debug_variant
- planner_variant

Response:
```json
{
  "ok": true,
  "data": {
    "new_run_id": "uuid",
    "state": "draft"
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

## 6.3 Run Controls
### POST /run/pause
### POST /run/resume
### POST /run/abort

Abort request includes:
```json
{
  "run_id": "uuid",
  "reason": "operator_abort"
}
```

Allowed reasons:
- operator_abort
- budget_abort
- planner_abort
- environment_abort

## 6.4 Run Read APIs
- `GET /run/status?run_id=uuid`
- `GET /run/stages?run_id=uuid`
- `GET /run/events?run_id=uuid`
- `GET /run/transcripts?run_id=uuid`
- `GET /run/tool-calls?run_id=uuid`
- `GET /run/logs?run_id=uuid`
- `GET /runs`

`GET /runs` filters:
- state
- environment
- scenario_id
- created_by
- date_from
- date_to

---

# 7. Failure APIs

- `GET /failures/groups`
- `GET /failures/detail?failure_id=uuid`
- `POST /failures/replay`
- `POST /failures/mark-noise` (admin)
- `POST /failures/confirm-flaky` (lead/admin)

---

# 8. Capacity & Trends Analytics APIs

## 8.1 Capacity
### GET /analytics/capacity

Response shape:
```json
{
  "ok": true,
  "data": {
    "summary": {
      "last_safe_preset": "L_v1",
      "first_degraded_preset": "XL_v1",
      "first_hard_fail_preset": "MAX_v1",
      "likely_bottleneck": "query_data latency",
      "highest_risk_persona_mix": "customer_stress_v2"
    },
    "series": {
      "preset_vs_pass_rate": [],
      "preset_vs_p95_latency_ms": [],
      "preset_vs_cost_cents": [],
      "preset_vs_queue_depth": []
    }
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

Series point:
```json
{
  "preset_id": "L_v1",
  "x_rank": 4,
  "value": 0.97,
  "run_ids": ["uuid", "uuid"]
}
```

## 8.2 Capacity Formula Rules
- `last_safe_preset` = highest preset with pass_rate >= 0.95 and zero deterministic_fail
- `first_degraded_preset` = first preset where pass_rate < 0.95 OR p95 latency threshold breached
- `first_hard_fail_preset` = first preset with deterministic_fail OR budget abort
- preset order fixed: XS,S,M,L,XL,MAX

## 8.3 Trends
### GET /analytics/trends

Response shape:
```json
{
  "ok": true,
  "data": {
    "pass_rate": [],
    "cost_drift": [],
    "latency_p95": [],
    "flake_rate": [],
    "rag_faithfulness": [],
    "planner_efficiency": []
  },
  "trace_id": "uuid",
  "request_id": "uuid",
  "timestamp": "ISO8601"
}
```

Trend point:
```json
{
  "bucket_start": "ISO8601",
  "bucket_end": "ISO8601",
  "value": 0.91,
  "run_count": 12
}
```

## 8.4 Trend Defaults and Formulas
- default bucket = 1 day
- default window = last 28 days
- missing bucket = null, not zero
- `cost_drift` = average cost per completed run in bucket
- `latency_p95` = p95 latency across completed runs in bucket
- `flake_rate` = failures later marked flaky / total failures in bucket
- `rag_faithfulness` = average RAG faithfulness across qualifying RAG runs in bucket
- `planner_efficiency` = confirmed_new_findings / planner_run_count in bucket

Filtering precedence:
1. environment
2. branch
3. scenario
4. suite
5. persona preset

---

# 9. Planner APIs

- `GET /planner/state`
- `GET /planner/proposals`
- `POST /planner/approve-next`
- `POST /planner/reject-next`
- `POST /planner/pause`
- `POST /planner/resume`
- `POST /planner/force-stop`
- `GET /planner/explored-space`

---

# 10. Planner Scoring, Tie-Breaks, and Confirmation Rules

## 10.1 Planner Score
Planner proposal score is:

`score = 0.35*failure_severity + 0.20*novelty + 0.25*reproducibility + 0.20*cost_efficiency`

All component values normalized to 0–1.

## 10.2 Definitions
- `failure_severity` = weighted class severity:
  - deterministic_fail = 1.0
  - policy_fail = 0.9
  - golden_miss = 0.6
  - llm_warn = 0.3
- `novelty` = distance from previously explored region + unseen persona/pressure/suite combos
- `reproducibility` = confirmed_fail_count / total_confirmation_runs
- `cost_efficiency` = normalized inverse cost per confirmed finding

## 10.3 Tie-Break Rules
If two proposals have same rounded score (4 decimal places), break ties in this order:
1. higher reproducibility
2. lower projected cost
3. higher novelty
4. lower projected duration
5. lexicographic proposal_id ascending

## 10.4 Confirmation Rules
- deterministic failure becomes `confirmed` after 2 reproductions with same replay manifest inputs
- likely flaky if:
  - at least 3 reruns
  - failure reproduced < 50%
- planner must classify inconclusive if:
  - less than 2 confirmation runs completed
  - or conflicting failure classes observed

---

# 11. Profiles APIs

- `GET /profiles/pressure`
- `GET /profiles/persona`
- `GET /profiles/goal`
- `GET /profiles/run-template`
- `POST /profiles/pressure/clone`
- `POST /profiles/persona/clone`
- `POST /profiles/goal/clone`
- `POST /profiles/run-template/clone`
- `POST /profiles/{type}/update`
- `POST /profiles/{type}/archive`

Built-ins are readable and clone-only.

Response item:
```json
{
  "profile": {
    "profile_id": "string",
    "profile_type": "pressure",
    "name": "Large",
    "version": "v1",
    "built_in": true,
    "mutable": false,
    "payload": {},
    "created_by": "system",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  }
}
```

---

# 12. Admin APIs

Admin only:
- `GET /admin/budgets`
- `POST /admin/budgets/update`
- `GET /admin/environments`
- `POST /admin/environments/update`
- `GET /admin/audit-logs`
- `GET /admin/roles`
- `POST /admin/roles/update`
- `POST /admin/control-mode/update`

---

# 13. Event Stream Contracts

## 13.1 Transport
WebSocket path:
`/ws/harness/v1`

## 13.2 Subscription Message

```json
{
  "action": "subscribe",
  "run_id": "uuid",
  "streams": ["events", "logs", "tool_calls", "transcripts", "alerts", "planner"]
}
```

## 13.3 Stream Envelope

```json
{
  "stream": "events",
  "sequence_no": 101,
  "run_id": "uuid",
  "payload_type": "suite_started",
  "payload": {},
  "timestamp": "ISO8601",
  "trace_id": "uuid"
}
```

## 13.4 Ordering Guarantees
- sequence_no strictly increasing per `(run_id, stream)`
- server preserves order within each `(run_id, stream)` pair
- client may merge by timestamp for display only

## 13.5 Payload Schemas

### events stream

#### run_started
```json
{
  "run_id": "uuid",
  "state": "running"
}
```

#### run_paused
```json
{
  "run_id": "uuid",
  "state": "paused",
  "reason": "operator_pause"
}
```

#### run_resumed
```json
{
  "run_id": "uuid",
  "state": "running"
}
```

#### run_aborted
```json
{
  "run_id": "uuid",
  "state": "aborted",
  "reason": "operator_abort"
}
```

#### run_completed
```json
{
  "run_id": "uuid",
  "state": "completed",
  "summary": {
    "pass_count": 1,
    "warn_count": 0,
    "fail_count": 0
  }
}
```

#### suite_started
```json
{
  "suite_name": "voice_sessions",
  "stage_name": "suites"
}
```

#### suite_completed
```json
{
  "suite_name": "voice_sessions",
  "result_class": "pass",
  "pass_count": 25,
  "warn_count": 0,
  "fail_count": 1
}
```

#### stage_blocked
```json
{
  "stage_name": "evaluation",
  "reason": "budget_warning"
}
```

#### failure_detected
```json
{
  "failure_id": "uuid",
  "failure_group_id": "uuid",
  "failure_class": "deterministic_fail",
  "title": "Workflow invalid transition"
}
```

#### breakpoint_found
```json
{
  "preset_id": "XL_v1",
  "classification": "first_degraded_preset"
}
```

#### budget_warning
```json
{
  "used_cost_cents": 35000,
  "max_cost_cents": 50000,
  "threshold": 0.70
}
```

### logs stream

#### log_entry
```json
{
  "log_id": "uuid",
  "severity": "info",
  "message": "suite started",
  "context": {}
}
```

### tool_calls stream

#### tool_call_started
```json
{
  "tool_call_id": "uuid",
  "request_id": "uuid",
  "tool_name": "query_data"
}
```

#### tool_call_completed
```json
{
  "tool_call_id": "uuid",
  "request_id": "uuid",
  "tool_name": "query_data",
  "status": "success",
  "latency_ms": 1820,
  "cost_cents": 7
}
```

#### tool_call_failed
```json
{
  "tool_call_id": "uuid",
  "request_id": "uuid",
  "tool_name": "query_data",
  "status": "error",
  "error_code": "UPSTREAM_UNAVAILABLE"
}
```

### transcripts stream

#### transcript_item_added
matches `TranscriptRecord`

### alerts stream

#### alert_created
matches `AlertRecord`

### planner stream

#### planner_hypothesis_updated
```json
{
  "planner_id": "uuid",
  "current_hypothesis": "string",
  "confidence": 0.76
}
```

#### planner_mutation_proposed
matches `PlannerMutationProposal`

#### planner_mutation_approved
```json
{
  "proposal_id": "uuid",
  "approved_by": "user_id"
}
```

#### planner_stopped
```json
{
  "planner_id": "uuid",
  "reason": "goal_reached"
}
```

---

# 14. Persistence Model (Migration-Level)

## 14.1 Required Tables and Key Columns

### runs
- `run_id UUID PK`
- `state TEXT NOT NULL`
- `run_name TEXT NOT NULL`
- `environment TEXT NOT NULL`
- `execution_mode TEXT NOT NULL`
- `created_by TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `started_at TIMESTAMPTZ NULL`
- `completed_at TIMESTAMPTZ NULL`

Indexes:
- `(state, created_at desc)`
- `(environment, created_at desc)`

### run_profiles
- `run_id UUID PK REFERENCES runs(run_id)`
- `scenario_id TEXT NOT NULL`
- `scenario_version TEXT NOT NULL`
- `pressure_profile_id TEXT NOT NULL`
- `pressure_profile_version TEXT NOT NULL`
- `persona_matrix_id TEXT NOT NULL`
- `persona_matrix_version TEXT NOT NULL`
- `goal_contract_id TEXT NOT NULL`
- `goal_contract_version TEXT NOT NULL`
- `seed_mode TEXT NOT NULL`
- `seed_value BIGINT NULL`
- `control_mode TEXT NOT NULL`

### run_validation_results
- `validation_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `valid BOOLEAN NOT NULL`
- `blocking_errors JSONB NOT NULL`
- `warnings JSONB NOT NULL`
- `projected_cost_cents INT NOT NULL`
- `projected_duration_minutes INT NOT NULL`
- `validated_at TIMESTAMPTZ NOT NULL`

### run_stage_states
- `stage_state_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `stage_name TEXT NOT NULL`
- `state TEXT NOT NULL`
- `started_at TIMESTAMPTZ NULL`
- `completed_at TIMESTAMPTZ NULL`
- `duration_ms BIGINT NULL`
- `pass_count INT NOT NULL DEFAULT 0`
- `warn_count INT NOT NULL DEFAULT 0`
- `fail_count INT NOT NULL DEFAULT 0`
- `active_subtask TEXT NULL`

Unique:
- `(run_id, stage_name)`

### run_events
- `event_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `stream TEXT NOT NULL`
- `sequence_no BIGINT NOT NULL`
- `payload_type TEXT NOT NULL`
- `payload JSONB NOT NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

Unique:
- `(run_id, stream, sequence_no)`

### run_logs
- `log_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `severity TEXT NOT NULL`
- `message TEXT NOT NULL`
- `context JSONB NOT NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

### run_transcripts
- `transcript_item_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `session_id UUID NOT NULL`
- `sequence_no BIGINT NOT NULL`
- `speaker TEXT NOT NULL`
- `content_type TEXT NOT NULL`
- `content TEXT NOT NULL`
- `tool_name TEXT NULL`
- `request_id UUID NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

### run_tool_calls
- `tool_call_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `request_id UUID NOT NULL`
- `tool_name TEXT NOT NULL`
- `status TEXT NOT NULL`
- `latency_ms INT NOT NULL`
- `cost_cents INT NOT NULL`
- `fallback_used BOOLEAN NOT NULL`
- `fallback_type TEXT NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

### failure_groups
- `failure_group_id UUID PK`
- `failure_class TEXT NOT NULL`
- `title TEXT NOT NULL`
- `severity TEXT NOT NULL`
- `first_seen TIMESTAMPTZ NOT NULL`
- `latest_seen TIMESTAMPTZ NOT NULL`

### failure_details
- `failure_id UUID PK`
- `failure_group_id UUID NOT NULL REFERENCES failure_groups(failure_group_id)`
- `description TEXT NOT NULL`
- `repro_count INT NOT NULL DEFAULT 0`
- `likely_root_cause_domain TEXT NULL`
- `impacted_personas JSONB NOT NULL`
- `impacted_pressure_profiles JSONB NOT NULL`
- `environment TEXT NOT NULL`
- `associated_commit_shas JSONB NOT NULL`
- `replay_manifest_id UUID NULL`

### replay_manifests
- `replay_manifest_id UUID PK`
- `source_run_id UUID NOT NULL REFERENCES runs(run_id)`
- `manifest JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### pressure_profiles
- `profile_row_id UUID PK`
- `profile_id TEXT NOT NULL`
- `version TEXT NOT NULL`
- `built_in BOOLEAN NOT NULL`
- `mutable BOOLEAN NOT NULL`
- `payload JSONB NOT NULL`
- `created_by TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`
- `archived_at TIMESTAMPTZ NULL`

Unique:
- `(profile_id, version)`

Repeat same pattern for:
- `persona_profiles`
- `goal_contracts`
- `run_templates`

### planner_states
- `planner_id UUID PK`
- `state TEXT NOT NULL`
- `goal_contract_id TEXT NOT NULL`
- `iterations_used INT NOT NULL`
- `remaining_budget_cents INT NOT NULL`
- `confidence NUMERIC(5,4) NOT NULL`
- `current_hypothesis TEXT NOT NULL`
- `last_mutation_id UUID NULL`
- `next_mutation_proposal_id UUID NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### planner_mutation_proposals
- `proposal_id UUID PK`
- `planner_id UUID NOT NULL REFERENCES planner_states(planner_id)`
- `base_run_id UUID NOT NULL REFERENCES runs(run_id)`
- `proposed_run_profile_id UUID NOT NULL`
- `mutation_diff JSONB NOT NULL`
- `confidence NUMERIC(5,4) NOT NULL`
- `reasoning_summary TEXT NOT NULL`
- `status TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### planner_explored_regions
- `region_id UUID PK`
- `planner_id UUID NOT NULL REFERENCES planner_states(planner_id)`
- `configuration_summary TEXT NOT NULL`
- `status TEXT NOT NULL`
- `confidence NUMERIC(5,4) NOT NULL`
- `runs_count INT NOT NULL`

### alerts
- `alert_id UUID PK`
- `run_id UUID NOT NULL REFERENCES runs(run_id)`
- `type TEXT NOT NULL`
- `severity TEXT NOT NULL`
- `message TEXT NOT NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

### audit_logs
- `audit_id UUID PK`
- `actor_id TEXT NOT NULL`
- `actor_role TEXT NOT NULL`
- `action_type TEXT NOT NULL`
- `target_type TEXT NOT NULL`
- `target_id TEXT NOT NULL`
- `before_payload JSONB NULL`
- `after_payload JSONB NULL`
- `timestamp TIMESTAMPTZ NOT NULL`
- `trace_id UUID NOT NULL`

Indexes:
- `(actor_id, timestamp desc)`
- `(target_type, target_id, timestamp desc)`

## 14.2 Retention Rules
- audit_logs: 2 years minimum
- run_events: 90 days hot, archive afterwards
- run_logs: 30 days hot, archive afterwards
- run_transcripts: 30 days hot unless replay-pinned
- replay_manifests: never delete while source run retained
- profiles: version rows immutable; archive only

---

# 15. Replay Manifest Contract

```json
{
  "replay_manifest_id": "uuid",
  "source_run_id": "uuid",
  "scenario_id": "string",
  "scenario_version": "string",
  "pressure_profile_id": "string",
  "pressure_profile_version": "string",
  "persona_matrix_id": "string",
  "persona_matrix_version": "string",
  "goal_contract_id": "string",
  "goal_contract_version": "string",
  "seed_mode": "fixed",
  "seed_value": 12345,
  "test_suites": ["voice_sessions"],
  "execution_mode": "scale",
  "environment": "nonprod",
  "code_sha": "abc123",
  "planner_version": "v4",
  "created_at": "ISO8601"
}
```

---

# 16. UI Binding Rules

- Every UI component MUST bind to documented endpoints or streams only.
- Frontend may derive:
  - grouping
  - formatting
  - labels
  - chart tooltips
- Frontend may NOT derive:
  - auth decisions
  - state transitions
  - capacity classifications
  - planner approval rules
  - analytics formulas

---

# 17. Acceptance Criteria (Contracts)

The control-plane backend is DONE only when:
1. all endpoints above implemented
2. all public objects validate against frozen schemas
3. list endpoints support pagination/filtering/sorting
4. mutating endpoints are idempotent
5. authorization matrix enforced server-side
6. websocket ordering preserved per `(run_id, stream)`
7. profile payload schemas enforced
8. event payload schemas enforced
9. planner scoring and tie-break rules implemented as documented
10. persistence schema supports replay and historical versioning
11. UI can render all required pages without undocumented fields
12. all mutating actions are audited

---

# 18. Explicit Non-Goals

Not part of v1:
- GraphQL
- arbitrary user-defined analytics formulas
- prod autonomous execution
- mutable built-in presets
- multi-tenant customer-facing dashboards

---

# 19. Final Rules for Agents

1. Do not invent undocumented endpoints.
2. Do not invent undocumented public fields.
3. Do not collapse event stream types into an untyped blob.
4. Do not move auth to frontend only.
5. Do not mutate built-in profile versions in place.
6. Do not skip audit logs.
7. Do not improvise planner scoring.
8. Do not improvise analytics formulas.

