Run an overnight autonomous review-and-fix pass across these repos:

- C:\Users\samjo\Desktop\BB_Micro_Bridge
- C:\Users\samjo\Desktop\CalExp5
- C:\Users\samjo\Desktop\Chase_Expense_Validator
- C:\Users\samjo\Desktop\RevExp5
- C:\Users\samjo\Desktop\TS_Exp5
- C:\Users\samjo\Desktop\BB_Data_Manager

Priority:
1. BB_Micro_Bridge
2. CalExp5
3. Chase_Expense_Validator
4. RevExp5
5. TS_Exp5
6. BB_Data_Manager

Task:
- inspect recent changes and surrounding dependencies
- find real bugs/regressions/risks
- fix safe issues
- rerun validation
- commit fixes on a branch
- do not deploy
- do not push to master
- do not rotate secrets
- do not revert unrelated user changes

Focus on:
- auth/security
- bridge/control-plane behavior
- worker/replica/HA issues
- QBO/QBT integrations
- webhook / CDC / projections
- caching correctness
- stale localhost assumptions
- consumer/bridge contract drift
- CalExp5 Control Tower
- people/access activation logic
- push/notification behavior

Validation:
- BB_Micro_Bridge: run tests
- CalExp5: run build
- other repos: run the strongest available safe validation

Output:
Create per-repo markdown reports in:
C:\Users\samjo\Desktop\OpenAI\OvernightReports

Also create:
C:\Users\samjo\Desktop\OpenAI\OvernightReports\MASTER_OVERNIGHT_SUMMARY.md

Each repo report must include:
- findings by severity
- fixes applied
- files changed
- validation run
- remaining risks
- git branch + commit hashes

Rules:
- be autonomous
- do not stop at analysis
- make fixes where justified
- if blocked, document the blocker and continue to the next repo
- keep fixes minimal and correct
- preserve unrelated local work
