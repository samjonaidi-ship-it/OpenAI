# Universal Control Plane Model

**Date:** 2026-05-09
**Status:** Working target architecture
**Scope:** BBInc app universe: CalExp5, BB ControlTower, BB Micro Bridge, BB Scan, BB Buddy, Data Manager, GPS, supplier/client/architect portals, ingestion workers, artifact pipelines, and future BBInc apps.

## Purpose

BBInc needs one universal control plane for operational behavior across the app ecosystem.

This is broader than BB Scan and broader than CalExp5. Receipt image handling, watermarking, telemetry, feature rollout, portal access, GPS behavior, artifact retention, AI model selection, cost guardrails, and debug capture are all examples of the same foundation problem:

- settings are scattered
- flags are mixed with preferences
- some controls are local/browser-only
- some are Bridge-backed
- some are env-only
- some are hard-coded constants
- some are documented but not centrally exposed

The target is not one giant flag table. The target is one centrally discoverable control plane with typed control families, app-owned manifests, authoritative storage, audit history, and ControlTower management.

## Evidence Reviewed

This document is grounded in the current repository and architecture docs:

- `OpenAI\DB\_foundation\README_DB_ARCHITECTURE.md` says `OpenAI\DB` is the single consolidated architecture home for CalExp5, BB Buddy, Micro Bridge, BB Scan, GPS, Data Manager, and Control Tower.
- `OpenAI\DB\architecture\ECOSYSTEM_TARGET_ARCHITECTURE.md` defines the platform direction as Bridge-centered backend contracts, Neon as app-owned system of record, universal inbound intake, canonical domain tables, and settings centralization.
- `BB_ControlTower\docs\UNIFIED_TOGGLES_AND_TENANCY.md` already identifies fragmentation across local settings, beta flags, BB Scan settings, feature flags, and env-driven runtime mode.
- `BB_ControlTower\docs\UNIVERSAL_FEATURE_FLAGS.md` already designs app-scoped feature flags using `app_features` and `app_feature_overrides`.
- `BB_ControlTower\bff\lib\feature-resolver.js` implements scoped feature resolution with precedence `user > workspace > project > role > global > default` and a 60-second cache.
- `BB_ControlTower\bff\routes\features.js` exposes universal feature admin/read APIs for app-scoped flags.
- `BB_Micro_Bridge\src\routes\scan-policy-v1.js` exposes BB Scan telemetry policy and scan-specific feature flags with a 5-minute server cache.
- `BB_Micro_Bridge\migrations\041_bb_scan_telemetry_policy.sql` defines a fleet-wide telemetry policy table, not per-user.
- `BB_Micro_Bridge\migrations\042_bb_scan_feature_flags.sql` defines BB Scan-specific rollout flags.
- `CalExp5\src\store\slices\settingsSlice.js` currently stores user preferences, beta flags, and BB Scan tuning in one persisted Zustand settings blob.
- `CalExp5\server.js` saves that settings blob to Bridge `app_settings` as `calexp5/global`.
- `CalExp5\src\components\modals\ReceiptScanModal.jsx` and `CalExp5\src\components\shared\Camera.jsx` read those settings directly at runtime.

## Core Decision

BBInc should introduce a universal control plane with six distinct control families:

1. Runtime mode
2. Feature flags
3. Runtime configuration
4. Policies and guardrails
5. Secrets and boot configuration
6. User preferences

These families share one administrative experience in ControlTower, but they must not all live in the same table or use the same semantics.

### Alignment With Earlier Toggle Docs

This model refines the earlier three-layer framing in `BB_ControlTower\docs\UNIFIED_TOGGLES_AND_TENANCY.md`.

That earlier document correctly identified the root problem: runtime behavior, feature gates, developer knobs, mock data, and local preferences were conflated. Its wording treated several BB Scan controls as feature flags. This document is the more precise platform-wide model:

- feature flags are only capability gates and rollout controls
- telemetry switches and debug-bundle switches are policies
- scan thresholds, image sizes, JPEG quality, watermark layout, and model thresholds are runtime configuration
- API keys, CORS, database URLs, and OAuth secrets remain deployment/secret configuration
- personal UI display choices remain user preferences

Therefore, when older docs say a setting should "move to feature flags," interpret that as "move to the universal control plane," then classify it into the correct control family.

## Control Families

### 1. Runtime Mode

Runtime mode is deployment-level behavior.

Examples:

- `dev`
- `mock`
- `beta`
- `prod`

Runtime mode belongs in environment/deployment configuration, not in a user-editable browser setting.

It affects:

- logging level and sampling
- feature lifecycle floor
- test route registration
- mock adapters
- banner/status labels
- rate-limit multipliers
- replica/safety profile

