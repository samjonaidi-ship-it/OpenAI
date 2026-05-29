# Search and Discovery Strategy

**Date:** 2026-04-04  
**Purpose:** Define how the platform searches and retrieves data for agents, portals, and operational views  
**Scope:** CalExp5 / BB Buddy platform  

---

## Executive Summary

The platform will need at least three distinct search and discovery modes:

1. **Structured relational search** — entity graph, relationships, hierarchy queries
2. **Full-text search** — communication, document, and narrative content
3. **Semantic/vector search** — multi-modal intent matching, similarity, recommendations

This document defines:

- Which search mode serves which use case
- Implementation strategy for each mode
- Data separation rules (knowledge vs. query data)
- Agent retrieval patterns
- UI discovery patterns (360 views, queues, dashboards)

---

## Part 1: Three Search Modes

### 1. Structured Relational Search

**Purpose:** Find entities and relationships by attributes

**Use cases:**

- "Show me all properties owned by customer X"
- "List employees assigned to jobsite Y on dates Z"
- "Find invoices with status='unpaid' for customer X"
- "Show all service engagements on property P in last 30 days"

**Technology:**

- Postgres relational queries
- Custom aggregation functions
- Indexed join-heavy queries
- Temporal/validity filters

**Data sources:**

- `entities` table
- `entity_relationships` table
- `entity_hierarchy` table
- `events` table (for historical slices)

**Agent access:**

- Deterministic, cached queries
- No ambiguity
- Natural language → SQL translation (LLM-assisted)

**Example queries:**

```sql
-- Find crew assignments for jobsite X in week Y
SELECT
  e.id, e.display_name, e.entity_type,
  r.relationship_type, r.valid_from, r.valid_to,
  h.parent_entity_id as jobsite_id
FROM entities e
JOIN entity_relationships r ON r.from_entity_id = e.id
JOIN entity_hierarchy h ON h.child_entity_id = e.id
WHERE h.parent_entity_id = $1
  AND r.relationship_type = 'assigned_to'
  AND r.valid_from <= $2 AND (r.valid_to IS NULL OR r.valid_to >= $2);
```

### 2. Full-Text Search

**Purpose:** Find content across documents, communications, and narrative fields

**Use cases:**

- "Find communications mentioning 'roof leak' for property X"
- "Search for images with filename containing 'damage'"
- "Find notes mentioning customer Y's phone number"
- "Surface all alerts for equipment Z in last 7 days"

**Technology:**

- Postgres `tsvector` + GIN indexes for basic full-text
- pgvector for keyword embeddings (optional future)
- Document segmentation for long PDFs
- Metadata indexing (date, author, entity links)

**Data sources:**

- `communications` table
- `actions` and `reminders` tables (narrative fields)
- `event` descriptions
- `documents` metadata

**Search index structure:**

```sql
CREATE TABLE fulltext_search_index (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL,
  entity_type VARCHAR NOT NULL,
  source_type VARCHAR NOT NULL,  -- 'communication', 'action', 'event', 'document'
  source_id UUID,
  title VARCHAR,
  content TEXT,
  content_tsv tsvector,
  created_at TIMESTAMP,
  indexed_at TIMESTAMP DEFAULT now(),
  FOREIGN KEY (entity_id) REFERENCES entities (id)
);

CREATE INDEX idx_fulltext_search
  ON fulltext_search_index USING GIN(content_tsv);
```

**Agent access:**

- BM25-ranked results prioritized by date
- Truncated result sets (top 10 by relevance)
- Filtered by entity scope (e.g., "only for crew X")

**Example query:**

```sql
SELECT
  fsi.entity_id, fsi.source_type, fsi.source_id,
  ts_rank(fsi.content_tsv, query) as rank
FROM fulltext_search_index fsi,
     plainto_tsquery('english', $1) as query
WHERE fsi.content_tsv @@ query
  AND fsi.entity_id = $2  -- constrained to crew/property scope
ORDER BY rank DESC
LIMIT 10;
```

### 3. Semantic/Vector Search

**Purpose:** Find similar entities, recommendations, and multi-modal intent matches

**Use cases:**

- "Find similar service issues to this one"
- "Recommend crew assignments based on past performance"
- "Surface related properties (geographically near, similar size, shared customer)"
- "Find images visually similar to this damage photo"

**Technology:**

- pgvector for 768-dim OpenAI embeddings
- Approximate nearest-neighbor (ANN) indexes
- Multi-modal embedding (text + image)
- Cosine/L2 distance metrics

**Data sources:**

Embeddings are **generated separately** but stored in:

- `entity_embeddings` table (entity profiles)
- `communication_embeddings` table (message intent)
- `issue_embeddings` table (service problem patterns)
- `image_embeddings` table (visual similarity)

