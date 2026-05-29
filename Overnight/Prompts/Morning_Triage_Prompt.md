Review the overnight engineering results and prepare the morning fix/deploy plan.

Inputs:
- C:\Users\samjo\Desktop\OpenAI\OvernightReports\MASTER_OVERNIGHT_SUMMARY.md
- all per-repo overnight reports in:
  C:\Users\samjo\Desktop\OpenAI\OvernightReports

Task:
1. identify the most credible findings
2. separate:
   - confirmed bugs
   - likely bugs needing verification
   - low-confidence findings
3. identify which fixes are already safe and complete
4. identify which branches/commits should be inspected first
5. produce a morning action list ordered by impact and risk

Output format:
1. Confirmed Findings
- severity ordered
- file references
- why each is credible

2. Fixes Already Applied
- repo
- branch
- commit
- whether validation passed

3. Items Requiring Manual Verification
- exact thing to verify
- repo
- suggested command or UI check

4. Recommended Morning Priority
- ordered list of what to inspect, merge, test, or deploy first

5. Risks to Avoid
- anything that should not be merged or deployed yet

Be concise and technical.
Do not repeat low-value summaries.
