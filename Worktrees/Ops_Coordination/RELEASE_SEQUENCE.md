# Release Sequence

## Purpose
Tracks required merge and deploy order across repos.

| Order | Repo | Task | Branch | Status | Blocking | Deploy Target | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `BB_Micro_Bridge` | Example API task | `agent/example-api` | pending | none | Railway | backend first |
| 2 | `BB_Crew_Calendar` | Example UI task | `agent/example-ui` | pending | `BB_Micro_Bridge` task 1 | Railway | UI depends on backend |

## Status Values
- `pending`
- `in_progress`
- `review`
- `merged`
- `deployed`

## Rules
- Lower order deploys first.
- Do not deploy blocked tasks before their dependencies are deployed.
- Update this file whenever dependency order changes.