Runtime mode should be visible in ControlTower, but changing it should remain an ops/deployment action.

### 2. Feature Flags

Feature flags are boolean capability gates and rollout controls.

Examples:

- `calexp5.receipts.scan.enabled`
- `calexp5.receipts.tap_extract`
- `calexp5.receipts.overlay_annotations`
- `calexp5.receipts.watermarking`
- `bb-scan.corner_rectify`
- `controltower.receipts.audit_view`
- `supplier.portal.invoice_upload`

Feature flags answer:

> Is this capability enabled for this actor, role, workspace, project, or app?

They should support:

- app id
- feature key
- lifecycle
- default value
- deploy-mode floor
- scope overrides
- expiration
- reason
- owner
- audit history

The current ControlTower universal feature resolver already establishes the right precedence model:

`user > workspace > project > role > global > default`

That precedence should become the platform standard.

### 3. Runtime Configuration

Runtime configuration is structured app behavior.

Examples:

- receipt canonical long edge: `2576`
- AI extraction long edge: `1568`
- JPEG quality
- max upscale factor
- AI model tier thresholds
- watermark placement
- watermark font size
- overlay font family
- artifact retention days
- R2 key template
- Drive folder routing
- GPS clustering thresholds
- QBO sync batch size

Runtime config answers:

> What parameter values should the app or service use right now?

This is not a feature flag. A watermark font size, image dimension target, model confidence threshold, or retention day count should not be stored as a rollout flag.

Runtime config must be:

- typed
- schema-validated
- versioned
- hashable
- auditable
- scoped
- cached with explicit TTL
- snapshotted into work products when it affects generated artifacts

### 4. Policies And Guardrails

Policies and guardrails are high-impact operational controls.

Examples:

- telemetry enabled/disabled
- debug image bundles enabled/disabled
- customer-visible GPS policy
- artifact retention policy
- AI monthly cost cap
- QBO writeback breaker
- precise-location visibility
- external portal upload size limits
- PII redaction rules

Policies answer:

> What safety, compliance, cost, retention, or privacy constraints govern this workflow?

Some policies can be stored as runtime config, but high-blast-radius policies should have first-class tables or strongly typed records.

The existing BB Scan telemetry policy table is the right pattern: a fleet policy row with explicit fields, updated_by, updated_at, reason, and fail-quiet defaults.

### 5. Secrets And Boot Configuration

Secrets and boot configuration are not runtime toggles.

Examples:

- API keys
- OAuth client secrets
- webhook verifier tokens
- database URLs
- token storage mode
- CORS origins
- session secret
- service host/port

These belong in deployment secret stores or environment variables.

ControlTower may show redacted status and health, but it should not treat secrets as ordinary app settings.

### 6. User Preferences

User preferences are personal UI behavior.

Examples:

- compact layout
- collapsed sidebar
- preferred theme
- local display density
- hidden panels
- personal map display preference

Preferences should not control shared business behavior, artifact generation, or server-side workflows.

Browser-local storage is acceptable for purely personal display preferences. Cross-device preferences can be stored per user, but they remain preferences, not fleet controls.

## Universal Data Model

### App Registry

Every BBInc app or service should have an app registry entry.

Required fields:

- `app_id`
- `display_name`
- `app_family`
- `owner`
- `status`
- `runtime_mode_floor`
- `description`
- `created_at`
- `updated_at`

Example app ids:

- `calexp5`
- `bb-scan`
- `bb-controltower`
- `bb-micro-bridge`
- `bb-buddy`
- `bb-gps`
- `bb-supplier-portal`
- `bb-client-portal`
- `bb-architect-portal`
- `bb-data-manager`

### Feature Registry

Feature flags should continue the `app_features` / `app_feature_overrides` model already present in ControlTower docs and BFF code.

Required concepts:

- app id
- feature key
- lifecycle
- default enabled
- deploy-mode floor
- owner
- description
- override scope
- override reason
- expiration
- resolver source

### Runtime Config Registry

Runtime config should use a parallel registry, not the feature table.

Recommended conceptual tables:

- `app_runtime_config_keys`
- `app_runtime_config_values`
- `app_runtime_config_history`

Required key fields:

- `app_id`
- `config_key`
- `value_schema`
- `default_value_json`
- `current_value_json`
- `scope_type`
- `scope_value`
- `version`
- `config_hash`
- `owner`
- `updated_by`
- `updated_at`
- `reason`
- `effective_from`
- `expires_at`

Scope should follow the same vocabulary as feature flags where useful:

- global
- app
- role
- workspace
- project
- user
- device class
- environment

Not every config should allow every scope. The schema should declare allowed scopes per key.

### Policy Registry

Policies can either be first-class tables or typed runtime config records depending on risk.

Rule:

