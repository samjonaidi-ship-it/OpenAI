# CalExp5 Control Tower Architecture

## Bottom line
CalExp5 should not get a single giant admin page. It now spans multiple operational domains that need to be separated into coherent control surfaces.

## Current app domains already present
From the codebase, CalExp5 already contains:
- authentication and onboarding
- employee/people management
- feature-driven UI access
- timesheet/calendar operations
- PTO and manager reporting
- receipt capture/history/vault
- tool crib and audit workflows
- jobsites and visual audit
- GPS review/admin
- push registration / device behavior
- subscriptions, tickets, storybook, estimates
- local cache / offline queue / sync behavior

This is already a platform-style app, not a single-purpose calendar.

## Recommended partition

### 1. Control Tower
Purpose: operator overview across the whole app.

Panels:
- current Bridge readiness
- current web/worker mode
- last sync and stale data warnings
- active users / recent sessions
- push health
- offline queue health
- feature rollout status
- open data/sync issues

This is the executive/operator dashboard, not the place for deep editing.

### 2. People And Access
Purpose: manage identities, crew auth, onboarding, permissions, and remote support.

Capabilities:
- employee list
- principal / qbt mapping
- role assignment
- feature overrides
- force onboarding reset
- revoke sessions
- reset PIN / WebAuthn
- device ownership / last used

Bridge already exposes some of this through admin and auth endpoints. CalExp5 should consume it as a first-class admin surface.

### 3. Features And Releases
Purpose: control who sees what.

Capabilities:
- per-user feature matrix
- role defaults
- environment flags
- staged rollout groups
- hidden beta/admin tools

This should be distinct from People because permissions and rollout control become their own operational concern.

### 4. Time And Payroll Operations
Purpose: manage the timesheet/pay-period workflow.

Capabilities:
- pay-period state
- upload status
- timesheet exceptions
- locked/approved PTO visibility
- manager review tools
- reconciliation with QBT

### 5. Receipt And Finance Operations
Purpose: manage receipt ingestion and financial workflow.

Capabilities:
- receipt queue health
- receipt vault review
- alias tables
- drive sync/back-annotation status
- failed uploads / retries
- publish/external receipt operations

### 6. Tool And Asset Operations
Purpose: tool catalog, assignment, audit, enrichment, and media.

Capabilities:
- tool dashboard
- enrichment jobs
- audit sessions
- media/order/thumbnail ops
- sync state and offline queue

### 7. GPS And Field Operations
Purpose: manage device/location workflow.

Capabilities:
- review queue
- route reconstruction health
- admin pipeline controls
- device assignment and last contact
- map/cache health

### 8. Settings And Device Experience
Purpose: app-level behavior and remote control.

Capabilities:
- global settings
- receipt cache TTL
- upload behavior
- log level / diagnostics
- push preferences defaults
- kiosk/shared-device constraints

### 9. Support And Audit
Purpose: give operators an audit trail and recovery tools.

Capabilities:
- audit logs
- crash/error events
- user action history
- export / diagnostics bundles
- clear guidance for remote support

## Why this partition is correct
If all of these end up inside one generic settings/admin panel:
- permissions become hard to reason about
- support actions mix with product config
- operational jobs mix with user profile edits
- the UI becomes fragile and slow to navigate

This needs a control-plane architecture, not another drawer.

## Recommended route / nav model
Top-level admin shells:
- Control Tower
- People & Access
- Features
- Time Ops
- Receipt Ops
- Tool Ops
- GPS Ops
- Settings
- Audit

## Backend alignment needed
CalExp5 should rely on Bridge for authoritative admin/state where possible:
- users / roles / features
- onboarding resets
- session revocation
- receipt admin ops
- tool admin ops
- gps admin ops
- push/admin status
- bridge/operator visibility

CalExp5 should keep local-only control for UX/device concerns:
- local cache state
- PWA/device capability state
- transient modal/UI preferences
- local offline queue visibility

## What to build first
1. Control Tower shell
2. People & Access
3. Features matrix
4. Receipt Ops and Tool Ops as first operational subpanels
5. GPS Ops
6. Settings / device controls

## Immediate implication
CalExp5 is now big enough that its admin/control experience should be treated as a separate product surface.
