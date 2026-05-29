# BB Buddy Agentic Architecture | v1.1 | 2026-04-01 | BB

## Vision

BB Buddy evolves from a hardcoded 3-model client into a **scalable agentic mesh** where any model can be swapped into any role, agents communicate via MCP, and BB's entire business knowledge — receipts, invoices, contracts, emails, properties, projects — is available via RAG. Zero UX penalty. Crew points, talks, gets answers.

---

## Current State (v3.17) — What Works

```
PHONE (bb-scan-openai.html — single monolithic client)
  ├── OpenAI Realtime Mini ← WebRTC audio/video, function calling
  ├── Claude Sonnet 4.6 ← direct browser REST for expert knowledge + web search
  ├── SerpAPI ← via Bridge for asset search
  └── 5 hardcoded tools (ask_expert, log_item, deliver_report, calexp_action, find_asset)

BRIDGE (BB_Micro_Bridge — data persistence + context only)
  ├── /init → returns API keys to client
  ├── /v2/transcripts → sendBeacon batch storage
  ├── /v2/session/* → session lifecycle
  ├── /v2/crew-memory → per-employee memory
  └── /v2/search → SerpAPI proxy
```

**What's good:** Zero-latency voice (WebRTC direct to OpenAI), working function call lifecycle, echo suppression, hallucination filtering, crew memory, session persistence.

**What's rigid:** Models hardcoded, tools defined in HTML, no RAG, no model abstraction, API keys sent to client, no agent protocol.

---

## Target Architecture — Agentic Mesh

### The Key Insight

**OpenAI Realtime IS the orchestrator.** It handles voice, thinking, and tool dispatch in a single stream. The research confirms:

- `gpt-realtime` (full, GA) has native MCP integration — point it at an MCP server, it auto-discovers tools
- Async function calling is built-in — model speaks "Let me check on that" while tools execute in background
- OpenAI Agents SDK (`@openai/agents-realtime`) provides handoffs, guardrails, tracing out of the box
- Sequential tool chaining works — model calls tool A, reasons over result, decides to call tool B
- `addImage()` method accepts base64 camera frames — same pattern we use today
- Assistants API is being sunset mid-2026 — Agents SDK is the official replacement

**No custom orchestrator needed.** OpenAI Realtime decides when to call which tool. Bridge executes them.

### Architecture Diagram

```
PHONE (thin client — just WebRTC + camera)
  │
  │ WebRTC audio + camera frames (via addImage)
  │
  ▼
┌──────────────────────────────────────────────────────────────┐
│               OPENAI REALTIME (GA)                            │
│           gpt-realtime / gpt-realtime-mini                    │
│                                                               │
│  Voice I/O ← WebRTC (same as today)                          │
│  Orchestration ← model decides which tools to call            │
│  Async tools ← speaks while waiting for results               │
│  Tool chaining ← calls A, gets result, calls B if needed      │
│  Handoffs ← can delegate to specialist agents                 │
│  Guardrails ← input/output validation in parallel             │
│  MCP client ← connects to BB's MCP server on Bridge           │
│  Tracing ← built-in debugging + audit                         │
└───────────────┬──────────────────────────────────────────────┘
                │ MCP protocol (tool discovery + execution)
                ▼
┌──────────────────────────────────────────────────────────────┐
│               BB BRIDGE — MCP TOOL SERVER                     │
│                                                               │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ Vision Agent  │  │ Knowledge     │  │ Search Agent      │ │
│  │              │  │ Agent (RAG)   │  │                   │ │
│  │ Claude 4.6   │  │ pgvector +    │  │ SerpAPI /         │ │
│  │ GPT-4o       │  │ hybrid BM25 + │  │ Perplexity /      │ │
│  │ Gemini Flash │  │ any summarizer│  │ Claude web_search │ │
│  │ (config)     │  │ (config)      │  │ (config)          │ │
│  └──────────────┘  └───────────────┘  └───────────────────┘ │
│                                                               │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ Financial    │  │ Action Agent  │  │ Logging Agent     │ │
│  │ Agent        │  │               │  │                   │ │
│  │ QBO/QBT →    │  │ CalExp5 API / │  │ Receipts / tools /│ │
│  │ SQL query +  │  │ Drive / Email │  │ vehicles / audit  │ │
│  │ summarize    │  │ / Estimates   │  │ (no model needed) │ │
│  └──────────────┘  └───────────────┘  └───────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                SHARED INFRASTRUCTURE                    │  │
│  │  Neon Postgres: sessions, transcripts, crew memory     │  │
│  │  pgvector: RAG knowledge base (hybrid search)          │  │
│  │  Cost tracker: per-agent, per-model, per-session       │  │
│  │  Audit log: every agent call with model/latency/tokens │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### UX Impact Analysis

| Concern | Answer |
|---------|--------|
| **Will it be slower?** | No. OpenAI Realtime async function calling means the model speaks "Let me check" while tools execute server-side. Same UX as today's "Give me a moment" pattern. |
| **Will crew notice?** | No. Same voice, same camera, same "point and ask." They get smarter answers because the backend has more tools + company knowledge. |
| **Latency delta?** | Voice: identical (still direct WebRTC ~200ms). Tool calls: +100-200ms network hop (phone→OpenAI→Bridge→tool→OpenAI→phone) vs today's ~50ms (phone→Claude direct). Imperceptible during natural pause. |
| **Model failure?** | Each agent has config-driven fallback. Vision: Claude → GPT-4o. Search: SerpAPI → Perplexity. Knowledge: GPT-4o-mini → Claude Haiku. |
| **Camera frames?** | SDK has `addImage(base64, {triggerResponse})` — same pattern as current `captureFrame()`. No change to frame capture logic. |

---

## OpenAI Agents SDK — CONFIRMED Research Findings

**Package:** `@openai/agents-realtime` v0.8.2 (published March 31, 2026, ~1.6M downloads/month)
**Default model:** `gpt-realtime-1.5` (upgraded from preview in v0.8.0)
**Peer dependency:** Zod v4 (not v3)
**Bundle:** UMD at `dist/bundle/openai-realtime-agents.umd.cjs` (~200-400KB gzipped est.)
**CDN:** Available on jsDelivr

### What It Gives Us

The SDK replaces ~400 lines of raw WebRTC lifecycle management with ~50 lines:

```
TODAY (raw WebRTC — ~400 lines of lifecycle management):
  pc = new RTCPeerConnection()
  dc = pc.createDataChannel('oai')
  dc.addEventListener('message', onDCMessage)  ← 200 lines of event parsing
  pendingFnCalls queue + response.done handler
  Manual buddySpeaking flag for echo suppression
  Manual response.create / response.done sequencing

WITH SDK (~50 lines):
  agent = new RealtimeAgent({ name, instructions, tools, handoffs })
  session = new RealtimeSession(agent, { model, transport })
  session.connect({ apiKey })
  → SDK handles: WebRTC, tool dispatch, result return, response sequencing
  → Events: agent_start, agent_end, audio_start, tool_approval_requested
```

### Function Call Lifecycle — FULLY ABSTRACTED (biggest win)

The SDK eliminates our entire `pendingFnCalls` / `response.done` / `response.create` system:

| What We Built in v3.17 | SDK Does Automatically |
|------------------------|------------------------|
| `pendingFnCalls` queue | Tool resolution from agent's tool list |
| `response.function_call_arguments.delta` accumulation | Argument parsing + validation |
| `response.function_call_arguments.done` → mark ready | Tool dispatch to execute function |
| `response.done` → process queued calls sequentially | `ResponseCreateSequencer` handles timing |
| `conversation.item.create` with `function_call_output` | `sendFunctionCallOutput()` automatic |
| `response.create` with instructions to speak result | Sequencer defers until previous turn finishes |
| Double-fire prevention (`delete pendingFnCalls[fnKey]`) | Handled internally |
| Truncated JSON args repair | Handled by SDK parsing |

**Events we can hook into:** `agent_tool_start`, `agent_tool_end`, `tool_approval_requested`, `error`

### Camera Frames — addImage() Works (No Video Track)

**SDK's WebRTC transport only adds audio track.** No video track support in SDK.

But `addImage(base64DataUrl, {triggerResponse})` works independently — sends images via data channel as `conversation.item.create` with `input_image` content. This IS our current `captureFrame()` pattern.

**Important:** Model never speaks proactively based on visual input (GitHub #694). Visual input is passive — model only responds after audio turn. This matches our current behavior.

**For BB Buddy:** We manage our own `getUserMedia({audio: true, video: true})`, pass audio portion to SDK transport via custom `mediaStream`, send video frames via `addImage()` on demand.

### Echo Cancellation — Still Our Problem

SDK does NOT manage echo cancellation. Relies on browser WebRTC built-in AEC.

Our `buddySpeaking` flag + 800ms grace pattern stays relevant for edge cases. SDK's `audio_start` / `audio_stopped` events replace manual `response.audio.delta` / `response.audio.done` tracking.

### Browser Compatibility — Good Signs

| Factor | Status |
|--------|--------|
| **iOS Safari issues** | **None found** in 1,146 GitHub issues |
| **WebRTC support** | Standard APIs, H.264 native in Safari |
| **iOS autoplay risk** | SDK creates `<audio autoplay>`. May need user gesture. We handle this with `initAudioCtx()`. |
| **Build step** | Recommended (Vite/esbuild). UMD bundle exists but Zod v4 peer dep complicates CDN-only. |
| **React Native** | Does NOT work (#133). Irrelevant for us. |

### Architecture Impact: Build System Decision

Current BB Buddy is a **single self-contained HTML file** served via base64 from Bridge. The SDK requires npm packages (Zod v4 + agents). Two options:

**Option A: Vite build** (recommended)
- `npm install @openai/agents-realtime zod`
- Vite bundles to single JS file
- HTML loads the bundle
- Standard, well-supported, tree-shakeable

**Option B: CDN imports** (simpler, riskier)
- `<script type="module">` importing from jsDelivr
- No build step, stays as single HTML file
- Risk: Zod v4 from CDN, version pinning, offline unavailable

Phase 0 will test both on iOS Safari.

### What Changes in Our HTML Client

| Current (v3.17) | With Agents SDK |
|-----------------|----------------|
| ~1,400 lines single HTML file | ~400-500 lines (UI + camera + SDK init) |
| 200+ lines WebRTC + data channel parsing | `new RealtimeSession(agent).connect()` |
| `pendingFnCalls` queue + `response.done` | SDK `ResponseCreateSequencer` |
| `captureFrame()` → inject via data channel | `session.addImage(base64)` |
| Manual `session.update` for VAD/voice | Part of agent/session config |
| `buddySpeaking` flag via `response.audio.*` | SDK `audio_start` / `audio_stopped` events |
| Hardcoded `getToolDefinitions()` | `hostedMcpTool({ serverUrl })` — auto-discovered |
| Direct Claude API calls from browser | MCP tool on Bridge — OpenAI calls server-to-server |
| API keys to client (OpenAI + Anthropic + SerpAPI) | Only OpenAI key (or ephemeral token) |
| base64-encoded HTML served by Bridge | Vite-built bundle (or CDN imports) |

---

## RAG — BB Knowledge Base

### BB's Actual Data Inventory

| Category | Volume | Format | Location |
|----------|--------|--------|----------|
| **Receipts** | ~1,000 | Scanned photos → AI-extracted text | Google Drive + Neon `cal_receipts` |
| **Invoices** | Hundreds | QBO API (structured JSON) | QBO via Bridge endpoints |
| **Estimates** | Hundreds | QBO API (structured JSON) | QBO via Bridge endpoints |
| **Contracts** | Dozens-hundreds | PDF, Google Docs | Google Drive |
| **Emails/texts** | Hundreds | Text (Gmail API, structured) | Gmail / future integration |
| **Properties** | Thousands of lines | Structured data (URL, description) | Neon `cal_stores` + enrichment |
| **Clients** | Hundreds | Structured data | Neon `employees` + QBO customers |
| **Projects** | Hundreds | QBO classes + jobcodes | Neon `cal_stores` + QBO |
| **SOPs/Safety** | Dozens | Google Docs, PDF | Google Drive |
| **Vendor pricing** | Dozens | Google Sheets, PDF | Google Drive |
| **Building codes** | Large PDFs | NEC, IBC, IRC, OSHA | External reference |
| **Tool manuals** | Dozens | PDF | Google Drive |
| **Tribal knowledge** | Unbounded | Sam's brain → voice/text/docs | Future capture |

### Two Systems, Not One

This data splits into two fundamentally different retrieval patterns:

**System A: RAG (unstructured documents → vector search)**
- SOPs, safety plans, contracts, codes, manuals, vendor pricing sheets, emails
- Chunked, embedded, stored in pgvector
- Retrieved via hybrid semantic + keyword search
- ~5K-15K chunks after processing

**System B: SQL Agent (structured data → query + summarize)**
- Receipts, invoices, estimates, timesheets, properties, clients, projects
- Already in Neon Postgres (cal_receipts, employees, cal_stores, etc.)
- Already accessible via QBO/QBT Bridge endpoints
- Retrieved via SQL queries, summarized by LLM
- This is the Financial Agent — not RAG

**The crew doesn't know the difference.** They ask "What did we spend on the Johnson project?" and the orchestrator (OpenAI Realtime) decides: is this a document lookup (RAG) or a data query (SQL Agent)?

### RAG Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **Vector DB** | pgvector on Neon (BBInc_1) | Already have it. `CREATE EXTENSION vector`. $0-5/mo. |
| **Embedding** | OpenAI text-embedding-3-small | Already have API key. $0.02/1M tokens. 15K chunks ≈ $0.15. |
| **Search** | Hybrid: pgvector (semantic) + tsvector/BM25 (keyword) | "How do I waterproof..." AND "NEC 210.52" both work. |
| **Chunking** | 512 tokens, 64 overlap, tables kept whole | 2026 Vectara benchmark winner (69% accuracy). |
| **Ingestion** | Google Drive polling every 15-30 min | Simpler than webhooks. Adequate for doc update frequency. |
| **Text extraction** | Google Docs → Drive API export. PDF → pdf-parse. Sheets → CSV serialize. | Existing patterns in BB ecosystem. |

### Hybrid Search: Why Both Vector AND Keyword

Construction queries are a mix:
- **Semantic:** "how do I waterproof a deck ledger board?" → vector similarity
- **Exact keyword:** "NEC 210.52 receptacle spacing" → BM25 keyword match
- **Tabular lookup:** "price for 2x6 PT from Pacific Lumber" → keyword + metadata filter

Reciprocal Rank Fusion (RRF) combines both in one Postgres query. No external service needed.

### Knowledge Source Priority

| Tier | Sources | Ingest How | When |
|------|---------|-----------|------|
| **1 — Highest value** | Company SOPs, safety plans, vendor pricing, supplier contacts | Google Drive polling → chunk → embed | Phase 2 |
| **2 — Reference** | Building codes (NEC, IBC), OSHA 1926, material specs, tool manuals | Manual upload → chunk → embed | Phase 2 |
| **3 — Structured** | Receipts, invoices, estimates, timesheets, properties | SQL Agent (not RAG) — already in Neon | Phase 3 |
| **4 — Tribal** | Sam's operational knowledge, lessons learned, preferred methods | Voice capture via Buddy + manual entry | Phase 2+ |

### Tribal Knowledge Capture (All of the Above)

Sam confirmed: "All the above" for capturing tribal knowledge. Four input channels:

| Channel | How It Works | Example |
|---------|-------------|---------|
| **Voice to Buddy** | "Buddy, remember: we always use Simpson Strong-Tie for seismic connections" → crew memory + RAG chunk | Easiest. Crew can do it on the jobsite. |
| **Text/form** | Admin UI in CalExp5 → add knowledge entry → embed and store | For structured facts, pricing, contacts. |
| **Document upload** | Drop PDF/Doc into "BB Knowledge Base" Drive folder → auto-ingested | For manuals, contracts, specs. |
| **Session extraction** | End-of-session Claude digest → extract durable facts → upsert to RAG | Automatic. Already planned (crew memory compaction). |

### Neon Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE bb_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT NOT NULL,              -- 'sop-fall-protection-v3'
  doc_title TEXT NOT NULL,
  doc_type TEXT NOT NULL,            -- 'sop','code','pricing','manual','spec','tribal','email'
  section TEXT,                      -- 'Section 4.2 - Guardrails'
  content TEXT NOT NULL,             -- the actual chunk text
  embedding vector(1536) NOT NULL,   -- OpenAI text-embedding-3-small
  search_vector tsvector,            -- for BM25 keyword search
  metadata JSONB DEFAULT '{}',       -- tags, page, revision_date, source, author
  drive_file_id TEXT,                -- Google Drive source (null for tribal/API sources)
  source_type TEXT DEFAULT 'drive',  -- 'drive','qbo','manual','voice','session'
  chunk_index INT,
  total_chunks INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kc_embedding ON bb_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_kc_search ON bb_knowledge_chunks USING gin(search_vector);
CREATE INDEX idx_kc_doc ON bb_knowledge_chunks(doc_id);
CREATE INDEX idx_kc_type ON bb_knowledge_chunks(doc_type);
CREATE INDEX idx_kc_source ON bb_knowledge_chunks(source_type);
```

### Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| pgvector storage (Neon) | $0-5 (free tier likely sufficient) |
| Embedding updates (~500 docs/mo) | $0.01 |
| Query embeddings (~5K queries/mo) | $0.01 |
| LLM generation for RAG answers | $5-50 (model-dependent) |
| Google Drive API | $0 |
| **Total RAG infrastructure** | **$5-55/mo** |

One-time ingestion of entire knowledge base: **~$0.15**

---

## MCP Tool Registry

Each tool becomes an MCP-compatible server endpoint on Bridge. OpenAI Realtime auto-discovers them.

| Tool | Purpose | Model Used | Latency |
|------|---------|------------|---------|
| `vision` | Identify tools/materials/text from camera frame | Claude 4.6 → GPT-4o fallback | 2-5s |
| `knowledge` | Search BB's document knowledge base (RAG) | pgvector search + GPT-4o-mini summarizer | 1-3s |
| `search_web` | Find external resources (videos, manuals, pricing) | SerpAPI → Perplexity fallback | 1-3s |
| `query_data` | Query structured business data (receipts, invoices, projects) | SQL query + GPT-4o-mini summarizer | 1-2s |
| `log_item` | Record a detection (receipt, tool, vehicle, permit) | No model — direct DB write | <500ms |
| `deliver_report` | Generate long-form report (notification/email/PDF) | Any model for formatting | 1-2s |
| `calexp_action` | Execute CalExp5 operations (log hours, check PTO, etc.) | No model — API routing | <1s |
| `remember` | Store tribal knowledge from voice ("Buddy, remember...") | Embedding + upsert to pgvector | <1s |

### Model Selection Config

Each agent has primary + fallback, changeable without code:

| Agent | Primary | Fallback | Selection Criteria |
|-------|---------|----------|-------------------|
| Vision | Claude Sonnet 4.6 (best vision) | GPT-4o | Image quality needs |
| Knowledge (RAG) | GPT-4o-mini (cheap, fast) | Claude Haiku 4.5 | Cost optimization |
| Search | SerpAPI (structured results) | Claude web_search | Availability |
| Data query | GPT-4o-mini (structured summarization) | Claude Haiku 4.5 | Cost optimization |
| Report formatting | GPT-4o-mini | Claude Haiku 4.5 | Cost optimization |

---

## OpenAI Realtime Platform — Key Facts

| Capability | Details |
|-----------|---------|
| **Models** | `gpt-realtime` (full, GA) — best reasoning/vision. `gpt-realtime-mini` (GA) — 3x cheaper. |
| **MCP** | Native. Point session at MCP server URL, auto-discovers tools. |
| **Async function calls** | Native. Model speaks while waiting for tool results. No code needed. |
| **Tool chaining** | Model calls tool A, gets result, decides to call tool B. No limit on chain depth. |
| **Image input** | `addImage(base64, {triggerResponse})` — still frames, not video stream. Same as current approach. |
| **Context window** | 32K tokens (full), ~16K (mini). ~30-40 min audio before truncation. |
| **Context management** | `conversation.item.delete`, `retention_ratio` truncation, compaction cookbook. |
| **Max session** | 60 minutes. |
| **Agents SDK (JS)** | `@openai/agents` + `@openai/agents-realtime` (npm). |
| **SDK features** | RealtimeAgent, RealtimeSession, tool() with Zod, hostedMcpTool(), handoffs, guardrails, tracing. |
| **Transport** | OpenAIRealtimeWebRTC — accepts custom mediaStream + audioElement. |
| **Events** | agent_start/end, agent_handoff, audio_start/stopped/interrupted, history_updated, tool_approval_requested. |
| **Pricing (mini)** | Audio: $10/$20 per 1M tokens in/out. Text: $0.60/$2.40. |
| **Pricing (full)** | Audio: $32/$64 per 1M tokens in/out. Text: $4/$16. |
| **Cached input** | $0.30-0.40/1M — 98% discount on re-sent context. |

### Mini vs Full Decision

| Factor | Mini (current) | Full |
|--------|---------------|------|
| Audio cost | $10/$20 per 1M | $32/$64 per 1M (3.2x more) |
| Tool calling accuracy | Good | Better (improved instruction following) |
| Vision quality | Adequate for large objects | Better for small text/labels |
| Context window | ~16K | 32K (2x more conversation history) |
| ~Cost/5-min session | $0.50 | $1.60 |
| ~Monthly (10 crew x 4/day) | $440 | $1,408 |

**Decision:** Keep v3.17 production on Mini (`master` branch). Test Full on `bb-buddy-v4-agents` branch. If tool-calling accuracy is noticeably better, use Full for the orchestrator and Mini is available as a budget fallback.

---

## Implementation Phases

### Phase 0: Agents SDK Evaluation (effort: small, risk: low)

**Goal:** Validate that `@openai/agents-realtime` works on mobile browsers (iOS Safari) and doesn't degrade UX.

**What:**
- Install `@openai/agents-realtime` in project
- Rewrite `bb-scan-openai.html` to use `RealtimeAgent` + `RealtimeSession` + `OpenAIRealtimeWebRTC`
- Keep same 5 tools, but define them via `tool()` with Zod schemas instead of raw JSON
- Use SDK events (`audio_start`, `audio_stopped`) instead of manual `buddySpeaking` flag
- Test on: iOS Safari, Chrome Android, Chrome desktop
- Measure: connection time, first-audio latency, tool call success rate, bundle size

**Not changing:** Tool execution still happens client-side. No MCP yet. No RAG yet. This is purely a framework migration test.

**Success criteria:** Same or better UX as v3.17, SDK works on iOS Safari, no new latency.

**Failure fallback:** If SDK doesn't work on mobile, skip Phase 0, proceed directly to Phase 1 with raw WebRTC + MCP tools.

### Phase 1: MCP Tool Layer (effort: medium, risk: medium)

**Goal:** Move all AI tool execution from browser to Bridge. API keys stay server-side. Model selection becomes config-driven.

**What:**
- Build MCP server on Bridge with tool endpoints
- Each tool wraps its AI provider with primary/fallback config
- OpenAI Realtime connects to Bridge MCP server via `hostedMcpTool()`
- HTML client simplified: only WebRTC + camera + UI. No Claude/SerpAPI calls.
- Per-tool cost tracking: model, tokens, latency, cost → `cal_scan_transcripts`
- Anthropic API key removed from client entirely

**Dependencies:** Phase 0 (or raw WebRTC + MCP if Phase 0 fails)

### Phase 2: RAG Knowledge Base (effort: medium, risk: low)

**Goal:** BB's document knowledge available to crew via voice.

**What:**
- Enable pgvector on Neon BBInc_1: `CREATE EXTENSION vector`
- Create `bb_knowledge_chunks` table
- Build ingestion pipeline: Google Drive folder → poll → extract text → chunk → embed → upsert
- New MCP tool: `knowledge` — hybrid vector + BM25 search → summarize → return to Buddy
- New MCP tool: `remember` — voice-captured tribal knowledge → embed → store
- Ingest Tier 1: SOPs, safety plans, vendor pricing
- Build test set: 50 real crew questions → measure retrieval quality

**Dependencies:** Phase 1 (MCP tool layer must exist for the knowledge tool)

### Phase 3: Financial + Action Agents (effort: large, risk: medium)

**Goal:** Buddy can query business data and take actions.

**What:**
- `query_data` MCP tool: route to existing QBO/QBT Bridge endpoints → summarize
- "Run me a P&L for Q1" → QBO Reports API → GPT-4o-mini summary → speak
- "What did we spend on Johnson?" → SQL query on cal_receipts + QBO invoices → summarize
- Route `calexp_action` to real CalExp5 API endpoints (not stubs)
- Crew auth: CalExp5 PIN login → scoped permissions (Sam sees financials, crew sees timesheets)

**Dependencies:** Phase 2 (shared infrastructure), existing QBO/QBT Bridge endpoints

### Phase 4: Voice Model Abstraction (effort: large, risk: high)

**Goal:** Crew can choose voice provider, not just voice name.

**What:**
- Abstract transport layer: OpenAI WebRTC, Gemini Live WebSocket, future Claude Realtime
- Settings UI: "AI Provider: OpenAI / Gemini / Claude"
- Each provider has different capabilities — feature matrix in UI
- Test Gemini Live (already have `scan-live.html` as starting point)

**Dependencies:** Phase 1. This is a stretch goal — only pursue if there's a clear reason to offer alternatives.

### Phase 5: Multi-Agent Orchestration (effort: very large, risk: high)

