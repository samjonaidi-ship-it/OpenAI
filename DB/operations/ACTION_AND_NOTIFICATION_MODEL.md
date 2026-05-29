# Action And Notification Model

This document consolidates action items, alerts, reminders, notifications, and outbound deliveries into one canonical model.

It is a companion to:

- `COMMUNICATIONS_AND_ACTION_MODEL.md`
- `OBSERVATIONS_AND_TELEMETRY_MODEL.md`
- `MASTER_DATA_MANAGEMENT.md`
- `WORKFLOW_AND_APPROVAL_MODEL.md`

## Purpose

Several architecture docs refer to:

- action items
- reminders
- alert candidates
- notifications
- outbound deliveries

These should not remain fragmented concepts.

## Core Principle

Use one action pipeline:

1. signal
2. candidate
3. action item or reminder
4. notification
5. delivery outcome

## Canonical Objects

### Signal

Raw or derived precursor.

Examples:

- warranty expiry approaching
- invoice aging threshold crossed
- communication commitment overdue
- weather delay risk

### Candidate

A normalized, reviewable suggestion for action.

Examples:

- `alert_candidate`
- `reminder_candidate`

### Action Item

Internal or operational work item.

Examples:

- review supplier insurance
- follow up on missing bid
- investigate device health issue

### Reminder

Time-oriented follow-up to a stakeholder or internal operator.

Examples:

- customer payment reminder
- subcontractor bid reminder
- crew follow-up reminder

### Notification

Concrete outbound or in-app message.

Examples:

- email sent
- SMS sent
- push notification delivered
- portal notice created

## Recommended Core Tables

- `signals`
- `action_candidates`
- `action_items`
- `reminders`
- `notifications`
- `notification_deliveries`

## Why This Consolidation Matters

It reduces duplication across:

- MDM monitoring
- telemetry-derived alerts
- communication-derived tasks
- workflow outcomes

## Source Domains

Signals may come from:

- communications
- telemetry
- financial aging
- lifecycle rules
- MDM change tracking
- workflow failures

## Visibility

Actions and notifications must respect:

- stakeholder scope
- sensitivity classification
- delivery policy
- approval policy where needed

## Track A Activation

Track A should activate:

- internal/crew action items
- internal/crew reminders
- selected external reminders that support crew operations

Customer-facing notification productization remains deferred.

## Design Rules

1. Separate precursor signals from human-usable action records.
2. Separate action records from outbound notifications.
3. Record delivery outcomes explicitly.
4. Let multiple source domains feed one action pipeline.
5. Use this model to replace duplicated alert/reminder language across docs.

## Next Design Step

The next practical step is to define:

- canonical signal categories
- action/reminder state machine
- notification channel matrix
- deduplication rules between source domains
