# Ecosystem Target Architecture

**Date:** 2026-04-06  
**Status:** Working target architecture  
**Scope:** BBInc app ecosystem modernization across desktop, mobile, bridge, DB, ingest, AI, and distributed domains

## Purpose

This document consolidates the conclusions, risks, and target direction established through the app audit, DB review, and operating-model discussion across:

- `TS_Exp5`
- `GS_Receipts`
- `Invoice_Validate2`
- `RevExp5`
- `Chase_Expense_Validator`
- `PorjExp5`
- `Landfill_Surcharge`
- `CalExp5`
- `BB_Data_Manager`
- `BB_Micro_Bridge`
- the Track 0 / Track A / DB architecture package

It is intended to be the single target architecture document for:

- app consolidation
- master-data ownership
- settings centralization
- inbound asset intake
- AI assistant strategy
- projection strategy
- future domain/portal separation

## Executive Summary

The BBInc ecosystem is already transitioning from a collection of apps into a platform.

The platform direction is correct:

- Bridge-centered backend contract
- Neon as app-owned system of record
- richer identity and lineage modeling
- universal asset/document architecture
- projection-first consumers
- CalExp5 as the crew/mobile surface

The problem is that several desktop tools still operate with older assumptions:

- local settings as business configuration
- app-shaped master tables
- provider-shaped integration assumptions
- local denormalized caches treated as quasi-canonical
- duplicated admin and reconciliation logic

The right target is not "merge all apps into one codebase immediately."

The right target is:

1. centralize ownership first
2. centralize settings and master data on the Bridge
3. establish one universal inbound intake platform
4. establish canonical domain tables and versioned projections
5. consolidate desktop UI into one modular shell
6. keep one mobile shell for crew
7. support native Excel/file operations through a dedicated local automation relay

## Current-State Assessment

### 1. Platform direction is ahead of several app implementations

The newer docs and migrations define a more future-safe architecture than several of the current app schemas and local settings stores.

Relevant evidence:

- `C:\Users\samjo\Desktop\OpenAI\DB\UNIVERSAL_PROJECTION_ARCHITECTURE.md`
- `C:\Users\samjo\Desktop\OpenAI\DB\BRIDGE_CONSUMER_NORMALIZATION_PLAN.md`
- `C:\Users\samjo\Desktop\OpenAI\DB\MASTER_DATA_MANAGEMENT.md`
- `C:\Users\samjo\Desktop\CalExp5\docs\DB_ARCHITECTURE.md`
- `C:\Users\samjo\Desktop\CalExp5\docs\migrations\2026-04-05_universal_context_envelope.sql`
- `C:\Users\samjo\Desktop\CalExp5\docs\migrations\2026-04-05_customer_account_lineage.sql`

### 2. `BB_Data_Manager` is useful, but reflects an older master-data shape

`BB_Data_Manager` remains valuable as a donor of admin patterns, but it should not become the long-term schema authority.

Evidence:

- `C:\Users\samjo\Desktop\BB_Data_Manager\src\db\schema.ts`
- `C:\Users\samjo\Desktop\BB_Data_Manager\src\server\routes\sync-runner.js`

Observed characteristics:

- compartmentalized app schema
- older `customers` / `vendors` / `work_jobcodes` / `properties` tables
- older receipt-scanning tables
- `app_settings` and enrichment overlays

### 3. Desktop apps still carry too much local authority

Examples:

- `RevExp5` local settings server:
  - `C:\Users\samjo\Desktop\RevExp5\src\server\settings-server-v1.js`
- `PorjExp5` local settings + binder/esigner settings:
  - `C:\Users\samjo\Desktop\PorjExp5\src\server\server.js`
  - `C:\Users\samjo\Desktop\PorjExp5\src\server\routes\settings.js`
- `Landfill_Surcharge` local settings and document workflow state:
  - `C:\Users\samjo\Desktop\Landfill_Surcharge\server.js`
- `TS_Exp5` still carries provider-shaped configuration and local settings mentality:
  - `C:\Users\samjo\Desktop\TS_Exp5\src\server\services\http-client.js`
  - `C:\Users\samjo\Desktop\TS_Exp5\src\public\js\settings-module.js`

### 4. `GS_Receipts` remains a critical ingest edge

`GS_Receipts` is not a side utility. It is part of the operational platform.

Evidence:

