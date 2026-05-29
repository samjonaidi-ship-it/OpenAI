# BB Buddy Harness Control Console UI Specification (v1.1 — Final / Agent-Executable)

## Document Info
- **Status:** FINAL FOR BUILD
- **Audience:** AI agents, frontend engineers, backend engineers, reviewers
- **Scope:** UI only
- **Parent Docs:** `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md`, `BB_Buddy_Test_Harness_Control_and_Autonomy_Spec_v3.1.md`
- **Rule:** This spec overrides any ambiguous UI prose elsewhere.

---

# 0. UI Precedence & Data Binding Rules

## 0.1 Precedence
If UI prose conflicts with API/data contracts, the API/data contracts win.

## 0.2 Binding Rule
Every page, widget, chart, modal, and action in this document MUST bind only to documented endpoints, payloads, and stream types from the control-plane contracts document.

## 0.3 No Hidden Business Logic
The frontend MAY NOT independently decide:
- authorization eligibility
- state transitions
- capacity classifications
- planner approval eligibility
- analytics formulas

Those decisions MUST come from backend contracts.

---

# 1. Design Goals

The console must do four things well:

1. Compose runs
2. Observe runs live
3. Investigate failures
4. Operate autonomous testing safely

This UI is desktop-first and operator-only.

---

# 2. Supported Platforms

## 2.1 Viewports
- Primary: 1440×900 and above
- Minimum supported: 1280×800
- Reduced-density mode: 1024×768
- Mobile: out of scope
- Tablet touch optimization: out of scope

## 2.2 Browsers
- Chrome latest
- Edge latest
- Firefox latest

Safari desktop optional for v1.

---

# 3. Global App Shell

## 3.1 Three-Column Layout

- Top Bar: 64 px fixed
- Left Nav: 240 px fixed
- Main Workspace: fluid, min 760 px
- Right Rail: 320 px fixed

## 3.2 Shell Rule
The Right Rail is global and persists across all pages. It reflects the current selected context, not just page-local state.

## 3.3 Spacing System
- base = 8 px
- standard card padding = 16 px
- section gap = 24 px
- control gap = 12 px
- dense row = 36 px
- standard row = 44 px

---

# 4. Top Bar

## 4.1 Left
- product title
- environment badge
- control mode badge

## 4.2 Center
- global search / command palette entry

## 4.3 Right
- current user
- role badge
- notifications bell
- connection indicator
- settings button

## 4.4 Connection Indicator States
- connected
- degraded
- disconnected

Tooltip must show:
- websocket status
- last event timestamp
- fallback polling status

---

# 5. Navigation

## 5.1 Left Nav Order
1. Launch
2. Live Run
3. Failures
4. Capacity
5. Trends
6. Planner
7. Profiles
8. Admin

## 5.2 Visibility
- Admin page visible only to admin
- Planner page hidden for crew and observe-only users
- Live Run always visible

---

# 6. Permissions and UI Gating

## 6.1 Roles
- admin
- lead
- crew
- observer_service
- planner_service

## 6.2 Visibility Matrix

| Area | admin | lead | crew | observer_service | planner_service |
|---|---|---|---|---|---|
| Launch view | yes | yes | no | no UI | no UI |
| Launch run button | yes | yes | no | no | no |
| Launch via Agent | yes | yes | no | no | no |
| Planner controls | yes | yes | no | no | no |
| Admin page | yes | no | no | no | no |
| Failures page | yes | yes | yes (read-only restricted) | no UI | no UI |

## 6.3 UI Rule
Hidden controls must also be backend-enforced. UI hiding is not security.

---

# 7. Page 1 — Launch

## 7.1 Sections
1. Run Identity
2. Scenario & Suites
3. Pressure Profiles
4. Persona Matrix
5. Goal Contract & Stop Conditions
6. Review & Launch

## 7.2 Run Identity Controls
- Run Name
- Environment
- Seed Mode
- Seed Value
- Execution Mode

### Field Behaviors
- Environment default = nonprod
- staging visible only to admin
- Seed Value visible only when Seed Mode = fixed
- Execution Mode options:
  - deterministic
  - scale
  - ai_eval

## 7.3 Scenario & Suites
- Scenario dropdown
- Scenario version label
- Scenario description panel
- Clone scenario button
- View scenario details button

### Suites (exact order)
- node_tests
- rag_accuracy
- voice_sessions
- workflow_engine
- browser_tests
- scale_k6
- cross_project

### Validation Hints
- capacity goal requires scale_k6
- regression goal requires baseline
- invalid combinations show inline validation error from backend

## 7.4 Pressure Profiles
Left side: preset cards XS / S / M / L / XL / MAX  
Right side: exact numeric detail panel from profile payload

### Profile detail fields
- concurrency
- session_count
- data_volume_multiplier
- rag_corpus_size
- write_density
- duration_minutes

### Warnings
- yellow warning at projected budget >70%
- red block at >90% or backend hard block

### MAX Confirm Modal
Typed confirm required:
`RUN MAX IN NONPROD`

