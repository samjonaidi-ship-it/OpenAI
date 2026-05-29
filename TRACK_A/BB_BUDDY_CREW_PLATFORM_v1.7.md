# BB Buddy Crew Platform | A0–A3 | v1.7 | 2026-04-03 | FINAL FOR BUILD

**This is the committed crew-only product roadmap.**  
Homeowner functionality remains design-only in `BB_HOME_PLATFORM_EXPANSION.md`.

---

# 0. Canonical Status

This file is the **Track A execution doc**.

## Reading order for Track A agents
Read in this exact order:

1. `BB_BUDDY_CREW_PLATFORM_v1.7.md` (this file)
2. `BB_BUDDY_CORE_ARCHITECTURE.md`
3. `BB_BUDDY_TRACK_0_DELIVERY_v1.8.md` (dependency gates + validation mapping)
4. `BB_Buddy_Harness_Control_Plane_API_and_Data_Contracts_v1.1.md` (only if implementing Track A-visible harness/control dependencies)
5. `BB_Buddy_Harness_Control_Console_UI_Spec_v1.1.md` (only if implementing Track A-visible harness UI dependencies)

## Authority split
This file is canonical for:
- A0–A3 scope
- Track A sequencing
- Track A done-when criteria
- crew-only boundaries
- phase dependencies

This file is **not** canonical for:
- Track 0 control-plane public contracts
- Track 0 final console UI details
- Track B design scope
- low-level Track A MCP public contracts

Track A MCP/public contracts remain owned by the frozen contracts appendix in Core Architecture.

---

# 1. Track A Objective

Build the crew-only product in four phases:

- **A0** SDK evaluation on iOS Safari
- **A1** MCP tool layer on Bridge
- **A2** crew-only knowledge system
- **A3** crew-only operations assistant

Track A must remain:
- single-tenant
- crew-only
- non-homeowner
- validated by Track 0 before shipping

---

# 2. Execution Boundary Matrix

| Feature | Phase | Status | Build Now? | Notes |
|---|---|---|---|---|
| OpenAI Agents SDK | A0 | Committed | YES | framework migration test |
| MCP tool layer | A1 | Committed | YES | server-side tool execution |
| RAG crew docs | A2 | Committed | YES | SOPs, safety, pricing, manuals |
| Tribal knowledge capture | A2 | Committed | YES | crew memory + RAG |
| Financial queries | A3 | Committed | YES | QBO/QBT → SQL agent |
| Crew scheduling | A3 | Committed | YES | CalExp5 integration |
| Crew auth/permissions | A3 | Committed | YES | PIN → role scope |
| Write-back workflows | A3 | Committed | YES | idempotency + approvals |
| Stripe billing | — | FORBIDDEN NOW | NO | future homeowner platform |
| Jobber scheduling | — | FORBIDDEN NOW | NO | future homeowner platform |
| Homeowner scheduling | — | FORBIDDEN NOW | NO | future homeowner platform |
| Property intelligence | — | FORBIDDEN NOW | NO | future homeowner platform |
| Customer uploads | — | FORBIDDEN NOW | NO | future homeowner platform |

---

# 3. Crew-Only Hard Scope Rules

## Single-tenant only
Forbidden in A0–A3:
- `tenant_id`
- RLS
- multi-tenant isolation logic
- homeowner data references
- customer upload pipelines
- property/home-asset schema

## RAG vs SQL split
- `knowledge` tool = unstructured crew docs only
- `query_data` = structured business data only
- RAG never queries structured tables
- SQL agent never uses embeddings

## Track B isolation
Track A agents must not implement B-track ideas early.

---

# 4. Phase A0 — Agents SDK Evaluation

## Goal
Validate `@openai/agents-realtime` on iOS Safari without UX regression.

## Required
- Assistants API deprecation audit
- install agents realtime SDK
- rewrite client around `RealtimeAgent`/`RealtimeSession`
- keep same 5 hardcoded tools in A0
- measure connection time, first-audio latency, tool-call success, bundle delta
- test iOS Safari, Chrome Android, Chrome desktop

## Forbidden in A0
- server-side tools
- MCP
- RAG
- multi-model strategy
- load testing

## DONE WHEN
- SDK installed and works on desktop
- iOS Safari tested
- latency measured and documented
- bundle delta documented
- Assistants API audit complete
- decision recorded: SDK viable OR raw WebRTC
- merged to main

## Gate meaning
A0 COMPLETE means **evaluation finished and path chosen**, not necessarily SDK success.

---

# 5. Phase A1 — MCP Tool Layer

## Goal
Move AI tool execution from browser to Bridge. API keys stay server-side.

## Required tools
- `vision`
- `knowledge` (placeholder in A1)
- `search_web`
- `query_data`
- `log_item`
- `deliver_report`
- `calexp_action`
- `remember`

