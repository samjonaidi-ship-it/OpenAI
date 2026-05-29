# Multi Repo Board

| Repo | Task | Agent | Branch | Status | Depends On | Integrator | Deploy Target | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `BB_Crew_Calendar` | Example UI task | `worker-1` | `agent/example-ui` | pending | none | `integrator-calendar` | Railway |  |
| `BB_Micro_Bridge` | Example API task | `worker-2` | `agent/example-api` | pending | none | `integrator-bridge` | Railway |  |

## Status Values
- `pending`
- `in_progress`
- `blocked`
- `review`
- `merged`
- `deployed`

## Dependency Format
- `none`
- `<Repo>: <Task>`
- multiple dependencies separated by `;`

Examples
- `none`
- `BB_Micro_Bridge: receipt DB persistence`
- `BB_Micro_Bridge: receipt DB persistence; BB_Crew_Calendar: BB scan admin tab`

## Rules
- One row per active task.
- Set a task to `review` only after the worker branch is pushed and ready for integration.
- Set a task to `merged` only after the repo integrator merges it into that repo's `main`.
- Set a task to `deployed` only after deployment is confirmed.