**Goal:** Agents delegate to each other for complex multi-step tasks.

**What:**
- Task decomposition: "Find the cheapest shaver on my desk" → Vision (identify) → Search (find prices) → compare → speak
- Parallel agent execution for independent sub-tasks
- Handoff chains via Agents SDK
- A2A protocol if cross-service communication needed
- Full governance: permissions matrix, cost budgets, audit trails

**Dependencies:** All previous phases. This is the long-term vision, not near-term work.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestrator | OpenAI Realtime (not custom) | Native voice + MCP + async tools + Agents SDK. Zero UX penalty. |
| Voice model | Mini (production), Full (evaluation branch) | Mini proven in v3.17. Test Full for accuracy before committing to 3x cost. |
| Vector DB | pgvector on Neon | Already running. One SQL command. $0 additional. Hybrid search. |
| Embedding | OpenAI text-embedding-3-small | Already have key. Cheapest. $0.15 for entire corpus. |
| RAG pattern | Hybrid search (vector + BM25) | Construction needs semantic AND exact keyword retrieval. |
| Structured data | SQL Agent (not RAG) | Receipts, invoices, projects are already in Neon. Query, don't embed. |
| Drive sync | Polling every 15-30 min | Simpler than webhooks. Docs don't change per-minute. |
| API keys | Server-side only (Phase 1) | Security. Model flexibility. ~100-200ms acceptable in "thinking" pause. |
| Agent protocol | MCP (native OpenAI support) | Standard. Auto-discovered. Testable independently. |
| Tribal knowledge | Voice + text + docs + session extraction | All four channels. Buddy is a knowledge capture device. |
| Branching | `bb-buddy-v4-agents` branch. `master` = stable v3.17. | Production stays working. Experiments don't break crew. |
| Cost tracking | Per-agent per-model per-session | Instrumented early. Budget caps can be added later. |

---

## Cost Projections

### Current (v3.17)

| Component | Per 5-min Session | Monthly (10 crew x 4/day) |
|-----------|-------------------|---------------------------|
| OpenAI mini audio | $0.50 | $440 |
| Claude ask_expert (~3/session) | $0.05 | $44 |
| Claude compaction (~2/session) | $0.03 | $26 |
| SerpAPI | Free tier | $0 |
| Neon | ~$0 | $19 |
| **Total** | **~$0.58** | **~$529** |

### V2 Architecture (estimated)

| Component | Per 5-min Session | Monthly (10 crew x 4/day) |
|-----------|-------------------|---------------------------|
| OpenAI mini audio (unchanged) | $0.50 | $440 |
| MCP vision tool (Claude/GPT-4o) | $0.05 | $44 |
| MCP knowledge tool (RAG query) | $0.01 | $9 |
| MCP data tool (SQL + summarize) | $0.01 | $9 |
| MCP search tool | Free-$0.01 | $0-9 |
| Compaction (unchanged) | $0.03 | $26 |
| pgvector storage | ~$0 | $0-5 |
| Neon (unchanged) | ~$0 | $19 |
| **Total** | **~$0.60** | **~$552** |

**Net cost increase: ~$23/month** for RAG + SQL agent capabilities. The voice model (OpenAI Realtime) remains the dominant cost.

**If using Full instead of Mini:** ~$1,500/mo. Only justified if tool accuracy is measurably better.

---

## ADDENDUM: Home Services Subscription Platform

### The Business Opportunity

BB is considering expanding into recurring home services subscriptions: tree service, window washing, gutter cleaning, landscaping, pressure washing, roof cleaning. Customers (homeowners) would get BB Buddy as their AI home maintenance assistant — and can upload their own documents (inspection reports, warranties, contracts) for personalized AI answers.

**Market validation:**
- U.S. home services market: **$842 billion** (2026), growing to $989B by 2031
- 62% of U.S. consumers already use recurring service plans
- Lowe's launched HomeCare+ nationally (March 2026) at $99/year — basic indoor tasks only
- **Nobody** has an AI voice+vision assistant for home services. BB Buddy is genuinely novel here.

### What This Changes in the Architecture

**BB Buddy goes from internal crew tool to customer-facing SaaS platform.** The agentic mesh architecture we designed still works — but needs three additions: **multi-tenancy**, **audience gating**, and **property intelligence**.

```
                    BB BUDDY PLATFORM
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   BB CREW          HOMEOWNERS      SERVICE PROVIDERS
  "BB Buddy"        "BB Home"         "BB Pro"
        │                │                │
  All tools        Their property    Their catalog
  All data         Their docs        Their customers
  Financials       Global knowledge  Global knowledge
  GPS/timesheets   Linked providers  Scheduling
```

### Multi-Tenant RAG Architecture — CONFIRMED

**Approach: Shared table + Row-Level Security (RLS) + tenant_id column**

This is the standard pgvector multi-tenant pattern, confirmed viable at our scale:

| tenant_id | What It Contains | Who Sees It |
|-----------|-----------------|-------------|
| `bb_global` | Building codes, PNW seasonal calendar, safety standards | Everyone |
| `bb_crew` | BB internal SOPs, vendor pricing, crew procedures | BB crew only |
| `cust_{uuid}` | Homeowner's inspection reports, warranties, contracts | That homeowner only |
| `prov_{uuid}` | Provider's service catalog, certifications, pricing | Provider + linked customers |

**Data isolation guaranteed by 5 layers:**
1. **Postgres RLS** — database enforces tenant_id filtering on every query
2. **Application filter** — every vector search includes `WHERE tenant_id IN (...)`
3. **JWT authentication** — tenant_id extracted from signed token, verified by Neon Authorize
4. **Tool-level gating** — LLM never even sees tools it can't use (filtered before session starts)
5. **Audit log** — every RAG query logged with tenant context for compliance

**Schema change from v0.4:** Add `tenant_id` column to `bb_knowledge_chunks`:

```sql
-- Updated schema (replaces v0.4 schema)
CREATE TABLE bb_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'bb_global',  -- NEW: tenant isolation
  doc_id TEXT NOT NULL,
  doc_title TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  section TEXT,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  search_vector tsvector,
  metadata JSONB DEFAULT '{}',
  drive_file_id TEXT,
  source_type TEXT DEFAULT 'drive',
  chunk_index INT,
  total_chunks INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS enforcement
ALTER TABLE bb_knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bb_knowledge_chunks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON bb_knowledge_chunks
  FOR ALL USING (
    tenant_id = current_setting('app.tenant_id', true)
    OR tenant_id = 'bb_global'
    OR tenant_id IN (SELECT provider_id FROM tenant_providers WHERE tenant_id = current_setting('app.tenant_id', true))
  );

-- Indexes (updated for multi-tenant)
CREATE INDEX idx_kc_embedding ON bb_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_kc_tenant ON bb_knowledge_chunks(tenant_id);
CREATE INDEX idx_kc_search ON bb_knowledge_chunks USING gin(search_vector);
CREATE INDEX idx_kc_doc ON bb_knowledge_chunks(doc_id);
```

### Three Audiences, Three Tool Sets

| Tool | BB Crew | Homeowner | Provider |
|------|---------|-----------|----------|
| `vision` (identify from camera) | Yes | Yes | Yes |
| `knowledge` (RAG search) | All docs | Their docs + global | Their docs + global |
| `search_web` (external resources) | Yes | Yes | Yes |
| `query_data` (SQL financials) | Yes — all data | Their property only | Their customers only |
| `log_item` (record detection) | Yes | No | No |
| `calexp_action` (CalExp5 ops) | Yes | No | No |
| `schedule_service` | Yes (manage) | Yes (request) | Yes (accept/decline) |
| `property_info` | All properties | Their property | Linked properties |
| `remember` (tribal knowledge) | Yes | Yes (their notes) | Yes (their notes) |
| `upload_document` | Yes | Yes (their docs) | Yes (their docs) |
| `get_service_history` | All history | Their property | Their work history |
| `get_estimate` | Create for any | Request for their property | Provide bids |

**Implementation:** The MCP server returns different tool lists based on `audience` claim in the JWT. OpenAI Realtime only sees the tools available to the current user.

### Property Knowledge Schema (NEW)

Home services require structured property data — not RAG, but a proper database:

```sql
CREATE TABLE bb_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,            -- homeowner who owns this property
  address TEXT NOT NULL,
  lat NUMERIC, lng NUMERIC,
  lot_sqft INT,
  home_sqft INT,
  stories INT DEFAULT 1,
  roof_type TEXT,                     -- 'asphalt','cedar_shake','metal','tile'
  roof_sqft INT,
  gutter_linear_ft INT,
  window_count INT,
  driveway_sqft INT,
  lawn_sqft INT,
  irrigation_zones INT DEFAULT 0,
  special_notes TEXT,                 -- 'gate code 1234', 'dog in backyard'
  metadata JSONB DEFAULT '{}',        -- flexible: HOA rules, preferences
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bb_property_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES bb_properties(id),
  species TEXT,                       -- 'Douglas Fir','Big Leaf Maple','Western Red Cedar'
  dbh_inches INT,                     -- diameter at breast height
  height_est_ft INT,
  health_score INT,                   -- 1-5 (from AI vision assessment)
  location_on_property TEXT,          -- 'front yard NW corner','backyard near fence'
  near_structures BOOLEAN DEFAULT FALSE,
  near_power_lines BOOLEAN DEFAULT FALSE,
  last_service_date DATE,
  last_service_type TEXT,             -- 'trimmed','removed','health_assessment'
  photos JSONB DEFAULT '[]',          -- [{url, date, notes}]
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bb_service_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES bb_properties(id),
  tenant_id TEXT NOT NULL,
  project_name TEXT NOT NULL,         -- 'Kitchen Remodel','Annual Gutter Clean Q4 2025'
  project_type TEXT NOT NULL,         -- 'remodel','maintenance','repair','emergency','inspection'
  status TEXT DEFAULT 'completed',    -- 'estimated','in_progress','completed','cancelled'
  start_date DATE,
  end_date DATE,
  original_estimate_cents INT,
  change_order_total_cents INT DEFAULT 0,
  final_cost_cents INT,
  crew_or_provider TEXT,
  qbo_invoice_id TEXT,               -- link to QuickBooks invoice
  notes TEXT,
  before_photos JSONB DEFAULT '[]',
  after_photos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bb_service_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES bb_service_projects(id),
  property_id UUID NOT NULL,          -- denormalized for direct property queries
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL,             -- 'labor','material','subcontractor','permit','equipment'
  description TEXT NOT NULL,          -- 'Install First Alert SA320CN smoke alarm, hallway'
  quantity NUMERIC DEFAULT 1,
  unit TEXT,                          -- 'each','sqft','lf','hour','day'
  unit_cost_cents INT,
  total_cents INT,
  installed_asset_id UUID,            -- links to bb_home_assets if this installed something
  date_performed DATE,
  performed_by TEXT,                  -- crew member or subcontractor name
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sp_property ON bb_service_projects(property_id);
CREATE INDEX idx_sp_tenant ON bb_service_projects(tenant_id);
CREATE INDEX idx_sp_type ON bb_service_projects(project_type);
CREATE INDEX idx_sli_property ON bb_service_line_items(property_id);
CREATE INDEX idx_sli_project ON bb_service_line_items(project_id);
CREATE INDEX idx_sli_asset ON bb_service_line_items(installed_asset_id);

-- RLS on both
ALTER TABLE bb_service_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE bb_service_projects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bb_service_projects
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE bb_service_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bb_service_line_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bb_service_line_items
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));
```

### Property-Centric RAG — The Unified Knowledge Model

**The property is the primary key for all knowledge.** When a homeowner talks to BB Buddy, every query is scoped to their property. BB Buddy fuses three knowledge layers transparently:

```
HOMEOWNER ASKS: "Did BB install a smoke alarm?"
                        │
                        ▼
              PROPERTY-SCOPED QUERY
              property_id = 'prop_247'
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  STRUCTURED DATA    RAG SEARCH     ASSET LOOKUP
        │               │               │
  bb_service_        bb_knowledge_   bb_home_assets
  line_items         chunks WHERE    WHERE property_id
  WHERE property_id  tenant_id IN    AND asset_type
  AND description    ('bb_global',   LIKE '%smoke%'
  LIKE '%smoke%'     'bb_prop_247',
        │            'cust_abc123')   │
        │               │             │
        ▼               ▼             ▼
  "Line item:       "NFPA 72:       "First Alert
   First Alert       test monthly,   SA320CN, installed
   SA320CN,          replace every   2025-03-15,
   installed         10 years"       hallway, operational"
   2025-03-15,
   $47.50"
        │               │             │
        └───────────────┼─────────────┘
                        │
                        ▼
              BUDDY SPEAKS (fused answer):
              "Yes — BB installed a First Alert SA320CN smoke alarm
               in the hallway on March 15, 2025. Cost was $47.50.
               NFPA recommends testing monthly by pressing the test
               button. It should be replaced by 2035. Your last test
               was... no record found. Want me to add a monthly
               reminder?"
```