**Embedding generation:**

- **Trigger:** On entity creation/update or asynchronously
- **Process:** External service (Claude API or local model) generates embeddings
- **Storage:** Embeddings stored in `*_embeddings` tables, not in canonical tables

**Example table:**

```sql
CREATE TABLE entity_embeddings (
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL UNIQUE,
  entity_type VARCHAR NOT NULL,
  embedding vector(768) NOT NULL,
  model_version VARCHAR,
  generated_at TIMESTAMP,
  FOREIGN KEY (entity_id) REFERENCES entities (id)
);

CREATE INDEX idx_entity_embeddings
  ON entity_embeddings USING ivfflat(embedding vector_cosine_ops)
  WITH (lists = 100);
```

**Agent access:**

- Used when agents are uncertain or need recommendations
- Not used for "definitive" answers
- Ranked by confidence threshold
- Contextual filtering (e.g., "only in same property")

**Example query:**

```sql
SELECT
  ee.entity_id, ee.entity_type,
  1 - (ee.embedding <=> $1::vector) as similarity
FROM entity_embeddings ee
WHERE ee.entity_type = 'service_engagement'
  AND ee.entity_id != $2  -- exclude the query entity itself
ORDER BY similarity DESC
LIMIT 5;
```

---

## Part 2: Data Separation Rule

### "Knowledge" vs. "Query Data"

Critical principle:

> **Knowledge is data that an agent uses to understand context, historical patterns, and recommendations. Query data is the current operational state of a record.**

Track A enforces this separation:

| Category | Examples | Storage | Freshness | Agent Behavior |
|----------|----------|---------|-----------|-----------------|
| **Query Data** | Entity state, relationships, workflow status, current assignment | `entities`, `entity_relationships`, `events`, `workflows` | Current (sync on write) | Agent reads directly, assumes authoritative |
| **Knowledge** | Historical patterns, embeddings, similarity scores, fact summaries | `entity_embeddings`, `entity_summaries`, `pattern_cache`, `projection_*` | Can be stale (hourly refresh acceptable) | Agent uses to enrich context, not as source of truth |

**Rule:** Agents never decide workflow based on knowledge alone. They use knowledge to enrich context, then confirm decisions against query data.

**Example:**

```
Agent reasoning:
1. Query: Get all open issues for crew X (from `workflows` table)
2. Knowledge: Get 3 similar historical issues (from `entity_embeddings`)
3. Knowledge: Summarize resolution patterns (from `pattern_cache`)
4. Agent: "Based on [historical pattern], I recommend resolution Y"
5. Human/system: Approves or rejects (decides against query data)
```

---

## Part 3: Which Search Mode for Which Use Case

### Crew Visibility

**"Show me all shifts for crew X next week"**

- Mode: **Structured relational**
- Query: entity_relationships where from_entity_id=crew, relationship_type='assigned_to', valid_from/to overlap week
- Freshness: Current
- Agent: Reads directly from projections

**"Show me past issues with crew X"**

- Mode: **Structured + Full-Text**
- Query: entity_relationships + full-text search on communications
- Freshness: Current for relationships, slightly stale for full-text is OK
- Agent: Lists issues, shows summary from projections

### Customer Portal

**"Show me all properties I own"**

- Mode: **Structured relational**
- Query: entity_relationships where from_entity_id=customer, relationship_type='owns'
- Freshness: Current
- Portal: Rendered from projection

**"Show me service history for property X"**

- Mode: **Structured + Full-Text**
- Query: events (immutable ledger) + communications (full-text)
- Freshness: Current for events (immutable), slightly stale for full-text OK
- Portal: Rendered from projections

**"Show me similar properties"**

- Mode: **Semantic/Vector**
- Query: entity_embeddings for geospatial, size, status similarity
- Freshness: Can be stale (hourly refresh)
- Portal: "Recommended for you" section

### Agent Proactive Suggestions

**"Which crew should I assign to jobsite X?"**

- Mode: **Structured + Semantic**
- Query 1: Crew available in region (structured geo query)
- Query 2: Crew with similar past assignments (vector similarity)
- Freshness: Projections current, embeddings hourly OK
- Agent: "I recommend crews [ranked by fit]"

**"What's the most likely issue with property X?"**

- Mode: **Semantic + Knowledge**
- Query 1: Service issues with similar symptoms (vector)
- Query 2: Seasonal patterns (from projections)
- Freshness: Both can be stale
- Agent: "Likely issue is [with confidence level]"

### Operational Dashboards

**"Show me approval queue"**

- Mode: **Structured + Projections**
- Query: workflows where status='awaiting_approval' (structured), projected summary
- Freshness: Current
- Dashboard: Real-time updates via WebSocket

