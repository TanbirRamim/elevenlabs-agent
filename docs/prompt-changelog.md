# Prompt changelog

| Date | Route / agent | Version | Change | Eval result |
| --- | --- | --- | --- | --- |
| 2026-10-03 | all | @1 | Initial prompts | guard eval 9/9, 0 false blocks |
| 2026-10-04 | workMapBuilder | workmap@2 | Debrief-learned rules become guardrails: quote the answer segment, reuse the topically closest stored frame as the moment. Before, legal/GDPR and known-bug rules taught via the unseen-case probes were silently dropped (no screen moment), capping eval:tutor at 43%. | eval:tutor on a real captured map, before/after in the PR |
