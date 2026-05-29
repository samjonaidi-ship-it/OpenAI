# Bridge / Target / Consumer Alignment Audit

Date: 2026-04-03
Scope: BB_Micro_Bridge + active consumers + official Intuit and Google platform documentation

## Executive Summary

The Bridge is partially aligned with its targets, but not fully aligned with the latest platform direction.

Current state:
- QBO REST alignment: mostly good for the current Accounting API usage.
- QBT alignment: only aligned with the legacy QuickBooks Time model, not with Intuit's newer Payroll and Time platform direction.
- Google alignment: mixed. Drive is serviceable, Maps is partly on older endpoints and Places legacy patterns.
- Consumer alignment: mixed. CalExp5 is mostly aligned, TS_Exp5 is compatible but still carries bridge-shim semantics, Chase_Expense_Validator is now operationally aligned, and several repos still contain legacy localhost assumptions in tests/docs/debug code.

Bottom line:
- The production Bridge is compatible enough to run now.
- It is not in 100% alignment with the latest Intuit and Google direction.
- The biggest strategic misalignment is QuickBooks Time: the Bridge is built around the legacy Time API model while Intuit is pushing Payroll/Time GraphQL + newer time workflows.

## Official Target Findings

### QBO

Official sources confirm:
- OAuth 2.0 remains the required auth model for QBO production and sandbox apps.
- Webhooks remain the recommended event mechanism.
- Intuit explicitly recommends pairing webhooks with CDC for reliability.
- CDC only covers the last 30 days and excludes several entities, including `TimeActivity`.
- QBO release notes show:
  - new minor versions 74 and 75 in January 2025
  - updated throttles/call limits in August 2025
  - refreshed webhook retry policy in February 2026
  - refresh tokens now have a maximum validity period of five years in February 2026
  - deprecated `source` field for Customer and Vendor in production since September 15, 2025

Important official QBO docs:
- OAuth 2.0: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- Webhooks: https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks
- CDC: https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api/change-data-capture
- REST features / throttles: https://developer.intuit.com/app/developer/qbo/docs/learn/rest-api-features
- Release notes: https://developer.intuit.com/app/developer/qbo/docs/release-notes/general-release-notes
- OAuth FAQ: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq

### QBT / Payroll and Time

Official sources now make the platform split explicit:
- Intuit now has a newer Payroll and Time API direction with GraphQL and restricted partner access.
- The newer Payroll and Time API is not broadly open and requires elevated partner tier / onboarding.
- Intuit still explicitly exposes a legacy QuickBooks Time API for legacy time-tracking solutions.
- The Bridge currently uses the legacy QuickBooks Time model (`rest.tsheets.com/api/v1`) and not the new Payroll and Time GraphQL platform.

Important official Time docs:
- Payroll and Time getting started: https://developer.intuit.com/app/developer/payroll-time/docs/get-started
- Track time (legacy): https://developer.intuit.com/app/developer/payroll-time/docs/workflows/track-time-legacy
- Time API direction / TimeActivity: https://developer.intuit.com/app/developer/qbo/docs/workflows/track-time/develop-time
- Time use cases: https://developer.intuit.com/app/developer/qbo/docs/workflows/track-time/use-cases

Interpretation:
- Current Bridge use of `/users`, `/jobcodes`, `/timesheets`, `/geolocations`, `/customfields`, `/locations`, and `/effective_settings` is aligned to Intuit's legacy Time API path, not the new strategic platform.
- That is acceptable for now if the business intentionally stays on legacy Time behavior.
- It is not "latest-platform aligned".

### Google

Official sources confirm:
- Google Drive v3 supports simple, multipart, and resumable upload.
- Google explicitly recommends resumable upload for large files and unstable networks.
- Google OAuth refresh tokens must be stored long-term, but they can expire or be invalidated for several reasons, including six months of non-use, token count limits, or testing-mode constraints.
- Maps Geocoding v4 supports field masks and OAuth; current docs are centered on v4.
- Street View Static API requires API key and recommends digital signatures for maximum security.
- Roads API supports up to 100 GPS points per request and optional interpolation.
- Places API (New) is now the current version; Places API legacy is legacy, and Find Place (Legacy) is explicitly replaced by Text Search (New).

Important official Google docs:
- Drive uploads: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Google OAuth: https://developers.google.com/identity/protocols/oauth2
- Geocoding v4: https://developers.google.com/maps/documentation/geocoding/geocoding
- Street View Static API: https://developers.google.com/maps/documentation/streetview/overview
- Roads API snapToRoads: https://developers.google.com/maps/documentation/roads/snap
- Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview
- Places migration overview: https://developers.google.com/maps/documentation/places/web-service/legacy/migrate-overview
- Places legacy overview: https://developers.google.com/maps/documentation/places/web-service/choose-api