**"Show me aging open issues"**

- Mode: **Structured + Alerting**
- Query: issues where status='open' and created_at < now() - interval '7 days'
- Freshness: Current
- Dashboard: Alerts highlight old records

---

## Part 4: Implementation Strategy

### Phase 1: Structured Relational Search (Track A)

**What:** Build core entity graph queries and projections

**Required for Track A:**

1. Entity lookup queries (by type, by id, by attributes)
2. Relationship queries (find all X assigned to Y)
3. Hierarchy traversal (property → buildings → rooms)
4. Temporal filters (valid_from/valid_to)
5. Projections for 360 views

**Implementation:**

- Use Drizzle ORM for query builders
- Create view functions in Postgres for complex aggregations
- Index all foreign keys and temporal columns
- Implement query result caching in ETag/revision tracking

**Progress:**

- [ ] Entity graph queries implemented (Week 1-2)
- [ ] Projection tables created and populated (Week 2-3)
- [ ] Query performance targets met: <100ms for 99th percentile (Week 3-4)

### Phase 2: Full-Text Search (Track B1)

**What:** Add full-text search over communications and narratives

**Required for Track B1:**

1. Full-text index schema (`fulltext_search_index` table)
2. Index population pipeline (as communications arrive)
3. Search API endpoint (`/api/data/search/fulltext`)
4. Result ranking and filtering
5. Instrumentation

**Implementation:**

- Use Postgres tsvector + GIN indexes
- Update full-text index on every communication/action insert
- Implement faceted search (filter by entity, date, type)
- Implement pagination (offset-based OK for now)

**Progress:**

- [ ] Full-text schema designed (Week 1-2 of Track B1)
- [ ] Index update pipeline implemented (Week 2-3)
- [ ] API endpoint tested (Week 3-4)

### Phase 3: Semantic/Vector Search (Track B2+)

**What:** Add embeddings for similarity and recommendations

**Required for Track B2:**

1. Embedding generation pipeline (external API calls)
2. pgvector extension installation
3. Entity/communication/issue embedding tables
4. IVFFlat index for fast ANN
5. Embedding refresh strategy (hourly batch)
6. Vector search API endpoint

**Implementation:**

- Use OpenAI API for embeddings (or local model if low-cost)
- Batch embedding generation (daily refresh)
- Store embeddings separately from canonical data
- Use IVFFlat indexes for speed
- Implement confidence thresholds

**Progress:**

- [ ] Embedding schema + tables designed (Week 1-2 of Track B2)
- [ ] Batch generation pipeline built (Week 2-3)
- [ ] Vector search API tested (Week 3-4)
- [ ] Monitored for embedding quality (Week 4+)

---

## Part 5: Agent Retrieval Patterns

### Pattern 1: Deterministic Lookup

```javascript
// Agent needs the entity, not search results
const crew = await bridge.get(`/api/data/entities/${crewId}`);
// No ambiguity, no ranking needed
```

### Pattern 2: Structured Query for Operational Data

```javascript
// Agent needs all open issues for crew X (this week)
const issues = await bridge.post('/api/data/search/structured', {
  filters: {
    entity_id: crewId,
    relationship_type: 'assigned_to',
    status: 'open',
    created_at: { gte: startOfWeek, lte: endOfWeek }
  },
  limit: 50
});
// Results are definitive; agent uses directly
```

### Pattern 3: Full-Text Search for Context

```javascript
// Agent wants to understand property X history
const communications = await bridge.post('/api/data/search/fulltext', {
  query: 'roof damage OR leak',
  entity_id: propertyId,
  date_range: { gte: 90 days ago, lte: today },
  limit: 10
});
// Results are ranked by relevance; agent summarizes for context
```

### Pattern 4: Vector Search for Recommendations

```javascript
// Agent needs to suggest similar crew assignments
const similarCrews = await bridge.post('/api/data/search/vector', {
  embedding_type: 'entity_profile',
  query_entity_id: crewId,
  limit: 5,
  filters: { available_in_region: true }
});
// Results are ranked by similarity; agent explains reasoning ("like your past assignment to X")
```

---

## Part 6: Freshness Guarantees by Mode

| Mode | Freshness Target | Implementation | Acceptable Lag |
|------|---|---|---|
| **Structured** | Current | Sync on write | <1 second |
| **Full-Text** | Recent | Async index update | <5 minutes |
| **Vector** | Flexible | Batch refresh (hourly) | <1 hour |

### Freshness Disclosure to Agents

Agents must know data age:

```javascript
// Example response with freshness metadata
{
  "results": [...],
  "metadata": {
    "search_mode": "structured",
    "as_of": "2026-04-04T14:05:00Z",
    "lag_seconds": 0,
    "freshness": "current"
  }
}
```