- low-risk structured behavior can live in runtime config
- high-risk behavior deserves a first-class policy row/table

Examples of first-class policies:

- telemetry policy
- artifact retention policy
- external sharing policy
- QBO writeback policy
- AI cost policy
- PII/GPS visibility policy

### Config Snapshot Records

Any workflow that creates an artifact, external writeback, invoice, PDF, JPG, payment record, or customer-visible output must persist the effective control snapshot used at generation time.

Minimum snapshot fields:

- `app_id`
- `workflow`
- `control_plane_version`
- `feature_snapshot`
- `runtime_config_snapshot`
- `policy_snapshot`
- `config_hash`
- `resolved_at`
- `resolver_version`

For receipt artifacts, this means the annotated JPG/PDF can later prove:

- feature flags active at generation time
- image sizing config
- watermark config
- overlay config
- retention policy
- customer-visible metadata policy
- renderer version

This is required for reliable audit, recovery, and regeneration.

## Centralized Access And Change

Centralized access does not mean every control is edited on one giant page. It means every control is discoverable, governed, and changeable through one authority path.

The authority path should be:

1. Apps declare manifests.
2. Bridge/ControlTower imports manifests into Neon registries.
3. ControlTower lists all controls by app/domain/family.
4. Admins change allowed controls through typed editors.
5. Writes require reason and actor identity.
6. Changes create history records.
7. Caches invalidate or expire within documented TTLs.
8. Apps read effective config through a small number of standard resolver endpoints.
9. The control plane supports both authenticated per-user/session resolvers and public or pre-auth fleet/bootstrap resolvers where a workflow needs controls before auth exists.
10. Workflows snapshot effective config before generating artifacts or external writes.
11. CT shows drift, orphaned code reads, stale cache status, and last change history.

## Centralized Exposure Contract

Every BBInc app, service, worker, and pipeline should expose flags/settings through the same control-plane contract:

1. Each app ships a control manifest.
2. Bridge and/or ControlTower imports manifests into Neon registries.
3. ControlTower becomes the universal editor/viewer for those controls.
4. Apps read effective controls through standard resolver endpoints instead of reaching into scattered tables, localStorage, or ad hoc constants.
5. Resolver endpoints are split by need:
   - authenticated per-user/session resolution where identity, workspace, project, or role matters
   - public or pre-auth bootstrap resolution where the workflow must assemble safely before auth exists
6. Generated artifacts, external writebacks, and customer-visible outputs store the effective control snapshot/hash used at generation time.
7. Drift checks detect hard-coded, orphaned, stale, local-only, or unregistered flags/settings.

This is the enforcement mechanism that keeps flags and settings centralized over time. A new flag, setting, policy, tuning parameter, or artifact-impacting constant is not complete until it is declared in the manifest, imported into the registry, visible in ControlTower, resolvable by apps, included in relevant snapshots, and covered by drift checks.

## Manifest Requirement

Every app should ship a control manifest.

The manifest should declare:

- feature flags
- runtime config keys
- policies consumed
- default values
- schemas
- allowed scopes
- owners
- descriptions
- lifecycle state
- whether a key is customer-impacting
- whether a key is artifact-impacting
- whether a key requires reason on change
- whether a key requires elevated approval

No app should introduce a new runtime flag or config constant without adding it to the manifest.

## CI And Drift Checks

To make sure all flags and settings are exposed centrally, add automated drift checks:

1. Static scan for feature/config reads in app code.
2. Compare discovered keys to each app manifest.
3. Fail CI or publish a CT warning when code reads an undeclared key.
4. Compare manifest keys to registry rows.
5. Warn on registry rows with no code consumer.
6. Warn on hard-coded constants that match known config categories.
7. Show orphaned localStorage keys.
8. Show env vars that are being misused as runtime config.

This is how the ecosystem avoids another scattered-settings problem.

## Resolver Contract

Each app should consume a small resolver API instead of reaching into arbitrary tables.

Recommended read endpoints:

- `GET /api/control-plane/effective?app_id=calexp5`
- `GET /api/control-plane/features?app_id=calexp5`
- `GET /api/control-plane/runtime-config?app_id=calexp5`
- `GET /api/control-plane/policies?app_id=calexp5`

Recommended admin endpoints:

- `GET /api/admin/control-plane/apps`
- `GET /api/admin/control-plane/apps/:app_id`
- `PUT /api/admin/control-plane/features/:app_id/:feature_key`
- `PUT /api/admin/control-plane/runtime-config/:app_id/:config_key`
- `PUT /api/admin/control-plane/policies/:app_id/:policy_key`
- `POST /api/admin/control-plane/import-manifest`
- `POST /api/admin/control-plane/invalidate-cache`

For app performance, resolvers should cache effective config with short TTLs:

