# Data Domain Boundaries

This document defines the persistence boundary between the product operational platform and the BB Buddy test harness/control-plane system.

## Purpose

Two major data systems now coexist:

1. the product/operational platform
2. the harness/control-plane system

They may share infrastructure, but they should not be treated as one undifferentiated database domain.

## Product Operational Domain

This domain includes:

- stakeholders
- entities
- lifecycle
- MDM
- scheduling
- communications
- telemetry
- workflows
- finance
- 360 views

This is the focus of the docs in this folder.

## Harness / Control-Plane Domain

This domain includes:

- runs
- run events
- planner state
- replay manifests
- profile versions
- harness alerts
- harness audit logs

The canonical contract and persistence definition for this domain live in the harness docs, not in the product DB docs.

## Boundary Rule

Harness tables are not product graph tables.

Do not mix:

- harness runs into product `events`
- planner state into product workflows
- harness transcripts into customer/crew communications

unless a deliberate analysis bridge is defined.

## Recommended Physical Strategy

Preferred options:

1. same Neon project, separate schemas
2. separate database within same environment
3. separate Neon project later if governance requires

For now, the minimum acceptable structure is:

- product schema(s)
- harness schema(s)
- separate migration streams
- separate application roles where practical

## Shared Infrastructure Allowed

Shared infrastructure may include:

- same Postgres engine
- same monitoring stack
- same backup policy family
- shared auth infrastructure where appropriate

But logical table ownership must remain separate.

## Why This Matters

The two domains have different:

- retention patterns
- access rules
- event volume
- audit meaning
- operational purpose

Mixing them will create confusion in:

- analytics
- permissions
- retention
- incident response
- schema ownership

## Bridging Rule

If the product platform needs to analyze harness outcomes, do it through:

- explicit bridge tables
- exported summaries
- analytics projections

Do not casually join raw harness persistence into the product graph.

## Design Rules

1. Treat product and harness as separate persistence domains.
2. Use separate schemas or stronger isolation.
3. Keep migration ownership separate.
4. Do not place harness records into product graph/event tables.
5. Bridge only through deliberate integration points.
