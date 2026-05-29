# BB Universal Registry — Design Record & Research Synthesis

**Version:** v0.5 (living document)
**Date started:** 2026-05-17
**Status:** ⚠️ DISCOVERY IN PROGRESS — NOT READY FOR PLANNING. More topics to be discussed and added.
**Owner:** Sam @ Bainbridge Builders

---

## 0. Purpose & Status

This document is the single, evidence-based record of the discovery, reconciliation, and research for the **BB Universal Registry** — a universal asset/entity registry and lifecycle-management layer for the Bainbridge Builders ecosystem.

**Rules for this document:**
- Everything here is **evidence-based** — traceable to a file/repo that was read in full, or to a cited web source. No guessing.
- Claims are tagged: **[DECISION]** = locked by Sam during discovery; **[VERDICT]** = evidence-based research conclusion; **[STATE]** = observed current reality in a repo; **[OPEN]** = not yet resolved.
- This is a **living document.** Sections 8 (Open Topics) onward will grow as discussion continues.
- It is **not** an implementation plan. Planning is deliberately deferred.

**Evidence base** (all read in full — see Appendix A): the `OpenAI\DB` architecture corpus (90 docs, ~50K lines); the four repositories `BB_Micro_Bridge`, `BB_ControlTower`, `CalExp5`, `BB_Scan_OpenAI-v4`; and ten web-research passes (Appendix B).

---

## 1. The Vision

Bainbridge Builders is building a robust system to **register assets and manage their lifecycle** across the whole ecosystem.

**Core mental model:** every object the business deals with is a form of **asset / entity**:
- **People** — crew, employees, clients/homeowners, subcontractors, suppliers, architects.
- **Organizations** — including **BBInc itself** as the root `organization` entity.
- **Places** — properties, jobsites.
- **Physical assets** — tools, vehicles, equipment, appliances (the shop, the toolcrib, trucks).
- **Digital assets** — files, documents, plans, 3D models, PDFs, photos, audio, video, emails, scraped public records.

Every asset has **parent/child relationships (lineage)** that change over time, a **lifecycle**, and **provenance**.

The registry is becoming an **agent-native platform**: AI agents run in homeowner-facing and crew-facing apps, produce/classify/store assets, and query the registry — and must be strictly isolated by persona.

---

## 2. Locked Decisions (Discovery)

These were decided by Sam during the discovery dialogue (2026-05-17).

| # | Topic | [DECISION] |
|---|-------|-----------|
| D1 | **Foundation model** | Build the universal **`entity_node`** graph: a thin spine + a runtime **class registry** + typed profile tables for heavy core classes + one universal **relationship/edge table** + a relationship-type registry. (Not a typed-silo extension; not a single fat polymorphic table; not greenfield-from-scratch.) |
| D2 | **Where the spine lives** | In **ControlTower's `ct_bff` schema** — because the identity/party/grant/subscription substrate already lives there. (Re-decided away from an earlier "BB_Micro_Bridge module" answer once that evidence surfaced.) |
| D3 | **Dynamic classes** | New entity classes and relationship types must be addable **at runtime, via ControlTower, with no code deploy.** Delivered by a class-registry table + JSON Schema, **not** by adopting Directus or another product. |
| D4 | **Scope of first build** | **Full** — files + physical assets + people + properties all become entities. |
| D5 | **Lineage** | Both **containment** (asset-in-asset) and **business relationships** (owned_by, renamed_to, merged_into, etc.), **bitemporal**, with **point-in-time "as-of"** queries ("who owned/parented X on date Y"). |
| D6 | **Lifecycle depth** | States + an append-only transition ledger + revision/supersession + **compliance lifecycle** (expiry-driven: certs/COI/W9/warranty/maintenance, traffic-light status, expiring/expired alerts). A full workflow/approval engine is **out of scope** for now. |
| D7 | **Migration approach** | **Parallel build + cutover** — build alongside current tables, backfill, shadow-validate, then cut over. Live apps keep working throughout. |
| D8 | **UI surfaces** | **Operator console** (ControlTower) **+ crew surfaces** (in the crew app). |
| D9 | **Identity resolution** | **Auto-match + human review queue** — confidence-scored matching; high-confidence auto-links, uncertain ones queue for Sam to confirm/merge. |
| D10 | **Intake model** | A deliberate **3-zone pipeline: Incoming → Staging → Outgoing**, with first-class **provenance + per-channel trust**. |
| D11 | **Company entity** | BBInc is the **root `organization` entity**. Producers (homeowners, subs, architects) are themselves entities in the same graph — the graph is self-referential and complete. |
| D12 | **Agent data — two categories** | (A) External public-record scraping (geo/permit data) = a low-trust **producer** that lands as claims attached to an entity; (B) capture-phase AI inference (photo a tool → make/model) = **enrichment** on a crew-produced asset, not a separate producer. |
| D13 | **Ownership/custody** | Never stored as a column on the asset — always a **time-versioned relationship edge**. Transfer = close one edge, open the next. |
| D14 | **Visibility** | A four-input resolution: visibility **classification** + ownership/custody **relationship** + subscription **entitlement** + explicit **time-bounded grant** — evaluated server-side on every read. |
| D15 | **Knowledge/RAG architecture** | Agentic retrieval over a hybrid index, **scoped by the registry**. NOT classic one-shot RAG, NOT GraphRAG. The registry *is* the graph; a semantic layer hangs off it. |

---

## 3. Current-State Reconciliation — What Exists Today

**Headline [STATE]:** This is a **consolidation project, not greenfield.** Roughly 55% of an asset registry already exists — but it is fragmented across **4 repos, 5+ disjoint data stores, 3 temporal mechanisms,** and there is **no universal entity node.**

### 3.1 The reference corpus — `C:\Users\samjo\Desktop\OpenAI\DB`

