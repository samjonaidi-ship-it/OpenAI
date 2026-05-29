# Workflow And Approval Model

This document defines how CalExp5 / BB Buddy should govern write-back actions, approvals, idempotency, outbox delivery, retries, and compensation.

It is a companion to:

- `TRACK_A_DB_ALIGNMENT.md`
- `DB_ARCHITECTURE.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`
- `ENTITY_LIFECYCLE_MODEL.md`
- `COMMUNICATIONS_AND_ACTION_MODEL.md`

## Purpose

Track A requires governed crew-only write workflows.

That means the system must support:

- action requests
- approval tiers
- idempotent execution
- outbox delivery
- retries
- compensation
- auditability

This is not just a generic event log.
It is a first-class operational subsystem.

## Core Principle

Never let assistant-driven write-back go directly from intent to side effect.

Use a governed workflow pipeline:

1. request
2. validate
3. approve if needed
4. execute
5. confirm outcome
6. retry or compensate if needed
7. audit everything

## Primary Use Cases

Examples:

- create or update CalExp5 scheduling record
- record crew operational action
- write back governed notes or logs
- trigger approved business workflow
- queue a financial or operational follow-up action

## Core Objects

### 1. Workflow Request

A workflow request is the durable record of intended action.

Examples:

- update crew assignment
- log field note
- generate and deliver report
- create operational task

Recommended fields:

- `workflow_request_id`
- `request_type`
- `request_scope_entity_id`
- `requested_by_user_id`
- `requested_by_entity_id`
- `requested_at`
- `request_payload`
- `idempotency_key`
- `risk_level`
- `approval_policy`
- `status`

### 2. Approval Record

Some requests need explicit review before execution.

Examples:

- lead approval
- admin approval
- dual approval for sensitive action

Recommended fields:

- `workflow_approval_id`
- `workflow_request_id`
- `approval_tier`
- `required_role`
- `status`
- `decided_by_user_id`
- `decided_at`
- `decision_reason`

### 3. Execution Record

Execution should be recorded separately from the request.

Why:

- one request may retry multiple times
- one request may partially succeed
- one request may need compensation

Recommended fields:

- `workflow_execution_id`
- `workflow_request_id`
- `attempt_no`
- `execution_target`
- `started_at`
- `completed_at`
- `status`
- `response_payload`
- `error_code`
- `error_message`

### 4. Outbox Message

External side effects should be emitted through an outbox pattern.

Examples:

- call Bridge endpoint
- send downstream message
- create remote write-back action

Recommended fields:

- `outbox_message_id`
- `workflow_execution_id`
- `message_type`
- `destination`
- `payload`
- `status`
- `scheduled_at`
- `sent_at`
- `last_attempt_at`
- `attempt_count`

### 5. Compensation Action

Some workflows need an explicit corrective path if execution partially succeeds or fails downstream.

Examples:

- revert local state marker
- queue reversal action
- create operator review task
- trigger manual remediation workflow

Recommended fields:

- `compensation_action_id`
- `workflow_request_id`
- `workflow_execution_id`
- `compensation_type`
- `status`
- `scheduled_at`
- `completed_at`
- `reason`

## Lifecycle

Workflow requests need explicit lifecycle states.

Suggested request states:

- `draft`
- `pending_validation`
- `pending_approval`
- `approved`
- `rejected`
- `queued`
- `executing`
- `completed`
- `failed`
- `compensating`
- `compensated`
- `cancelled`
- `archived`

Suggested approval states:

- `not_required`
- `pending`
- `approved`
- `rejected`
- `expired`

Suggested execution states:

- `queued`
- `running`
- `succeeded`
- `failed`
- `partial`
- `timed_out`

## Idempotency

Idempotency is mandatory for assistant-driven write workflows.

Use rules such as:

- each externally meaningful request must carry an `idempotency_key`
- duplicate same-scope same-intent requests should resolve to the same durable request when appropriate
- execution retries must not create duplicate side effects

Store at minimum:

- `idempotency_key`
- `request_fingerprint`
- `first_seen_at`
- `last_seen_at`
- `resolved_workflow_request_id`

## Approval Tiers

Approval should be policy-driven, not improvised per tool.

Examples:

- low-risk internal action: auto-approved
- lead-tier action: lead approval required
- sensitive operational action: admin approval required

Approval policy should be driven by:

- action type
- affected scope
- role of requesting user
- risk level
- data sensitivity

## Outbox Pattern

Do not mix DB transaction success with downstream side-effect success.

Recommended pattern:

1. store workflow request and state transition locally
2. write outbox message in same transaction
3. async worker processes outbox
4. record downstream outcome
5. retry or compensate if needed

This is the safest way to integrate with Bridge and CalExp5 action endpoints.

## Retry Policy

Retries should be explicit and bounded.

Track:

- attempt count
- retryable/non-retryable classification
- backoff policy
- terminal failure state

Example retry classes:

- transient network failure
- upstream unavailable
- timeout

Non-retryable examples:

- invalid input
- approval denied
- forbidden action

## Compensation Policy

Not all failures should auto-retry forever.

Use compensation when:

- downstream side effect partially succeeded
- local state and remote state diverged
- workflow must be safely unwound or flagged

Compensation may be:

- automatic
- queued for human review
- mixed, depending on risk

## Audit Requirements

Every workflow mutation should be auditable.

Audit should capture:

- who requested action
- what policy allowed or blocked it
- who approved or rejected it
- what execution happened
- what side effects were emitted
- whether retries or compensation occurred

## Relationship To Other Models

### With `ACCESS_AND_ENTITLEMENT_MODEL.md`

- access determines who may request or approve
- product capability determines which workflow actions are exposed
- visibility policy may affect approval sensitivity

### With `ENTITY_LIFECYCLE_MODEL.md`

- workflow request is a stateful entity or equivalent lifecycle-bearing record
- approvals and executions have lifecycle
- compensation is a lifecycle branch, not an afterthought

### With `COMMUNICATIONS_AND_ACTION_MODEL.md`

- a communication may create a workflow request
- approvals may generate communications
- execution outcomes may generate reminders or notifications

### With `TRACK_A_DB_ALIGNMENT.md`

- Track A must prioritize governed crew-only workflows first
- customer-facing workflow surfaces remain deferred

## Recommended Initial Table Families

The platform should support at least:

- `workflow_requests`
- `workflow_approvals`
- `workflow_executions`
- `idempotency_keys`
- `outbox_messages`
- `workflow_failures`
- `compensation_actions`
- `workflow_audit_events`

Likely supporting fields:

- `status`
- `risk_level`
- `approval_policy`
- `request_payload`
- `response_payload`
- `attempt_no`
- `idempotency_key`
- `request_fingerprint`
- `retryable`
- `error_code`

## Design Rules

1. No assistant-driven write-back should bypass the workflow layer.
2. Requests, approvals, executions, and compensation must be separate records.
3. Idempotency must be explicit and durable.
4. Use outbox for downstream side effects.
5. Retry only where policy says retry is safe.
6. Compensation must be modeled for partial-failure paths.
7. Audit every mutation and decision.
8. Track A should implement this for crew-only governed actions first.

## Next Design Step

The next practical step is to define:

- canonical workflow request types
- approval tier matrix for admin / lead / crew
- idempotency-key rules by action type
- outbox destinations
- retry and compensation policies
