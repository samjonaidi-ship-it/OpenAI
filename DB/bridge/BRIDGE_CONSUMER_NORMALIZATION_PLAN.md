# Bridge Consumer Normalization Plan

**Date:** 2026-04-04  
**Status:** Active planning document  
**Scope:** Normalize consumer apps so BB Micro Bridge is the canonical contract everywhere

## Purpose

Consumer apps still show drift in three categories:

1. legacy localhost defaults
2. mixed direct-provider semantics in docs and debug code
3. inconsistent environment routing and API key handling

This document records the actual drift and the cleanup order.

## Canonical Contract Rules

All active consumers must follow these rules:

1. Bridge is the canonical backend contract
2. production default is the Railway Bridge URL
3. `X-API-Key` is the canonical app-to-Bridge credential
4. localhost is allowed only for explicit local-dev modes
5. provider-specific URLs do not appear in active runtime code

## Current Findings By Consumer

### CalExp5

Current posture:
- generally aligned
- proxies to Bridge
- still keeps local defaults in dev/test paths

Observed examples:
- `vite.config.js` defaults `BRIDGE_URL` to `http://localhost:3105`
- tests reference `http://localhost:3105`

Required action:
- keep dev default if needed
- document clearly that production/staging must route through proxy and not bypass to provider APIs

Priority: medium

### TS_Exp5

Current posture:
- partly aligned
- still carries local defaults and mixed historical docs

Observed examples:
- `src/server/services/http-client.js` defaults to `http://localhost:3105`
- `src/server/services/bridge-client.js` defaults to `http://localhost:3105`
- docs still reference legacy `localhost:3100` migration narratives and mixed API-base assumptions
- historic logs show missing `X-API-Key` failures

Required action:
- standardize one Bridge client module
- remove duplicate client abstractions
- keep localhost only behind explicit local-dev config
- clean stale docs that still describe Mini/local-first routing

Priority: high

### RevExp5

Current posture:
- active runtime appears aligned to production Bridge
- debug/docs still carry stale localhost references

Observed examples:
- runtime files use production Railway Bridge URL
- debug/test files still reference `http://localhost:3100`

Required action:
- leave active runtime as-is
- clean debug defaults so they do not teach the wrong contract

Priority: medium

### Chase_Expense_Validator

Current posture:
- active extension path now cloud-first
- repository still contains many historical `content-v*` files with localhost defaults
- host permissions still include local Bridge hosts

Observed examples:
- `extension/popup.js` is cloud-first with localhost fallback
- `content-v27.js` is cloud-first
- many older `content-v*.js` files still hardcode `http://localhost:3100`
- manifest still includes localhost permissions

Required action:
- keep active extension on cloud-first mode
- isolate or archive obsolete content versions
- shrink manifest host permissions if old desktop path is no longer needed

Priority: high

### PorjExp5

Current posture:
- mostly aligned
- still has localhost defaults in service constructor comments / dev paths

Observed examples:
- `src/server/services/qbo-service-v4.js` constructor defaults to `http://localhost:3105`
- `Run.bat` is production-first with localhost commented

Required action:
- make production/staging env-driven
- keep localhost only for explicit dev mode

Priority: medium

### Landfill_Surcharge

Current posture:
- aligned

Observed examples:
- production Bridge URL is default in UI and JS
- uses `X-API-Key`

Required action:
- minimal; just keep settings disciplined

Priority: low

### Invoice_Validate2

Current posture:
- aligned in active extension runtime
- still has localhost in permissions/docs for local mode

Observed examples:
- popup defaults to production Railway Bridge URL
- manifest still includes localhost host permissions

Required action:
- keep production default
- decide whether localhost permissions are still needed

Priority: low-medium

## Normalization Workstreams

### Workstream 1. Runtime contract cleanup

Required outcome:
- each consumer has exactly one active Bridge base URL strategy
- production defaults to Railway
- staging can be env-driven
- localhost is explicit dev-only

### Workstream 2. Credential normalization

Required outcome:
- all active Bridge calls use `X-API-Key`
- no mixed bearer/query-param contract in active runtime

### Workstream 3. Legacy archive cleanup

Required outcome:
- historical localhost-heavy scripts remain only in archive/debug areas
- active runtime trees do not carry misleading defaults

### Workstream 4. Documentation cleanup

Required outcome:
- consumer READMEs and deployment docs describe Bridge as canonical
- Mini/local-first migration language is retired from active docs

## Recommended Cleanup Order

1. **TS_Exp5**
- highest drift in active runtime and docs

2. **Chase_Expense_Validator**
- active path is fixed, but repo hygiene is still poor

3. **RevExp5**
- mostly docs/debug cleanup

4. **PorjExp5**
- minor constructor/env cleanup

5. **CalExp5**
- documentation/proxy clarification only

6. **Landfill_Surcharge / Invoice_Validate2**
- light cleanup

## Success Criteria

Normalization is complete when:

1. all active consumers default to Railway Bridge in production
2. all active consumers send `X-API-Key` consistently
3. no active runtime module defaults to Mini/local provider semantics unless explicitly in local-dev mode
4. docs no longer describe Bridge as optional or transitional
5. Bridge breaking changes can be rolled out consumer-by-consumer against a known contract

## Recommended Next Step

Start with TS_Exp5.

It has the highest combination of:
- active drift
- historical auth failures
- mixed client abstractions
- stale migration narratives