## Bridge Alignment Findings

### QBO alignment in Bridge

Good:
- Uses OAuth 2.0 token refresh against `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`.
- Uses current production/sandbox hosts.
- Uses `minorversion=75`, which matches the latest minor version explicitly called out in Intuit release notes.
- Uses batch endpoint with max 30 operations, which matches Intuit guidance.
- Uses QBO query max patterns consistent with the 1000-entity cap.

Relevant implementation:
- [qbo-v2.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\qbo-v2.js)

Gaps:
- No webhook ingestion path for QBO changes.
- No CDC sync layer.
- No explicit handling for deprecated `Customer.source` / `Vendor.source` if any consumers still depend on it.
- Token policy handling is operationally good, but there is a documentation conflict inside Intuit sources: FAQ still emphasizes 100-day rolling refresh token behavior, while release notes now state a 5-year maximum validity period. The safe operational assumption is still: always persist and use the latest refresh token from the most recent token response.
- No explicit `intuit_tid` capture surfaced for support/debug correlation.

### QBT alignment in Bridge

Current implementation:
- [config-v2.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\config-v2.js) uses `https://rest.tsheets.com/api/v1`
- [qbt.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\qbt.js) implements legacy Time-style endpoints

Assessment:
- This is aligned to the legacy QuickBooks Time API.
- It is not aligned to the newer Payroll and Time platform direction.
- If you intend to stay on legacy Time, this is operationally fine.
- If you intend to be "latest Intuit aligned", you need a roadmap to evaluate Payroll and Time GraphQL, partner-tier access, and what functionality moves there versus remains in QBO TimeActivity.

Specific risk:
- The Bridge and TS_Exp5 assume legacy endpoints like `/api/v1/timesheets` and `/api/v1/geolocations`. That is compatible with the legacy Time model, but it increases lock-in to the old contract.

### Google alignment in Bridge

Drive:
- [google-drive.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\google-drive.js) uses Drive v3 via `googleapis`, which is fine.
- Current upload approach is acceptable for small files.
- For larger PDFs or unstable mobile/network conditions, the implementation is not explicitly resumable-upload aware.
- If receipt PDFs can exceed roughly 5 MB or uploads occur on unstable mobile paths, resumable uploads are the better official pattern.

Maps / Roads / Street View:
- [receipt-location.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\receipt-location.js) uses older-style geocoding and Places legacy endpoints.
- [osrm.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\clients\osrm.js) uses Roads API snapToRoads and Directions API patterns.
- [image-cache.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\cache\image-cache.js) and [properties-v1.js](C:\Users\samjo\Desktop\BB_Micro_Bridge\src\routes\properties-v1.js) use Street View Static API.

Assessment:
- Roads API usage looks conceptually aligned.
- Street View usage works, but there is no evidence of digital signature usage; Google recommends signatures for security.
- Geocoding is not using the newer v4 pattern with field masks.
- Places usage is legacy-oriented; Google now treats Places API (New) as the current version and Places legacy as legacy.

## Consumer Alignment Findings

### CalExp5

Status: mostly aligned.

- Uses the Bridge proxy pattern through [server.js](C:\Users\samjo\Desktop\CalExp5\server.js)
- Calls Bridge-backed `/qbt/*`, `/cal/*`, `/data/*`, `/auth/*` routes through its own app proxy
- Uses current Bridge API shapes for timesheets, jobcodes, receipt scans, settings persistence, GPS, and auth

Main issues:
- Still carries production file fallback for settings in the app server.
- Uses a public-URL workaround for long AI scan requests because Railway internal networking is not stable enough for that path.
- This is operationally aligned, but not a clean target architecture.

### TS_Exp5

Status: compatible, but fragile.

- TS_Exp5 is now Bridge-only in intent, but its service layer still thinks in direct Intuit endpoint terms like `/api/v1/timesheets` and `/v3/company/.../query`, then remaps those through local bridge shims.
- That means it is compatible today, but not cleanly coupled to the Bridge contract.

Relevant files:
- [qbt.service.js](C:\Users\samjo\Desktop\TS_Exp5\src\server\services\qbt.service.js)
- [qbo.service.js](C:\Users\samjo\Desktop\TS_Exp5\src\server\services\qbo.service.js)
- [http-client.js](C:\Users\samjo\Desktop\TS_Exp5\src\server\services\http-client.js)

Main issues:
- Still carries bridge-shim semantics instead of treating Bridge as the canonical API.
- Keeps localhost defaults in config for local bridge use.
- Compatible now, but brittle if Bridge route contracts evolve.