**How the three layers merge:**

| Layer | Source | tenant_id Pattern | What It Answers |
|-------|--------|-------------------|----------------|
| **BB Provider** | Service history, crew notes, asset installs, BB SOPs | `bb_global` + `bb_prop_{id}` | "What did BB do at this house?" |
| **Homeowner** | Uploaded docs (inspection, warranty, insurance, HOA) | `cust_{uuid}` | "What's in my warranty?" "What did the inspector say?" |
| **Public** | Municipal codes, permits, assessor data, zoning | `public_{municipality}` | "Can I build here?" "What permits do I need?" |

**The query always fans out from property_id:**

```javascript
// Property-scoped tool execution
async function propertyQuery(question, propertyId, tenantId) {
  // 1. Determine which knowledge layers this property can access
  const property = await getProperty(propertyId);
  const tenantIds = [
    'bb_global',                          // BB's universal knowledge
    `bb_prop_${propertyId}`,              // BB's notes for THIS property
    tenantId,                             // homeowner's uploaded docs
    `public_${property.municipality}`,    // municipal codes/permits
  ];
  // Add linked providers
  const providers = await getLinkedProviders(tenantId);
  for (const p of providers) tenantIds.push(p.tenant_id);

  // 2. Parallel: structured data + RAG + asset lookup
  const [structured, ragResults, assets] = await Promise.all([
    queryStructuredData(question, propertyId),   // SQL on service_projects + line_items
    hybridRAGSearch(question, tenantIds),         // pgvector + BM25 on knowledge_chunks
    queryAssets(question, propertyId),            // SQL on home_assets
  ]);

  // 3. Assemble context for LLM summarization
  return { structured, ragResults, assets };
}
```

**Line-item granularity matters.** The homeowner asks "How much did the kitchen remodel cost?" — they want:

```
Kitchen Remodel — Completed August 2025
Original estimate: $47,500 | Change orders: $3,200 | Final: $50,700

Line items:
  Cabinets (Shaker White, 14 units)    $18,400  material
  Quartz countertops (Calacatta)        $8,900  material+install
  Electrical (20 circuits, GFCI)        $6,200  labor+material
  Plumbing (sink relocation)            $4,800  labor+material
  Tile backsplash (subway 3x6)          $3,100  material+install
  Painting (walls + trim)               $2,800  labor+material
  Demolition + haul-away                $2,400  labor
  Permit + inspection                   $1,200  permit
  Change order: add undercab lighting   $1,800  material+labor
  Change order: upgrade faucet          $1,400  material

Installed assets from this project:
  - KitchenAid KDTE204KPS dishwasher (warranty: 1yr parts+labor → Aug 2026)
  - InSinkErator Evolution Excel garbage disposal (warranty: 7yr → Aug 2032)
  - Broan NuTone range hood (warranty: 1yr → Aug 2026)
```

That answer comes from `bb_service_projects` + `bb_service_line_items` + `bb_home_assets` (linked via `installed_asset_id`). No RAG needed — this is pure structured SQL. But if the homeowner asks "Is my dishwasher still under warranty?", Buddy cross-references the asset's warranty_expiry with today's date AND checks their home warranty policy (RAG document) for extended coverage.

**This is the property knowledge stack:**

```
┌─────────────────────────────────────────────────┐
│              PROPERTY 'prop_247'                  │
│           1234 Eagle Harbor Dr, BI               │
├─────────────────────────────────────────────────┤
│                                                   │
│  STRUCTURED DATA (SQL queries)                   │
│  ├── bb_properties         → physical attributes │
│  ├── bb_home_assets        → appliances/systems  │
│  ├── bb_property_trees     → tree inventory      │
│  ├── bb_service_projects   → project history     │
│  └── bb_service_line_items → granular costs      │
│                                                   │
│  DOCUMENT KNOWLEDGE (RAG hybrid search)          │
│  ├── bb_global             → codes, standards    │
│  ├── bb_prop_247           → BB's property notes │
│  ├── cust_abc123           → HO's uploaded docs  │
│  └── public_bainbridge     → municipal records   │
│                                                   │
│  COMPUTED INTELLIGENCE (agents)                  │
│  ├── Asset age + lifespan  → replacement timeline│
│  ├── Service history       → maintenance gaps    │
│  ├── Seasonal calendar     → upcoming needs      │
│  └── Warranty status       → coverage checks     │
│                                                   │
└─────────────────────────────────────────────────┘
```

### PNW Seasonal Calendar (embedded in RAG as global knowledge)

The research produced a complete annual service schedule for the PNW. This becomes `tenant_id = 'bb_global'` content in the RAG:

| Season | Key Services | BB Buddy Proactive Use |
|--------|-------------|----------------------|
| **Spring (Mar-May)** | Gutter clean, tree prune, aeration, first mow, mulch, irrigation startup | "Spring is here — your gutters need post-winter cleaning. Want me to schedule?" |
| **Summer (Jun-Aug)** | Weekly mowing, window washing, hedge trim, irrigation tune-up | "This is the best window for exterior window washing. Shall I book it?" |
| **Fall (Sep-Nov)** | **CRITICAL: gutter clean**, leaf removal, roof moss treatment, winterize irrigation | "November gutter cleaning is your most important service. I see heavy leaf accumulation..." |
| **Winter (Dec-Feb)** | Storm response, tree removal (best pricing), drainage inspection | "Winter is the cheapest time for tree removal. That leaning maple we flagged..." |

**The AI advantage:** BB Buddy can cross-reference the seasonal calendar with each property's tree inventory, service history, and local weather to make proactive recommendations no competitor can match.

### Subscription Tiers (market-informed)

| Tier | Monthly | Annual (10% off) | Services |
|------|---------|------------------|----------|
| **BB Essential** | $149/mo | $1,609/yr | Bi-weekly mowing (seasonal), 2x gutter clean, 1x window wash |
| **BB Complete** | $299/mo | $3,229/yr | Weekly mowing, 2x gutter clean, 2x window wash, 1x pressure wash, seasonal cleanup |
| **BB Premium** | $499/mo | $5,389/yr | All Complete + tree care, roof cleaning, irrigation management, priority scheduling |

**Revenue projection:** 100 subscribers at BB Complete = $29,900/month = **$358,800/year recurring**.

### Customer Ingestion UX (for non-technical homeowners)

Upload flow must be dead simple:

1. Homeowner drops a PDF (home inspection, warranty, contract)
2. UI shows: "Reading your document..."
3. Backend: parse → chunk (512 tokens) → contextualize (Claude Haiku adds context sentence per chunk) → embed → store with `tenant_id = cust_{uuid}`
4. UI shows: "Your document is ready! Ask me anything about it."
5. Processing time: 10-30 seconds for a 50-page PDF

**BB Buddy's killer feature for customers:**
- Upload home inspection report → AI extracts all exterior/maintenance items → auto-generates a proposed BB service plan with pricing
- Point camera at a tree → AI identifies species, estimates size, flags visible disease → suggests service
- "When is my next gutter cleaning?" → answers from scheduling data
- "The tree in my backyard looks sick" → triggers vision assessment, creates service request

### Authentication — Now Required

Current v3.17: soft PIN auth for crew.
New requirement: real multi-tenant authentication.

| Audience | Auth Method | JWT Claims |
|----------|------------|------------|
| BB Crew | CalExp5 login (existing) | `{audience: 'crew', tenant_id: 'bb', employee_id: '...'}` |
| Homeowner | Email/password or OAuth (Google) | `{audience: 'customer', tenant_id: 'cust_xxx', property_ids: [...]}` |
| Provider | Email/password | `{audience: 'provider', tenant_id: 'prov_xxx'}` |

**Options:** Clerk ($25/mo for managed auth), Auth.js (free, self-hosted), or custom JWT on Bridge.

### Competitive Moat

**No existing home service platform has this.** The research confirmed:
- LawnStarter: satellite imagery for quotes (passive, no conversation)
- SingleOps: tree inventory pins on maps (manual, arborist-only)
- Jobber/Housecall Pro: scheduling + CRM (no AI)
- Lowe's HomeCare+: basic indoor tasks ($99/year, no exterior)
- **Nobody** has customer-facing AI voice+vision for home services

BB Buddy pointing at a tree and telling you its species, health status, and when it was last trimmed — while cross-referencing your inspection report and the PNW seasonal calendar — is genuinely novel.

### Capacity Validation: 2GB Per Property (Stress Test)

Validated against a real scenario: one home with 15 years of data (receipts, projects, estimates, drawings, aerial photos, before/after photos, loan docs, permits, service calls, insurance policies) totaling 2GB.

**Key finding: 2GB of files ≠ 2GB in pgvector.** Files stay in Drive/S3. Only extracted text + embeddings go in Neon.

| Metric | Value |
|---|---|
| Raw files | 2 GB (stays in Drive) |
| Extractable text | ~50-100 MB |
| Chunks (512 tokens) | ~5,000-12,000 |
| Vector storage | ~200 MB (vectors + HNSW index + text) |
| Embedding cost | **$0.14** (one-time) |
| Query latency | 5-20ms (HNSW) |
| Neon plan needed | Launch ($5/mo) |

**Image content strategy (60-70% of 2GB is images):**
- Text PDFs → pdf-parse extracts text → chunk → embed
- Scanned PDFs → OCR (Google Vision or Claude Vision) → chunk → embed
- Photos/drawings → Claude Vision generates 1-3 sentence description → embed description → store image URL in metadata
- Original images stay in Drive, referenced by `drive_file_id` in metadata
- This is **Option C: Hybrid** — text RAG + AI-generated image descriptions. Enables text search over visual content ("find the photo of the deck before renovation").

**Scaling to many customers:**

| Scale | Chunks | Vector Storage | Monthly Neon | Embedding (one-time) |
|---|---|---|---|---|
| 1 property (2GB) | 12K | 200 MB | $5 | $0.14 |
| 10 properties | 120K | 2 GB | $6 | $1.40 |
| 100 properties | 1.2M | 20 GB | $12 | $14 |
| 500 properties | 6M | 100 GB | $40 | $70 |
| 1,000 properties | 12M | 200 GB | $75 | $140 |

pgvector handles 12M vectors at 200GB on Neon Scale plan. Query latency stays under 50ms with HNSW.

**Bulk ingestion:** 2GB mixed corpus takes ~30-60 minutes to fully process (parse + OCR + describe + chunk + embed). For concurrent customer onboarding, use a job queue (BullMQ or Neon-based).

### Document Ingestion Pipeline — Detailed Spec

**The critical question: do we read 100% of everything upfront, or classify and defer?**

**Answer: Hybrid.** Classify everything cheaply (pennies), deep-index high-value docs immediately, queue the rest for background processing. The key finding from production RAG systems: **80% of retrieval failures trace back to ingestion quality, not the LLM.** Cutting corners on ingestion destroys trust on the first query.

#### Strategy: Three-Tier Ingestion

```
TIER 1 — INSTANT (on upload, <5 seconds per doc)
  Free. No API calls. Runs locally.
  ├── Extract file metadata (name, type, size, page count, creation date)
  ├── Generate thumbnail
  ├── Filename pattern matching → auto-classify 30-40% of docs
  │   "invoice_2024_03.pdf" → type: invoice
  │   "IMG_4521.jpg" → type: photo (needs further triage)
  │   "Home_Inspection_Report_2019.pdf" → type: inspection
  ├── Attempt text extraction (pdf-parse / PyMuPDF)
  │   If substantial text returned → mark as "digital PDF" (skip OCR)
  │   If < 50 chars/page → mark as "scanned" (needs OCR)
  ├── Text heuristic scan on first 500 chars
  │   Keywords: INVOICE, ESTIMATE, CHANGE ORDER, PERMIT, POLICY → auto-classify
  └── Result: every doc has metadata + type + processing_route

TIER 2 — FAST CLASSIFICATION (background, <1 minute for full batch)
  Cheap. ~$1.50 per 1,000 docs.
  ├── Docs not classified by Tier 1 → send page 1 to Claude Haiku
  │   Prompt: "Classify this document. Return: type, priority (high/med/low),
  │   has_tables, has_images, summary (1 sentence)."
  │   Cost: ~500-1000 tokens/doc × $1/MTok = $0.75 per 1,000 docs
  ├── Images → quick text detection (local EasyOCR or Google Vision)
  │   If text found → route to OCR pipeline
  │   If no text → route to AI description pipeline
  └── Result: every doc classified, prioritized, routed

TIER 3 — DEEP INDEXING (background queue, 30-90 minutes for 2GB)
  Where the money goes. ~$8-15 per customer.
  ├── Route by processing_route:
  │   ├── digital_pdf → pdf-parse → Docling (for tables) → chunk → enrich → embed
  │   ├── scanned_pdf → Google Vision OCR → Docling → chunk → enrich → embed
  │   ├── image_with_text → Google Vision OCR → chunk → enrich → embed
  │   ├── image_photo → Claude Haiku description → embed
  │   ├── spreadsheet → CSV/XLSX parse → serialize rows with headers → chunk → embed
  │   └── google_doc → Drive API export text → chunk → enrich → embed
  └── Result: all chunks in pgvector with HNSW index, searchable
```

