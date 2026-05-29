# GitHub + Railway Deploy Workflow | 2026-04-04

## Purpose

Define the normal production deploy path for `BB_Micro_Bridge` now that deploy-context cleanup is complete and build times are back in range.

This document is intentionally operational, not architectural.

## Current live target

- Railway project: `BB-Production`
- Railway project id: `7b578e94-4004-44cd-8c33-6fc18f983b5a`
- Environment: `production`
- Service: `BB-Micro-Bridge`
- Current production domain: `https://bb-micro-bridge-production.up.railway.app`

## Current baseline

After the deploy-context cleanup:
- tracked `test-data/` removed from repo
- heavyweight design docs archived out of tracked repo
- latest Railway Docker build time observed: `37.75 seconds`

This means the normal deploy path is now fast enough to standardize on GitHub-triggered deployment.

## Deployment policy

### Normal path

Use GitHub push/merge to deploy production.

This should be the default for:
- routine production deploys
- hotfixes that have been locally tested and committed
- any change that does not require bypassing git history

### Emergency path

Use `railway up` only when:
- GitHub webhook/build trigger is unavailable
- a production rollback or hotfix must be forced immediately
- the exact commit cannot wait for normal CI/repo-trigger flow

When `railway up` is used:
- deploy from a clean worktree only
- never deploy from a dirty local repo with unrelated files present
- prefer a detached clean worktree at the exact commit being deployed

## Why GitHub should be the default

GitHub-triggered Railway deploys are better because they:
- use the committed repo state only
- avoid noisy local working-tree uploads
- produce deterministic commit-to-deployment mapping
- reduce accidental inclusion of local-only files
- make rollback and audit easier

## Required branch discipline

### Production branch

Treat `master` as production-deployable.

Rules:
- no large fixtures or replay artifacts tracked in repo
- no local secret files tracked
- no deploy from uncommitted state
- no mixed feature + ops cleanup bundles unless intentional

### Local work

If the working tree is dirty:
- commit only the intended files
- or create a clean detached worktree for deploy

Recommended command pattern:

```powershell
git worktree add --detach C:\Users\samjo\AppData\Local\Temp\bbmb-deploy-clean <commit>
```

## Standard production deploy sequence

### 1. Prepare

- confirm local tests pass
- confirm only intended files are committed
- confirm target commit hash
- confirm production window is clear

### 2. Push

```powershell
git push origin master
```

### 3. Let Railway/GitHub deploy

Do not manually redeploy unless:
- webhook failed
- build stalled
- emergency override is required

### 4. Verify latest deployment

Use Railway CLI:

```powershell
railway status --json
railway logs --build --latest --lines 160
```

Verify:
- latest deployment commit hash
- build success
- build time trend

### 5. Verify runtime health

```powershell
Invoke-RestMethod https://bb-micro-bridge-production.up.railway.app/api/health | ConvertTo-Json -Depth 6
Invoke-RestMethod https://bb-micro-bridge-production.up.railway.app/ready | ConvertTo-Json -Depth 6
```

Expected:
- `status: ok` on `/api/health`
- `status: ready` on `/ready`
- `qbo: ok`
- `qboPersistence: ok`
- `qbt: ok`

### 6. Optional safe pressure check

Use the safe pressure test pack only:
- `/api/health`
- `/ready`
- `/api/qbo/token-status`

Do not run refresh-storm pressure in production unless explicitly planned.

## Emergency deploy path

Only use this if GitHub-triggered deploy is not sufficient.

### 1. Create clean worktree

```powershell
git worktree add --detach C:\Users\samjo\AppData\Local\Temp\bbmb-deploy-clean <commit>
```

### 2. Deploy from clean worktree

Use explicit Railway targeting if needed:

```powershell
railway up --project 7b578e94-4004-44cd-8c33-6fc18f983b5a --environment production --service BB-Micro-Bridge --detach --message "Emergency deploy <commit>"
```

### 3. Verify health immediately

Run the same `/api/health` and `/ready` checks.

## Rollback policy

Rollback should also use GitHub as the normal path:
- revert the bad commit
- push the revert
- let Railway redeploy

Use emergency direct deploy only if:
- the revert path is too slow
- GitHub-triggered deploy path is impaired

## What not to do

- do not deploy from a dirty production repo
- do not track large replay/test payloads in the runtime repo
- do not use `railway up` as the everyday deploy mechanism
- do not mix runtime hotfixes with broad refactors in one production push

## Current recommendation

For `BB_Micro_Bridge`, the deploy standard should now be:

1. commit
2. push to GitHub
3. allow Railway to auto-deploy
4. verify build log
5. verify `/api/health`
6. verify `/ready`

That is now the cleanest, fastest, and least error-prone path.
