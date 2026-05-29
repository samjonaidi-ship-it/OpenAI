# Active Agents

| Agent | Role | Repo | Branch | Current Task | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `worker-1` | worker | `BB_Crew_Calendar` | `agent/example-ui` | Example UI task | idle |  |
| `worker-2` | worker | `BB_Micro_Bridge` | `agent/example-api` | Example API task | idle |  |
| `integrator-calendar` | integrator | `BB_Crew_Calendar` | `main` | Merge and deploy calendar repo | idle | only session allowed to merge/deploy this repo |
| `integrator-bridge` | integrator | `BB_Micro_Bridge` | `main` | Merge and deploy bridge repo | idle | only session allowed to merge/deploy this repo |

## Role Values
- `worker`
- `integrator`
- `reviewer`

## Status Values
- `idle`
- `in_progress`
- `review`
- `blocked`

## Rules
- Each active session should appear here.
- Update this file when an agent changes task, repo, or branch.
- Integrators should stay on `main`.
- Workers should stay on `agent/*`.