#### Why Not 100% Upfront AND Why Not Lazy

| Approach | Problem |
|----------|---------|
| **100% upfront blocking** | User waits 30-90 minutes before they can ask any questions. Terrible UX. |
| **100% lazy (index on first query)** | First query for each doc returns garbage or nothing. Destroys trust immediately. |
| **Our hybrid** | Tier 1+2 complete in seconds (user sees their doc library instantly with types/thumbnails). Tier 3 runs in background (user can ask questions about already-indexed docs while the rest processes). Progress bar shows "247 of 412 documents indexed..." |

**The UX flow:**
1. Customer uploads 2GB folder (or connects Google Drive)
2. Within 5 seconds: all documents appear in gallery with thumbnails + auto-classified types
3. Within 1 minute: all documents classified and prioritized
4. Background: deep indexing progresses. User sees: "Indexing: 247/412 documents ready"
5. User can immediately ask questions about already-indexed docs
6. Within 30-90 minutes: 100% indexed. BB Buddy has full knowledge of the home.

#### Processing Routes in Detail

**Digital PDFs (text layer present, ~70% of construction docs):**
- pdf-parse extracts text immediately (10ms/doc, free)
- For docs with tables (invoices, estimates, BOQs): Docling for structured extraction (97.9% table accuracy, free, local)
- Chunk at 512 tokens with 64 token overlap
- Contextual enrichment: Claude Haiku adds 1-2 sentence context to each chunk (Anthropic's method, reduces retrieval failures by 49%)
- Embed with text-embedding-3-small via Batch API

**Scanned PDFs (no text layer, ~15% of docs):**
- Google Vision DOCUMENT_TEXT_DETECTION: $1.50/1K pages, 98% accuracy on printed text
- Then same pipeline as digital PDFs: Docling → chunk → enrich → embed
- Flag docs where OCR confidence is low for manual review

**Photos with text (receipts, permits, labels, ~10% of files):**
- Google Vision TEXT_DETECTION detects and extracts text
- Or Claude Haiku Vision for both OCR + context in one call ($0.002/image)
- Extracted text → chunk → enrich → embed
- Store original image URL in metadata for display

**Photos without text (before/after, aerials, site photos, ~5% of files):**
- Claude Haiku Vision generates description (100-200 tokens)
  "Exterior photo: two-story Craftsman home, new fiber cement siding installed,
  before photo shows deteriorated cedar shakes. North-facing elevation."
- Description embedded as a chunk with `source_type: 'image_description'`
- Original image URL in metadata — BB Buddy can show the photo when it finds the description
- Cost: $0.002/image via Batch API

**Spreadsheets (price lists, vendor sheets):**
- Export to CSV, serialize each row group with column headers
- "Item: 2x6 PT 16ft | Supplier: Pacific Lumber | Price: $8.47/ea | Updated: 2026-03-15"
- Tables are atomic: never split a row from its headers
- Embed the serialized text

**Large documents (50+ pages — building plans, insurance policies):**
- Split by logical sections using PDF bookmarks/ToC if available
- For building plans: each page treated as an image → Claude Haiku describes layout, dimensions, room labels
- For dense text (insurance policies, loan docs): chunk normally but with higher overlap (128 tokens) to preserve clause boundaries
- Small-to-Big retrieval: index small chunks, but store parent section reference so BB Buddy can expand context when needed

#### Contextual Enrichment (the 49% improvement)

Anthropic's Contextual Retrieval research shows that prepending document-level context to each chunk reduces retrieval failures by 49% (67% when combined with BM25 hybrid search — which we're already doing).

**What it looks like:**

```
BEFORE enrichment (raw chunk):
  "The anode rod should be inspected every 3 years and replaced
   if more than 50% depleted. Sediment should be flushed annually
   by connecting a hose to the drain valve."

AFTER enrichment (contextualized chunk):
  "This chunk is from the Rheem Performance Plus 50-gallon water heater
   owner's manual (model XG50T09HE40U0), Section 7: Maintenance Schedule.
   The anode rod should be inspected every 3 years and replaced
   if more than 50% depleted. Sediment should be flushed annually
   by connecting a hose to the drain valve."
```

The added context sentence costs ~100 tokens of Claude Haiku input per chunk. With prompt caching (the document context is reused across all chunks from the same doc), this drops to ~$1.02 per million document tokens.

**Total enrichment cost for 2GB corpus:** ~$5 (the largest single line item).

#### Queue Architecture

```
┌──────────┐     ┌────────────┐     ┌────────────┐
│  Upload   │────→│  pg-boss   │────→│  Workers   │
│  Landing  │     │  Job Queue │     │  (Node.js) │
│  Zone     │     │  (Postgres)│     │            │
│  (Drive/  │     │            │     │  classify  │
│   S3)     │     │  Jobs:     │     │  ocr       │
└──────────┘     │  classify  │     │  chunk     │
                  │  ocr       │     │  enrich    │
                  │  chunk     │     │  embed     │
                  │  enrich    │     │  validate  │
                  │  embed     │     │            │
                  │  validate  │     └─────┬──────┘
                  └────────────┘           │
                                          ▼
                                   ┌────────────┐
                                   │  pgvector   │
                                   │  (Neon)     │
                                   └────────────┘
```

**Why pg-boss over BullMQ:** No Redis dependency. Atomic job creation with document metadata in one Postgres transaction. Already using Neon Postgres. Exactly-once delivery via SKIP LOCKED. Good enough throughput for our scale.

**Queue concurrency settings:**

| Stage | Concurrency | Rate Limit | Why |
|-------|------------|-----------|-----|
| Classify (Tier 1) | 10 | None (local) | CPU-bound, fast |
| Classify (Tier 2, Haiku) | 5 | 50 RPM (Tier 1) to 4,000 RPM (Tier 4) | API limit |
| OCR (Google Vision) | 5 | 1,800 RPM | Google's limit |
| Chunk | 10 | None (local) | CPU-bound |
| Enrich (Claude Haiku) | 5 | Match API tier | Largest cost item |
| Embed (OpenAI Batch) | 1 | 2,048 per request, 50K per batch | Batch API is fire-and-poll |
| Validate | 3 | None (local) | Runs test queries |

**Progress tracking:** pg-boss emits job progress → Bridge SSE endpoint → customer UI shows "Indexing: 247/412 documents ready. Estimated time remaining: 12 minutes."

**Retry policy:** 3 attempts with exponential backoff (1s, 4s, 16s). Dead-letter queue for persistent failures. Customer notified: "3 documents need manual review" with links to the problematic files.

#### Quality Assurance

**Automatic checks (run on every chunk):**

| Check | Threshold | Action |
|-------|-----------|--------|
| Chunk too short | < 50 tokens | Merge with adjacent chunk |
| Chunk too long | > 2,500 tokens | Re-split |
| Gibberish (bad OCR) | > 30% non-dictionary words | Flag for manual review |
| Empty/whitespace | 0 meaningful tokens | Discard, log warning |
| Near-duplicate | Cosine similarity > 0.98 with existing chunk | Deduplicate |

**Validation after ingestion completes:**

| Test | Target | Method |
|------|--------|--------|
| Context precision | > 0.7 | Golden dataset of 20-50 Q&A pairs → run retrieval → check if correct chunks in top 5 |
| Context recall | > 0.8 | All information needed is present in retrieved chunks |
| Same-doc coherence | High intra-doc similarity | Chunks from same document should cluster together |
| Cross-tenant isolation | Zero leakage | Auth as Tenant A, query, assert zero Tenant B results |

**Golden dataset:** For each property, auto-generate 10-20 test questions from the classified documents:
- "What did the home inspection say about the roof?" (from inspection report)
- "When was the water heater installed?" (from service line items)
- "What's the coverage limit on my home warranty?" (from insurance policy)
Run these after every ingestion to catch regressions.

**Expected manual review rate:** ~10-15% of documents in a mixed 2GB corpus. Mostly scanned docs with tables and handwritten inspector notes. The UI flags these: "3 documents may have extraction issues — review recommended."

#### Cost Breakdown per Customer (2GB corpus)

| Stage | What | Cost |
|-------|------|------|
| **Classification** | Filename patterns (free) + Haiku first-page ($0.75/1K) | **$1.50** |
| **Text extraction** | pdf-parse for digital PDFs (~70% of docs) | **Free** |
| **OCR** | Google Vision for scanned PDFs + text images (~600 docs) | **$0.90** |
| **Image descriptions** | Claude Haiku Batch for ~200 photos | **$0.40** |
| **Contextual enrichment** | Claude Haiku + prompt caching, ~5M tokens | **$5.10** |
| **Embeddings** | text-embedding-3-small Batch API, ~5M tokens | **$0.05** |
| **Table extraction** | Docling (local, free) | **Free** |
| | | |
| **Total per customer** | | **~$8-10** |
| **Total for 500 customers** | | **~$4,000-5,000** one-time |

**Where the money goes:** 60% contextual enrichment (Claude Haiku), 10% OCR (Google Vision), 5% image descriptions, <1% embeddings. Embeddings are essentially free. The intelligence layer (contextual enrichment) is the investment that drives the 49-67% retrieval quality improvement.

#### Bulk Upload UX

**For the initial property onboarding (the 2GB scenario):**

```
OPTION A: Google Drive folder
  Customer shares a Drive folder with BB → Bridge polls, discovers files,
  auto-ingests everything. No manual upload needed.
  Best for: tech-comfortable customers with organized Drive folders.

OPTION B: Web upload
  Customer drags entire folder into upload zone in BB customer portal.
  Files stream to object storage, pipeline kicks off automatically.
  Progress bar: "Uploading... Processing... 247/412 indexed"
  Best for: customers who want to upload from their computer.

OPTION C: Guided walkthrough with BB Buddy
  Customer opens BB Buddy, says "I want to set up my home."
  Buddy: "Great! Let's start by uploading your key documents.
  Do you have a home inspection report?"
  Guides through: inspection → insurance → warranty → permits → receipts
  Each uploaded immediately, processed in background.
  Best for: non-technical customers who need hand-holding.

OPTION D: BB crew onboarding visit
  BB crew visits, does the appliance walkthrough (camera + voice),
  AND uploads customer's paper documents by scanning with phone camera.
  Buddy handles everything — crew just points and talks.
  Best for: premium tier customers, highest quality results.
```

**All four options feed the same pipeline.** The difference is just the upload mechanism.

### Architecture Impact Summary

| Dimension | Original V2 Plan | With Home Services |
|-----------|-----------------|-------------------|
| **Users** | ~10 BB crew | Crew + hundreds of homeowners + providers |
| **RAG schema** | `bb_knowledge_chunks` | Same table + `tenant_id` + RLS |
| **Auth** | PIN-based soft auth | JWT with tenant claims (Clerk or custom) |
| **MCP tools** | 8 tools, crew-only | 15+ tools, audience-gated |
| **New tables** | `bb_knowledge_chunks` | + `bb_properties`, `bb_property_trees`, `bb_home_assets`, `bb_service_projects`, `bb_service_line_items` |
| **pgvector cost** | ~$0-5/mo (BB docs only) | ~$40/mo at 500 properties (2GB each) |
| **Voice model cost** | ~$440/mo (10 crew) | + customer sessions (usage-based) |
| **Scheduling** | Not needed | Jobber or similar ($49-149/mo) |
| **Revenue** | $0 (internal tool) | $358K/yr at 100 Complete subscribers |

### Home Asset Inventory + Lifecycle Management

BB Buddy becomes a **proactive home management agent.** Crew walks through a customer's home, points the camera at every appliance, and Buddy reads the label, identifies make/model/age, and builds a complete home inventory.

**The walkthrough flow:**

```
Crew arrives at customer home with BB Buddy on phone
  │
  ├── Point at water heater label
  │   → Vision agent reads: Rheem XG50T09HE40U0, mfg March 2019
  │   → Knowledge agent: 50-gal, 8-12yr lifespan, annual flush recommended
  │   → Asset created: {type: 'water_heater', make: 'Rheem', model: 'XG50T09HE40U0',
  │     mfg_date: '2019-03', age_years: 7, condition: 'operational'}
  │   → Buddy speaks: "That's a Rheem 50-gallon, about 7 years old. Typical lifespan
  │     is 8-12 years. I'd recommend an annual tank flush and anode rod check."
  │
  ├── Point at HVAC unit
  │   → Vision reads model plate, knowledge cross-references maintenance schedule
  │   → Asset created with filter change interval, last service unknown
  │   → Buddy: "Carrier Infinity, installed 2021. Filters every 3 months.
  │     No service records found — want me to schedule a filter change?"
  │
  ├── Point at dishwasher
  │   → Vision reads: Bosch 500 Series SHPM65Z55N, mfg 2020
  │   → Knowledge: 2-year parts warranty (expired), 10-year lifespan typical
  │   → Asset created with warranty status
  │
  └── Result: complete home inventory with maintenance timeline
```

