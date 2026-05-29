# Implementation Action Checklist

**Date:** 2026-04-04  
**Owner:** Platform Architecture Lead  
**Next Review:** 2026-04-11  

---

## Overview

This checklist operationalizes the findings from the April 2026 Architecture Assessment.

Three new governance documents were created to close gaps:

1. **BRIDGE_CONTRACT_GOVERNANCE.md** — Enforce Bridge as canonical target
2. **QBT_QBO_PLATFORM_ROADMAP.md** — QBT legacy decision, QBO webhook path
3. **SEARCH_AND_DISCOVERY_STRATEGY.md** — Formalize three search modes

This checklist links assessment findings to concrete actions, timelines, and ownership.

---

## Critical Items (This Week - April 4-10)

### 1. Review Assessment and Governance Docs

- [ ] **Lead:** Platform Architecture
- [ ] **Action:** Circulate new governance docs to team leads
- [ ] **Docs involved:**
  - BRIDGE_TARGET_CONSUMER_ALIGNMENT_AUDIT.md (existing, re-read § "Recommended Actions")
  - BRIDGE_CONTRACT_GOVERNANCE.md (new)
  - QBT_QBO_PLATFORM_ROADMAP.md (new)
  - SEARCH_AND_DISCOVERY_STRATEGY.md (new)
- [ ] **Timeline:** By April 8 EOD
- [ ] **Success criteria:** All leads have read docs and flagged questions

### 2. Confirm QBT Legacy Decision (No Code Changes Yet)

- [ ] **Lead:** Product / Integration Lead
- [ ] **Task:** Review QBT_QBO_PLATFORM_ROADMAP.md § Part 4
- [ ] **Decision needed:** Stay on legacy QBT for Track A? (Yes/No)
- [ ] **Rationale:** Record why (strategic direction, timeline, cost)
- [ ] **Timeline:** By April 9 EOD
- [ ] **Impact:** If yes → no code changes needed. If no → kick off partnership talks with Intuit.
- [ ] **Success criteria:** Explicit written decision in JIRA or email

### 3. Flag TS_Exp5 as Fragile

- [ ] **Lead:** TS_Exp5 owner
- [ ] **Action:** Review BRIDGE_CONTRACT_GOVERNANCE.md § "TS_Exp5" table
- [ ] **Assessment:** TS_Exp5 still has "local provider endpoint semantics" instead of treating Bridge as canonical
- [ ] **Risk:** This is a **High priority** fragility before any customer escalation
- [ ] **Timeline:** Flag by April 8
- [ ] **Next step:** Schedule TS_Exp5 cleanup (see Major Items)

### 4. Update README_DB_ARCHITECTURE.md

- [ ] **Lead:** Platform Architecture
- [ ] **Action:** Add governance docs to reading order and TOC
- [ ] **Status:** ✅ COMPLETE (April 4)
- [ ] **Next:** Ensure all team members know about the new section

---

## Major Items (This Month - April)

### 5. Bridge Contract Cleanup for CalExp5

**Owner:** CalExp5 Lead  
**Priority:** Medium  
**Timeline:** April 11-25

- [ ] Review BRIDGE_CONTRACT_GOVERNANCE.md § CalExp5 section
- [ ] Items:
  - [ ] Remove settings file fallback for production (or isolate to dev-only)
  - [ ] Document proxy behavior in CalExp5 README
  - [ ] Add BRIDGE_CONTRACT.md to CalExp5 repo
- [ ] **Success criteria:** CalExp5 repo has clear Bridge contract documentation
- [ ] **Code changes:** Minimal (cleanup/docs only, no feature changes)

### 6. TS_Exp5 Urgent Refactor

**Owner:** TS_Exp5 Lead  
**Priority:** High  
**Timeline:** April 11-30 (Pre-Track-B Escalation)

This is critical because TS_Exp5 still contains direct Intuit endpoint logic.