## 7.5 Persona Matrix
Table columns (exact order):
- enabled
- role
- persona
- size
- weight
- traits summary
- customized flag
- edit
- delete

Footer:
- weight total
- validation status

### Add/Edit Persona Drawer Fields
- role
- persona
- size
- weight
- interruption_rate
- ambiguity_rate
- escalation_rate
- patience_seconds
- completion_rate
- contradiction_rate

### Persona Preset Buttons
- Standard Mix
- Customer Stress
- Supplier Friction
- Admin Overload
- Passive Crew
- Full Breakpoint Mix

## 7.6 Goal Contract & Stop Conditions
Goal controls:
- goal type
- success metric
- priority weights
- run strategy

Stop conditions:
- max cost
- max duration
- max iterations
- stop on first hard blocker
- failure confirmations required
- no-improvement threshold

## 7.7 Review & Launch
Summary card must show:
- environment
- scenario
- suites
- pressure preset
- persona mix summary
- goal type
- projected budget
- control mode
- reproducibility status

Buttons:
- Save Draft
- Validate
- Launch
- Launch via Agent
- Clone Existing

## 7.8 Launch Flow
- Validate calls backend validation endpoint
- Launch disabled until validation success
- Launch via Agent opens confirmation modal and then creates planner task

---

# 8. Page 2 — Live Run

## 8.1 Top Strip
Required fields:
- run id
- run name
- state badge
- environment
- elapsed time
- current stage
- progress %
- pause / resume / abort
- clone run
- export manifest

## 8.2 Main Layout
Left 65%:
- Stage Pipeline
- Event Timeline

Right 35%:
tab set:
1. Logs
2. Transcripts
3. Tool Calls
4. Metrics

## 8.3 Stage Pipeline
Stages in exact order:
- validation
- seeding
- suites
- evaluation
- aggregation
- completion

Stage card fields:
- stage_name
- state
- started_at
- completed_at
- duration_ms
- pass_count
- warn_count
- fail_count
- active_subtask

## 8.4 Event Timeline
Columns:
- time
- event type
- suite/stage
- summary
- severity
- trace link

Filters:
- all
- failures only
- warnings only
- tool calls
- planner actions
- budget events

## 8.5 Right Tabs

### Logs
Columns:
- timestamp
- severity
- message
- trace id

### Transcripts
Columns:
- timestamp
- speaker
- content_type
- content
- tool_name
- trace id

### Tool Calls
Columns:
- timestamp
- tool_name
- request_id
- status
- latency_ms
- cost_cents
- fallback_used
- trace id

### Metrics
Required charts:
- latency over time (ms)
- cost burn over time (cents)
- active sessions over time (count)
- errors by type (count)

---

# 9. Page 3 — Failures

## 9.1 Layout
Three panes:
- group list
- detail
- repro/actions panel

## 9.2 Group List Columns
- failure_class
- title
- count
- latest_seen
- affected_suites
- severity

## 9.3 Detail Panel Fields
- title
- description
- first_seen
- latest_seen
- repro_count
- likely_root_cause_domain
- impacted_personas
- impacted_pressure_profiles
- environment
- associated_commit_shas
- replay_manifest_id

## 9.4 Actions
- Replay Failure
- Clone as Debug Run
- Open Trace
- Export Repro Manifest
- Mark Noise
- Confirm Flaky

---

# 10. Page 4 — Capacity

## 10.1 Summary Cards
- last_safe_preset
- first_degraded_preset
- first_hard_fail_preset
- likely_bottleneck
- highest_risk_persona_mix

## 10.2 Required Charts

### Chart A
Preset vs pass rate  
- x-axis: preset ordered XS,S,M,L,XL,MAX
- y-axis: pass rate 0.0 to 1.0
- threshold line at 0.95

### Chart B
Preset vs p95 latency  
- y-axis in ms

### Chart C
Preset vs cost  
- y-axis in cents

### Chart D
Preset vs queue depth  
- y-axis in count

### Chart Rules
- hover must show underlying run ids
- clicking point filters related runs
- null values render as gaps, not zero

---

# 11. Page 5 — Trends

## 11.1 Required Widgets
- pass rate trend
- cost drift trend
- p95 latency trend
- flake rate trend
- RAG faithfulness trend
- planner efficiency trend

## 11.2 Default Time Window
- 28 days

## 11.3 Filters
- date range
- environment
- branch
- scenario
- suite
- persona preset

## 11.4 Missing Data Rule
Missing buckets render as null gaps, not zeros.

---

# 12. Page 6 — Planner

## 12.1 Top Summary
- planner state
- active goal
- iterations used
- remaining budget
- confidence
- control mode

## 12.2 Required Sections
- Current Hypothesis
- Next Mutation
- Explored Space Map
- Planner Action Log

## 12.3 Controls
- Pause Planner
- Resume Planner
- Approve Next Mutation
- Reject Next Mutation
- Force Stop
- Tighten Envelope
- Export Planner State