- `C:\Users\samjo\Desktop\GS_Receipts\_Multi-Source\MultiVendorReceiptProcessor-v7.35.gs`
- `C:\Users\samjo\Desktop\GS_Receipts\_Multi-Source\CREW_RECEIPT_FLOW.md`

Observed role:

- supplier email ingest
- crew receipt intake
- file generation and metadata embedding
- Drive/Gmail routing
- context/spatial defaults

## Core Design Decisions

## 1. One Universal Inbound Intake Platform

### Decision

There should be one inbound intake platform for anything and everything inbound.

This means one architecture for inbound assets from:

- crew
- customers
- suppliers
- subcontractors
- admins
- external portals
- browser scrapers
- Gmail/email
- local desktop relay

### Clarification

This does **not** mean one single extraction flow for every asset.

It means:

- one intake framework
- one universal intake envelope
- one canonical normalization layer
- one review/governance layer
- one asset/document graph
- many typed adapters and handlers

### Intake channels

Expected ingress adapters:

- Gmail / Apps Script / GS
- CalExp5 mobile capture
- customer portal upload
- supplier portal upload
- scraper/extension handoff
- API/webhook submissions
- local automation relay
- desktop drag/drop/import

### Intake envelope

Every inbound item should receive a universal intake envelope including:

- `source_system`
- `source_channel`
- `submitted_by_actor_type`
- `submitted_by_actor_id`
- `received_at`
- `asset_type`
- `media_type`
- `bundle_id`
- `source_hash`
- raw payload references
- original file names / source identifiers

### Processing stages

1. ingress
2. classification
3. extraction
4. context resolution
5. review/routing
6. canonical upsert
7. projection publication

## 2. One Agent Platform, Many Role-Specific Assistants

### Decision

All internal and external entry points should become agent-assisted over time.

### Role-specific assistant families

- crew assistant
- customer assistant
- supplier assistant
- admin/operator assistant
- internal backoffice/reconciliation assistant

### Rule

These are not separate AI platforms.

They should share:

- same bridge AI/tool layer
- same canonical DB and projections
- same retrieval and control-plane infrastructure

They should differ by:

- tool scope
- permissions
- prompts
- UI surface
- workflow access

### Implications

The Bridge should be the long-term home for:

- tool execution
- retrieval orchestration
- resolver/decoder services
- policy/approval gating
- memory and audit

## 3. Distributed Domain / Portal Structure

### Decision

The platform should plan for distributed domain and portal separation now.

Likely role/domain surfaces:

- `crew`
- `admin`
- `customer`
- `supplier`

Potential future routing families:

- `crew.*`
- `admin.*`
- `customer.*`
- `supplier.*`

### Rule

Domains should primarily differ by:

- access scope
- projections
- workflows
- branding and UX

They should **not** become separate business-logic stacks unless truly necessary.

### Infrastructure stance

The product and harness/control-plane domains must remain logically separate.

Relevant boundary doc:

- `C:\Users\samjo\Desktop\OpenAI\DB\DATA_DOMAIN_BOUNDARIES.md`

## Target Platform Components

## 1. Bridge

The Bridge should be the canonical backend contract and operational control plane.

Bridge owns:

- QBO/QBT integration
- master-data sync
- aliases and lineage
- customer-account resolution
- review/replay/rescrape workflows
- document and asset metadata contracts
- projections
- operator jobs
- token persistence
- AI tool execution
- settings that affect business logic

## 2. Desktop Admin Shell

The target desktop experience should be one modular shell.

It should absorb:

- finance and reconciliation patterns from `RevExp5`
- project/contracts patterns from `PorjExp5`
- admin/master-data patterns from `BB_Data_Manager`
- receipt/document normalization and review features from `Landfill_Surcharge`

### Desktop module order

1. Receipt / Invoice Ops
2. Revenue / Expense Recon
3. Projects / Contracts
4. Master Data
5. Control Tower

## 3. Mobile / Field Shell

`CalExp5` should remain the mobile/field shell.

It should own:

- crew operations
- receipt capture/history
- timesheets
- GPS and field telemetry
- lightweight review/admin subset
- mobile AI assistant access

It should not become the giant desktop admin shell.

## 4. Local Automation Relay

This should become a first-class platform component.

It is required because:

- estimate generation needs to work in the field
- iPad/browser cannot directly execute Excel COM operations
- native file operations still matter operationally

The local automation relay should own:

- Excel COM estimate generation
- native open/export/print operations
- local watchers
- file-system-native automations
- later PDF/signature/native helper tasks as needed