- [ ] Review BRIDGE_CONTRACT_GOVERNANCE.md § TS_Exp5 section
- [ ] Items:
  - [ ] Remove direct calls to Intuit endpoints in qbo.service.js
  - [ ] Remove direct calls to `rest.tsheets.com` in qbt.service.js
  - [ ] Remap all provider-specific logic to use Bridge routes
  - [ ] Update http-client.js to route through Bridge
  - [ ] Remove localhost Bridge defaults; use Railway env vars
  - [ ] Add BRIDGE_CONTRACT.md to TS_Exp5 repo
- [ ] **Code review:** All changes must remove "local provider remapping" patterns
- [ ] **Testing:** All QBO/QBT routes must go through Bridge; validate in staging
- [ ] **Success criteria:** Zero direct Intuit endpoint calls in TS_Exp5 code; 100% Bridge-mediated

### 7. Add Bridge Code Review Checklist

**Owner:** Bridge Maintainer  
**Priority:** Medium  
**Timeline:** April 15-20

- [ ] Create `BRIDGE_CODE_REVIEW_CHECKLIST.md` in Bridge repo
- [ ] Include:
  - [ ] All new routes use explicit versioning (`/v1`, `/v2`)
  - [ ] No route has localhost references
  - [ ] Provider-specific logic is in Bridge, not consumer code
  - [ ] Routes documented in contract matrix
- [ ] Update Bridge PR template to reference checklist
- [ ] **Success criteria:** Checklist used in 3 consecutive PRs

### 8. QBO Webhook/CDC Planning (Q2 Prep)

**Owner:** Integration Architect  
**Priority:** Medium  
**Timeline:** April 15-30

No code changes yet, but plan for Track B1.

- [ ] Review QBT_QBO_PLATFORM_ROADMAP.md § Part 3 (QBO Webhook + CDC Implementation Roadmap)
- [ ] Tasks:
  - [ ] Sketch Phase 1: Webhook endpoint design
  - [ ] Sketch Phase 2: CDC fetcher + cursor tracking
  - [ ] Sketch Phase 3: Outbox + worker pattern
  - [ ] Estimate effort per phase
  - [ ] Identify dependencies (Intuit credentials, Railway networking)
- [ ] **Success criteria:** JIRA epic created with phased approach; effort estimates in place

### 9. Search Strategy Review (Track A Prep)

**Owner:** DB Engineer / Agent Lead  
**Priority:** Medium  
**Timeline:** April 18-30

- [ ] Review SEARCH_AND_DISCOVERY_STRATEGY.md § Part 1 (Three Search Modes)
- [ ] Review Part 4 (Implementation Strategy - Phase 1)
- [ ] Tasks:
  - [ ] Confirm Track A includes only structured relational search
  - [ ] Outline entity graph query patterns needed
  - [ ] Design projection tables for 360 views
  - [ ] Add query performance targets to definition of done
- [ ] **Success criteria:** Query performance targets documented; first projection queries designed

---

## Alignment and Cleanup (May - Post Track A Kickoff)

### 10. Chase_Expense_Validator Cleanup

**Owner:** Chase Extension Lead  
**Priority:** Low  
**Timeline:** May 1-15

- [ ] Review BRIDGE_CONTRACT_GOVERNANCE.md § Chase_Expense_Validator section
- [ ] Items:
  - [ ] Consolidate Bridge URL references to use Railway Bridge
  - [ ] Audit extension manifest for obsolete localhost permissions
  - [ ] Update docs to reference Bridge endpoints
- [ ] **Success criteria:** Extension connects to Railway Bridge; no localhost hardcodes in code

### 11. RevExp5 Repository Cleanup

**Owner:** RevExp5 Lead  
**Priority:** Low  
**Timeline:** May 1-20

