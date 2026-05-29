# Universal Control Plane Implementation Plan

**Date:** 2026-05-09  
**Status:** Plan only - no application code changes in this document  
**Scope:** BBInc-wide control-plane implementation, with CalExp5 receipt scanning and BB Scan as the first end-to-end migration pilot

---

## 1. Purpose

This document turns the current architecture and receipt-pipeline strategy into an execution plan.

It is based on the current documented model and current code that already exists across:
- `CalExp5`
- `BB_Micro_Bridge`
- `BB_ControlTower`
- `OpenAI\DB`

This is not a greenfield design. The goal is to phase current production code into the documented universal control-plane model without breaking live receipt capture, AI extraction, or customer-facing JPG/PDF output.

---

## 2. Source Basis

The plan below is evidence-based from the following documents and code already read in full during this analysis cycle.

### 2.1 Canonical documents

- `C:\Users\samjo\Desktop\OpenAI\DB\architecture\UNIVERSAL_CONTROL_PLANE_MODEL.md`
- `C:\Users\samjo\Desktop\OpenAI\DB\architecture\ECOSYSTEM_TARGET_ARCHITECTURE.md`
- `C:\Users\samjo\Desktop\BB_Receipt_Image_Pipeline_Strategy.md`
- `C:\Users\samjo\Desktop\BB_ControlTower\docs\UNIVERSAL_FEATURE_FLAGS.md`
- `C:\Users\samjo\Desktop\BB_ControlTower\docs\UNIFIED_TOGGLES_AND_TENANCY.md`
- `C:\Users\samjo\Desktop\CalExp5\docs\FEATURE_INVENTORY_2026-05-06.md`
- `C:\Users\samjo\Desktop\CalExp5\docs\REMOVAL_PLAN_2026-05-06.md`

### 2.2 Current implementation evidence

- `C:\Users\samjo\Desktop\CalExp5\src\store\slices\settingsSlice.js`
- `C:\Users\samjo\Desktop\CalExp5\server.js`
- `C:\Users\samjo\Desktop\CalExp5\src\components\modals\ReceiptScanModal.jsx`
- `C:\Users\samjo\Desktop\CalExp5\src\components\shared\Camera.jsx`
- `C:\Users\samjo\Desktop\CalExp5\src\components\shared\ReceiptFAB.jsx`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\routes\scan-policy-v1.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\src\utils\feature-defaults.js`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\migrations\041_bb_scan_telemetry_policy.sql`
- `C:\Users\samjo\Desktop\BB_Micro_Bridge\migrations\042_bb_scan_feature_flags.sql`
- `C:\Users\samjo\Desktop\BB_ControlTower\bff\lib\feature-resolver.js`
- `C:\Users\samjo\Desktop\BB_ControlTower\src\pages\BbScan.tsx`
- `C:\Users\samjo\Desktop\BB_ControlTower\src\pages\SettingsDeveloper.tsx`

### 2.3 Current-state facts that constrain the plan

1. `CalExp5` currently persists user preferences, beta flags, and BB Scan tuning together in one Zustand blob in `settingsSlice.js`.
2. `CalExp5` saves and loads that blob through `/settings/load` and `/settings/save` in `server.js`.
3. Receipt scan runtime behavior currently reads `betaFlags` and `bbScanSettings` directly in `ReceiptScanModal.jsx`, `Camera.jsx`, and `ReceiptFAB.jsx`.
4. `BB_Micro_Bridge` already has a working fleet model for BB Scan telemetry policy and scan-specific feature flags in `scan-policy-v1.js` and migrations `041` and `042`.
5. `BB_ControlTower` already has a scoped feature resolver with precedence implemented in `bff/lib/feature-resolver.js`.
6. The universal control-plane architecture already defines the target model: manifests, registries, resolver endpoints, cache invalidation, control snapshots, and drift checks.
7. The receipt pipeline strategy already defines the first migration pilot: canonical `filing-2576.jpg`, `sonnet-1568.jpg`, R2 for canonical/internal artifacts, Google Drive for official customer/accounting outputs, and control snapshots attached to generated artifacts.
8. The receipt telemetry and filing flow is currently split across `receipt-capture`, `receipt-scan`, and `receipt-scan-escalate` rows, while CT groups attempts using a fallback mix of `scanId`, `sessionId`, `payload.capture.scanId`, `payload.capture.sessionId`, or row ID.
9. Gallery scans currently pass through crop/canvas paths that strip original EXIF unless the client preserves that data explicitly before the transform boundary.
10. The generic receipt Drive uploader currently writes `name`, `description`, and `parents`, but not structured Drive `appProperties`, even though another Bridge Drive client already supports `appProperties`.
11. The offline receipt queue currently stores image blob, thumbnail, employee ID, timestamp, retry count, file hash, and filename, but does not persist the richer capture/source/provenance metadata that the downstream receipt strategy now requires.
12. `scanReceipt()` currently stamps `scanTimestamp` with `new Date().toISOString()` at request time rather than guaranteed original capture time, which is especially important for queued/offline and gallery-origin receipts.
13. The current BB Scan-specific feature-flag model supports sticky cohort rollout using `rollout_pct`, `cohort_filter`, and per-session hashing semantics that the broader universal feature registry does not yet fully replicate.
14. `scan-policy-v1.js` already has a real split between public fleet/bootstrap reads (`/api/cal/telemetry-policy`, `/api/cal/feature-flags`) and admin writes, because the receipt pipeline needs some controls before authenticated app work begins.
15. The BB Scan admin flag write path in `scan-policy-v1.js` updates seeded rows in `bb_scan_feature_flags` but does not insert new rows on demand.
16. The current CT feature resolver caches by `appId`, identity, and workspace only, even though the same resolver already supports project-scoped overrides.
17. CT's current BB Scan preset table still includes `fat_card_layout` in the `GA` bulk preset even though that flag no longer belongs to the active BB Scan rollout set.
18. The receipt pipeline already includes concrete `/scan/escalate` versus `/file` race guards: Bridge returns 409 while escalation is in flight and uses `consumed` to prevent double filing.

