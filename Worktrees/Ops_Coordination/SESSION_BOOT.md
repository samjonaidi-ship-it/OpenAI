# Session Boot

## Role Windows
- `launch-calexp5-3w.ps1` opens the three CalExp5 role windows only.
- `launch-calexp5-2w1i.ps1` opens the shared workspace plus the three CalExp5 role windows.
- `launch-calexp5-worker1.ps1` opens worker 1 only.
- `launch-calexp5-worker2.ps1` opens worker 2 only.
- `launch-calexp5-integrator.ps1` opens the integrator checkout only.

## Expected Mapping
- Integrator: `C:\Users\samjo\Desktop\CalExp5`
- Worker 1: `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-1`
- Worker 2: `C:\Users\samjo\Desktop\OpenAI\Worktrees\CalExp5-worker-2`

## First Files To Open In Each Window
1. Repo `AGENTS.md`
2. Repo `docs\AGENT_TASK_BOARD.md`
3. `C:\Users\samjo\Desktop\OpenAI\Ops_Coordination\ACTIVE_AGENTS.md`

## Role Reminder
- Workers stay on `agent/*` only.
- Integrator stays on `main` only.
- Workers push only their branch.
- Integrator merges and deploys.
