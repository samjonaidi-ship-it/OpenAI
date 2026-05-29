# Observations And Telemetry Model

This document defines how CalExp5 should ingest, store, summarize, and operationalize continuous and external event data.

It is a companion to:

- `DB_ARCHITECTURE.md`
- `MASTER_DATA_MANAGEMENT.md`
- `ENTITY_LIFECYCLE_MODEL.md`
- `ACCESS_AND_ENTITLEMENT_MODEL.md`

## Purpose

The platform needs to incorporate signals that do not fit cleanly into a simple business event ledger.

Examples:

- weather traces
- crew GPS traces
- device telemetry
- route and travel signals
- public-record refreshes
- market and environmental conditions
- other external discrete events

These signals matter because agents will later use them to:

- explain what happened
- identify risk
- generate proactive alerts
- optimize scheduling and dispatch
- produce longitudinal stakeholder intelligence

## Core Principle

Not all “events” should be stored the same way.

The platform should distinguish between:

1. business events
2. external observations
3. continuous telemetry streams
4. derived signals and alerts

If these are collapsed into one table, the system will become noisy, slow, and semantically unclear.

## Four Data Classes

### 1. Business Events

These are meaningful operational facts in the platform timeline.

Examples:

- service call created
- estimate issued
- provider assigned
- invoice paid
- warranty expired
- crew assignment changed

These belong in the canonical event ledger.

Recommended tables:

- `events`
- `event_entities`

## 2. External Observations

These are point-in-time observations from external or system-generated sources.

Examples:

- weather snapshot at a property
- daily air quality index
- public-record change detected
- property risk score refresh
- traffic severity near a jobsite

These should not normally be modeled as business events unless they trigger operational impact.

Recommended tables:

- `observations`
- `observation_entities`

Typical observation fields:

- `observation_type`
- `source_system`
- `observed_at`
- `location_ref`
- `value_payload`
- `confidence`
- `quality_status`

## 3. Continuous Telemetry Streams

These are high-volume append-only traces.

Examples:

- crew GPS pings
- vehicle location traces
- weather traces
- equipment sensor readings
- mobile device telemetry

These should be stored in dedicated time-series or append-only telemetry tables, not in the main event ledger.

Recommended table families:

- `gps_traces`
- `weather_traces`
- `sensor_readings`
- `device_health_traces`

Typical telemetry fields:

- `stream_id`
- `source_entity_id`
- `related_entity_id`
- `recorded_at`
- `sequence_no`
- `lat`
- `lng`
- typed metric columns where possible
- `raw_payload`

## 4. Derived Signals And Alerts

These are higher-level conclusions produced from observations, telemetry, or business events.

Examples:

- crew arrived late to jobsite
- storm risk elevated for property
- irrigation issue likely
- technician route drift detected
- HVAC filter replacement overdue
- dishwasher warranty about to expire

These should be durable and explainable.

Recommended tables:

- `derived_signals`
- `alert_candidates`
- `notifications`

Each derived signal should retain provenance to the source data that created it.

## Why This Separation Matters

This architecture allows the platform to:

- preserve raw data without polluting the business timeline
- derive operationally meaningful facts when needed
- summarize high-volume data for efficient retrieval
- let agents reason over curated signals instead of only raw traces
- control retention and cost

## Core Use Cases

### Weather And Environmental Context

The system should support:

- weather traces by region or property
- severe weather alerts affecting properties and jobsites
- weather-aware service rescheduling
- long-term property risk inference based on environmental exposure

Example:

- hourly weather observations are stored by region
- affected properties are mapped to those regions
- a severe rain event generates a derived signal for gutter or roof service review
- an active jobsite may receive a `weather_delay_risk` signal

### Crew GPS And Work Validation

The system should support:

- continuous GPS traces for crew members during work shifts
- jobsite arrival/departure detection
- route reconstruction
- labor verification support
- safety/compliance investigations
- service proof and customer reassurance

Example:

- raw GPS trace shows a crew member moved from home base to property to supply house and back
- system derives:
  - estimated arrival time
  - actual arrival event
  - duration on site
  - route deviation if any

These derived facts may then contribute to:

- timesheet validation
- customer-visible service proof
- internal performance review
- dispute resolution

### Device Health And Trace Quality

The platform should explicitly track the health of devices that generate operational traces.

This is especially important when GPS traces are incomplete, inaccurate, or delayed due to:

- low battery
- weak signal
- poor GPS accuracy
- background app suspension
- disabled location permissions
- network loss
- device aging or instability

These conditions should not be treated as ordinary business events.
They belong in the telemetry and diagnostics layer.

Recommended raw device-health signals:

- battery percentage
- charging state
- GPS accuracy estimate
- signal quality
- network type
- app heartbeat
- location permission state
- background tracking enabled state
- OS power-saving mode

Recommended diagnostic outputs:

- `tracking_gap_detected`
- `gps_accuracy_degraded`
- `low_battery_tracking_risk`
- `device_offline_during_shift`
- `background_location_disabled`
- `arrival_proof_confidence_low`

These diagnostics should then influence higher-level operational reasoning such as:

- whether a shift trace is trustworthy
- whether jobsite arrival can be verified
- whether a disputed service visit lacks strong evidence
- whether a crew member or provider needs device remediation

Recommended attachment model:

- raw device-health traces attach to `device`
- device assignment links them to `crew_member` or `provider`
- derived diagnostics may also attach to `shift`, `jobsite`, or `service_engagement`

This keeps raw telemetry separate from operational conclusions while preserving explainability.

### Property Intelligence

The system should support external augmentation of properties with:

- weather exposure
- public-record changes
- parcel or permit changes
- insurance-relevant hazard context
- seasonal maintenance drivers

This becomes part of property 360 and agent reasoning.

### Marketplace Scheduling And Dispatch

The system should support service provider scheduling using external and continuous inputs such as:

- provider GPS position
- current route load
- local weather
- travel times
- service area conditions

This allows better:

- dispatch ranking
- ETA prediction
- rescheduling decisions
- customer communication

### Live Feeds, Media Evidence, And Security Monitoring

The platform may also ingest live or near-live feeds from installed devices such as:

- video cameras
- audio sensors
- tool-theft monitoring devices
- edge monitoring boxes
- other continuous field surveillance sources

These sources should be modeled as a layered evidence system.

Recommended layers:

1. device and stream state
2. continuous media streams
3. detections and anomalies
4. reviewed incidents and evidence packages

#### Device And Stream State

The system should track:

- device installation
- device assignment to property, jobsite, tool crib, or equipment zone
- online/offline status
- configuration profile
- firmware and health state
- retention policy
- access policy

These are durable operational records and should attach to first-class device entities.

#### Continuous Media Streams

Raw video and audio should not be stored in Neon/Postgres.

The database should store only:

- stream identifiers
- stream endpoints or storage references
- clip or segment references
- capture windows
- quality and health metadata
- retention class
- linkage to property, jobsite, equipment, or security zone

The actual media payload should live in object storage, NVR infrastructure, or another media-serving layer.

#### Detections And Anomalies

The system should support machine- or rule-generated detections such as:

- motion detected
- person detected after hours
- tool zone breach
- suspected tool removal
- vehicle detected on site
- unusual audio pattern
- tamper event

These are not automatically incidents.
They are intermediate, explainable signals.

Recommended records:

- `media_detections`
- `zone_breach_signals`
- `security_alert_candidates`

#### Reviewed Incidents And Evidence Packages

Only after thresholding, review, or escalation should the platform create a durable business/security incident such as:

- suspected theft incident
- trespass incident
- vandalism incident
- tamper investigation

Those incidents should then link to:

- related property or jobsite
- affected asset or tool
- responsible or responding stakeholders
- supporting clips, snapshots, and audio excerpts
- follow-up tasks, claims, or reports

This keeps the system from collapsing noisy detections into the main event ledger prematurely.

## Attachment Model

External observations and telemetry should attach to the graph through stable anchors.

Common anchors:

- `property`
- `jobsite`
- `service_engagement`
- `crew_member`
- `provider`
- `vehicle`
- `equipment`
- `region`

Recommended pattern:

- raw weather trace may attach to a region or geospatial zone
- derived impact attaches to the affected property/jobsite/service engagement
- raw GPS trace attaches to crew member or vehicle
- derived arrival/departure facts attach to service engagement, shift, or jobsite

This avoids unnecessary duplication while preserving operational context.

## Storage Strategy

Do not use a single generic JSON table for all continuous data.

Recommended layered storage:

### Raw Layer

Stores high-frequency source data.

Examples:

- minute-by-minute GPS pings
- hourly weather feed observations
- sensor stream payloads

Traits:

- append-only
- short-to-medium retention
- partitioned by time when volume increases