---

## 3. Problem Statement

Today the ecosystem has the right pieces, but they are split across incompatible control surfaces.

### 3.1 Fragmentation that exists now

- Feature-like controls exist in multiple places:
  - `feature-defaults.js`
  - `betaFlags` in `settingsSlice.js`
  - `bb_scan_feature_flags`
  - CT-local developer settings
- Runtime tuning exists as local app state:
  - `bbScanSettings` in `settingsSlice.js`
- Policy-like controls already exist in dedicated Bridge tables:
  - `bb_scan_telemetry_policy`
- User preferences are mixed into the same blob as runtime behavior.
- Artifact-producing workflows do not yet consistently snapshot the effective controls used at generation time.

### 3.2 Why this matters operationally

This creates ten practical failures:

1. There is no single authoritative place to discover every live control affecting runtime behavior.
2. There is no single resolver contract that every app can consume.
3. Customer-visible artifacts can be generated without durable linkage to the exact settings and policies that produced them.
4. CT cannot reliably expose, audit, diff, and roll back all live controls because many are still local, implicit, or unregistered.
5. Receipt attempts cannot yet be correlated cleanly end to end because the pipeline still depends on mixed `scanId` and `sessionId` fallback grouping rather than one stable correlation contract.
6. Receipt provenance can be lost at handoff boundaries, especially for gallery EXIF, source kind, capture mode, orientation chain, and structured output metadata.
7. Offline queue replay does not yet preserve a sufficiently rich receipt provenance envelope for later filing, audit, and regeneration.
8. Timestamp semantics are not yet cleanly separated between capture time, scan request time, receipt date, Drive upload time, and local filesystem timestamps.

9. Some receipt controls are needed before any authenticated app session exists, but the current BBInc control model does not yet document a first-class split between public fleet/bootstrap controls and authenticated per-user controls.

10. The current CT feature resolver caches by app, identity, and workspace but not `project_id`, even though the resolver already supports project-scoped overrides; that can produce stale or cross-project resolves for the same identity inside one workspace.

---

## 4. Target Operating Model

This plan adopts the universal control-plane model already documented.

### 4.1 Control families

Every runtime-affecting control must be classified into one of these families:

| Family | Purpose | Examples in current scope |
|---|---|---|
| Runtime mode | Broad environment or operating mode | deploy mode floors, prod vs beta gating |
| Feature flags | Capability gates and rollout controls only | `receiptScanning`, `tapExtract`, overlay rollout |
| Runtime configuration | Typed operational parameters | `2576` long edge, `1568` AI long edge, JPEG quality, max upscale factor |
| Policies / guardrails | Safety, privacy, retention, cost, writeback rules | telemetry image capture, GPS visibility, R2/Drive retention, QBO attachment policy |
| Secrets / boot config | Boot-only service configuration | API keys, DB URLs, OAuth secrets |
| User preferences | Personal UI behavior only | drawer state, per-user display preferences |

### 4.2 Centralized exposure contract

The implementation must preserve the contract already documented:

1. Each app ships a control manifest.
2. Bridge and/or CT imports manifests into Neon registries.
3. CT becomes the central viewer/editor.
4. Apps read through standard resolver endpoints.
5. Artifact-producing workflows store the effective control snapshot/hash used at generation time.
6. Drift checks detect hard-coded, orphaned, local-only, or unregistered controls.

### 4.3 Receipt pipeline as first pilot

The first full pilot should be the CalExp5 receipt pipeline because it exercises the hardest cases together:

- device variability
- scan tuning
- AI routing
- telemetry
- canonical image generation
- customer JPG/PDF generation
- R2 and Drive storage
- watermark / overlay controls
- metadata and privacy policy
- recovery/regeneration

If the control plane works here, the foundation is real.

---

## 5. Non-Goals

This plan does **not** assume the following happen in the first migration wave:

- immediate migration of every BBInc app to the new control plane
- removal of every old code path in one release
- forced schema cutover to long-term `assets` / `asset_artifacts` tables on day one
- new CT editors before the registries and resolvers exist
- receipt overlay rendering before canonical artifact lineage and control snapshots are in place

---

## 6. Implementation Principles

1. **Inventory before mutation.** No control should be edited centrally until it is registered and visible.
2. **Dual-read before cutover.** New resolver paths should be introduced alongside legacy reads before legacy behavior is removed.
3. **Legacy fallback remains until the new path is proven.** This is especially important for `bbScanSettings`.
4. **Artifact-producing workflows must snapshot controls before final cutover.** This is mandatory for customer-facing outputs.
5. **Do not use feature flags as a dumping ground.** Runtime config and policies remain separate.
6. **Keep CT as the management surface, not the source of truth.** Neon-backed registries and Bridge/BFF resolvers are the source of truth.
7. **Receipt storage responsibilities remain split by purpose.**
   - Neon: metadata and lineage authority
   - R2: canonical/internal image artifacts
   - Google Drive: official human/accounting artifacts