90 architecture/schema documents, ~50,000 lines. It is **aspirational design, never reconciled.** It contains three-plus competing "universal object" models that were never unified:
- A universal **entity graph** (`entities` / `entity_types` / `entity_relationships` / `events`) — aspirational, never built.
- A **39-table compartment schema** (`BB_PLATFORM_SCHEMA-v2.md`) — typed master tables + JSONB enrichment; partly the shipped reality.
- A single-table polymorphic **`cal_assets`** model (in `RESEARCH_BEST_PRACTICES`/`SIZING_FEASIBILITY_STUDY`).
- A unified **`people`** table (in `_research/RESEARCH_Human_Assets_Architecture.md`).

Glossary terms the corpus mandates: **Principal** (auth actor) ≠ **Party** (real-world actor) ≠ **Entity** (operational graph node) ≠ **Stakeholder**. Key corpus docs: `ENTITY_LIFECYCLE_MODEL`, `ACCESS_AND_ENTITLEMENT_MODEL`, `IDENTITY_AND_PARTY_MODEL`, `MASTER_DATA_MANAGEMENT`, `BB_EFFECTIVE_DATING_ARCHITECTURE`. The corpus repeatedly warns against: one giant monolith table, raw EAV, collapsing identity concepts, lifecycle-as-a-single-status-column, and over-engineering for BB's small scale.

### 3.2 BB_Micro_Bridge — the live backend

[STATE] Fastify 5 / Node 20, Neon Postgres, deployed on Railway (port 3105). ~84,000 lines of source, 56 migrations. **The live registry actually lives here.**

- **No `schema_migrations` table.** Migrations are per-file `.mjs` runner scripts + a manual high-water-mark comment. Two schemas: `public` (master data) and `bb_runtime_app` (projections/operational state).
- **`cal_assets` family** — the real universal asset system, mature: `cal_assets` (SERIAL PK, `asset_class` discriminator, `parent_asset_id` self-FK lineage depth ≤4, `canonical_group_id` + `supersedes_id`/`superseded_by_id` from migration 043, `source_actor_type`, `captured_at`/`received_at`/`effective_at`), plus `cal_asset_media`, `cal_asset_events`, `cal_asset_corrections`, `cal_asset_audit_sessions`. `assets-v1.js` (v1.8.4) provides working CRUD + state-machine lifecycle transitions + parent/child lineage + an event log.
- **`asset-classes.js`** — 19 asset classes, but **hardcoded in code** (adding a class = a code edit + deploy). Each class has a per-class lifecycle state machine.
- **`versioned_field_values`** (migration 027c) — a working **bitemporal** effective-dating table: `effective_from DATE` (business date), `recorded_at TIMESTAMPTZ` (wall clock), `superseded_at`/`superseded_by_id` (soft supersession). `effective_to` is derived, not stored.
- **`master_data_history`** — field-level change log. **`unified_audit_trail`** + **`entity_activity_log`** — system + business event logs. No tamper-evidence (no hash chain).
- **Master tables** — `employees`, `customers`, `vendors`, `work_jobcodes`, `properties`, `company` — pre-date migration 001; only ALTERed since. `enrichment` JSONB pattern. Customers carry `parent_customer_account_id`/`root_customer_account_id` self-FK lineage columns.
- **No universal `entities` / `entity_types` / `entity_relationships` table.** Entity identity is a scattered `(entity_type, entity_id)` string-pair convention across ~10 tables. The `entity_type` enum is **inconsistent** across docs/tables (singular vs plural, `work_jobcode` vs `jobcode`).
- **`visibility.js`** middleware — a thin 2-axis filter only: a `visibility` classification (`internal`/`published`/`shared`) + a property allowlist. The real grant tables live in `ct_bff`, not here. No time-bounded grants.
- **`subscriptions-v1.js`** + `service-plans.js` — home-maintenance *service* subscriptions stored as `cal_assets` rows. **No Stripe here**; no data-access gating.
- **`compliance-cron.js`** — compliance-class assets, expiry tracking, auto-expire, tiered 60/30/14/7-day alerts. Real.
- **data-manager module** — master-data sync (QBO + QBT), enrichment, effective-dating. Identity resolution exists **only** for the QBO↔QBT employee join (a 3-tier email / payroll_id / qbt_id cascade). No generic match/merge engine.
- **`platform-v1.js`** — a **second, disjoint entity graph**: `bb_projects → bb_estimate_revisions → bb_contract_revisions → bb_document_artifacts → bb_signature_envelopes`. Not connected to `cal_assets`.
- **MCP** is the intended primitive bus but is **not built**; the shipped tool surface is custom function-tools.

### 3.3 BB_ControlTower — the operator console

[STATE] React 19 + Vite + a Fastify BFF. ~56,000 lines, ~90% built, deployed on Railway. **Has a real migration runner** (`bff/migrations/run.js`, idempotent, `__hwm__` sentinel, 104 migrations).

- Owns the **`ct_bff`** Neon schema. Tables relevant to the registry: `identities`, `workspaces` / `workspace_members`, `parties` + `contact_points` + `party_contact_points` + `user_party_memberships` + `user_entity_memberships`, `asset_grants`, `asset_visibility_classifications`, `persona_registry`, `app_registry`, `plans` / `features_catalog` / `subscriptions` / `seat_pools`, `access_policies`, `role_templates`, `access_decisions_log`, `drift_findings`, `bid_packages`.
- **Stripe integration lives here** (`subscriptions-v1.js`, `payment-methods-v1.js`, `admin-stripe-v1.js`, crew tiers).
- 8 nav groups; `MasterDataList.tsx` is a working CRUD editor for the 6 master tables + QBO/QBT write-back; `EnrichmentRegistry.tsx` is a per-entity-type field-definition viewer.
- Contains `docs/MASTER_SWITCH_MULTI_PERSONA_NESTED_ASSETS_ARCHITECTURE.md` — a 1,128-line "canonical / ready for implementation" design doc that specifies multi-persona auth, nested assets, 8-tier visibility, lifecycle states — **entirely unbuilt.** It is effectively a prior spec for this same registry effort.

