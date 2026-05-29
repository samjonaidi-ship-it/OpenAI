# CalExp5 Overnight Review Report (2026-04-05)

## Findings by Severity

### High
- Admin push controls in the drawer used unauthenticated fetches (`/api/push/admin-status`, `/api/push/admin-notifications`, `/api/push/preferences`), which would 401 under auth-enabled deployments, breaking admin visibility and toggles.

### Medium
- Control Tower People & Access assumed `member.internalId` was always present. If the Bridge returns only `id` (or `internalId` missing), list keys collide and admin actions target `undefined` IDs (reset onboarding, status, revoke sessions, push toggles).

### Low
- None identified during this pass.

## Fixes Applied
- Added Authorization headers to push admin/status/preference fetches in the drawer so admin actions work under auth.
- Resolved Control Tower member IDs with a fallback (`internalId` → `id`) and guarded admin actions to avoid `undefined` IDs; also stabilized list keys and push badge indexing.

## Files Changed
- `src/components/layout/MenuDrawer-v2.jsx`
- `src/components/views/ControlTower.jsx`

## Validation Commands and Results
- `npm run build` — succeeded.
  - Warnings about dynamic imports and chunking remain (vite reporter warnings for `api-users.js`, `useStore.js`, `auth.js`).

## Remaining Risks / Follow-ups
- If Bridge expects a different identifier than `id` when `internalId` is missing, Control Tower actions may still fail; this should be confirmed with real payloads from `/admin/crew-auth`.
- Build warnings indicate suboptimal chunk splitting; not addressed in this pass since behavior is unchanged.
- No runtime/UI smoke test was executed in this pass.

## Branch and Commits
- Branch: `overnight/calexp5-2026-04-05`
- Commit: `e1083f41659e63e017f4086a7aca38e1b5fa06d7`