**Later — the homeowner calls BB Buddy:**

```
"My water heater is leaking!"
  │
  ├── Buddy pulls asset: Rheem XG50T09HE40U0, 7 years, mfg 2019
  ├── Checks warranty: 6-year tank warranty expired March 2025
  ├── Checks home warranty: Fidelity Home Warranty covers water heaters up to $1,500
  ├── Buddy: "Your manufacturer warranty expired last year, but your Fidelity home
  │   warranty covers this. I can help you file a claim. Can you take a photo of
  │   the leak for the claim?"
  ├── Customer sends photo via addImage()
  ├── Buddy generates claim document with: asset details, photo, failure description
  ├── Files claim via email/API to warranty provider
  └── Schedules emergency plumber from BB's provider network
```

**This is the moat.** After one walkthrough, BB knows more about the customer's home than they do. Every appliance has a ticking clock — and BB Buddy is the only one watching it.

**Schema: Home Assets**

```sql
CREATE TABLE bb_home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES bb_properties(id),
  tenant_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,           -- 'water_heater','hvac','dishwasher','furnace',
                                      -- 'washer','dryer','refrigerator','roof','siding',
                                      -- 'garage_door','smoke_detector','gfci','panel'
  make TEXT,
  model TEXT,
  serial_number TEXT,
  manufacture_date DATE,
  install_date DATE,
  age_years NUMERIC GENERATED ALWAYS AS (
    EXTRACT(YEAR FROM AGE(COALESCE(install_date, manufacture_date)))
  ) STORED,
  expected_lifespan_years INT,        -- from manufacturer/RAG knowledge
  condition TEXT DEFAULT 'operational', -- 'operational','degraded','failed','replaced'
  location_in_home TEXT,              -- 'basement','kitchen','garage','utility room'
  warranty_provider TEXT,             -- 'manufacturer','Fidelity Home Warranty','AHS'
  warranty_expiry DATE,
  warranty_coverage TEXT,             -- 'parts only','parts+labor','full replacement'
  warranty_max_cents INT,             -- coverage cap in cents
  home_warranty_id TEXT,              -- link to home warranty policy
  maintenance_interval_months INT,    -- recommended service frequency
  last_maintenance_date DATE,
  next_maintenance_due DATE,
  energy_rating TEXT,                 -- 'Energy Star','Standard'
  photos JSONB DEFAULT '[]',          -- [{url, date, label_photo: true}]
  specifications JSONB DEFAULT '{}',  -- {capacity_gallons, btu, tonnage, etc.}
  recall_status TEXT DEFAULT 'clear', -- 'clear','recalled','checked_2026-04-01'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ha_property ON bb_home_assets(property_id);
CREATE INDEX idx_ha_tenant ON bb_home_assets(tenant_id);
CREATE INDEX idx_ha_type ON bb_home_assets(asset_type);
CREATE INDEX idx_ha_maintenance ON bb_home_assets(next_maintenance_due);

-- RLS
ALTER TABLE bb_home_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bb_home_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bb_home_assets
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true));
```

**New MCP tools for asset management:**

| Tool | Who Can Use | What It Does |
|------|------------|-------------|
| `inventory_asset` | Crew, Customer | Vision reads label → creates bb_home_assets record |
| `get_asset_info` | Crew, Customer | Retrieves asset details, warranty status, maintenance history |
| `check_warranty` | Crew, Customer | Cross-references asset with warranty provider terms |
| `file_claim` | Customer (crew assists) | Generates claim doc with asset details + photos, submits |
| `schedule_maintenance` | Crew, Customer | Creates service request based on asset maintenance schedule |
| `check_recalls` | System (automated) | Periodic CPSC recall database check by model number |
| `get_maintenance_timeline` | Crew, Customer | Shows all assets sorted by next_maintenance_due |

**RAG knowledge needed for asset intelligence:**

| Knowledge Type | Source | Example |
|---------------|--------|---------|
| Manufacturer maintenance schedules | Product manuals (PDF) | "Rheem: flush tank annually, check anode rod every 3 years" |
| Typical lifespans by appliance type | Industry data (embedded) | "Tank water heaters: 8-12 years, tankless: 20+ years" |
| Warranty terms by manufacturer | Manufacturer websites | "Rheem residential: 6-year tank, 6-year parts" |
| Home warranty provider coverage | Policy documents (customer upload) | "Fidelity: water heater up to $1,500 per incident" |
| Recall database | CPSC API (automated sync) | "Rheem XG50T recalled for gas valve defect — Nov 2024" |
| Troubleshooting guides | Manufacturer + expert knowledge | "Water heater leaking from bottom: likely tank failure vs T&P valve" |
| Energy efficiency comparisons | Energy Star database | "Replacing 2019 standard with heat pump saves ~$300/year" |

**Proactive alerts (the real value):**

BB Buddy doesn't wait for things to break. It watches the timeline:
- "Your Carrier HVAC filter is due for a change next week. Want me to schedule it?"
- "Your Rheem water heater is 7 years into an 8-12 year lifespan. I recommend scheduling an inspection before winter."
- "Your Bosch dishwasher was recalled for a fire hazard (CPSC #26-789). Contact Bosch for a free repair."
- "Based on your home's age and asset inventory, here are the top 5 maintenance priorities this quarter..."

### Updated Phase Plan

The original 5 phases still hold, but Phase 2 and Phase 3 expand significantly:

| Phase | Original Scope | Added for Home Services + Assets |
|-------|---------------|----------------------------------|
| **0: Agents SDK** | Unchanged | Unchanged |
| **1: MCP Tools** | Unchanged | Add audience-gating to tool registry |
| **2: RAG** | BB docs only | + multi-tenant schema, customer upload pipeline, property knowledge tables, appliance knowledge base |
| **3: Financial + Action** | QBO/QBT queries | + scheduling (Jobber API), subscription mgmt, property CRUD, home asset inventory, warranty tracking, claim filing |
| **4: Voice abstraction** | Unchanged | Unchanged |
| **5: Multi-agent** | Unchanged | + seasonal recommendations, neighborhood clustering, proactive maintenance alerts, recall monitoring |
| **NEW 6: Customer portal** | N/A | Subscription signup, property onboarding, document upload, asset gallery, maintenance timeline, claim status |

**Phase 6 is the customer-facing product.** Phases 0-3 build the platform that makes Phase 6 possible. The architecture supports it from day one if we include `tenant_id` in Phase 2.

**If using Full instead of Mini:** ~$1,500/mo. Only justified if tool accuracy is measurably better.

---

## Home Knowledge Model — Property Completeness Template

### The Concept

Every property has a **knowledge completeness score** — a template of what an ideal home RAG should contain. BB Buddy guides the homeowner to fill gaps, shows progress, and auto-populates what it can from public records.

```
970 Huntington Drive — Knowledge Score: 62% ████████░░░░
  ✅ Purchase & Title (100%)    ✅ Inspection Reports (100%)
  ✅ Pest/Fumigation (100%)     ✅ Solar System (100%)
  ⚠️  Insurance Policy (0%)      ⚠️  Appliance Inventory (0%)
  ⚠️  Maintenance Records (20%)  ⚠️  Permits (50%)
  ✅ Utility Data (100%)         ⚠️  Home Warranty (50%)

  BB Buddy: "Upload your insurance declarations page and I'll
  do a 20-min walkthrough to inventory your appliances.
  That gets you to 85%."
```

### Document Categories (10 categories, ~70-80 document slots)

| Cat | Category | Key Documents | Importance |
|-----|----------|--------------|------------|
| **A** | Purchase & Ownership | Grant deed, purchase agreement, title insurance, deed of trust, closing disclosure | CRITICAL |
| **B** | Disclosures & Hazards | Transfer disclosure (TDS), NHD report, seller questionnaire, lead paint, HOA CC&Rs | CRITICAL |
| **C** | Inspection Reports | Home inspection, pest/termite, roof, sewer scope, septic, foundation, chimney, pool | CRITICAL |
| **D** | Insurance | Homeowner's policy, declarations page, replacement cost estimate, flood/earthquake, contents inventory | CRITICAL |
| **E** | Tax & Financial | Property tax bill, supplemental tax, capital improvement receipts, solar credits | HIGH |
| **F** | Estate/Legal | Living trust, transfer deed, will, power of attorney | HIGH (if applicable) |
| **G** | Permits & Improvements | Building permits, certificate of occupancy, architectural plans, contractor invoices, lien releases | HIGH |
| **H** | Systems & Appliances | HVAC records, water heater docs, roof warranty, appliance manuals, electrical panel schedule | HIGH |
| **I** | Maintenance Records | HVAC service, pest control, chimney cleaning, septic pumping, tree trimming, appliance repairs | MEDIUM |
| **J** | Utility Accounts | Electric, gas, water/sewer, energy usage history | MEDIUM |

### Structured Property Knowledge (~350-400 fields)

| Domain | Fields | Capture Method |
|--------|--------|---------------|
| Physical attributes | ~25 (year, sqft, lot, stories, rooms, construction, exterior, roof, foundation) | Public records auto-populate |
| HVAC system | ~17 (type, fuel, brand, model, age, tonnage, SEER, filter, zones) | BB Buddy camera walkthrough |
| Plumbing system | ~16 (water source, heater, pipe material, sewer/septic, main shutoff) | BB Buddy walkthrough |
| Electrical system | ~20 (panel amps, wiring type, GFCI, solar, EV charger, generator) | BB Buddy panel photo |
| Roofing | ~10 (material, age, warranty, condition, gutters) | BB Buddy exterior + upload |
| Appliance inventory | ~18 per appliance x 10-20 appliances | BB Buddy reads labels |
| Exterior/grounds | ~24 (irrigation, trees, fence, deck, driveway, hardscape) | BB Buddy exterior walkthrough |
| Infrastructure | ~14 (water, sewer, gas, electric, internet providers) | Auto-populate + confirm |
| Environmental/hazard | ~20 (flood, fire, seismic, soil, radon, asbestos, wind) | FEMA/Cal MyHazards APIs (free) |
| Rooms inventory | ~15 per room x 10-20 rooms | BB Buddy room-by-room walkthrough |
| Ownership/history | Variable (purchases, renovations, claims) | Documents + public records |

### Minimum Viable Document Set — "First 10"

When a homeowner has nothing, ask for these in priority order:

| # | Document | Why AI Needs It | How to Get It |
|---|----------|----------------|---------------|
| 1 | Home Inspection Report | Baseline of every system and defect | Should have from purchase; else hire inspector ~$400-600 |
| 2 | Insurance Declarations Page | Coverage, deductibles, exclusions | Download from carrier portal |
| 3 | Property Tax Bill | Parcel number (unlocks public records), assessed value | County website (free) |
| 4 | NHD / Natural Hazard Report | Flood, fire, seismic risk profile | Should have from purchase; else ~$100 |
| 5 | Appliance Photo Walkthrough | Make, model, serial, age of everything | BB Buddy 20-min walkthrough |
| 6 | Seller Disclosures (TDS/SPQ) | Known defects, repair history, system ages | From purchase package |
| 7 | Roof info (age, material, warranty) | Most expensive replacement item | Photo + warranty doc |
| 8 | HVAC info (type, age, last service) | Second most expensive system | Nameplate photo + service receipt |
| 9 | Electrical Panel Photo | Amp service, circuit map, breaker types | Quick photo of open panel door |
| 10 | Permit History | What work was done legally/unpermitted | City building dept portal or Shovels.ai |

### Auto-Population (zero homeowner effort, address-only)

| Data | API Source | Cost |
|------|-----------|------|
| Flood zone | FEMA NFHL REST API | Free |
| Multi-hazard risk (18 types) | FEMA National Risk Index | Free |
| Seismic hazard | USGS API | Free |
| Soil type | USDA NRCS Web Soil Survey | Free |
| Climate zone | DOE/IECC maps | Free |
| Product recalls (by model) | CPSC Recalls API | Free |
| Building permits | Shovels.ai API | Paid (85% US coverage) |
| Property attributes (190+ fields) | Precisely / PropMix | Paid (per-lookup) |
| Energy usage (smart meter) | Green Button (customer authorizes once) | Free |

**With just an address, BB auto-populates ~25-30% of the knowledge model** before the homeowner lifts a finger.

### Onboarding Flow — Projected 60-80% Completion in First Session

