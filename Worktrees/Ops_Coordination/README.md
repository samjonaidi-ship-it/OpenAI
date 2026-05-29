# Ops Coordination

## Purpose
This folder coordinates multi-agent work across multiple repos.

## Repo-local vs Global
Each repo keeps its own local controls:
- `AGENTS.md`
- `docs/AGENT_TASK_BOARD.md`
- `docs/INTEGRATION_LOG.md`

This folder tracks:
- active agent sessions across repos
- cross-repo task status
- dependency-aware merge and deploy order

## Files
- `ACTIVE_AGENTS.md` - active sessions and roles
- `MULTI_REPO_BOARD.md` - global task tracking
- `RELEASE_SEQUENCE.md` - ordered merge/deploy plan

## Core Rules
- Workers operate only on `agent/*` branches.
- Workers never push `main`.
- Workers never deploy.
- Repo integrators are the only sessions allowed to merge into `main`.
- Repo integrators are the only sessions allowed to deploy.
- Repo-local file locks are authoritative for file ownership.
- This folder is authoritative for cross-repo dependencies and release sequencing.

## Operating Flow
1. Add tasks to `MULTI_REPO_BOARD.md`.
2. Add sessions to `ACTIVE_AGENTS.md`.
3. For each repo, workers claim files in that repo's local task board.
4. Workers implement on `agent/*` branches.
5. Workers push their branch and mark the task `review`.
6. Integrators merge into the repo's `main`.
7. Integrators update repo-local integration logs.
8. Integrators update `MULTI_REPO_BOARD.md` and `RELEASE_SEQUENCE.md`.
9. Integrators deploy in dependency order.