Agents prefer:

1. **Current** data when available (freshness must be < 1 second)
2. **Recent** data if current is not available (freshness < 5 minutes)
3. **Knowledge** (embeddings, summaries) only for context or recommendations

---

## Part 7: Monitoring and Optimization

### Search Performance Targets

| Query Type | 50th Percentile | 99th Percentile | Sample Size |
|---|---|---|---|
| Entity lookup by ID | <10ms | <50ms | single record |
| Relationship query (e.g., crew assignments for jobsite) | <50ms | <200ms | 1-10 results |
| Hierarchy traversal (property → children) | <100ms | <500ms | 10-100 results |
| Full-text search | <200ms | <1s | 10-100 results |
| Vector search (ANN) | <100ms | <500ms | 5 results |

### Monitoring

Create a Search Performance dashboard:

```sql
-- Query latency by mode
SELECT
  search_mode,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) as p50,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99,
  COUNT(*) as sample_count
FROM search_queries_log
WHERE timestamp > now() - interval '1 hour'
GROUP BY search_mode;

-- Slowest searches (outliers)
SELECT
  query_text,
  entity_id,
  duration_ms,
  result_count
FROM search_queries_log
WHERE duration_ms > 1000
ORDER BY duration_ms DESC
LIMIT 20;
```

### Query Optimization Workflow

1. **Monitor:** Identify slow queries (99th percentile > target)
2. **Profile:** Use `EXPLAIN ANALYZE` to find missing indexes
3. **Iterate:** Add indexes, retest, measure improvement
4. **Document:** Add comment to query explaining why index exists

---

## Part 8: Security and Privacy

### Data Access via Search

Search endpoints inherit entity-level access control:

```javascript
// Agent searches for issues, but can only see those within their scope
await bridge.post('/api/data/search/structured', {
  filters: {
    entity_type: 'service_engagement',
    scope: currentAgent.scope  // enforced by Bridge
  }
});
```

### Full-Text Search Indexing

Full-text search index includes sensitivity metadata:

```sql
CREATE TABLE fulltext_search_index (
  -- ...
  visibility_classification VARCHAR,  -- 'customer_visible', 'internal', 'restricted_financial'
  -- ...
);

-- Search respects visibility
SELECT * FROM fulltext_search_index
WHERE visibility_classification IN (userVisibilitySet)
  AND content_tsv @@ query;
```

### Vector Embeddings Privacy

Embeddings are **not** indexed in full-text search. They live in separate tables and are only retrieved for entity-specific recommendations:

```javascript
// Can only retrieve embeddings for entities you have access to
await bridge.get(`/api/data/entities/${entityId}/embeddings`)
// 404 if not in scope
```

---

## Part 9: Track A to Track C Roadmap

| Track | Structured | Full-Text | Vector | Status |
|-------|---|---|---|---|
| **A** (Now-June) | ✅ Core queries + projections | ❌ Deferred | ❌ Deferred | Phase 1 complete |
| **B1** (June-July) | ✅ Enhanced projections | ✅ Implement index + API | ❌ Deferred | Full-text search |
| **B2** (July-Sept) | ✅ Maintained | ✅ Optimized | ✅ Batch embeddings | Vector search pilot |
| **C** (Sept+) | ✅ Maintained | ✅ Real-time indexing | ✅ Multi-modal embeddings | Advanced features |

---

## Part 10: Next Steps

**Immediate (Week 1):**

1. [ ] Finalize structured relational queries for Track A (entity lookup, assignments, hierarchy)
2. [ ] Design projection tables and refresh strategy
3. [ ] Add to PROJECTION_AND_REFRESH_MODEL.md

**Track A (Weeks 2-4):**

1. [ ] Implement structured search in Bridge
2. [ ] Add full-text search schema (deferred implementation)
3. [ ] Test query performance against targets

**Track B1 (June):**

1. [ ] Implement full-text search index
2. [ ] Deploy full-text search API
3. [ ] Integrate into agent retrieval patterns

**Track B2 (July+):**

1. [ ] Implement embedding generation pipeline
2. [ ] Deploy vector search with pgvector
3. [ ] Test multi-modal similarity

---

## See Also

- `PROJECTION_AND_REFRESH_MODEL.md` (read-optimized views)
- `DB_ARCHITECTURE.md` (entity graph core model)
- `ACTION_AND_NOTIFICATION_MODEL.md` (communications that feed full-text)
- `BRIDGE_CONTRACT_GOVERNANCE.md` (search API endpoints)
- `TRACK_A_DB_ALIGNMENT.md` (Track A scope and priority)