### 3.4 CalExp5 — the crew PWA (BB_Express)

[STATE] React 19 / Vite, an Express server (port 3200) that proxies BB_Micro_Bridge. Crew time-tracking + receipts + tools + GPS.
- **`CalExp5/docs/migrations/*.sql`** (12 files defining `assets`, `commercial_records`, etc.) are a **stale, never-deployed parallel draft** — they are NOT the live schema. The Bridge's `cal_assets` family is the real one. *Disregard the CalExp5 migrations.*
- Two unrelated subscription stacks (a crew-SaaS one via the CT BFF + Stripe; a legacy property-service one).
- `ComplianceDashboard.jsx` treats compliance certs as **child assets** of a person. `auditLog.js` is localStorage-only (not a real audit trail).

### 3.5 BB_Scan_OpenAI-v4 — BB Buddy (the agent)

[STATE] The most recent BB Buddy agent work. A thin client + proxy (`server.js` is bare Node, no framework, no runtime DB). Live app is `index-v4-10.html` v4.10.13.9 — a WebRTC voice agent that identifies tapped objects (Realtime / Gemini / Claude routing). `index-v5-min.html` is a deliberate strip-down Sam is A/B-testing against the heavy build.
- **Agent architecture v7.0** — single-agent **Chat-Supervisor** pattern (a Realtime "Fast Talker" + a Sonnet "Slow Thinker" supervisor), 6 primitives, event-sourced spine. ~30% built; the elaborate specs (MIRIX memory, 9-agent expert panel) are mostly unbuilt. "Specialists" are prompt/voice variants of one supervisor — **not** separate agents.
- **No persona model.** Entirely crew-facing, single-org, global scope — by explicit design (v7.0 §41.1 permanently defers customer-facing surfaces). The `experts` registry table has no `org_id`/`user_id`. A homeowner is treated as a bystander to protect, never a user. **Persona isolation does not exist** and is the architecture's single biggest gap for an agent-native registry.
- **Crew memory (v6.5)** — a markdown "brain": a Git repo with an entity/asset folder topology (`/entities`, `/assets`, `/records`, `/jobs`), YAML frontmatter + prose + wikilinks, three ownership tiers (AUTO-GENERATED / AI-MAINTAINED / HUMAN-CURATED), and it is a *projection* of a Postgres event log (regenerable). It has **no hard partition key** — isolation is by file-path convention. A parallel Postgres-table memory model (MIRIX, v4.10.8 spec) *does* have the key (`crew_member_id` + `scope`) but is unbuilt.
- **`bb-embeddings`** — a real DINOv2 ViT-S/14 microservice → 384-dim vectors → pgvector HNSW (`asset_signatures`). This does **visual instance re-identification** (recognize *this drill*) — **not** document RAG. There is **no text/document RAG anywhere.**
- **Security debt:** live API keys hardcoded in client HTML; the consent gate is stubbed. Both block any homeowner-facing rollout.
- Has its own Neon project (`BBInc_1`, flat `public` schema) *and* writes to a `bbscan_app` schema in the shared Neon — two DB stories.

### 3.6 The fragmentation problem

[STATE] The agent's and the registry's data is currently scattered across **at least five disjoint stores** that were never unified:
1. `cal_assets` family (BB_Micro_Bridge, `public` schema).
2. `bb_projects` graph (BB_Micro_Bridge, `platform-v1.js`).
3. `ct_bff` parties/identities/grants (BB_ControlTower).
4. The markdown "brain" (BB Buddy, a Git repo).
5. `asset_signatures` visual gallery + the BB_Scan `BBInc_1` Neon project.

Plus 3 unreconciled temporal mechanisms (`valid_from/to` edges, `versioned_field_values`, `enrichment_history`). **The Universal Registry is precisely the thing that consolidates all of this.**

---

## 4. Target Architecture

### 4.1 The entity model — a thin spine in `ct_bff`

```
entity_class ──── runtime registry; new classes added via ControlTower, NO deploy;
                  each row carries a JSON Schema governing its attrs
      │
entity_node ───── ONE row per object (person, org, property, tool, file, BBInc…);
                  stable UUID every relationship FKs to; class, display_name,
                  lifecycle_state, visibility_class, provenance, attrs (JSONB)
      ├── typed profiles ──── person/org/property/vendor… — heavy core classes get
      │                       a real class-table-inheritance profile (joined on node_id);
      │                       dynamic on-the-fly classes live only in attrs JSONB
      ├── entity_relationship ── ONE edge table: containment + business graph;
      │                          relationship_type registry; bitemporal
      ├── entity_transition ──── append-only lifecycle ledger
      ├── entity_event ───────── business timeline ledger
      ├── provenance ─────────── intake envelope + SHA-256 content address
      ├── identity_link ──────── external IDs (qbo/qbt/stripe) + merge queue
      ├── access ─────────────── 4-input visibility policy, RLS-enforced
      └── audit ──────────────── hash-chained, trigger-populated, append-only
```

[VERDICT] Hybrid model: a thin universal spine + a runtime class registry (JSON Schema per class) + class-table-inheritance typed profiles for heavy known classes + JSONB attrs (GIN-indexed) for dynamic classes. EAV is rejected as an anti-pattern. Reference: Len Silverston's *Data Model Resource Book* (the Party Model).

### 4.2 Lineage & bitemporal

[VERDICT] One `entity_relationship` edge table covers both the containment hierarchy and the business-relationship graph (distinguished by a `relationship_type.is_containment` flag). Traversal via adjacency list + recursive CTEs. **Apache AGE is rejected** (not available on Neon). Edges are bitemporal: `effective_from`/`effective_to` + `recorded_at` + soft supersession. Keep BB's existing `versioned_field_values` design (it is sound) — the **one gap to fix**: add a `tstzrange` column + a GiST exclusion constraint (`btree_gist`) so the database itself rejects overlapping validity periods. Ownership/custody transfers are edge close+open; "who owned X on date Y" is an as-of query.

