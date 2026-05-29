Run an overnight autonomous review-and-fix pass on this repo only:

- C:\Users\samjo\Desktop\CalExp5

Mission:
Find real bugs/regressions/risks, fix safe issues, rerun validation, and leave a clear report.

Focus especially on:
- Control Tower behavior
- People & Access
- active/inactive handling
- mocked employee behavior
- admin actions
- feature flags / entitlements
- drawer/navigation changes
- /control route behavior
- Receipts / Tools / GPS / Audit / Settings tabs
- bridge operator panel integration
- stale assumptions between CalExp5 and BB_Micro_Bridge
- auth/session behavior
- push/notification controls
- file/settings persistence
- UI regressions on desktop and mobile

Required actions:
1. inspect git status and recent changes
2. inspect touched files and nearby dependencies
3. run build
4. find real issues only
5. fix safe issues
6. rerun build
7. commit fixes on a branch
8. do not deploy
9. do not push to master

Rules:
- do not revert unrelated local changes
- keep fixes minimal and correct
- preserve current production architecture
- if blocked, document blocker and continue with remaining safe work

Deliverables:
Create:
- C:\Users\samjo\Desktop\OpenAI\OvernightReports\CalExp5_overnight_report.md

Report must include:
- findings by severity
- fixes applied
- exact files changed
- validation commands and results
- remaining risks
- branch name and commit hashes