## 12.4 Visibility Rules
- Approve/Reject visible only in recommend mode
- Force Stop visible to lead/admin
- Tighten Envelope human only
- no planner control for crew

---

# 13. Page 7 — Profiles

## 13.1 Tabs
- Pressure Profiles
- Persona Presets
- Goal Contracts
- Run Templates

## 13.2 Required Table Columns
- name
- version
- owner
- built_in
- mutable
- updated_at
- clone
- use_in_run

## 13.3 Rules
- built-ins cannot be edited directly
- updates create new version
- archived versions hidden by default but filterable

---

# 14. Page 8 — Admin

## 14.1 Sections
- budgets
- environments
- role assignments
- control mode policy
- websocket health
- audit logs

## 14.2 Controls
- adjust budgets
- restrict environments
- enable/disable autonomy modes
- update roles
- archive runs
- revoke planner tasks

---

# 15. Right Rail

Panels in order:
1. Current Context
2. Budget Status
3. Live Alerts
4. Planner Status
5. Quick Actions

## 15.1 Current Context
- selected run id
- current stage
- selected failure id
- selected trace id

## 15.2 Budget Status
- used cost
- max cost
- burn rate
- warn % threshold
- hard cap status

## 15.3 Live Alerts
Last 5 alerts:
- budget_warning
- breakpoint_found
- policy_fail
- stream_disconnected
- planner_stopped

## 15.4 Quick Actions
- Clone Current Run
- Export Current View
- Open Latest Trace
- Jump to Failure Group

---

# 16. Modals and Drawers

## Required Modals
- MAX confirmation
- destructive action confirmation
- planner mutation approval
- abort confirm
- clone run
- export manifest
- validation errors

## Required Drawers
- persona editor
- scenario details
- trace mini-inspector

---

# 17. Component State Rules

Every component must support:
- loading
- empty
- ready
- partial
- error

## 17.1 Loading
- tables/charts use skeletons
- buttons may show spinner

## 17.2 Empty
- must show action-oriented next step

## 17.3 Partial
- must show stale-data banner and last update time

## 17.4 Error
- component-level retry required

---

# 18. Streaming and Refresh

## 18.1 Live Data
- websocket primary
- polling fallback

## 18.2 Refresh Intervals
- Live Run fallback: 10s
- Trends: 60s
- Capacity: 60s
- Admin health: 30s

## 18.3 Ordering Rule
Per-stream ordering follows backend sequence guarantees.

---

# 19. Chart Defaults and Rules

## 19.1 Common
- every chart must have legend
- tooltip shows exact value + units
- export PNG and CSV required
- legend order follows documented series order

## 19.2 Units
- pass rate: decimal 0–1 in data, percent in UI labels
- latency: ms
- cost: cents in data, dollars may be display-formatted
- queue depth: count
- planner efficiency: decimal 0–1

## 19.3 Threshold Lines
- pass-rate chart threshold = 0.95
- budget burn threshold = 0.70 warn, 0.90 danger

## 19.4 High-Volume Downsampling
When points > 500:
- use backend-provided sampled series
- frontend must not invent sampling logic

---

# 20. Interaction Flows

## 20.1 Failure Replay
- user selects failure
- clicks Replay Failure
- modal shows frozen config
- confirm
- draft run created
- redirect to Launch with locked replay fields

## 20.2 Planner Recommend
- planner proposes mutation
- diff displayed
- user approves/rejects
- action logged
- planner state refreshes

## 20.3 Abort Run
- confirm modal
- on success top strip updates and right rail alert appears

---

# 21. Component Inventory (Frozen)

- AppShell
- TopBar
- LeftNav
- RightRail
- PageHeader
- RunSummaryStrip
- StagePipeline
- EventTimeline
- StructuredLogViewer
- TranscriptViewer
- ToolCallTable
- MetricsPanel
- FailureGroupList
- FailureDetailPanel
- ReproActionsPanel
- PressurePresetSelector
- PersonaMatrixTable
- GoalContractEditor
- StopConditionsEditor
- PlannerHypothesisCard
- PlannerDiffCard
- ExploredSpaceTable
- ProfilesTable
- AdminSettingsPanel

Agents may compose subcomponents internally but must expose these user-facing surfaces.

---

# 22. Accessibility

Required:
- keyboard navigable
- visible focus states
- charts have accessible table alternative
- color not sole severity indicator
- explicit labels
- WCAG AA text contrast

---

# 23. Acceptance Criteria (UI)

The UI is DONE only when:
1. layout works at 1280 px and 1440 px
2. Launch page produces validated runs with no hidden state
3. Live Run updates in real time with ordered data
4. role and control-mode gating are visible and enforced
5. Failure replay produces locked reproducible draft
6. Capacity page shows required summary cards and charts
7. every page handles loading/empty/partial/error states
8. charts use documented units, thresholds, and missing-data behavior
9. every component binds only to documented contracts
10. destructive actions require confirmation

---

# 24. Explicit Non-Goals

Not part of v1:
- mobile operator UI
- drag-and-drop dashboards
- arbitrary custom charts
- theming system
- customer-facing views