### RevExp5

Status: mostly aligned in active runtime, mixed in debug/docs.

- Active runtime uses Bridge endpoints like `/api/qbo/invoices-enriched`, `/api/qbo/invoice/pdf`, `/api/qbo/attachment-fetch`, `/api/qbo/validate-labor-exact`, `/api/qbt/validate-labor-exact`, `/api/qbo/recon-enhanced`.
- Production runtime references Railway Bridge.
- Benchmarks, debug pages, and old docs still reference localhost Mini bridge.

Main issue:
- Operational path is fine, but repository still contains a lot of legacy test/debug assumptions.

### Chase_Expense_Validator

Status: active path aligned now, repository history noisy.

- Current active files now default to Railway Bridge and probe `/ready` for QBO status.
- Many historic content script versions still reference `http://localhost:3100`.
- Extension manifest still includes localhost host permissions, which is okay if desktop mode remains supported.

Relevant files:
- [popup.js](C:\Users\samjo\Desktop\Chase_Expense_Validator\extension\popup.js)
- [content-v27.js](C:\Users\samjo\Desktop\Chase_Expense_Validator\extension\content-v27.js)

### Other consumers

- `PorjExp5`, `Landfill_Surcharge`, and most current Railway consumers appear Bridge-aligned enough for now.
- Several repos still contain docs, tests, benchmark files, or old scripts that reference localhost Mini bridge. Those are not production blockers, but they are not 100% alignment either.

## 3-Way Misalignment Summary

### Highest priority gaps

1. QBT platform direction mismatch
- Bridge is on legacy QuickBooks Time API.
- Intuit's current strategic direction is Payroll and Time / GraphQL and newer Time workflows.
- This is the biggest strategic target misalignment.

2. QBO change ingestion under-built
- Official guidance strongly favors webhooks + CDC.
- Bridge currently has neither.
- This is a resilience and data-freshness gap relative to Intuit's recommended model.

3. Google Places is on legacy patterns
- Bridge uses legacy Places-style `findplacefromtext` and older geocoding patterns.
- Google now positions Places API (New) as the current version and legacy as legacy.

4. Consumer contract drift
- TS_Exp5 still thinks in direct-provider paths and relies on bridge remapping.
- Multiple repos still contain legacy localhost assumptions.

### Medium priority gaps

5. No `DATABASE_URL_DIRECT` split in Bridge runtime config
6. No QBO `intuit_tid` correlation surfaced into logs
7. Street View requests appear unsigned
8. Drive uploads do not explicitly use resumable upload where official guidance would favor it
9. No documented provider-specific compatibility matrix per consumer app

## What is already well aligned

- Bridge QBO hosts and OAuth flow are correct.
- Bridge QBO batch size of 30 matches official guidance.
- Bridge `minorversion=75` is current relative to explicitly documented minor versions.
- Roads API chunking logic conceptually aligns with the 100-point limit.
- CalExp5 and current active Chase extension flows are much closer to the Bridge than the older apps were.

## Recommended Actions

### Immediate

1. Treat current QBT integration as explicitly `legacy` in docs and code comments.
2. Create a provider compatibility matrix for each active consumer.
3. Capture `intuit_tid` and response metadata on QBO failures.
4. Inventory all consumer routes still depending on Bridge remapping instead of canonical Bridge contracts.

### Next

5. Add a QBO webhook + CDC design path to the Bridge roadmap.
6. Decide deliberately whether to:
   - stay on legacy QuickBooks Time for now, or
   - start a migration study toward Payroll and Time APIs.
7. Migrate Google Places usage from legacy `findplacefromtext` patterns toward Places API (New) where it matters.
8. Review whether Drive uploads should move to resumable upload for larger artifacts.
9. Review whether Street View requests should be signed, not key-only.

### Before claiming "100% alignment"

You would need:
- QBO webhook/CDC strategy
- explicit QBT legacy-vs-new roadmap decision
- Places API migration decision
- consumer-by-consumer contract cleanup
- production config/docs updated to the current target APIs and target limits

## Final Assessment

Current scorecard:
- Bridge vs QBO: good, but incomplete on modern sync patterns
- Bridge vs QBT: functionally aligned to legacy, not aligned to latest Intuit direction
- Bridge vs Google: partly aligned, partly legacy
- Consumers vs Bridge: mixed but improving

Conclusion:
- Production compatibility is acceptable.
- Strategic platform alignment is not yet complete.
- The main blind spot was QuickBooks Time: the Bridge is not wrong, but it is on the legacy branch of Intuit's ecosystem, not the new one.