8. **Correlation comes before observability.** CT should not expand receipt drill-down behavior further on top of fallback grouping rules.
9. **Metadata loss must be designed out explicitly.** Gallery EXIF, source kind, capture mode, rotation chain, and output metadata cannot be reconstructed reliably after the fact.
10. **`scanSessionId` and Bridge `scanId` serve different jobs.** The plan must preserve a client-generated attempt/session identifier from the first telemetry event, then attach the Bridge `scanId` when `/scan` begins returning server-side state.

---

## 7. Workstreams

The implementation should be run as eight coordinated workstreams.

### 7.1 Workstream A - Control Inventory and Manifest Authoring

**Goal:** register every known control before changing runtime behavior.

**Tasks**
- Author app manifests for:
  - `calexp5`
  - `bb-micro-bridge`
  - `bb-controltower`
  - receipt-pipeline-specific controls if separated by subsystem
- Include at minimum:
  - feature flags
  - runtime config keys
  - policy keys
  - artifact-impacting controls
  - ownership metadata
  - default values or registry pointers as already defined by the platform docs
- Backfill manifests from:
  - `feature-defaults.js`
  - `settingsSlice.js`
  - `bb_scan_telemetry_policy`
  - `bb_scan_feature_flags`
  - receipt pipeline documented controls in `BB_Receipt_Image_Pipeline_Strategy.md`
- Ensure receipt manifests explicitly classify:
  - capture/source provenance controls
  - metadata embedding controls
  - thumbnail access controls
  - archive artifact policy
  - overlay font and renderer controls
  - QBO attachment behavior controls
  - retrieval/cache policy controls for list, detail, print/share, and offline-view use cases

**Deliverables**
- one manifest per app
- one inventory report of legacy controls
- one drift baseline

**Exit criteria**
- Every known current control is categorized into a control family.
- No receipt-pipeline control remains undocumented.

### 7.2 Workstream B - Registry and Schema Foundation

**Goal:** create the storage model for universal control-plane data.

**Tasks**
- Keep existing tables in service:
  - `bb_runtime_app.app_features`
  - `bb_runtime_app.app_feature_overrides`
  - `bb_runtime_app.bb_scan_telemetry_policy`
  - `bb_runtime_app.bb_scan_feature_flags`
- Add the runtime config registry already implied by the source docs:
  - `app_runtime_config_keys`
  - `app_runtime_config_values`
  - `app_runtime_config_history`
- Decide whether BB Scan sticky cohort rollout remains a specialized resolver/table during migration or whether equivalent cohort semantics are added to the universal feature system before cutover.
- Add or confirm policy storage for:
  - typed policy tables where risk is high
  - runtime-config-backed policy records only where risk is low and structure is stable
- Add control-plane manifest import tracking and change history if not already present in the universal model implementation backlog.

**Deliverables**
- migrations
- registry seed data
- history tracking

**Exit criteria**
- Registries exist for features, runtime config, and policies.
- Every registry supports audit history and actor attribution.

### 7.3 Workstream C - Resolver and API Layer

**Goal:** expose one standard read path and one standard admin path.

**Tasks**
- Keep existing BB Scan policy endpoints working:
  - `GET /api/cal/telemetry-policy`
  - `GET /api/cal/feature-flags`
  - existing admin write routes in `scan-policy-v1.js`
- Treat those BB Scan reads as a first-class bootstrap lane, not as an accident:
  - some controls must resolve before authenticated session state exists
  - the universal control plane therefore needs both authenticated per-user resolvers and public or pre-auth fleet/bootstrap resolvers where the workflow requires them
- Add the universal control-plane resolver/admin endpoints already named in the architecture:
  - effective feature resolver
  - effective runtime config resolver
  - effective policy resolver
  - manifest import endpoint
  - cache invalidation endpoint
- Preserve documented TTL guidance:
  - feature flags about 60 seconds
  - runtime config about 5 minutes
  - policies 30 seconds to 5 minutes depending on risk
- Support explicit invalidation for kill switches and urgent policy changes.
- Fix the current resolver cache-key weakness before project-scoped rollout expands:
  - project-scoped overrides cannot safely share a cache key that omits `project_id`
- Add or extend receipt-specific resolver/admin contracts for:
  - control snapshots at scan and file boundaries
  - artifact metadata policy
  - overlay/watermark renderer config
  - thumbnail access policy
  - Drive/R2 retention and visibility policy
- Add one authoritative receipt attempt correlation contract that survives across:
  - `/capture-telemetry`
  - `/scan`
  - `/scan/escalate`
  - `/file`
  - corrections logging
  - offline queue replay
  - CT attempt grouping
- The correlation contract should explicitly define:
  - client-generated `scanSessionId` from modal open / attempt start
  - server-generated `scanId` from `/scan`
  - how both identifiers flow through telemetry, queue records, filed artifacts, corrections, and CT joins
- Preserve the existing specialized BB Scan rollout semantics where needed:
  - rollout percentage
  - cohort filter
  - sticky session hashing
  until equivalent universal control-plane support exists
- Preserve the current seeded-row assumption explicitly during migration:
  - BB Scan admin writes can update existing flag rows today
  - new BB Scan flags still need migration/seed support until the universal registry fully owns creation

**Deliverables**
- stable resolver contracts
- cache invalidation support
- manifest import flow

**Exit criteria**
- Apps can resolve effective controls without reading local setting blobs directly.
- CT can invalidate caches after writes.