## Required outcomes
- tool primary/fallback config
- Realtime auto-discovers MCP tools
- client reduced to WebRTC + camera + UI
- Anthropic key removed from client
- per-tool cost tracking

## DONE WHEN
- MCP server deployed
- all 8 tools live
- latency <5s p95
- cost accuracy ±10%
- session lifecycle defined
- approval tiers defined per tool/role
- T0.1 harness validates 3-zero
- merged to main

## Dependencies
- A0 COMPLETE
- T0.1 COMPLETE

---

# 6. Phase A2 — Crew Knowledge System

## Goal
Crew can ask source-backed questions over internal docs by voice.

## Required
- pgvector enabled
- `bb_knowledge_chunks` table
- Drive polling ingestion pipeline
- chunking + embedding
- `knowledge` tool = hybrid vector + BM25
- `remember` tool = voice memory capture
- golden retrieval set
- confidence scoring

## Explicitly out of scope
- homeowner ingestion
- multi-tenant schema
- property intelligence
- customer files

## DONE WHEN
- ingestion pipeline operational
- 50 golden queries pass faithfulness >0.7
- zero hallucinated citations in golden set
- latency <3s p95
- ingestion stable 48h
- `remember` upserts successfully
- T0.5 evaluator confirms metrics
- merged to main

## Dependencies
- A1 complete
- T0.3 + T0.5 complete

---

# 7. Phase A3 — Crew Operations Assistant

## Goal
Buddy can query business data and take governed crew-only actions.

## Required
- `query_data` for financial / operational structured data
- `calexp_action` routing to real CalExp5 endpoints
- crew auth via PIN
- role-based data access
- governed write workflows
- idempotency
- approval tiers
- outbox pattern
- retry + compensation

## A3 UX Addendum — Crew Entry Surface (Map-First)
Crew entry must support a map-first landing surface with **admin minimums + user
configurable layers**. This is required for the crew daily start-of-day workflow.

Minimums (admin-required):
- map base layer
- assigned jobsites
- safety/alert channel
- pay period summary

User-configurable layers:
- store pins (Home Depot, Ace, Outdoor Supply)
- crew visibility (show others / share my location)
- tool checklist
- foreman notes
- traffic + weather advisories

Privacy rules:
- user can hide their location from other crew unless admin-required by role
- map renders last-seen state when live tracking is hidden or stale

## Roles
- admin: all data, all actions
- lead: team data and team operations
- crew: own data only

## DONE WHEN (Part 1 build-complete)
- QBO/QBT query paths verified
- CalExp5 integration complete
- workflow state machine tested
- idempotency proven
- approval tiers working
- outbox tested
- role matrix enforced
- single-tenant rule preserved
- T0.6 scale validation passes
- merged to main

## DONE WHEN (Part 2 production validation — Sam only)
- 48h production shadow
- 5+ sessions/day
- cost <$20/day
- satisfaction ≥4/5
- zero critical errors
- Sam signs off

## Explicitly out of scope
- customer scheduling
- property CRUD
- warranty workflows
- homeowner notifications
- Stripe
- Jobber

## Dependencies
- A2
- T0.5 + T0.6
- existing QBO/QBT Bridge endpoints

---

# 8. Track A Public Contract Status

## Track A API / contract answer
**Yes — Track A’s MCP/public contract layer is fully defined at the doc level.**

The Core Architecture frozen contracts appendix defines:
- request envelopes
- success/error envelopes
- approval request/decision objects
- workflow state objects
- session/transcript records
- cost events
- citations
- normalized tool outputs

That is sufficient for agents to implement the Track A public interface without inventing shapes.

## Important nuance
Track A does **not** own the Track 0 control-plane API.  
Track A owns its MCP/tool interaction layer; Track 0 owns the harness control-plane API.

---

# 9. Dependency Gates from Track 0

| Phase | Requires |
|---|---|
| A0 | None |
| A1 | T0.1 COMPLETE + A0 COMPLETE |
| A2 | T0.3 COMPLETE + T0.5 COMPLETE |
| A3 | T0.5 COMPLETE + T0.6 COMPLETE |

Track A agents must treat these as hard stops.

---

# 10. Build Readiness Statement

Track A is **build-ready** for agents.

## What “build-ready” means
- scope is clear
- dependencies are explicit
- forbidden areas are explicit
- contracts are frozen
- Track 0 validation path is explicit

## What it does not mean
- no engineering difficulty
- no repo integration work
- no environment surprises

---

# 11. Replacing “Open Items: ZERO”

Use this statement instead:

**Track A is build-ready for committed crew-only scope. Deferred and forbidden scope is explicitly listed; Track B remains out of bounds.**

This is more accurate and safer for agents.

---

# 12. Final Rules for Agents

1. Build only A0–A3
2. Do not read Track B as implementation scope
3. Use frozen Track A contracts from Core
4. Respect Track 0 gates
5. Do not add tenant_id or homeowner logic
6. Do not invent public contract fields