### 4.3 Lifecycle

[VERDICT] A database-driven state machine: an append-only **transition-log table** (one row per change, `most_recent` boolean, reason/actor/time) + a `(state, event, next_state)` mapping table. **Temporal.io is rejected** as overkill. Revision/supersession reuses the existing `cal_assets` `canonical_group_id` machinery. Compliance lifecycle generalizes the existing `compliance-cron` (expiry-driven states + tiered alerts) beyond `cal_assets`.

### 4.4 Identity resolution / MDM

[VERDICT] **Build** a deterministic-first matcher (exact join on email / phone / tax-ID / external IDs) + a fuzzy confidence score (Talisman — native JS) + a **two-threshold human review queue**. **Splink/Zingg/dedupe are rejected** (Python; built for thousands–millions of records; BB has <2,500 canonical entities with strong QuickBooks IDs). Golden record = **field-level survivorship**, federated (each field draws from whichever source is authoritative for it; source IDs + provenance preserved).

### 4.5 Access / visibility / entitlements

[VERDICT] **Build a Postgres-native policy layer with Row-Level Security as the engine-enforced backstop.** OpenFGA/SpiceDB are rejected (Zanzibar systems keep their own tuple store → a permanent dual-write sync burden; time-bounded grants are *easier* in plain Postgres). Cerbos (stateless sidecar, no extra DB) is the only viable "buy" — worth reconsidering once persona/policy complexity is high. The 4-input check (classification + relationship + entitlement + time-bounded grant) resolves in one SQL function. Subscriptions: **Stripe Entitlements** as the plan→feature source of truth, **mirrored** into a BB table; the access check is `entitlement_present AND payment_state_ok` (Stripe keeps subscriptions `active` while unpaid — BB must layer its own grace-period policy).

### 4.6 Provenance & the 3-zone intake pipeline

```
PRODUCERS (each an entity)   →  INCOMING  →  STAGING  →  OUTGOING
crew · homeowners · subs ·       capture +    classify·    publish/post/
architects · agents · QBO/QBT    envelope     extract·     deliver/e-sign
                                 (SHA-256)    resolve·
                                              dedup·
                                              review (confidence-gated)
```

[VERDICT] **Build** the 3-zone pipeline (a few Postgres tables). **Content-addressable storage** (SHA-256 over R2/Drive) gives dedup + integrity + stable identity. Provenance = a **W3C-PROV-shaped** envelope (Entity/Activity/Agent), HMAC-signed sidecar, with a per-channel **trust level**. Agent-scraped data is low-trust and cannot auto-promote past staging. The agent is the primary intake client — so intake is **async, queued, idempotent, confidence-gated**. Audit = a **hash-chained, trigger-populated, append-only** table (HMAC key held outside the DB). Event sourcing is rejected as overkill.

### 4.7 The knowledge / RAG layer

[VERDICT — critical assessment, 2026 state of the art]

- **Retrieval is unavoidable** — gigabytes per property is 2–3 orders of magnitude beyond any context window. Long-context "no-RAG" is not in contention as the store.
- **Classic one-shot RAG is the floor, not the target.** The 2026 default is **agentic retrieval** — retrieval as a tool the agent calls iteratively (plan → retrieve → reflect → re-retrieve → verify), framed as context engineering.
- **GraphRAG is rejected for BB.** GraphRAG spends most of its cost using an LLM to *manufacture* an entity graph from documents — BB is already building that graph (the registry). Building GraphRAG would duplicate the registry with a noisier, non-canonical copy.
- **The architecture is "two stores, one knowledge system":** the **registry is the structured graph**; a **semantic layer** (document chunks in pgvector) hangs off it, and **every chunk carries an `entity_node_id` foreign key**. The agent routes between two tools — `query_registry` (deterministic facts/relationships) and `search_documents` (interpretation/narrative, entity-scoped).
- **Scale:** pgvector on Neon, ONE embeddings table `PARTITION BY HASH(property_id)`, per-partition HNSW index — so every query searches only one property's slice. The ceiling (pgvectorscale/DiskANN >10M vectors) is **not available on Neon** — a distant, known migration, non-blocking now.
- **Isolation:** per-property partition + **forced Row-Level Security** (property + persona). No managed RAG service enforces isolation at the engine level — for a paid product where a cross-customer leak is existential, RLS is non-negotiable.
- **Ingestion (fire-and-forget):** thin dropzone → R2 + a `documents` row (`status='received'`) + enqueue → return. Async workers fan out by file type. **Buy the hard ML** — Mistral OCR (PDFs; Reducto for messy scans), AssemblyAI/Deepgram (audio), Firecrawl (URLs), Voyage/Jina (multimodal embeddings). **Build only** the dropzone, queue orchestration, and a per-document status state machine. Content-hash for dedup/idempotency.
- **Robustness non-negotiables:** the agent verifies before answering (silent retrieval misses are the worst failure for a paid product); the agent can see ingestion status (answer "still processing" not "I don't know").
- **Cloudflare AutoRAG / AI Search** is a credible Plan B (BB lives on R2) but is open beta, unpriced, capped at 5,000 instances — spike it, don't bet the subscription product on it.
- This document RAG is **separate from and complementary to** the existing `bb-embeddings`/DINOv2 service (visual object recognition). Both hang off the registry.

### 4.8 Agent integration

[VERDICT / DECISION] The registry is an **agent-native platform**. Three knowledge layers, all governed by one access layer: the **structured registry**, the **semantic RAG layer**, and **agent memory** (the markdown "brain", which becomes a scoped, versioned `agent_memory` asset class).
- **Persona isolation is foundational, not a late phase** — every entity, chunk, and memory file carries a persona/identity/workspace scope; every retrieval is pre-filtered by it; RLS is the backstop. BB Buddy today has *no* persona isolation — this is net-new.
- The registry exposes itself as a **scoped MCP tool surface** (per persona). The runtime class registry makes the registry self-describing to agents.
- Agents are dual actors — **producers** (intercept/classify/store, with dual attribution: agent + the human it acted for) and **consumers** (navigate/retrieve).