### 7.4 Workstream D - ControlTower Central Management Surface

**Goal:** make CT the authoritative operator surface for centralized visibility and change.

**Tasks**
- Build read-only universal control inventory first.
- Add editors only after the registry and resolver paths are proven.
- Separate CT surfaces by control family:
  - feature flags
  - runtime config
  - policies / guardrails
  - drift / orphan detection
  - change history / audit
- Keep the BB Scan workspace as the operational drill-down surface, but have it read/write the same central registries rather than acting as a separate control system.
- Clean up BB Scan workspace assumptions while migrating it:
  - remove stale preset entries such as `fat_card_layout`
  - replace placeholder artifact-slot language with registry-backed artifact visibility once artifact joins exist
- Expose receipt-pipeline-specific controls in dedicated views:
  - image normalization and quality
  - overlay/watermark config
  - telemetry image policy
  - retention and storage policy
- Expand CT receipt attempt visibility beyond the current single-thumbnail placeholder model so it can show:
  - source/capture artifact state
  - canonical `2576` artifact state
  - AI input artifact state
  - customer JPG/PDF state
  - archive artifact state while the legacy archive path exists
  - per-attempt control snapshot/hash
  - source kind and capture mode without fallback inference
- Replace ad hoc CT grouping heuristics with an attempt model backed by stable correlation identifiers and joined artifact metadata.

**Deliverables**
- central read-only inventory
- registry-backed editors
- drift panel
- audit history panel

**Exit criteria**
- All live receipt controls are visible in CT without opening CalExp5.
- CT no longer depends on browser-local developer settings for authoritative behavior.

### 7.5 Workstream E - CalExp5 Read-Path Migration

**Goal:** make CalExp5 consume the control plane without user-visible breakage.

**Tasks**
- Replace beta-flag reads with feature resolver reads.
- Introduce `useScanTuning()` or equivalent runtime-config resolver hook.
- Keep fallback defaults during migration.
- Preserve offline-safe behavior where needed, but do not let local persisted values remain authoritative for shared pipeline behavior.
- Remove direct dependence on local admin/dev surfaces once parity is confirmed.
- Fix or eliminate current handoff gaps where the frontend already knows receipt source/capture facts but does not propagate them consistently into Bridge scan payloads.
- Standardize live camera, gallery, and offline-queue entry paths on the same normalized post-confirmation artifact contract.
- Expand offline queue records so they can preserve the attempt envelope needed later for filing and telemetry:
  - capture time
  - source kind
  - capture mode
  - queue ID
  - queue timestamp
  - device GPS when available
  - gallery EXIF manifest pointer or embedded metadata when available

**Specific evidence-backed targets**
- `betaFlags` currently used in:
  - `ReceiptScanModal.jsx`
  - `ReceiptFAB.jsx`
  - other beta-flag call sites already catalogued in the removal plan
- `bbScanSettings` currently used in:
  - `ReceiptScanModal.jsx`
  - `Camera.jsx`
  - other BB Scan read sites already catalogued in the removal plan
- `scanReceipt()` already supports `options.captureMode`, but current `ReceiptScanModal.jsx` scan call sites do not pass the known `captureTelemetry.captureMode` into the request body.
- Gallery routing in `ReceiptScanModal.jsx` currently reads the selected file as base64 and emits gallery telemetry, but the documented receipt strategy shows that original EXIF/source provenance is usually lost after crop/canvas unless it is preserved explicitly before that boundary.
- The offline receipt queue implementation in `receipt-queue.js` currently persists only a narrow record shape and therefore needs schema expansion if queue-drained receipts are expected to preserve full provenance.
- `scanReceipt()` currently sets `scanTimestamp` at request time, so the implementation plan must distinguish actual capture time from later upload/drain time.

**Deliverables**
- feature resolver hook adoption
- runtime config hook adoption
- legacy fallback path

**Exit criteria**
- Receipt scanning runs from effective feature and runtime config resolvers.
- Local Zustand settings are no longer the live source of shared receipt-pipeline behavior.

### 7.6 Workstream F - Receipt Pipeline Control-Snapshot and Artifact Pilot

**Goal:** make the receipt pipeline the first workflow that fully consumes and snapshots the control plane.

**Tasks**
- Standardize the control contract for scan, extract, file, overlay, watermark, storage, recovery, and telemetry.
- Add one canonical scan/session correlation contract across:
  - modal-open and capture telemetry
  - `/capture-telemetry`
  - `/scan`
  - `/scan/escalate`
  - `/file`
  - corrections logging
  - offline queue replay
  - CT attempt grouping and drill-down
- The first field in that contract should be a client-generated `scanSessionId` that exists before Bridge can issue `scanId`.
- Before artifact generation, resolve and snapshot:
  - active feature flags
  - effective runtime config
  - effective policies
  - control hash / config hash
- Attach the snapshot or hash to:
  - `cal_receipts.metadata`
  - `asset_artifacts.metadata` where implemented
  - CT drill-down data
  - generated JPG/PDF metadata where practical
- Align with the image artifact strategy already documented:
  - canonical `filing-2576.jpg`
  - `sonnet-1568.jpg` for normal AI extraction
  - optional `opus-2576.jpg`
  - official customer JPG/PDF derived from the canonical 2576 artifact
- Align storage responsibilities:
  - R2 durable canonical/internal artifacts
  - Google Drive official human/accounting artifacts
  - Neon authoritative metadata and lineage
