# Track 0 Persistence Addendum

This document adds the missing persistence obligations required to implement the Harness Validation Layer cleanly in Track 0.

It is an addendum to:

- `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`
- `BB_Buddy_Harness_Validation_Layer_Spec_v1.0.md`

## Purpose

The current control-plane contract defines the base persistence schema for runs, streams, planner, alerts, and audit.

The validation layer introduces additional durable objects that need explicit storage.

## New Required Table Families

### 1. validation_runs

Purpose:

- track each validation run as a first-class record

Suggested columns:

- `validation_run_id UUID PK`
- `family TEXT NOT NULL`
- `suite TEXT NOT NULL`
- `build_sha TEXT NOT NULL`
- `scenario_id TEXT NULL`
- `replay_manifest_id UUID NULL`
- `trace_id UUID NOT NULL`
- `started_at TIMESTAMPTZ NOT NULL`
- `completed_at TIMESTAMPTZ NULL`
- `status TEXT NOT NULL`

### 2. confidence_reports

Purpose:

- persist the confidence report generated for each validation run

Suggested columns:

- `confidence_report_id UUID PK`
- `validation_run_id UUID NOT NULL REFERENCES validation_runs(validation_run_id)`
- `structural_confidence NUMERIC(5,4) NOT NULL`
- `evaluator_confidence NUMERIC(5,4) NOT NULL`
- `analytics_confidence NUMERIC(5,4) NOT NULL`
- `planner_confidence NUMERIC(5,4) NOT NULL`
- `overall_confidence NUMERIC(5,4) NOT NULL`
- `gating_status TEXT NOT NULL`
- `rationale JSONB NOT NULL`
- `generated_at TIMESTAMPTZ NOT NULL`

### 3. golden_cases

Purpose:

- store frozen known-good validation cases

Suggested columns:

- `golden_case_id UUID PK`
- `domain TEXT NOT NULL`
- `prompt_or_input TEXT NOT NULL`
- `expected_result TEXT NOT NULL`
- `expected_metrics JSONB NOT NULL`
- `tolerance JSONB NOT NULL`
- `source_of_truth TEXT NOT NULL`
- `version TEXT NOT NULL`

### 4. differential_comparisons

Purpose:

- persist replay/diff comparison outcomes

Suggested columns:

- `comparison_id UUID PK`
- `baseline_build_sha TEXT NOT NULL`
- `candidate_build_sha TEXT NOT NULL`
- `replay_manifest_id UUID NOT NULL`
- `compared_dimensions JSONB NOT NULL`
- `observed_deltas JSONB NOT NULL`
- `drift_classification TEXT NOT NULL`
- `notes JSONB NOT NULL`

### 5. adversarial_cases

Purpose:

- persist known adversarial validation cases

Suggested columns:

- `adversarial_case_id UUID PK`
- `attack_family TEXT NOT NULL`
- `injection_point TEXT NOT NULL`
- `fixture_ref TEXT NOT NULL`
- `expected_safe_behavior TEXT NOT NULL`
- `severity TEXT NOT NULL`

### 6. validation_artifacts

Purpose:

- index generated validation artifacts and reports

Suggested columns:

- `artifact_id UUID PK`
- `validation_run_id UUID NOT NULL REFERENCES validation_runs(validation_run_id)`
- `artifact_type TEXT NOT NULL`
- `storage_ref TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

## Stream Ordering Addendum

To support replay-grade ordering and deterministic inspection:

### run_logs

Add:

- `sequence_no BIGINT NOT NULL`

Recommended unique constraint:

- `(run_id, sequence_no)`

### run_tool_calls

Add:

- `sequence_no BIGINT NOT NULL`

Recommended unique constraint:

- `(run_id, sequence_no)`

### run_transcripts

Add recommended unique constraint:

- `(run_id, session_id, sequence_no)`

### validation stream records

If validation runs are streamed independently, they should follow the same per-stream ordering pattern as Track 0 streams.

## Visibility Addendum

The validation layer requires the control plane to expose:

- validation run state
- confidence report summary
- latest gating status
- latest drift report
- latest adversarial failures

Implementation may expose these through:

- dedicated endpoints
- extension of existing trend/failure surfaces

but they must be durably backed by the tables above.

## Retention Addendum

Add retention guidance for validation data:

- `validation_runs`: 1 year minimum
- `confidence_reports`: 1 year minimum
- `differential_comparisons`: retain while relevant baseline/candidate comparisons matter
- `golden_cases`: versioned and retained until explicitly superseded
- `validation_artifacts`: retain per storage policy, but DB index rows should persist while referenced

## Design Rules

1. Validation-layer persistence is mandatory, not optional.
2. Confidence reports must be durable.
3. Replay and drift artifacts must be linkable to validation runs.
4. Stream ordering must be persisted strongly enough for diagnosis and replay.
5. Validation data belongs in the same Track 0 control-plane domain, not a second DB product.
