# Multi-Agent Startup Checklist

## Before Opening VS Code
1. Open `C:\Users\samjo\Desktop\OpenAI\OpenAI-Agents.code-workspace`.
2. Open `C:\Users\samjo\Desktop\OpenAI\Ops_Coordination\ACTIVE_AGENTS.md`.
3. Open `C:\Users\samjo\Desktop\OpenAI\Ops_Coordination\MULTI_REPO_BOARD.md`.
4. Open `C:\Users\samjo\Desktop\OpenAI\Ops_Coordination\RELEASE_SEQUENCE.md`.
5. Confirm which repos and tasks are active.

## Per Repo Setup
1. Open the repo-local `AGENTS.md`.
2. Open `docs/AGENT_TASK_BOARD.md`.
3. Confirm file locks before editing.
4. Confirm `main` is current in the integrator worktree.
5. Create fresh `agent/*` branches for worker worktrees if needed.

## Launch Pattern: 2 Workers + 1 Integrator
Use `C:\Users\samjo\Desktop\OpenAI\launch-calexp5-3w.ps1` to open all three role windows at once.

1. Window A: worker 1 on worktree 1.
2. Window B: worker 2 on worktree 2.
3. Window C: integrator on `main` worktree.

## Worker Checklist
1. Verify you are not on `main`.
2. Claim file locks in the repo task board.
3. Implement only within your task scope.
4. Commit to your `agent/*` branch.
5. Push your `agent/*` branch.
6. Mark task status as `review`.
7. Record `Ready Commit` in the repo task board.

## Integrator Checklist
1. Verify you are on `main`.
2. Check repo task board for tasks marked `review`.
3. Merge one worker branch at a time.
4. Run required checks after each merge.
5. Push `main`.
6. Update `Merged Commit` and `Integrator` in the repo task board.
7. Append the merge to `docs/INTEGRATION_LOG.md`.
8. Deploy only after merge validation passes.
9. Update global coordination files after deployment.

## End of Session
1. Release file locks for merged work.
2. Mark deployed tasks in `MULTI_REPO_BOARD.md`.
3. Update `RELEASE_SEQUENCE.md` if dependencies changed.
4. Set agent statuses in `ACTIVE_AGENTS.md` to `idle`, `blocked`, or the next active task.