- Add explicit gallery and provenance work:
  - preserve original gallery EXIF before canvas processing
  - preserve `sourceKind` and `captureMode` through crop/confirm and scan submission
  - record orientation chain and rotation decisions as first-class metadata
  - preserve device GPS and photo EXIF GPS as separate signals where both exist
- Add explicit offline-queue work:
  - preserve actual capture timestamp rather than only upload/drain time
  - preserve queue lineage (`queueId`, queuedAt, retryCount, drain attempt)
  - preserve enough metadata to re-enter the same normalized artifact contract on replay
- Add explicit time/metadata policy work:
  - distinguish capture timestamp, receipt date, filing timestamp, Drive upload timestamp, and local filesystem repair timestamp
  - treat Drive `createdTime` as upload time, not canonical receipt time
  - preserve original receipt dates in Neon and embedded metadata
- Add explicit artifact-policy work:
  - define whether the current `archive-4k` derivative remains, is renamed, is moved to R2-only, or is removed
  - move debug artifact retention out of Google Drive and under R2 policy control
  - define interim image-file behavior such as orientation-detector temp files and debug-stage outputs
- Add explicit telemetry payload policy work:
  - define maximum inline payload budget for capture telemetry
  - keep large debug images out of durable telemetry rows where possible
  - prefer artifact references over large inline base64 once artifact storage is available
- Add explicit metadata-embedding work:
  - PDF metadata
  - JPG EXIF/XMP metadata
  - Drive description and structured `appProperties`
  - R2 object metadata
- Add explicit schema-transition work:
  - immediate path through `cal_receipts.metadata`
  - long-term path into `assets`, `asset_artifacts`, `asset_links`, and `asset_extractions`
  - extraction-attempt lineage so Sonnet/Opus runs point to their input artifacts

**Deliverables**
- control snapshot payload shape
- snapshot/hash persistence
- CT visibility of control snapshot used per attempt and per filed artifact
- attempt correlation model
- metadata embedding contract
- artifact lineage contract
- offline queue provenance contract
- timestamp semantics contract

**Exit criteria**
- Every filed receipt can be tied back to the exact controls that produced it.
- Recovery can regenerate customer artifacts from canonical image + manifests + metadata + control snapshot.
- CT can connect capture telemetry, Bridge scan rows, and filed artifacts without fallback guesswork.
- Gallery-origin receipts preserve enough provenance to satisfy metadata, location, and recovery requirements.

### 7.7 Workstream G - Drift Detection and Governance

**Goal:** prevent the platform from re-fragmenting after migration.

**Tasks**
- Build drift checks that compare:
  - code reads
  - manifests
  - registries
  - active CT surfaces
  - env vars misused as runtime controls
- Extend drift checks to artifact-impacting metadata paths:
  - Drive uploads missing expected `appProperties`
  - JPG/PDF outputs missing expected embedded metadata
  - telemetry rows missing correlation fields
  - artifact rows missing lineage pointers or control snapshot/hash
- Add drift checks for queue and timing fidelity:
  - queue records missing provenance fields
  - filed receipts missing preserved capture timestamp
  - workflows incorrectly using request time where capture time is required
- Flag:
  - hard-coded runtime constants not declared in manifests
  - registry rows with no code consumer
  - controls read locally but absent from registries
  - controls exposed in CT but absent from code
- Make drift findings visible in CT and CI where practical.

**Deliverables**
- drift scanner
- CT drift report
- CI guardrails

**Exit criteria**
- A new runtime-affecting control cannot be added without manifest coverage and registry visibility.

### 7.8 Workstream H - Legacy Surface Removal

**Goal:** remove old control surfaces only after parity and adoption are proven.

**Tasks**
- Remove or shrink in-app ControlTower paths in CalExp5 after parity gates are satisfied.
- Remove local developer-only receipt controls from CalExp5 once CT and resolver paths own them.
- Remove obsolete local beta flag and scan tuning write paths.
- Keep user preferences that are truly user-local.
- Retire legacy receipt artifact behaviors only after their replacements are live:
  - Google Drive debug bundle usage
  - current archive-4K Drive upload path
  - CT placeholder image-slot assumptions
  - local grouping heuristics based on mixed `scanId`/`sessionId` fallbacks

**Deliverables**
- deleted dead paths
- reduced API key surface in CalExp5
- simplified settings model

**Exit criteria**
- No shared pipeline control requires CalExp5-local admin UI.

---

## 8. Phase Plan

The workstreams above should be delivered in the following sequence.

### Phase 0 - Inventory and manifest authoring

**Objective:** inventory without behavior change.

**Repositories**
- `CalExp5`
- `BB_Micro_Bridge`
- `BB_ControlTower`
- `OpenAI\DB`

**Tasks**
- Write manifests.
- Register every current receipt-pipeline control.
- Produce the first drift baseline.
- Identify every receipt-pipeline constant or behavior that still lacks one of:
  - manifest registration
  - control-family classification
  - correlation-field ownership
  - metadata-embedding ownership

**Why first**
- The universal model explicitly requires manifests before centralized exposure.
- The current system still has split sources of truth.

**Rollback posture**
- No production behavior change.

### Phase 1 - Registry and resolver skeleton

**Objective:** add the central storage and read path.

**Repositories**
- `BB_Micro_Bridge`
- `BB_ControlTower`

**Tasks**
- Create runtime config registries.
- Confirm or extend feature registries.
- Add resolver endpoints.
- Add cache invalidation.
- Keep existing BB Scan policy tables/endpoints running in parallel.

