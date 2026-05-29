# CalExp5 Worktree Plan

## Purpose
Run `2 workers + 1 integrator` against `CalExp5` without branch or file collisions.

## Source Repo
- Repo: `C:\Users\samjo\Desktop\CalExp5`
- Integration branch: `main`

## Recommended Worktree Layout
- `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-main`
- `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-1`
- `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-2`

## Branch Mapping
- `CalExp5-main` -> `main`
- `CalExp5-worker-1` -> `agent/<task-1>`
- `CalExp5-worker-2` -> `agent/<task-2>`

## Creation Commands
```powershell
New-Item -ItemType Directory -Force -Path C:\Users\samjo\Desktop\OpenAI\Worktrees | Out-Null

git -C C:\Users\samjo\Desktop\CalExp5 fetch --all --prune

git -C C:\Users\samjo\Desktop\CalExp5 worktree add C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-main main

git -C C:\Users\samjo\Desktop\CalExp5 worktree add -b agent\bb-scan-task C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-1 origin/main

git -C C:\Users\samjo\Desktop\CalExp5 worktree add -b agent\crew-entry-task C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-2 origin/main
```

## Session Mapping
- Worker session 1 opens `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-1`
- Worker session 2 opens `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-2`
- Integrator session opens `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-main`

## Rules
- Workers stay on their own `agent/*` branch.
- Integrator stays on `main`.
- Workers push only their own branch.
- Integrator is the only session that merges to `main` and deploys.
- File locks must still be recorded in `docs/AGENT_TASK_BOARD.md`.

## Teardown
```powershell
git -C C:\Users\samjo\Desktop\CalExp5 worktree list

git -C C:\Users\samjo\Desktop\CalExp5 worktree remove C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-1

git -C C:\Users\samjo\Desktop\CalExp5 branch -d agent/bb-scan-task
```
