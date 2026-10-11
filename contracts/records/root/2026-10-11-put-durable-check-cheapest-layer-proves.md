# root/put-durable-check-cheapest-layer-proves

Rule: `root/put-durable-check-cheapest-layer-proves`. Recorded 2026-10-11 on `claude/e2e-budget-p1c` at 52299a46b.

docs/work-specs/e2e-suite-budget/evidence/cost-and-growth.md: 107 spec files were added between 2026-09-20 and 2026-10-11 and none consolidated; 19 offline specs drive no UI at all but import src in the browser, and 62 Node tests already import src. The rule that only said 'a Playwright spec in the same commit' named no cheaper layer, so every durable check became an E2E file and the full run outgrew nine and then ten shards in two weeks.

Why a rule rather than a fix, a mechanism or a check: The capacity line (scripts/e2e-capacity.mjs) measures growth and the protection check guards removal, but neither says where a new check should go; placement is a judgement made at writing time and only guidance reaches that moment.