### 4.9 Operational Control Plane

[STATE] The corpus doc literally named `UNIVERSAL_CONTROL_PLANE_MODEL.md` governs only *settings/flags/config/policies* (6 control families) — that is **one** control family, not the whole operational control plane. The operational machinery is spread across the corpus's observation→signal→action pipeline (`OBSERVATIONS_AND_TELEMETRY_MODEL`), projection-refresh model, the **Workflow & Approval** governed-write model, and the scheduling/dispatch model. ControlTower v2 is the operator console. No single corpus doc defines an automated control loop over the registry; subscription-churn is not modeled anywhere in the corpus.

[VERDICT] Managing ongoing complexity — 100 users changing subscriptions daily, continuous asset ingestion, BBInc production, a supplier marketplace — is achieved with **one structural split + one repeating pattern.**

**Three planes** (a logical partition of one Fastify codebase + one Neon DB):
- **Data plane** — the user request path; reads served from projections.
- **Control plane** — background workers (own process) that keep the system correct over time.
- **Management plane** — ControlTower (the operator console, ~90% built — Freshness/Drift/Operations/Operator-Jobs tabs).

**The reconciliation loop** is the core pattern (Kubernetes-controller model): continuously compare desired vs observed state and act to close the gap. **Level-triggered** (re-reads state, self-heals — not event-replay) + edge-triggered (webhooks for speed). ~6 reconcilers, each idempotent, scheduled via `pg_cron`, single-instance via leases: subscription↔entitlement, projection freshness, marketplace sync, BBInc production, identity merge, compliance expiry.

**Reliability spine:** transactional outbox; idempotency everywhere; retries with backoff+jitter + circuit breakers (**Cockatiel** — already in use); DLQ; leases. Job queue = `pg-boss`; scheduling = `pg_cron`; a Postgres event-log table as the spine. Rejected as overkill: Temporal, Kafka, full event sourcing.

**Observability + SLOs:**

[STATE] BB has already built substantial telemetry, and it splits in two:
- **Domain telemetry (~70–75%)** — freshness events, drift observations, conflict log, sync health, `unified_audit_trail`, `bb_events`, feature-usage events, BB Buddy tap/ML-training capture. Mature, Postgres-backed (`bb_runtime_app` schema, retention policies), trace-correlated, surfaced in ControlTower's Freshness/Drift tabs.
- **Infrastructure telemetry (~25–30%)** — incomplete. Only a `trace_id` correlation field (no real spans); hand-rolled Prometheus output with gauges/counters but **no histograms**; in-memory metrics that reset per-replica on redeploy; two `/metrics` endpoints that nothing scrapes; ad-hoc email alerting. The 4 apps use **5 fragmented hand-rolled client transports** (CalExp5 + BB Buddy have zero standard tooling).
- Existing standard tooling: BB_Micro_Bridge has the **full OpenTelemetry SDK installed but switched off** (`OTEL_ENABLED=false`); BB_ControlTower runs `prom-client` (real histograms) + Sentry; CalExp5/BB Buddy have none. The stack is asymmetric and half-built.