- [ ] Review BRIDGE_CONTRACT_GOVERNANCE.md § RevExp5 section
- [ ] Items:
  - [ ] Update benchmark/test docs to use Railway Bridge
  - [ ] Remove localhost-only fixture references
  - [ ] Audit debug pages for current Bridge paths
- [ ] **Success criteria:** All operational paths target Railway Bridge; test fixtures are current

### 12. Document "Knowledge vs. Query Data" Rule

**Owner:** Agent Lead  
**Priority:** Medium  
**Timeline:** May 1-15

- [ ] Review SEARCH_AND_DISCOVERY_STRATEGY.md § Part 2 (Knowledge vs. Query Data)
- [ ] Create agent implementation guide:
  - [ ] Define which data sources are authoritative (query data)
  - [ ] Define which are enrichment/context only (knowledge)
  - [ ] Document agent retrieval pattern examples (Part 5)
- [ ] **Success criteria:** Agent implementation guide available; agents follow pattern in 3+ new features

---

## Track B1 Preparation (June Kickoff)

### 13. QBT Legacy Annotation in Bridge

**Owner:** Bridge Maintainer  
**Priority:** Medium  
**Timeline:** June 1-5

No code changes; pure annotation for clarity.

- [ ] Annotate all `/api/qbt/*` routes with `[LEGACY]` comments
- [ ] Reference QBT_QBO_PLATFORM_ROADMAP.md § Part 6 (Code Markers)
- [ ] Example:
  ```javascript
  /**
   * [LEGACY] Uses rest.tsheets.com/api/v1
   * Evaluate migration to Payroll and Time GraphQL in Q3 2026.
   */
  router.get('/api/qbt/users', ...)
  ```
- [ ] **Success criteria:** All QBT routes annotated; annotation appears in code search

### 14. QBO Webhook Receiver Design

**Owner:** Integration Architect  
**Priority:** High  
**Timeline:** June 1-15

- [ ] Design Phase 1 of QBT_QBO_PLATFORM_ROADMAP.md:
  - [ ] Webhook signature verification
  - [ ] Webhook payload schema
  - [ ] Event queueing strategy
  - [ ] Error handling
- [ ] **Success criteria:** Design doc reviewed; team alignment on approach

### 15. Full-Text Search Index Design

**Owner:** DB Engineer  
**Priority:** High  
**Timeline:** June 1-15

- [ ] Design based on SEARCH_AND_DISCOVERY_STRATEGY.md § Part 2 (Full-Text Search)
  - [ ] `fulltext_search_index` table schema
  - [ ] Index update triggers
  - [ ] Ranking and faceting strategy
- [ ] **Success criteria:** Schema doc reviewed; implementation plan for Phase 2

---

## Ongoing / Monthly Tracking

### 16. Bridge Contract Compliance

**Owner:** Bridge Maintainer  
**Frequency:** Monthly  
**Success criteria:**

- [ ] No new routes without `/v1`, `/v2` versioning
- [ ] Zero direct external system calls in consumer code reviews
- [ ] Consumer apps have up-to-date BRIDGE_CONTRACT.md files
- [ ] Deprecation notices issued 30+ days before route sunset

### 17. Search Performance Monitoring

**Owner:** DB Engineer  
**Frequency:** Monthly (after Track A)  
**Success criteria:**

- [ ] Structured queries: 99th percentile < 200ms ✅
- [ ] Full-text queries: 99th percentile < 1s ✅ (Track B1)
- [ ] Vector queries: 99th percentile < 500ms ✅ (Track B2)

### 18. QBO Sync Health

**Owner:** Integration Architect  
**Frequency:** Monthly (after Phase 1)  
**Success criteria:**

- [ ] Webhook receiver uptime > 99.5% ✅ (Track B1)
- [ ] CDC fetch success rate > 99.9% ✅ (Track B1)
- [ ] Outbox processing lag < 1 minute ✅ (Track B2)

---

## Success Metrics

### April (This Month)

