Run an overnight autonomous review-and-fix pass on this repo only:

- C:\Users\samjo\Desktop\BB_Micro_Bridge

Mission:
Find real bugs/regressions/risks, fix safe issues, rerun validation, and leave a clear report.

Focus especially on:
- auth/security regressions
- web/worker split
- 2-replica / HA behavior
- idempotency
- rate limiting
- leases / operator jobs
- QBO token durability
- webhook / CDC / projections
- caching correctness
- operator/admin routes
- notification dedupe / delivery state
- readiness / health behavior
- QBO/QBT integration drift

Required actions:
1. inspect git status and recent changes
2. inspect touched files and nearby dependencies
3. run tests
4. find real issues only
5. fix safe issues
6. rerun tests
7. commit fixes on a branch
8. do not deploy
9. do not push to master

Rules:
- do not rotate secrets
- do not modify live infra
- do not revert unrelated local changes
- keep fixes minimal and correct
- if blocked, document blocker and continue with remaining safe work

Deliverables:
Create:
- C:\Users\samjo\Desktop\OpenAI\OvernightReports\BB_Micro_Bridge_overnight_report.md

Report must include:
- findings by severity
- fixes applied
- exact files changed
- validation commands and results
- remaining risks
- branch name and commit hashes
