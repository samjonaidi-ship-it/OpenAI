# Bridge Deploy Context Cleanup Plan

Date: 2026-04-04
Repo: C:\Users\samjo\Desktop\BB_Micro_Bridge

## Summary

The latest Railway Docker build is already down to about 63 seconds. The remaining deploy drag is not the Dockerfile; it is tracked repository payload, especially `test-data/`.

Tracked size snapshot:
- tracked files: 322
- `test-data/`: 24.99 MB
- `docs/`: 1.01 MB
- `tests/`: 0.11 MB
- `scripts/`: 0.15 MB

Largest tracked file:
- `test-data/scenarios/2026-03-25_extreme-firehose.json`: 21.21 MB

## What Should Leave The Production Repo

These files are not runtime dependencies and should not remain tracked in the production deploy repo.

### Priority 1: Remove From Tracked Repo

Entire `test-data/` tree:
- `test-data/raw/*`
- `test-data/scenarios/*`
- `test-data/results/*`
- `test-data/OVERNIGHT_REPORT.md`

Reason:
- not used by runtime request serving
- already excluded from Docker build context
- still inflates git-based deploy context and repo indexing
- contains sensitive operational/QBT-derived data and replay artifacts

### Priority 2: Move Out Of Main Runtime Repo If Not Needed Daily

Large design/spec docs:
- `docs/UNIVERSAL_ASSET_SYSTEM_SPEC.md`
- `docs/TOOL_TRACKER_SPEC.md`
- `docs/PRODUCTION_HARDENING_REPORT.md`
- `docs/BB_BUDDY_ARCHITECTURE_V2.md`
- related research/spec docs not needed for on-repo runtime maintenance

Reason:
- not used at runtime
- not needed for container image
- smaller impact than `test-data/`, but still unnecessary in the deploy repo

## What Must Stay

Keep tracked in repo:
- `src/**`
- `package.json`
- `package-lock.json`
- `Dockerfile`
- `.dockerignore`
- `.gitignore`
- runtime config templates
- tests actually used by CI if this repo remains the test-running source
- `README.md`
- concise operational docs needed by active maintainers

## Evidence: Runtime Reference Scan

No runtime code path reads `test-data/`.
Observed references are limited to:
- docs
- scripts such as `scripts/gps-sim.js` and `scripts/harvest-qbt-patterns.js`
- archived replay/result files themselves

That means `test-data/` is safe to archive out of the production repo, provided those developer scripts are updated to point at the archive location or remain local-only.

## Safe Archive Target

Recommended target outside the runtime repo:
- `C:\Users\samjo\Desktop\OpenAI\Archive\BB_Micro_Bridge_TestData`

Recommended preserved structure:
- `raw/`
- `scenarios/`
- `results/`
- `OVERNIGHT_REPORT.md`

Optional second target for large specs:
- `C:\Users\samjo\Desktop\OpenAI\Archive\BB_Micro_Bridge_Docs`

## Safe Execution Plan

### Phase 1: No-risk cleanup
1. Copy `test-data/` to archive target.
2. Verify archive contents and sizes.
3. Add explicit `.gitignore` entries for:
   - `test-data/raw/`
   - `test-data/scenarios/`
   - `test-data/results/`
4. Remove tracked `test-data/` from git index with `git rm --cached` only after archive verified.
5. Commit as deploy-context cleanup only.

### Phase 2: Optional doc slimming
1. Move heavyweight design/spec docs to `OpenAI\Archive` or dedicated architecture repo.
2. Replace with a short index file if needed.
3. Keep only active runtime/ops docs in `docs/`.

### Phase 3: Deploy-path hygiene
1. Prefer GitHub-triggered Railway deploys over noisy local `railway up` from a large working tree.
2. Keep production branch free of large fixtures and replay artifacts.
3. If local deploy is still needed, deploy only from a clean working tree.

## Estimated Gain

Expected impact from removing tracked `test-data/`:
- repo payload reduced by about 25 MB
- lower Railway indexing/upload overhead
- lower local deploy packaging overhead
- no runtime risk

Expected impact from slimming large docs as well:
- another ~1 MB reduction
- mainly cleanliness benefit, minor speed gain

## Recommendation

Do not touch runtime code for this step.
The highest-value move is to archive `test-data/` out of the tracked production repo first. That is the only change here likely to produce noticeable deploy-time improvement without introducing runtime risk.