| Phase | Effort | Model Coverage | Method |
|-------|--------|---------------|--------|
| **1: Address bootstrap** | Zero (automatic) | 25-30% | Public record APIs fill physical, environmental, hazard data |
| **2: Camera walkthrough** | 20-30 min with BB Buddy | 60-70% | AI reads nameplates, identifies materials, counts rooms/windows |
| **3: Document upload** | Guided "First 10" list | 80-90% | Homeowner uploads key docs, BB extracts and indexes |
| **4: Ongoing enrichment** | Zero (automatic) | 90%+ | Recall monitoring, email relay, seasonal prompts, service visits |

Industry average for manual-entry home inventory apps: **10-15% completion**. Our projected rate with auto-populate + camera walkthrough + guided upload: **60-80% in the first session.** The difference is that BB does most of the work.

---

## Zero-Friction Knowledge Acquisition Channels

The RAG shouldn't be a filing cabinet. It should be a **living system that captures knowledge from wherever it naturally flows.**

### Channel Architecture

```
┌─────────────────────────────────────────────────────────┐
│           PROPERTY RAG (bb_knowledge_chunks)              │
│                    property_id                            │
└──────────────────────┬──────────────────────────────────┘
                       │ auto-ingest from all channels
        ┌──────────────┼──────────────┬──────────────┐
        │              │              │              │
   📧 EMAIL       📱 SMS/MMS     📸 CAMERA      🔗 CONNECTED
   RELAY          RELAY          CAPTURE       ACCOUNTS
        │              │              │              │
  prop247@        Text photo     BB Buddy      PG&E Green
  buddy.bb        to BB number   "file this"   Button, Solar
                                               monitoring,
   Forward any    Snap physical  Point at doc   insurance
   home email     mail, send     or label,     portal auto-
                                Buddy files it  sync
        │              │              │              │
        └──────────────┼──────────────┼──────────────┘
                       │              │
                  🎤 VOICE       📂 MANUAL
                  CAPTURE        UPLOAD
                       │              │
                  "Buddy,        Drag-and-drop
                  remember        in customer
                  the plumber     portal or
                  said..."        Drive folder
```

### Per-Property Email Relay (highest ROI)

Every property gets a unique email address: `970huntington@buddy.bb` or `prop247@bb.homes`

**How it works:**
1. Homeowner sets up one Gmail/Outlook forwarding rule: "If from PG&E, State Farm, HOA → forward to 970huntington@buddy.bb"
2. Bridge receives email via webhook (SendGrid/Mailgun)
3. Pipeline: extract attachments → classify → ingest into property RAG
4. BB Buddy: "I received your updated insurance declarations. Your coverage is now $650K dwelling, $325K personal property, $1K deductible. I've updated your property file."

**What flows in automatically once the forwarding rule is set:**
- Insurance renewal declarations (annually)
- Property tax bills (annually)
- Utility bills (monthly)
- HOA communications
- Contractor invoices/estimates
- Service appointment confirmations
- Home warranty renewals

**Cost:** SendGrid free tier handles 100 emails/day. At scale, $15/mo for 50K emails.

### SMS/MMS Relay

Homeowner texts a photo of a document to their BB number:
- Twilio receives MMS → extract image → OCR → classify → ingest
- "I just got the roof warranty in the mail" → snap photo → text to BB → done
- Cost: Twilio ~$0.0079/incoming MMS

### Connected Account Auto-Sync

| Service | Sync Method | Data | Frequency |
|---------|------------|------|-----------|
| PG&E / Utility | Green Button API (customer authorizes once) | Energy usage, billing | Monthly |
| Solar monitoring (Enphase/SolarEdge) | OAuth API | Production data, system health | Daily |
| Insurance portal | Screen scrape or API (carrier-dependent) | Declarations, coverage changes | Annually |
| Weather | Open-Meteo API (free) | Property-local weather for service scheduling | Daily |

### Voice Capture (already built)

BB Buddy's existing crew memory system extends to homeowners:
- "Buddy, remember: the main water shutoff is behind the water heater in the garage"
- "Buddy, the plumber said the water pressure is 80 PSI and the PRV needs replacing in a year"
- Transcribed → embedded → stored in property RAG with `source_type: 'voice'`

### The Result: Self-Maintaining Knowledge

After initial onboarding, the property RAG **grows by itself:**
- Insurance renewals arrive via email relay → auto-indexed
- Utility bills arrive monthly → energy trends tracked
- BB crew visits for service → observations captured via voice + photos
- Manufacturer recalls checked monthly against appliance inventory
- Seasonal prompts generate maintenance data ("Did you service your HVAC?" → receipt uploaded → indexed)

The homeowner's effort after onboarding: **near zero.** The RAG just gets smarter over time.

---

## Retail Product Knowledge (Home Depot, Lowe's, etc.)

### The Opportunity

BB crew and homeowners constantly reference products from major retailers:
- "What's the right replacement filter for my Carrier furnace at Home Depot?"
- "What Moen faucets does Lowe's have for a kitchen remodel under $300?"
- "I need a GFCI outlet — which one is in stock at the Aptos Home Depot?"

### Approach: Web Search + Structured Product APIs (NOT building our own RAG per retailer)

**Building a RAG of Home Depot's catalog would be wrong.** Here's why:

| Approach | Problem |
|----------|---------|
| RAG Home Depot's full catalog | Millions of SKUs, prices change daily, inventory varies by store. Stale within hours. |
| RAG Lowe's product pages | Same issues. Copyright/ToS concerns with bulk scraping. |
| RAG manufacturer manuals | Better — but still millions of products. Most are never queried. |

**The right approach: real-time search + selective caching.**

BB Buddy already has `search_web` (SerpAPI) and Claude `web_search`. These return **live** product results with current pricing and availability. No stale RAG needed.

**What IS worth putting in RAG:**
- Products BB has actually used and recommends (curated, not scraped)
- BB's supplier pricing agreements (not retail pricing)
- Product compatibility data for installed assets ("this furnace takes this filter")
- Manufacturer maintenance manuals for products the homeowner actually owns

### How It Works in Practice

```
Homeowner: "I need a new filter for my furnace"
  │
  BB Buddy checks bb_home_assets:
  │  → Carrier Infinity 24ANB1, filter size 20x25x5, MERV 13
  │
  BB Buddy calls search_web tool:
  │  → "Carrier 20x25x5 MERV 13 furnace filter Home Depot"
  │  → Returns: Honeywell FC100A1037, $32.97, in stock at Aptos HD
  │
  BB Buddy: "Your Carrier Infinity takes a 20x25x5 MERV 13 filter.
  │  The Honeywell FC100A1037 is compatible — $32.97 at your local
  │  Home Depot, currently in stock. Want me to add a reminder to
  │  change it every 3 months?"
  │
  └── If the homeowner buys it, BB logs it:
      → bb_home_assets: last_maintenance_date = today
      → bb_service_line_items: "Honeywell FC100A1037 filter, $32.97, self-installed"
      → next_maintenance_due = today + 90 days
```

**The magic is the cross-reference:** BB Buddy knows what's installed (from the asset inventory), what's compatible (from manufacturer data in RAG), what's available (from live web search), and when it was last replaced (from service history). No retailer RAG needed — just intelligence connecting the dots.

### What BB SHOULD Curate in RAG

| Knowledge | Source | Why |
|-----------|--------|-----|
| BB's preferred products by category | BB crew experience + Sam's knowledge | "We always use Simpson Strong-Tie for seismic" — tribal knowledge |
| Compatibility mappings | Manufacturer cross-reference guides | "This furnace takes this filter" — saves web search on known combos |
| BB's supplier pricing | Vendor agreements (not retail) | Crew needs to know BB's cost, not retail price |
| Common fix-it guides | Curated by BB for their service area | "How to reset a Rheem water heater" — frequent customer question |
| Product recalls + safety alerts | CPSC API (automated) | "Your XYZ model was recalled" — proactive safety |

### Store Inventory APIs (future consideration)

Home Depot and Lowe's both have product APIs:
- **Home Depot Partner API** — requires partnership agreement, provides real-time inventory
- **Lowe's Product API** — similar partnership model
- **Alternative:** SerpAPI returns Home Depot/Lowe's results with pricing and "in stock" indicators

For now, web search covers this. If BB scales to hundreds of customers making daily product queries, a direct retail API partnership becomes worthwhile.

---

## Spatial/3D Property Intelligence (Layer 3)

### The Third Data Dimension

Documents are 2D text. Structured data is relational. Spatial data is **3D + temporal** — and it answers questions no document can:
- "How big is the master bathroom?" → room dimensions from LiDAR scan
- "Show me the kitchen from last year's walkthrough" → timestamped video frame
- "Where exactly is the water heater?" → spatial location in the utility room
- "What does the roof look like from above?" → drone/satellite imagery

### Production-Ready Pipeline (iPhone crew, no special equipment)

```
iPhone Camera (video walkthrough)
  │  30-min walkthrough → Gemini 2.5 Flash → scene descriptions + timestamps
  │  Cost: $0.27 per walkthrough
  │
iPhone LiDAR (Polycam Pro, $20/mo)
  │  Room-by-room scan → auto floor plan → dimensions + metadata
  │  Accuracy: within 1-5% (good for estimates, not for architecture)
  │
iPhone Photos (8-10 exterior shots → Hover, $25/structure)
  │  AI generates full exterior 3D model with measurements
  │  Windows, doors, siding, roofing, trim — all measured
  │
  └──→ All converge in Neon pgvector as text descriptions + structured metadata
```

### Video Walkthrough Processing

**Strategy: 1 FPS extraction with scene-change detection → hierarchical descriptions**

| Step | What | Cost |
|------|------|------|
| Frame extraction | 1 FPS with FFmpeg scene-change filter → ~300-600 meaningful frames from 30 min | Free (local) |
| Scene segmentation | Group similar consecutive frames into scenes (kitchen, bathroom, etc.) | Free (local) |
| Scene description | Gemini 2.5 Flash describes each scene (cheapest native video API) | **$0.27 / 30 min** |
| Temporal indexing | Each description tagged with video timestamp (3:24 = "entering kitchen") | Free |
| Embedding | Scene descriptions → text-embedding-3-small → pgvector | $0.01 |

**Alternative: Twelve Labs** ($0.99/30 min) — purpose-built video understanding with temporal search. Query "show me the water heater" → returns exact timestamp. Worth evaluating for the premium tier.

**Output per walkthrough:**
- ~50-100 scene descriptions (text chunks) with timestamps
- ~100-500 keyframe images (JPEG, stored in S3/Drive)
- ~1 MB in pgvector (descriptions + embeddings)
- ~100-500 MB in object storage (frames)

### iPhone LiDAR Scanning

**Polycam Pro ($20/mo unlimited scans)** is the practical choice for BB crew:
- Auto-detects walls, windows, doors, furniture
- Generates floor plans with measurements
- Exports: PDF floor plans, DXF (CAD), PLY/OBJ (3D mesh), CSV room data
- Room dimensions accurate within 1-5%

**Per-room metadata extracted from LiDAR:**

```json
{
  "room_name": "Primary Bathroom",
  "room_type": "bathroom",
  "floor": 2,
  "quadrant": "northwest",
  "dimensions": {"length_ft": 12.3, "width_ft": 9.8, "height_ft": 9.0},
  "area_sqft": 120.5,
  "volume_cuft": 1084.5,
  "windows": 1,
  "doors": 2,
  "features": ["double vanity", "walk-in shower", "soaking tub", "heated floor"],
  "materials": {"floor": "porcelain tile", "walls": "painted drywall + tile accent"},
  "fixtures": ["2x recessed lights", "1x pendant", "exhaust fan"],
  "condition": "good",
  "condition_notes": "Minor grout cracking near shower threshold",
  "connected_rooms": ["primary_bedroom", "hallway_upper"],
  "contains_assets": ["exhaust_fan_broan_xyz"]
}
```

**Bridge to RAG:** Convert structured metadata to natural language → embed:

> "The primary bathroom is on the second floor, northwest quadrant. 12.3 by 9.8 feet with 9-foot ceilings (120.5 sqft). Features: double vanity, walk-in shower, soaking tub, heated porcelain tile floor. Two recessed lights and a pendant. Good condition with minor grout cracking near shower threshold."

Now "what condition is the master bath?" retrieves this chunk.

### Exterior Assessment (no drone needed)

**Hover** ($25/structure): Take 8-10 iPhone photos of the exterior → AI generates full 3D model with measurements for windows, doors, siding, roofing, trim. Developer API available for programmatic access. Database of 10M+ residential properties.

**Roofr** ($13-19/report): Satellite-based roof measurement. Area, pitch, facets, ridges, valleys — all without climbing on the roof.