## Source-of-Truth Model

## 1. QBO / QBT mastery

Current operating assumption:

- QBO is master for most core financial and business entities
- QBT remains master for time/jobcode legacy domains where applicable
- Bridge owns canonical linkage and local enrichment

### Important refinement

Properties being "QBO-mastered" is currently a **design target**, not a proven present-state fact in the current code/data.

That should be treated explicitly during migration planning.

## 2. Customer account model

Use:

- `customer_account` as the billable QBO customer/sub-customer abstraction
- `party` as the real-world person/entity abstraction
- `property` as physical site
- `jobsite` as crew-facing operational site label
- `project`
- `estimate_revision`
- `contract_revision`

Important billing rule:

- `contract_number` is the preferred ultimate commercial anchor

## 3. Rich context envelope

Receipts and documents should carry:

- raw context
- resolved context
- commercial context
- spatial context
- governance/review state

The receipt work established that this richer metadata pattern should generalize to other asset types.

## Table Authority Model

## Canonical domain direction

The long-term canonical layer should be built around:

- `customers` as customer-account master with lineage extensions
- `entity_aliases`
- `entity_relationships`
- `cal_receipts`
- `cal_documents`
- `commercial_records`
- `commercial_record_revisions`
- `commercial_record_lines`
- `document_review_cases`
- `document_review_artifacts`
- `document_rescrape_runs`
- `document_rescrape_items`
- `document_field_diffs`
- `assets`
- `asset_artifacts`
- `asset_links`
- `asset_extractions`
- `asset_notes`

## Projection-only direction

Projection families should serve:

- reconciliation tools
- invoice timelines
- attachment presence/summary
- operator/control-tower views
- workflow queues
- 360 views

Projection rules are defined in:

- `C:\Users\samjo\Desktop\OpenAI\DB\UNIVERSAL_PROJECTION_ARCHITECTURE.md`
- `C:\Users\samjo\Desktop\OpenAI\DB\APP_PROJECTION_FAMILY_QBO_FINANCIALS_v1.md`
- `C:\Users\samjo\Desktop\OpenAI\DB\PROJECTION_REGISTRY_TEMPLATE.md`

## Legacy or transitional tables

These remain useful but should not define the long-term platform:

- older `work_jobcodes` assumptions
- older `properties` assumptions in `BB_Data_Manager`
- older `receipts` / `receipt_line_items` / `receipt_gps_hints`
- local `app_settings`
- app-local settings JSON stores

## Settings Partition

## Bridge-owned settings

These should be centralized on the Bridge:

- master data settings
- alias and lineage configuration
- resolver rules
- vendor defaults
- geocode/place defaults
- document metadata defaults
- review/replay controls
- projection refresh controls
- business feature entitlements
- company/business canonical settings
- AI configuration that changes business behavior

## Local-only settings

These should remain local:

- look and feel
- window/layout preferences
- device capability flags
- local cache and offline preferences
- local relay paths
- purely local feature toggles

## Hybrid during transition

These may remain hybrid temporarily:

- local source-folder paths
- binder/esigner workspace paths
- native preview/open preferences
- local automation relay endpoint registration

## Ingestion Strategy

## Near-term

`GS_Receipts` remains the current supplier-email / Drive ingest edge.

Short-term strategy:

- keep GS as the current ingress adapter
- narrow its responsibility to extraction, candidate context, and relay
- push canonical ID resolution and DB promotion to the Bridge

## Long-term

Move toward a broader intake architecture where Gmail/GS is just one adapter.

Future adapters may include:

- supplier portal upload
- customer portal upload
- direct bridge ingress
- desktop relay email watchers
- agent-assisted submission workflows

## Agent Strategy

## Shared AI layer

AI should be integral to the business platform.

The Bridge should evolve into the shared AI execution layer for:

- extraction
- classification
- context resolution
- retrieval
- review assistance
- operator diagnostics
- workflow assistance

## Role-specific assistants

### Crew assistant

Focus:

- field capture
- timesheet help
- jobsite/project/contract resolution
- operational Q&A

### Customer assistant

Focus:

- uploads
- status questions
- change requests
- contract/document interactions

### Supplier assistant

Focus:

- invoice/bid/change-order submission
- attachment handling
- reconciliation support

### Admin/operator assistant

Focus:

- review queues
- replay/rescrape
- master-data resolution
- control-tower actions
- projection refresh and diagnostics

## App Repartitioning

## Apps that become modules or donors