**Exit gate**
- CT can read all known controls from central registries.

### Phase 2 - CT read-only central inventory

**Objective:** visibility before editability.

**Repositories**
- `BB_ControlTower`

**Tasks**
- Build read-only CT views by control family.
- Show effective value, source, TTL/cache status, and history.
- Add drift/orphan reporting.
- Show current receipt-pipeline correlation gaps and artifact visibility gaps explicitly, rather than hiding them behind placeholder UI.

**Exit gate**
- Operators can inspect the full receipt pipeline control surface in one place.

### Phase 3 - CalExp5 dual-read migration

**Objective:** move runtime reads without breaking scan flow.

**Repositories**
- `CalExp5`
- `BB_Micro_Bridge`

**Tasks**
- Migrate beta flags to feature resolver reads.
- Add `useScanTuning()` or equivalent runtime-config hook.
- Keep legacy defaults and fallback.
- Instrument mismatches between legacy local values and resolved central values.
- Propagate capture mode and source-kind data through the scan request path instead of leaving Bridge scan rows to infer or miss them.
- Propagate real capture timestamps and a client-generated `scanSessionId` through scan submission, queue storage, queue replay, and file submission.

**Exit gate**
- Live receipt capture works with resolved settings.
- Mismatch telemetry is visible.

### Phase 4 - Receipt pipeline pilot

**Objective:** make receipt capture and filing the first full control-plane consumer.

**Repositories**
- `CalExp5`
- `BB_Micro_Bridge`
- `BB_ControlTower`

**Tasks**
- Resolve/snapshot controls at scan and file boundaries.
- Persist control snapshot/hash.
- Standardize canonical artifact generation around `filing-2576.jpg`.
- Keep `sonnet-1568.jpg` as normal extraction input.
- Move canonical/internal artifacts toward R2 responsibility.
- Keep Google Drive focused on official PDF/JPG outputs.
- Surface per-scan artifact links and metadata in CT BB Scan.
- Land the first stable correlation model and remove CT dependence on fallback grouping.
- Land gallery provenance preservation so gallery receipts do not lose original EXIF/source metadata at crop/canvas boundaries.
- Land the first metadata-embedding pass for PDF, JPG, Drive file properties, and R2 object metadata.
- Decide and implement the migration path for the legacy archive derivative.
- Land the queue provenance model so offline-drained receipts preserve the same capture semantics and metadata envelope as online receipts.
- Land the first retrieval/cache contract for crew-facing receipt access:
  - list thumbnail
  - fullscreen/display image
  - print/share PDF
  - offline viewed-image fallback only

**Exit gate**
- One receipt attempt can be traced end-to-end:
  - capture inputs
  - effective controls
  - AI input artifact
  - canonical artifact
  - customer JPG/PDF
  - R2/Drive pointers
  - recovery metadata
  - gallery/live source provenance where applicable
  - rotation/orientation metadata chain

### Phase 5 - CT write path and policy editors

**Objective:** centralize change, not just read.

**Repositories**
- `BB_ControlTower`
- `BB_Micro_Bridge`

**Tasks**
- Enable CT editors for:
  - feature flags
  - runtime config
  - policies
- Require reason, actor, and history.
- Invalidate caches after writes.
- Protect kill-switch and policy writes with role checks and audit.

**Exit gate**
- Operators can change receipt-pipeline controls centrally and see them propagate through resolver paths.

### Phase 6 - Legacy UI and settings removal

**Objective:** remove obsolete local control paths after proof.

**Repositories**
- `CalExp5`

**Tasks**
- Remove legacy `betaFlags` ownership.
- Remove `bbScanSettings` as authoritative live source.
- Remove obsolete in-app ControlTower admin/dev paths per the removal plan gates.
- Retain only genuine user preferences in local settings.

**Exit gate**
- Shared runtime behavior is no longer controlled by local admin toggles in CalExp5.

### Phase 7 - Overlay, watermark, and full artifact governance

**Objective:** land annotation features on a stable artifact/control foundation.

**Repositories**
- `CalExp5`
- `BB_Micro_Bridge`
- `BB_ControlTower`

**Tasks**
- Add manifest-driven overlay and watermark controls.
- Keep canonical `filing-2576.jpg` immutable.
- Generate flattened annotated outputs as child artifacts.
- Snapshot the control state used to render overlays and watermarks.
- Expose overlay/watermark approval and output provenance in CT.
- Add one approved server-side font package and track font file/version/checksum as part of the manifest and rendering metadata.
- Use server-side rendering for official annotated outputs rather than device/browser fonts.
- Define QBO attachment behavior explicitly for annotated vs unannotated artifacts.

**Exit gate**
- Customer-visible annotations are reproducible, auditable, and recoverable from canonical image + manifests + metadata + control snapshot.

### Phase 8 - Broader ecosystem adoption

**Objective:** extend the same model to the rest of the BBInc app universe.

**Targets**
- BB Buddy
- GPS
- Tool Crib and adjacent admin surfaces
- future portals

**Exit gate**
- Receipt pipeline is no longer the only full consumer of the universal control plane.

---

## 9. Detailed Repository Plan

### 9.1 `BB_Micro_Bridge`