- feature flags: about 60 seconds
- runtime config: about 5 minutes unless marked urgent
- policies: policy-specific, usually 30 seconds to 5 minutes

Critical kill switches should support explicit cache invalidation and short TTL.

## Pipeline Foundation Implications

All BBInc pipelines should be built around a `resolved controls` step.

The generic pipeline foundation becomes:

1. receive request or intake
2. identify actor, app, workspace, project, device, environment
3. resolve features
4. resolve runtime config
5. resolve policies
6. compute `controlSnapshot`
7. execute workflow
8. persist artifacts/results with snapshot hash
9. emit telemetry with snapshot hash
10. make CT drill-down show the effective controls used

This applies to:

- receipt scan
- appliance label scan
- tool scan
- GPS reconstruction
- QBO/QBT writeback
- projections
- document generation
- supplier upload
- customer portal upload
- BB Buddy actions
- ControlTower admin operations

## Receipt Pipeline As A Consumer

The receipt pipeline should not own the control plane. It should consume it.

Receipt-specific controls should be declared under app/domain keys such as:

- `calexp5.receipts.capture`
- `calexp5.receipts.image_processing`
- `calexp5.receipts.ai_extraction`
- `calexp5.receipts.overlay`
- `calexp5.receipts.watermark`
- `calexp5.receipts.artifacts`
- `calexp5.receipts.telemetry`

Examples:

- `image.canonical_long_edge = 2576`
- `image.ai_long_edge = 1568`
- `image.jpeg_quality = 0.92`
- `ai.normal_model = claude-sonnet-*`
- `ai.escalation_model = claude-opus-*`
- `watermark.enabled = true`
- `watermark.fields = [...]`
- `watermark.position = bottom_footer`
- `overlay.font_id = approved_font_v1`
- `artifacts.store_canonical_r2 = true`
- `artifacts.publish_customer_drive = true`

Every generated receipt artifact should store the control snapshot/hash.

## ControlTower Implications

ControlTower should become the universal control-plane UI.

Recommended navigation shape:

- Apps
- Feature Flags
- Runtime Config
- Policies And Guardrails
- Secrets Status
- Control History
- Drift And Orphans
- App-Specific Workspaces

App-specific workspaces such as BB Scan can still exist, but they should be views over the universal registries, not separate authority models.

For BB Scan, the current tab should become:

- scan attempts and telemetry
- image/artifact visibility
- scan feature rollout panel
- scan runtime tuning panel
- scan telemetry/debug policy panel
- receipt overlay/watermark panel

All edits should write through universal control-plane APIs.

## Migration Direction

Recommended migration order:

1. Treat this document as the universal architecture source of truth.
2. Keep existing Bridge feature flags and BB Scan policy working.
3. Add app control manifests for CalExp5, BB Scan, Bridge, and ControlTower.
4. Add runtime config registry and history tables.
5. Add effective-control resolver endpoint.
6. Move CalExp5 `bbScanSettings` from persisted Zustand app settings into runtime config.
7. Move CalExp5 beta flags into universal feature flags.
8. Keep local/Zustand defaults only as offline fallback values.
9. Add CT Runtime Config page.
10. Add drift/orphan checker.
11. Require generated artifacts and writebacks to store control snapshot/hash.
12. Decommission legacy per-browser/admin-local toggles that affect shared behavior.

## Open Decisions

1. Whether Bridge or ControlTower BFF owns the final control-plane write API.
2. Whether app manifests are imported at deploy time, startup time, or manually from CT.
3. Whether runtime config should live in Bridge-owned Neon tables or ControlTower BFF-owned tables in the same database.
4. Which controls require two-step approval.
5. Which controls are allowed to vary by user versus only app/global.
6. How to name app ids and domains consistently.
7. Whether `bb-scan` is a standalone app id, a CalExp5 domain, or both.
8. How long control-plane history should be retained.
9. How quickly urgent kill switches must propagate across replicas.
10. Whether artifact-impacting config changes require renderer regression tests before activation.

## Final Recommendation

Adopt a universal BBInc control plane, not a BB Scan-only flag model.

Use feature flags for capability and rollout, runtime config for typed parameters, policies for safety/cost/privacy/retention, env/secrets for boot-only service configuration, and user preferences only for personal UI behavior.

ControlTower should expose every control centrally through app manifests and registry-backed editors. Bridge/ControlTower should provide effective-control resolver APIs. Every artifact-producing or external-write workflow should snapshot the effective controls used.

The receipt image pipeline should become one of the first consumers because it has all the hard cases: device capture variability, AI model routing, artifact generation, customer-facing PDFs/JPGs, overlays, watermarks, GPS/metadata policy, R2/Drive storage, telemetry, and recovery.