[VERDICT] **Do NOT port telemetry out to OpenTelemetry/Grafana** — that misframes the problem. Domain telemetry stays where it is (it is the management plane's data; Grafana cannot model "freshness event" or "projection drift"). Adopt OpenTelemetry **additively** as the instrumentation standard for *infrastructure* telemetry only: enable the Bridge's already-installed OTel exporter (a flag, not a port); standardize all 4 apps on the OTel SDK to retire the 5 fragmented transports; make the existing `trace_id` *become* the OTel trace ID; add real histograms + a backend + alerting. Then ≤5 SLIs (API availability, API latency, projection freshness, reconciler correctness), 99.9% default, 4-week window, multi-window burn-rate alerting, symptom-over-cause, every page actionable, tiered error-budget policy.

[OPEN] Backend choice — Grafana Cloud (Tempo+Mimir+Loki, OTLP-native) vs standardizing on Sentry (already wired in ControlTower, ingests OTLP). See §8.

**Proactive layer:** the corpus's observation → derived-signal → alert-candidate → action-item → notification chain. Drift jobs emit early-warning *tickets*. Self-healing for reversible/deterministic/frequent issues; escalate irreversible/novel; automation failures raise incidents.

**Subscription churn:** 3–7 day grace period; escalating dunning (24h/3d/7d/14d); instant proration. Access check = `entitlement_present AND payment_state_ok` (Stripe keeps subscriptions `active` while unpaid). Offer pause as a churn-saver.

**Marketplace ops:** the corpus's dispatch model (`work_request → dispatch_opportunity → ranked candidates → assignment`); risk-tiered supplier onboarding/verification; SLAs in contracts + continuous monitoring; continuous trust scoring; automated payout reconciliation. Primary health metric = **liquidity / match rate** (per side, rolling 7-day, segmented) — not GMV.

**AI-agent-assisted ops:** "engineers govern, agents execute." Agents for triage/root-cause suggestion in shadow mode first; remediation human-gated ~90 days; never irreversible actions unsupervised.

[STATE] The control plane is ~40% designed (corpus) and ~30% built (ControlTower console; Bridge operator-jobs / worker-leases / Cockatiel / drift tables; the Workflow & Approval model). Consolidation, not greenfield.

### 4.10 Testing & Rollout Strategy

[STATE] A paradox: **BB_Micro_Bridge already has best-in-class testability hooks** — `BRIDGE_MODE=harness`, `fault-injection.js`, an injectable clock (`clock.js`), breakpoints, a `_harness-v1.js` endpoint family (state dump, fault arm, `trace/:traceId`), an `X-Sandbox-Mode` flag (migration 002), webhook traffic simulators (`gps-sim`, `bouncie-sim`), ~840 unit tests + integration tests + TZ-matrix CI. But: those hooks exist in only **1 of 4 repos**; CalExp5 has broad tests but **no CI** (only a Husky hook); BB_Scan has **zero tests**; the `Auto_Test_Harness` "Track 0" plan and the `BB_Harness` repo (described in Bridge docs) are designs that were **never built**; staging was removed (~2026-04-18) — production-only. ControlTower has the only cross-repo e2e (`tests/auto/`) and the most mature CI (post-deploy smoke + automatic Railway rollback).

[VERDICT] Strategy = **propagate the hooks already designed, build the harness, make the registry inherit them.**
- **Test shape** — honeycomb: thin unit, fat integration (Testcontainers + real deps), thin ruthless e2e (~5–10 journeys). Static analysis as the foundation.
- **Cross-plane testing** — **contract tests are the backbone**: Pact (consumer-driven) for sync boundaries, AsyncAPI/message-pact for async (reconciliation events, agent queues, outbox), a `can-i-deploy` CI gate. Plus a small cross-plane journey set threaded through the Bridge `_harness/trace` seam. The control plane gets **state-convergence tests** (seed drift → run reconciler → assert heal) — also the prime chaos target.
- **Traffic simulation** — k6 multi-persona scenarios (registry-browse, asset-ingest, subscription-churn, marketplace, control-plane-write), all 4 profiles (load/stress/spike/soak), SLO-gated in CI. Generalize the Bridge's existing webhook simulators.
- **Diagnosis** — one trace ID through every plane (the OTel work, §4.9) links a failed test to the exact span; reuse Track 0's result-classification taxonomy (`deterministic_fail`/`policy_fail`/`golden_miss`/`llm_warn`/`pass` with blocks_build/blocks_release flags).
- **Agent/RAG testing** — evals not assertions: golden datasets, RAG triad (context relevance / groundedness / answer relevance), component-level evals, validated LLM-as-judge, statistical-significance regression, CI-gated. Track 0's AI-eval layer design is reusable.
- **Chaos** — pragmatic: ToxiProxy + quarterly Game Days, targeting the reconciliation loops.

**Design-for-testability hooks to bake in NOW** (registry must inherit; propagate to all 4 repos): `testMode`/sandbox flag in request context; injectable clock; harness-mode endpoints; fault injection; idempotency keys; trace IDs (→ OTel trace ID); hexagonal ports for every external system (Stripe/QBO/QBT/LLM/R2); injectable IDs/randomness; a `buildApp()` DI factory per service; expand/contract migrations; reconcilers with a dry-run mode. Triad most painful to retrofit: **sandbox flag + hexagonal ports + injectable clock** — do those first.

**Staging & rollout** — no permanent staging tier (its removal was defensible — static staging drifts from prod). Use **Railway PR/preview environments + Neon database branching** (copy-on-write, ~1s, near-zero cost) for ephemeral per-PR environments; one on-demand full-data Neon branch for migration/load testing. Rollout = flag-driven **ring releases** (internal → ~5 canary → ~20 beta → all 100, each ring deliberately diverse) with guardrail metrics + automated threshold rollback (ControlTower already auto-rolls-back on smoke failure — generalize it). The Bridge's `deploy_mode_floor` + `rollout_pct`/cohort machinery already exists.

[STATE] Immediate gaps: CalExp5 has no CI; BB_Scan has zero tests; the harness was never built; testability hooks are Bridge-only.

### 4.11 Agent Development Governance

[STATE] BB builds and maintains the platform largely via AI coding agents (Claude Code + the Rcodex multi-agent system + Codex). Recurring failure: agents make local "surgical" band-aid fixes that satisfy the immediate error but violate global invariants and break the wider codebase. Inventory finding: BB has **rich advisory governance** (global `CLAUDE.md` v7.9, `AGENTS.md`, 12 skills, 4 Rcodex agent definitions, the orchestrator) but **thin enforcement** — effectively ONE machine-enforced architectural fitness function (`BB_Micro_Bridge/scripts/lint-replica-safety.mjs`, CI-wired, born from a real incident), ESLint style gates, and four Claude Code hooks that are **all non-blocking** (`exit 0`). The anti-band-aid rule itself is pure prose. BB_ControlTower has no `CLAUDE.md`/`AGENTS.md` and its CI lint is `continue-on-error`; `CalExp5/docs/CLAUDE.md` is stale.

[VERDICT] **Docs advise; machines enforce.** Move every must-hold invariant out of prose into a machine gate; keep docs lean and *local*. Two corollaries: **locality** (a constraint's reliability ∝ its proximity to the code being edited) and **consequence** (informing changes the *probability* of compliance; enforcing changes the *possibility*). Documentation alone fails because it competes for a finite, decaying attention budget and carries no consequence when ignored — and a large multi-repo platform is exactly the high-complexity environment where agents reward-hack/band-aid hardest (METR/Anthropic 2025 research: exploits surge past a complexity threshold).

**INFORM** (raise probability): directory-scoped `CLAUDE.md` (closest file wins); co-located ADRs in `docs/decisions/` capturing the *why* of each decision (the `REPLICA_SAFETY.md` incident→ADR→lint chain is the model); `// INVARIANT:` comments at the exact seam; routing skills that auto-load the relevant architecture section when an agent touches an area; fix stale per-repo docs; give BB_ControlTower a `CLAUDE.md`/`AGENTS.md`.

**ENFORCE** (remove possibility — the half BB is missing): per-repo **architectural fitness functions** replicating the `lint-replica-safety.mjs` pattern (encode each must-hold invariant as a CI-wired static check); **boundary/dependency lint** (dependency-cruiser, eslint-plugin-boundaries) for plane/layer boundaries; **anti-band-aid lint** set to `error` (ban `eslint-disable` abuse, `@ts-ignore`/`as any`, empty catches, `.skip`/`.only`) plus a CI diff gate that **new suppressions must = 0**; **blocking `PreToolUse` hooks** (`exit 2`) on `--no-verify`, forbidden paths (Mini_API_Bridge, migrations, frozen contracts, shared schemas), and overwriting versioned files; **frozen contracts** (TypeBox/Zod schemas agents cannot change); **CODEOWNERS + required review** on high-blast-radius paths; fix `continue-on-error` lint and per-clone hook fragility.

**PROCESS:** root-cause task framing ("write a failing test that reproduces it, then fix" — a bug fix must add a test, machine-checked); plan mode first for non-trivial changes; a machine-checked definition-of-done (no new suppressions, root cause, test added — make Track 0's "DONE WHEN" + 3-zero a gate); subagent scoping + a `Stop` hook running the full validation suite; gate messages must be **actionable** (say what to fix, point to the ADR).

[VERDICT] **The architecture must be executable, not just documented.** An invariant that lives only in a document is, for an agent, optional.

**Agent governance is a standalone, NOW initiative — not a registry deliverable.** The band-aid problem is a daily pain on the *current* codebase; it is being actioned independently of (and ahead of) the registry build. See the action plan: `C:\Users\samjo\Desktop\Claude\BB_ARCHITECTURE_GUARDRAILS.md` (capture-and-enforce as one act; the incident-mined ADR + fitness-function pattern; the baseline/ratchet; Phase 0 universal gates this week). The registry build, when it happens, **inherits and extends** those gates — it adds a registry fitness-function suite (e.g. "no entity write bypasses the spine", "every chunk carries `entity_node_id` + scope", "ownership is never a column", "no cross-plane import"), co-located ADRs, a routing skill, and PreToolUse guards on its frozen contracts.

---

## 5. Buy-vs-Build Research Verdicts

[VERDICT] BB stack: Node 20 + Fastify + Neon Postgres + Railway + Cloudflare R2/Workers. Nearly every "can we buy this" answer is **build Postgres-native** — the mature OSS options target 100–1000× BB's scale and add operational weight exceeding the registry itself.

| Concern | Verdict | Rejected (and why) |
|---------|---------|--------------------|
| Authorization / visibility | **Build** Postgres policy + RLS | OpenFGA, SpiceDB (dual-write sync burden); Oso (deprecated). Cerbos = possible later. |
| Identity resolution | **Build** deterministic + Talisman + review queue | Splink, Zingg, dedupe (Python; need thousands of records) |
| Bitemporal / effective-dating | **Keep + harden** `versioned_field_values` | XTDB, the `periods` extension |
| Entity data model | **Build** thin spine + class registry | EAV (anti-pattern); Apache AGE (not on Neon); Directus/Strapi/Baserow (poor fit) |
| Intake / lifecycle / provenance | **Build** — all small | Temporal (overkill); Pimcore/DAM platforms (separate stack) |
| Subscriptions / audit | **Build** thin glue | Feature-flag tools (no billing sync); event sourcing (overkill) |
| Knowledge / RAG | **Build** agentic retrieval on pgvector | GraphRAG (duplicates the registry); dedicated vector DBs (premature); managed RAG (weaker isolation). Buy parsing/transcription/embedding APIs only. |
| Control plane / ops | **Build** Postgres-native reconcilers + `pg-boss` + `pg_cron` + Cockatiel; OTel + Grafana Cloud | Temporal, Kafka, full event sourcing (overkill at this scale) |
| Testing / harness | **Build** the harness on existing Bridge hooks; honeycomb + Pact contract tests + Testcontainers; k6; agent/RAG evals; Railway PR envs + Neon branching | Heavy E2E suites (fragile); full Chaos Monkey (overkill) — use ToxiProxy + Game Days |
| Agent governance | **Build** machine gates — fitness functions, boundary lint, anti-band-aid lint, blocking PreToolUse hooks, CODEOWNERS, co-located ADRs | Relying on prose rules / advisory docs alone (proven insufficient — agents band-aid past them) |

---

## 6. Scale Assumptions

[STATE — corrected by Sam 2026-05-17] The system targets **100 users of diverse type**, **up to 10,000 live assets** at any time, and a **3-year backlog of documents to import**. Each property accumulates **gigabytes** of documentation; appliances carry manuals/service records.

[VERDICT] This is **medium scale, not large.** Projection: low single-digit millions of rows total (~150–300K `entity_node`; 1–5M in the hot append-only tables; potentially low-millions-to-tens-of-millions of embedding *chunks*). ~5–15 GB on Neon (paid tier). Postgres handles this comfortably **with**: time-based **partitioning** of the hot append-only tables (`entity_event`, `audit`) from day one; per-property partitioning of the embeddings table; a designed index strategy (`jsonb_path_ops` GIN + partial + expression indexes); real **search** (Postgres FTS) as its own phase; and a **load-test gate** before rollout. The 3-year document import is a **dedicated workstream** (batch pipeline, content-addressed dedup, confidence-tiered auto-accept — you cannot human-review ~100K documents).

---

## 7. Out of Scope (deliberate)

- A full workflow/approval engine with idempotency/outbox (lifecycle tier 4) — deferred.
- Multi-tenant `tenant_id` / RLS-for-tenancy beyond persona/workspace scoping.
- A customer-facing marketplace.
- Raw file *bytes* in Postgres (R2/Drive only; the registry holds metadata + content-addressed pointers).
- 3D-model geometry understanding (store the file + metadata/thumbnail only).
- Adopting OpenFGA / SpiceDB / Splink / Temporal / Directus / Pimcore / GraphRAG.

---

## 8. Open Topics — To Be Discussed

⚠️ Discovery is **not complete.** The following are known-open; Sam has indicated there are **more topics** to add. Planning will not begin until this section is resolved.

Known-open items so far:
1. **Sequencing** — the order of consolidating the 5+ fragmented stores into the registry; what migrates first.
2. **The homeowner-facing app** — BB Buddy is crew-only today; there is no homeowner app yet. Its scope, stack, and relationship to the registry are undefined.
3. **Security debt** — hardcoded API keys in client HTML and the stubbed consent gate must be resolved before any homeowner-facing rollout.
4. **The two BB Buddy memory models** — markdown "brain" (v6.5) vs Postgres MIRIX (v4.10.8) — must be reconciled; which is canonical.
5. **DB-home reconciliation** — BB_Scan's separate `BBInc_1` Neon project vs the shared Neon; `cal_assets` in BB_Micro_Bridge vs the spine in `ct_bff`.
6. **Vocabulary** — "asset" vs "entity"; the existing `assets`/`asset_type` terminology already in use for digital files.
7. **Cost modeling** — LLM/agent API costs, embedding costs, Neon tier, parsing-API costs at the 3-year-import volume.
8. **Notifications / communications layer** — referenced in the corpus, not yet discussed for the registry.
9. **`BB_Micro_Bridge` change policy** — it is shared infrastructure; what changes are permitted.
10. **Observability backend** — Grafana Cloud (Tempo/Mimir/Loki) vs standardizing on Sentry (already in ControlTower) as the OTLP backend. (Telemetry approach itself resolved — §4.9: keep domain telemetry, adopt OTel additively for infrastructure telemetry.)
11. **Feature-flag / progressive-delivery tooling** — adopt a hosted service (Unleash / Statsig / GrowthBook / Flagsmith) vs extend the existing Bridge `app_features` + `rollout_pct`/cohort machinery. (Testing/rollout approach itself resolved — §4.10.)
12. **Build the harness** — the `BB_Harness` repo (Track 0 design) was never built; the registry effort should build it on the Bridge's existing hooks. (Action, not an open question — noted here for sequencing.)

*(Additional topics to be appended as discussion continues.)*

---

## Appendix A — Evidence Index (what was read, in full)

- **`OpenAI\DB` corpus** — all 90 documents, ~50,000 lines (foundation, architecture, schema, operations, bridge, buddy, deployment, gps, scan, research, archive).
- **`BB_Micro_Bridge`** — all 56 `.sql` migrations + `sql/`; asset/entity/data routes (`assets-v1`, `assets-lookup-v1`, `data-v1`, `tools-v1`, `vehicles-v1`, `properties-v1`, `platform-v1`, schemas, `asset-classes.js`, asset clients); access/subscription/data-manager layer (`visibility.js`, `subscriptions-v1`, `service-plans`, portal/auth/session plugins, `data-manager` module, audit module, `compliance-cron`, `admin-writeback-v1`).
- **`BB_ControlTower`** — repo structure, `src/` + `bff/` + `bff/migrations/` (104), key docs incl. `MASTER_SWITCH_MULTI_PERSONA_NESTED_ASSETS_ARCHITECTURE.md`.
- **`CalExp5`** — 12 `docs/migrations/*.sql`, `server.js`, the asset frontend (slices, components), 17 design docs.
- **`BB_Scan_OpenAI-v4`** — `BBB_2/` agent architecture (~14K lines incl. Agent-Architecture-v7.0, Crew-Memory-v6.5, Markdown-Templates, Spatial-Awareness, Specialists), `docs/` embedding/vision/memory specs (~14K lines), `db/*.sql`, `server.js`, `worker/`, the current app HTML.

## Appendix B — Web Research Sources (2026 state of the art)

Ten research passes were run. Single best references per area:
- **Authorization** — PostgreSQL Row-Level Security docs; Nile "multi-tenant RLS" pattern.
- **Entity resolution** — Splink methodology docs (MoJ); field-level survivorship (Profisee/Data Ladder).
- **Bitemporal** — PostgreSQL range types + GiST exclusion constraints; Martin Fowler "Bitemporal History".
- **Entity data model** — Len Silverston, *The Data Model Resource Book* Vol. 1 (Party Model).
- **Intake / state machine** — GoCardless "database state machines"; W3C PROV-DM.
- **Subscriptions / audit** — Stripe Entitlements docs; PostgreSQL wiki `audit_trigger_91plus` + HMAC hash-chaining.
- **RAG (general)** — Anthropic "Effective Context Engineering for AI Agents".
- **RAG (multimodal ingestion)** — Reducto document-parser comparison; Ragie audio/video RAG; ColPali/ColQwen.
- **RAG (scale/isolation)** — pgvector multi-tenant + RLS (Nile, Pedro Alonso); Cloudflare AI Search docs.
- **RAG (GraphRAG)** — "Do You Really Need GraphRAG?" (Towards Data Science, Nov 2025); HybridRAG paper; Microsoft LazyGraphRAG.
- **Control plane / reconciliation** — Kubernetes Controllers; HashiCorp Well-Architected (control/data/management planes); O'Reilly *Cloud Native Infrastructure* ch. 4.
- **Reliability** — microservices.io Transactional Outbox; Google SRE Workbook (Implementing SLOs, Alerting on SLOs); `pg-boss`.
- **Observability / proactive ops** — OpenTelemetry; Google SRE (Monitoring Distributed Systems); Azure Well-Architected (self-healing).
- **Subscription / marketplace ops** — RevenueCat subscription-lifecycle guide; Mirakl marketplace best practices; Kissmetrics marketplace analytics (liquidity / match rate).
- **Testing strategy** — Spotify "Testing of Microservices" (the honeycomb); Pact (consumer-driven contract testing); Grafana k6 (load/traffic simulation); EvidentlyAI (RAG/agent evals); Google Cloud chaos-engineering guide.
- **Staging / testability** — Railway PR Environments docs; Neon database-branching docs; Google SWE Book ch.13 (design for testability); hexagonal architecture (ports & adapters); Stripe automated-testing guide.
- **Agent governance** — METR "recent reward hacking" research; Anthropic "Effective context engineering for AI agents"; Continuous Architecture fitness-functions practice; dependency-cruiser rules reference; Claude Code hooks guide.

(Full URL list retained in the conversation research record.)

---

*Updated: 2026-05-17 | Status: Discovery in progress — not ready for planning. Living document.*