**Required work**
- registry migrations
- runtime config resolver endpoints
- manifest import path
- cache invalidation path
- continued support for `scan-policy-v1.js` during migration
- receipt control-snapshot persistence
- receipt artifact lineage and storage rationalization
- receipt attempt correlation across telemetry, scan, escalate, and file boundaries
- metadata embedding upgrades for PDF/JPG/Drive/R2
- retirement or reassignment of the current archive-4K Drive behavior
- receipt timestamp normalization across capture, scan, file, Drive upload, and recovery
- queue replay fidelity for offline receipt attempts

**Do not remove immediately**
- existing BB Scan telemetry policy table
- existing BB Scan feature flags table

Those are the current working seed of the broader model.

### 9.2 `BB_ControlTower`

**Required work**
- universal control inventory UI
- runtime config editor
- policy editor
- drift/orphan view
- receipt-pipeline-specific views:
  - image artifacts
  - control snapshot
  - storage pointers
  - overlay/watermark status
  - gallery/live source provenance
  - scan/session correlation health
  - archive artifact state while legacy archive path exists

**Important constraint**
- CT should not become a second source of truth.
- It must operate against the registries and resolver contracts.

### 9.3 `CalExp5`

**Required work**
- manifest authoring
- feature resolver adoption
- runtime config resolver adoption
- scan/file boundary control snapshot handoff
- migration of receipt-specific settings out of local persistence
- gallery metadata preservation before crop/canvas processing
- consistent propagation of capture mode/source kind into scan requests
- convergence of live camera, gallery, and offline-queue paths onto one normalized artifact contract
- queue record schema expansion for provenance-preserving offline replay

**Keep local only**
- true personal UI preferences
- offline-safe cached last-known values only as temporary fallback during resolver outages

### 9.4 Receipt pipeline implementation focus

The first concrete workflow to fully adopt the model should be:

1. capture
2. crop/dewarp/rotation confirmation
3. canonical `filing-2576.jpg`
4. `sonnet-1568.jpg` generation
5. AI extraction
6. optional escalation
7. final customer JPG/PDF generation
8. Drive/R2/Neon persistence
9. CT visibility and recovery

This keeps the plan aligned with the already documented image artifact model.

The receipt implementation path must also explicitly cover:

1. source provenance capture for live camera vs gallery vs offline queue
2. orientation/rotation chain metadata
3. asset and extraction lineage migration
4. CT attempt correlation and joined artifact visibility
5. metadata embedding into official output channels
6. queue replay fidelity and capture-time preservation
7. crew retrieval/cache behavior for quick device fetch without turning Drive into the canonical store

---

## 10. Caching and Invalidation Plan

The caching model should follow the documented platform rules.

### 10.1 TTLs

- feature flags: about 60 seconds
- runtime config: about 5 minutes
- policies: 30 seconds to 5 minutes based on blast radius

### 10.2 Invalidations

Support explicit invalidation for:
- receipt scanning kill switch
- telemetry image capture policy
- overlay/watermark rollout changes
- GPS visibility policy
- Drive/R2 retention policy

### 10.3 Client behavior

- Clients should use effective-control resolver responses.
- Clients should not try to invent their own long-lived config authority.
- Last-known cache may be used only as a fallback path and must be clearly tagged as such.

---

## 11. Artifact and Telemetry Implications

This implementation plan inherits the receipt strategy decisions already documented.

### 11.1 Artifact responsibilities

| Artifact class | System of record |
|---|---|
| canonical/internal receipt images | R2 |
| official customer/accounting JPG/PDF | Google Drive |
| metadata, lineage, control snapshots | Neon |

### 11.1A Retrieval contract

The implementation should preserve the retrieval split already defined in the receipt strategy:

- list/table views: compact thumbnail artifact
- fullscreen/detail views: canonical display image or approved display derivative
- print/share/customer flows: official PDF or official customer JPG
- offline fallback on crew devices: only cached thumbnail and last-viewed display image, not a hidden second canonical store on the device

### 11.2 Snapshot responsibilities

Every artifact-producing step should record:
- feature snapshot
- runtime config snapshot
- policy snapshot
- control hash / config hash
- renderer or pipeline version where applicable
- capture timestamp and timestamp source where applicable
- `scanSessionId` and `scanId` where applicable

### 11.3 CT visibility

The BB Scan tab should evolve from raw attempt telemetry into attempt-plus-artifact observability.

At minimum CT should be able to show per attempt:
- scan/session identifier
- capture metadata
- source provenance metadata
- AI input artifact
- canonical 2576 artifact
- customer JPG/PDF links or availability state
- archive artifact state while retained
- R2 and Drive pointers
- effective control snapshot/hash
- correlation health and missing-link reason
- failure reason if any artifact is missing

---

## 12. Testing and Verification Plan

### 12.1 Registry and resolver tests

- manifest import idempotence
- feature scope precedence
- runtime config resolution
- policy resolution
- cache invalidation behavior
- fail-closed and fail-open rules where documented

### 12.2 CalExp5 migration tests

- receipt scan still opens and runs
- 4K/default capture behavior still resolves correctly
- fallback path works when resolver is unavailable
- mismatch telemetry is emitted during dual-read phase

### 12.3 Receipt artifact tests

- canonical `filing-2576.jpg` generation
- `sonnet-1568.jpg` generation
- customer JPG/PDF generation from canonical source
- control snapshot stored with artifacts
- R2/Drive pointer persistence
- recovery from Neon + R2 + manifests
- gallery EXIF/source-kind preservation across crop/confirm
- capture mode propagation into Bridge scan and telemetry payloads
- rotation/orientation metadata persistence
- Drive `appProperties` and JPG/PDF metadata embedding
- archive derivative behavior after the migration choice is implemented
- queue replay preserves original capture timestamp, queue lineage, and source provenance
- retrieval contract works for thumbnail, display image, PDF/share, and offline viewed-image fallback