- [ ] New governance docs created and circulated ✅
- [ ] QBT legacy decision made and documented ✅
- [ ] TS_Exp5 fragility flagged ✅
- [ ] CalExp5 cleanup scoped ✅
- [ ] README updated with governance docs ✅

### May (Post-Track A)

- [ ] TS_Exp5 refactored (Bridge-only paths)
- [ ] Bridge contract compliance monitoring in place
- [ ] CalExp5 and RevExp5 cleanup complete
- [ ] Search strategy + projection design complete

### June (Track B1 Kickoff)

- [ ] QBO webhook receiver deployed to staging
- [ ] Full-text search index implemented
- [ ] All QBT routes annotated as [LEGACY]
- [ ] Agent implementation guide published

### July (Track B2 Start)

- [ ] QBO CDC fetcher deployed
- [ ] Vector search schema designed
- [ ] Embedding generation pipeline planned

---

## Ownership Matrix

| Document / Task | Lead | Reviewer | Status |
|---|---|---|---|
| BRIDGE_CONTRACT_GOVERNANCE.md review | Platform Architecture | Engineering Leads | 🟢 Active |
| QBT legacy decision | Product/Integration | Platform Architecture | 🔴 Pending |
| TS_Exp5 refactor | TS_Exp5 Lead | Bridge Maintainer | 🟡 Flagged High |
| CalExp5 cleanup | CalExp5 Lead | Platform Architecture | 🟡 Planned |
| QBO webhook design | Integration Architect | Platform Architecture | 🟡 June kickoff |
| Search strategy impl | DB Engineer / Agent Lead | Platform Architecture | 🟡 June kickoff |
| Bridge code review checklist | Bridge Maintainer | Engineering Leads | 🟡 Planned |
| Monitoring dashboards | DevOps / Integration | Platform Architecture | 🟡 May-June |

**Legend:** 🟢 Active | 🟡 Planned | 🔴 Pending

---

## Next Review

**When:** April 11, 2026 EOD  
**Check:**
- [ ] QBT legacy decision made
- [ ] TS_Exp5 cleanup started
- [ ] All leads have read governance docs
- [ ] README update confirmed

**If blocked:** Escalate to product/architecture sync

---

## Appendix: Document Cross-References

| Topic | Primary Docs | Reference Docs |
|-------|---|---|
| Bridge contracts | BRIDGE_CONTRACT_GOVERNANCE.md | BRIDGE_TARGET_CONSUMER_ALIGNMENT_AUDIT.md, PRODUCTION_SAFE_PLAN_AND_ENV_MODEL.md |
| QBT/QBO strategy | QBT_QBO_PLATFORM_ROADMAP.md | BRIDGE_TARGET_CONSUMER_ALIGNMENT_AUDIT.md, MASTER_DATA_MANAGEMENT.md |
| Search modes | SEARCH_AND_DISCOVERY_STRATEGY.md | PROJECTION_AND_REFRESH_MODEL.md, DB_ARCHITECTURE.md |
| Domain boundaries | DATA_DOMAIN_BOUNDARIES.md | BRIDGE_CONTRACT_GOVERNANCE.md, MASTER_DATA_MANAGEMENT.md |
| Track A scope | TRACK_A_DB_ALIGNMENT.md | All architecture docs |

---

## Template: Adding New Governance Document

When creating new governance docs in the future, follow this pattern:

```markdown
# [Document Title]

**Date:** YYYY-MM-DD
**Owner:** [Role]
**Status:** Active / Deferred / Archive
**Related:** [List other governance docs]

## Executive Summary
[2-3 sentence summary of problem and solution]

## Current State
[What is happening now, what are the gaps]

## Recommended Approach
[What should change and why]

## Implementation Timeline
[Phased approach with dates]

## Success Criteria
[How to know this succeeded]

## Next Steps
[Immediate actions]
```

---

*For updates to this checklist, see .session/SESSION_STATE.md or contact the Platform Architecture Lead.*