**Cape Analytics** (Moody's): 120+ property attributes from aerial imagery. Roof Condition Rating used by top-10 insurers in 40 states. Enterprise API.

### AI Cannot Read 3D Files Directly

**Current LLMs cannot understand point clouds, mesh files, or 3D models.** The practical bridge:

| 3D Data | How AI Accesses It |
|---------|-------------------|
| LiDAR point cloud (PLY/OBJ) | Pre-processed into structured room metadata → text → pgvector |
| Video walkthrough | Extracted frames → AI descriptions with timestamps → pgvector |
| 3D mesh | Rendered to 2D images (top/front/side views) → AI describes → pgvector |
| Floor plans | Exported as PDF/image → AI reads room labels and dimensions → pgvector |

**The 3D data is for visualization. The knowledge lives as text.** The original scans stay in object storage for the customer to view (3D model viewer in the portal). But when BB Buddy answers questions, it searches text descriptions in pgvector.

### Design Visualization (current capability)

BB Buddy can generate remodel visualizations today using AI image generation:

| Capability | Technology | Ready? |
|-----------|-----------|--------|
| Inpainting (keep room, change surfaces/fixtures) | DALL-E 3, Stable Diffusion | **YES** — Tier 1 cosmetic |
| Style transfer ("make it mid-century modern") | Image-to-image models | **YES** |
| Product-in-room AR | IKEA Place model, manufacturer AR apps | **YES** (per manufacturer) |
| Full room redesign from floor plan | Emerging (12-18 months) | Not yet |
| 3D walkthrough of proposed design | Experimental (24+ months) | Not yet |

### Cost Per Property (Spatial Stack)

| Tier | What's Included | Per-Property Cost |
|------|----------------|-------------------|
| **Basic** | Video walkthrough (Gemini) + Polycam floor plans | $0.30 one-time + $0 ongoing |
| **Standard** | Above + Hover exterior model | $25.30 one-time |
| **Premium** | Above + Twelve Labs video search + Roofr roof measurement | $39.30 one-time + $1/mo (Twelve Labs hosting) |

All spatial data converts to text and lives in the same pgvector instance as documents. No separate spatial database needed at our scale.

### Updated Property Knowledge Stack (all 3 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROPERTY 'prop_247'                            │
│                 970 Huntington Drive, Aptos                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  LAYER 1: DOCUMENTS (2D text) — pgvector hybrid search           │
│  ├── bb_global           → codes, standards, seasonal calendar   │
│  ├── bb_prop_247         → BB's notes, crew observations         │
│  ├── cust_abc123         → homeowner's uploaded docs              │
│  └── public_santacruz    → county permits, assessor data          │
│                                                                   │
│  LAYER 2: STRUCTURED DATA (relational) — SQL queries             │
│  ├── bb_properties       → physical attributes, address           │
│  ├── bb_home_assets      → appliances with make/model/age         │
│  ├── bb_property_trees   → tree inventory with species/health     │
│  ├── bb_service_projects → project history with line items        │
│  └── bb_rooms            → room-by-room inventory from LiDAR      │
│                                                                   │
│  LAYER 3: SPATIAL/VISUAL (3D + temporal) — text descriptions     │
│  ├── Video walkthrough   → scene descriptions with timestamps     │
│  ├── LiDAR room scans    → dimensions, features, materials        │
│  ├── Exterior model      → measurements, siding, windows, roof    │
│  ├── Drone/satellite     → roof condition, lot boundaries         │
│  └── Thermal imaging     → moisture, insulation gaps (future)     │
│                                                                   │
│  COMPUTED INTELLIGENCE (agents cross-reference all layers)        │
│  ├── Asset age + lifespan → replacement timeline                  │
│  ├── Room data + assets  → "water heater is IN utility room"      │
│  ├── Seasonal calendar   → proactive maintenance alerts           │
│  ├── Warranty status     → coverage checks across policies        │
│  ├── Inspection + visual → "crack from inspection at 14:32"       │
│  └── Design generation   → "show me this bathroom remodeled"      │
│                                                                   │
│  ACQUISITION CHANNELS (zero-friction, continuous)                 │
│  ├── 📧 Email relay      → auto-ingest insurance, bills, invoices │
│  ├── 📱 SMS/MMS          → snap and text physical mail            │
│  ├── 📸 BB Buddy camera  → "file this" / appliance walkthrough   │
│  ├── 🔗 Connected APIs   → PG&E, solar, insurance auto-sync      │
│  ├── 🎤 Voice capture    → "Buddy, remember..." → RAG            │
│  └── 📂 Manual upload    → drag-and-drop in customer portal       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Research Sources

### OpenAI Realtime + Agents SDK
- [GPT Realtime Model docs](https://platform.openai.com/docs/models/gpt-realtime)
- [Realtime API Guide](https://developers.openai.com/api/docs/guides/realtime)
- [OpenAI Agents SDK (JS)](https://openai.github.io/openai-agents-js/)
- [@openai/agents-realtime npm](https://www.npmjs.com/package/@openai/agents-realtime)
- [OpenAI Pricing](https://developers.openai.com/api/docs/pricing)
- [Context Summarization Cookbook](https://developers.openai.com/cookbook/examples/context_summarization_with_realtime_api)

### RAG + Vector Search
- [pgvector vs Pinecone 2026 — Encore](https://encore.dev/articles/pgvector-vs-pinecone)
- [Why We Replaced Pinecone with PGVector — Confident AI](https://www.confident-ai.com/blog/why-we-replaced-pinecone-with-pgvector)
- [Best Embedding Models for RAG 2026 — PremAI](https://blog.premai.io/best-embedding-models-for-rag-2026-ranked-by-mteb-score-cost-and-self-hosting/)
- [RAG Chunking Strategies 2026 — PremAI](https://blog.premai.io/rag-chunking-strategies-the-2026-benchmark-guide/)
- [Hybrid Search in PostgreSQL — ParadeDB](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
- [Ultimate RAG Blueprint 2026 — LangWatch](https://langwatch.ai/blog/the-ultimate-rag-blueprint-everything-you-need-to-know-about-rag-in-2025-2026)
- [Neon pgvector docs](https://neon.com/docs/extensions/pgvector)
- [Google Drive changes.watch API](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/watch)

### Home Services Market + Multi-Tenant RAG
- [Lowe's HomeCare+ Launch (March 2026)](https://corporate.lowes.com/newsroom/press-releases/lowes-launches-associate-powered-home-maintenance-subscription-called-homecare-nationwide-03-17-26)
- [Home Services Trends 2026 — Winegls](https://winegls.com/home-services-trends-2026/)
- [U.S. Home Services Market — Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/us-home-service-market)
- [Neon Multi-Tenancy Guide](https://neon.com/docs/guides/multi-tenant)
- [Multi-Tenant pgvector — Confident AI](https://www.confident-ai.com/blog/why-we-replaced-pinecone-with-pgvector)
- [SingleOps Tree Inventory](https://singleops.com/features/tree-inventory/)
- [PNW Seasonal Maintenance — Madrona Group](https://www.themadronagroup.com/seasonal-home-maintenance-plan/)
- [Jobber Field Service Platform](https://www.getjobber.com)
- [LawnStarter Satellite Quoting](https://www.lawnstarter.com)

---

## Validated Research Findings (2026-04-01)

### MCP Server Architecture — CONFIRMED

**Connection flow is server-to-server.** OpenAI's infrastructure connects directly to our Bridge.

```
Browser (WebRTC) ──→ OpenAI Servers ──→ Bridge /mcp endpoint (Railway)
```

| Finding | Details |
|---------|---------|
| **Who connects?** | OpenAI's servers act as MCP client. Browser never touches MCP. |
| **Protocol** | Streamable HTTP — JSON-RPC over POST to `/mcp` endpoint. |
| **Public access** | Required. Railway already provides HTTPS. `https://bb-micro-bridge-production.up.railway.app/mcp` |
| **Authentication** | Bearer token via `headers` in session config. No OAuth needed. |
| **Tool discovery** | OpenAI sends `tools/list`, Bridge responds with tool array. Automatic. |
| **Session mode** | Stateless — each request independent. Perfect for Railway ephemeral containers. |
| **Fastify integration** | `@modelcontextprotocol/server` + `@modelcontextprotocol/node`. Use `request.raw` / `reply.raw`. Pass `request.body` as 3rd arg (Fastify pre-parses). |
| **What to install** | `npm i @modelcontextprotocol/server @modelcontextprotocol/node` |

**Session config (what gets passed to OpenAI Realtime):**
```
{
  type: 'mcp',
  server_label: 'bb-bridge',
  server_url: 'https://bb-micro-bridge-production.up.railway.app/mcp',
  headers: { 'Authorization': 'Bearer {BRIDGE_MCP_SECRET}' },
  allowed_tools: ['vision', 'knowledge', 'search_web', 'query_data', 'log_item', ...],
  require_approval: 'never'
}
```

**Built-in OpenAI MCP connectors (free, no Bridge needed):**
OpenAI provides hosted connectors via `connector_id` for: Dropbox, Gmail, Google Calendar, Google Drive, Microsoft Teams, Outlook, SharePoint. The Google Drive connector could supplement our RAG pipeline for real-time doc access.

### Neon pgvector — CONFIRMED

| Finding | Details |
|---------|---------|
| **Available on all plans** | Free, Launch, Scale. Just `CREATE EXTENSION vector`. |
| **pgvector version** | 0.8.0 (Postgres 14-17), 0.8.1 (Postgres 18). |
| **HNSW indexes** | Fully supported. Cosine (`<=>`), L2 (`<->`), inner product (`<#>`). |
| **tsvector/GIN** | Fully supported. Native Postgres, no extension needed. |
| **Free tier storage** | 0.5 GB hard cap. Our 25+ tables may already be close. |
| **Launch plan** | $5/mo base, $0.35/GB. 200MB vectors = $0.07/mo extra. No cap up to 16TB. |
| **Hybrid search** | pgvector + tsvector in same query, same DB, same transaction. Confirmed viable. |
| **pg_search (ParadeDB)** | Deprecated on Neon — migrate off by June 2026. Use native tsvector instead. |

**Action needed:** Check current Neon storage usage to determine if we need Launch plan before adding vectors.

### Agents SDK — CONFIRMED

| Finding | Details |
|---------|---------|
| **Version** | 0.8.2 (published March 31, 2026). 1.6M downloads/month. |
| **Default model** | `gpt-realtime-1.5` (upgraded from preview in v0.8.0) |
| **Zod requirement** | v4 (NOT v3). Peer dependency. |
| **Bundle** | UMD bundle included. ~200-400KB gzipped estimated. jsDelivr CDN available. |
| **Browser support** | Yes. Auto-detects `RTCPeerConnection`. Platform shims for browser/node/workerd. |
| **iOS Safari** | No issues found in 1,146 GitHub issues. Standard WebRTC + H.264. |
| **Function calls** | FULLY abstracted. `ResponseCreateSequencer` handles all timing. No manual lifecycle. |
| **Video tracks** | NOT in SDK transport (audio only). `addImage()` works independently via data channel. |
| **Echo cancellation** | NOT in SDK. Browser AEC relied on. Our `buddySpeaking` pattern still needed for edge cases. |
| **MCP connection** | Server-to-server. `hostedMcpTool({serverUrl})` → OpenAI connects to Bridge directly. |
| **Build step** | Recommended (Vite). CDN possible but Zod v4 peer dep complicates it. |

**Remaining Phase 0 test items:**
- Actual bundle size after tree-shaking
- iOS Safari autoplay behavior with SDK's `<audio>` element
- Vite vs CDN approach on mobile
- Custom `mediaStream` (audio+video) with SDK transport (pass audio only)

---

## Open Items (Before Coding)

| # | Question | Status |
|---|----------|--------|
| 1 | Google Drive folder structure — where are SOPs/safety plans? | **Need Sam to identify** |
| 2 | Agents SDK mobile compatibility — does it work on iOS Safari? | **No known issues (0/1146 GH issues). Phase 0 will confirm.** |
| 3 | Full vs Mini accuracy — is the 3x cost justified? | **Phase 0 comparison** |
| 4 | MCP server hosting — does Bridge have capacity? | **RESOLVED — stateless MCP, minimal overhead** |
| 5 | pgvector on Neon — plan tier support? | **RESOLVED — all tiers, may need Launch ($5/mo)** |
| 6 | Crew auth for financial data — PIN-only or full CalExp5 login? | **Design decision** |
| 7 | Building codes (NEC/IBC) — copyright/licensing for embedding? | **Legal question** |
| 8 | Email/text ingestion — Gmail API integration scope? | **Future phase** |
| 9 | OpenAI Google Drive connector — use for real-time doc access? | **Evaluate in Phase 2** |
| 10 | Neon storage usage — do we need Launch plan? | **Check before Phase 2** |

---

*Branch: `bb-buddy-v4-agents` (master = stable v3.17)*
*Companion: BB_BUDDY_ROADMAP.md (feature roadmap)*
*Learnings: memory/feedback_bb_buddy_learnings.md*
*Previous architecture: memory/project_bb_scan_live.md*