### 12.4 CT smoke tests

- control inventory renders
- edit actions write history and invalidate cache
- BB Scan row drill-down shows artifact/control data
- drift panel catches intentionally seeded orphans
- CT groups attempts by stable correlation key rather than fallback mixed identifiers
- CT shows concrete missing-link reasons when telemetry exists but filed artifacts do not, or vice versa

### 12.5 Telemetry payload tests

- capture telemetry respects size policy for inline payloads
- debug image-heavy events degrade to metadata-first plus artifact reference model when needed
- local telemetry cache handles thumbnail-heavy rows without breaking scan flow

---

## 13. Rollback Strategy

The migration should be reversible phase by phase.

### 13.1 Before CT writes are enabled

Rollback is straightforward:
- stop using the new resolver
- continue reading legacy local paths
- keep registries and manifests as passive inventory

### 13.2 During dual-read

Rollback path:
- disable resolved read path
- keep local `bbScanSettings` fallback active
- keep feature resolution on legacy paths where necessary

### 13.3 After receipt snapshot adoption

Do not roll back the existence of control snapshots once artifacts start storing them.

Instead:
- keep snapshot fields
- change the resolver source if needed
- preserve historical reproducibility

### 13.4 After CT write-path adoption

Rollback path:
- disable CT writes
- preserve read-only visibility
- invalidate caches
- fall back to last stable registry values or frozen policy rows

---

## 14. Open Decisions That Must Be Explicitly Resolved

These remain decisions, not hidden assumptions.

1. Whether the runtime config registries live Bridge-side, CT-side, or in shared Neon ownership with clear operational ownership.
2. Whether manifest import runs at deploy time, startup time, or as an explicit CT admin action.
3. Whether receipt-pipeline controls live under one `calexp5` manifest or a subsystem manifest partition beneath the same app.
4. Where the migration-period control snapshot/hash is stored first:
   - only in `cal_receipts.metadata`
   - in both `cal_receipts.metadata` and artifact rows
   - directly in the long-term asset model
5. How quickly to move receipt canonical artifacts to R2 in code relative to the rest of the control-plane work.
6. Whether CT will proxy receipt thumbnails or use signed R2 URLs for admin image viewing.
7. Whether PDF outputs are mirrored to R2 for faster internal retrieval.
8. Whether overlay/watermark renderer rollout waits for the full asset-row implementation or first lands with transitional metadata persistence.
9. Whether the current archive-4K derivative survives as an internal artifact, is replaced by canonical `2576`, or is removed entirely.
10. Whether receipt Drive uploads should be upgraded in place to use structured `appProperties` through the generic Drive client or through a receipt-specific adapter.
11. Whether control snapshots live only at filing time or also at earlier boundaries such as capture telemetry and scan analysis rows.
12. Whether `scanSessionId` becomes the universal pre-file correlation key for receipt attempts across CT, Bridge telemetry, corrections, queue replay, and artifacts.
13. Whether BB Scan sticky cohort rollout remains a specialized resolver path during migration or is generalized into the universal feature-flag model.
14. How much provenance the offline queue must persist before replay is considered production-correct.
15. Whether local Windows file timestamp repair remains an optional recovery/export step or becomes part of a formal rebuild workflow outside the core control plane.

These are execution choices. They should be tracked as decisions in the delivery backlog, not guessed in code.

---

## 15. Recommended Delivery Order

This is the recommended order because it matches the code and docs already in place.

1. Manifest authoring and drift baseline
2. Registry and resolver foundation
3. CT read-only inventory
4. CalExp5 dual-read adoption
5. Receipt control snapshot + artifact pilot
6. CT write path
7. Legacy local control removal
8. Overlay/watermark rollout
9. Broader ecosystem rollout

This order avoids the two common failure modes:
- building CT editors before the data model exists
- moving receipt artifact behavior before the control plane can reproduce it

---

## 16. Definition of Done

The control-plane program is not done when a few toggles move to CT.

It is done for a given workflow only when all of the following are true:

1. The workflow's controls are declared in a manifest.
2. The controls are imported into registries.
3. The effective controls are resolvable through standard endpoints.
4. CT can view and edit them centrally with audit history.
5. The workflow no longer depends on local hidden admin settings.
6. Artifact-producing steps store the effective control snapshot/hash.
7. Drift checks cover the workflow.
8. Recovery/regeneration works from canonical artifacts plus metadata plus snapshots.

For the receipt pipeline specifically, done means:
- canonical `filing-2576.jpg` is authoritative
- `sonnet-1568.jpg` remains the standard AI input
- R2, Drive, and Neon have clear responsibilities
- CT can show the right images and metadata per scan
- customer-facing JPG/PDF generation is reproducible and centrally governed

---

## 17. Immediate Next Actions

The next implementation steps should be:

1. Author the first manifest set for `calexp5`, `bb-micro-bridge`, and `bb-controltower`.
2. Create the runtime config registry migrations and history tables.
3. Add the read-only control inventory view in CT.
4. Introduce the CalExp5 runtime-config resolver hook for BB Scan tuning in dual-read mode.
5. Add receipt control snapshot plumbing before changing the storage/rendering pipeline further.

That sequence is the shortest path from today's fragmented controls to a system that can safely govern the customer-facing receipt pipeline.