### Summary Layer

Stores downsampled or aggregated views.

Examples:

- daily weather summary by region
- crew shift movement summary
- on-site duration summary
- property environmental risk snapshot

Traits:

- query-friendly
- medium-to-long retention
- often used by agents and dashboards

### Derived Layer

Stores explainable operational signals and alert candidates.

Examples:

- weather delay risk
- probable missed appointment
- overdue maintenance
- route anomaly

Traits:

- durable
- audit-friendly
- directly useful to workflows and agents

## Retention Strategy

Continuous data will grow quickly.

Retention should be intentional from the start.

Suggested policy shape:

- raw high-frequency telemetry: short retention
- summaries: medium or long retention
- derived alerts and business-impact events: long retention

Example:

- GPS pings: retain raw for 30-90 days
- daily route summaries: retain for multiple years
- dispute-relevant derived events: retain per legal/operational policy

Exact retention windows should be set by compliance and business need.

## Query Model For Agents

Agents should not usually start from raw telemetry.

They should query in this order:

1. current derived signals
2. summaries
3. business events
4. raw traces only if needed for explanation or investigation

This keeps responses:

- fast
- explainable
- cost-controlled
- less error-prone

Example questions agents should answer:

- “Was the crew actually on site yesterday?”
- “Which properties are at elevated storm-related maintenance risk?”
- “Which service calls are likely delayed because of weather?”
- “Which providers are drifting off route?”

## Provenance And Explainability

Any derived signal used by agents or user-facing workflows should preserve provenance.

At minimum, derived records should track:

- source type
- source identifiers
- derivation time
- derivation method or policy
- confidence
- affected entities

This is required so the system can explain:

- why an alert fired
- which observations contributed
- whether the conclusion is strong or tentative

## Privacy And Access

Continuous streams often contain sensitive data.

Examples:

- employee GPS traces
- provider route history
- occupancy-related property signals

These should be governed by:

- access scope
- visibility classification
- retention policy
- purpose limitation

Examples:

- customer may see proof of service arrival window but not full crew movement history
- subcontractor may see their own service engagement context but not other providers' routes
- internal operations may see route summaries while HR or compliance may have access to deeper traces only when justified

This must align with `ACCESS_AND_ENTITLEMENT_MODEL.md`.

## MDM Alignment

External observations and telemetry are not usually master data themselves, but they do influence master and derived state.

Examples:

- weather and permit changes may enrich property intelligence
- GPS-derived visit proof may enrich service history
- repeated telemetry anomalies may influence provider quality score

The MDM layer should therefore track:

- source system
- source watermark where available
- ingestion watermark
- derivation freshness

This must align with `MASTER_DATA_MANAGEMENT.md`.

## Lifecycle Alignment

Continuous and external data also participate in lifecycle.

Examples:

- a provider goes active/inactive, changing whether GPS should be collected
- a service engagement opens/closes, changing whether arrival/departure signals matter
- a warranty approaches expiration, generating escalating alerts over time

The raw trace may be continuous, but derived operational meaning is lifecycle-dependent.

This must align with `ENTITY_LIFECYCLE_MODEL.md`.

## Recommended Initial Table Families

The exact schema may vary, but the platform should support at least:

- `observations`
- `observation_entities`
- `gps_traces`
- `weather_traces`
- `sensor_readings`
- `telemetry_streams`
- `daily_summaries`
- `derived_signals`
- `alert_candidates`

Likely supporting fields:

- `source_system`
- `source_record_id`
- `source_watermark`
- `recorded_at`
- `observed_at`
- `derived_at`
- `confidence`
- `quality_status`
- `retention_class`
- `visibility_classification`

## Architectural Rules

1. Do not store continuous telemetry in the core business event ledger.
2. Separate raw traces, summaries, and derived business signals.
3. Attach raw data to stable anchors and derived impacts to operational entities.
4. Emit business events only when an observation or trace has meaningful operational impact.
5. Preserve provenance for all derived agent-facing conclusions.
6. Use retention and summarization policies from the start.
7. Keep telemetry access tighter than general operational access when the data is sensitive.
8. Let agents consume curated summaries and derived signals first, not only raw streams.
9. Treat external continuous and discrete augmentation as a permanent part of the platform, not an afterthought.

## Next Design Step

The next practical step is to define:

- continuous data source inventory
- retention classes
- summary and derivation policies
- agent retrieval contracts for observational and telemetry data