### `RevExp5`

Best donor for:

- Revenue / Expense Recon shell patterns
- invoice/payment/attachment financial surface

### `PorjExp5`

Best donor for:

- Projects / Contracts module
- estimate/contract authoring patterns

### `BB_Data_Manager`

Best donor for:

- master-data admin patterns
- grid/detail/enrichment workflows

It should be absorbed as a pattern source, not kept as the future shell.

### `Landfill_Surcharge`

Best donor for:

- receipt/document review and normalization workflows

## Apps that stay thin

### `Invoice_Validate2`

Keep as:

- specialized QBO scraper/input tool
- bridge-backed logic client
- transport into desktop receipt/invoice ops

### `Chase_Expense_Validator`

Keep as:

- specialized scraper/input tool
- bridge-backed logic client
- transport into desktop recon and receipt ops

## App that remains separate for now

### `TS_Exp5`

Keep separate initially.

But normalize it first:

- one bridge client abstraction
- no provider-shaped runtime assumptions
- no local tokens-path mental model as business architecture

Then reevaluate later for consolidation.

## Control Tower Direction

The control-tower concept should exist at two levels:

### 1. Bridge/operator control tower

Purpose:

- operator health
- jobs
- leases
- projections
- token persistence
- worker/shared-state pressure

Relevant doc:

- `C:\Users\samjo\Desktop\OpenAI\DB\BRIDGE_OPERATOR_CONTROL_TOWER.md`

### 2. Mobile/CalExp subset

Purpose:

- lightweight admin subset
- field-operational controls
- device/GPS/session/feature visibility

Relevant doc:

- `C:\Users\samjo\Desktop\OpenAI\DB\CALEXP5_CONTROL_TOWER_ARCHITECTURE.md`

## Major Risks

## 1. Older app-shaped tables quietly becoming canonical

This is the biggest structural risk.

Especially:

- `work_jobcodes`
- older `properties`
- older receipt tables
- app-local settings stores

## 2. Mixing customer/property/jobsite/project semantics again

The receipt and invoice work showed how much drift happens when those are collapsed into one field.

The same confusion can recur elsewhere if not guarded.

## 3. App-local settings continuing to carry business logic

This creates:

- drift
- deployment inconsistency
- environment mismatch
- hard-to-trace bugs

## 4. Projection strategy not being formalized

Without formal projections:

- apps keep inventing local caches
- request-time provider dependency stays too high
- cross-app consistency remains brittle

## 5. One giant universal monolith

"One inbound pipeline" must not become:

- one mega-schema
- one mega-agent
- one giant table
- one giant workflow

It must remain typed and layered.

## Phased Modernization Plan

## Phase 1: Platform authority

- define bridge-owned vs local-only settings
- define canonical source-of-truth table map
- stop adding new business settings to local JSON stores
- publish mapping sheets for key source objects

## Phase 2: Receipt / invoice core

- formalize GS as ingress adapter
- move final resolution to Bridge
- establish receipt/invoice workbench as first desktop module
- strengthen canonical financial-document model

## Phase 3: projections

- implement raw source -> canonical -> projection stack
- deliver first finance projection family
- cut main finance/recon consumers onto projections

## Phase 4: desktop shell

- combine receipt/invoice ops
- combine recon
- bring in projects/contracts
- bring in master data
- add control tower

## Phase 5: mobile clarity

- keep CalExp5 bounded as mobile/field shell
- retain only small admin subset

## Phase 6: local automation relay

- centralize Excel COM and native file workflows
- support mobile-originated estimate workflows through relay orchestration

## Phase 7: TS normalization

- normalize bridge contract and settings
- decide later on integration

## Immediate Recommended Deliverables

1. settings centralization matrix
2. table authority map
3. desktop module blueprint
4. receipt/invoice modernization cut plan
5. local automation relay architecture
6. inbound intake platform contract
7. agent role and tool-scope architecture

## Final Position

The long-term BBInc ecosystem should be:

- one universal intake platform
- one canonical bridge/control-plane backend
- one canonical DB with clear domain and projection layers
- one modular desktop admin shell
- one crew/mobile shell
- one local automation relay for native desktop operations
- one shared AI platform with multiple role-specific assistants
- one future-ready distributed portal/domain structure

The system should feel simple at the UI level while moving complexity behind:

- canonical master data
- resolvers
- lineage
- projections
- review governance
- shared AI tooling

That is the architecture that best matches both the current business reality and the future roadmap.
