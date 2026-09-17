# AC-1 - the skill teaches the control contract and its three gates

**Verdict: pass.** Reviewed at `dfac5b9cf230532565f57d6988517bb25cdbf94d` plus this branch's own
commits, on 2026-09-16, by a session that wrote none of the implementation.

## What was run

Against the SHIPPED package rather than the repository copy, because that is what a stranger gets:

```
npx -y @noacg/cli@0.3.2 docs contract      # 1.740 s, exit 0, 397 lines
npx -y @noacg/cli@0.3.2 --version          # 0.3.2
```

The printed text carries `### 5a. The three gates` with the gates as numbered steps, and the
authored-machine section the criterion names. Line 146 of the printed output states the gate that
is easiest to lose: "Zero errors is not this gate; zero errors plus no machine warning you cannot
explain" is.

In the repository, at this revision:

```
cd cli && npm ci && npm run build            # exit 0
node scripts/build-skill.mjs --check         # exit 0 - "11 generated files match the source (noacg v0.3.2)"
node --test test/unit.test.mjs               # 33 tests, 33 pass, 0 fail
grep -rn "later capability" cli/ src/ docs/  # only the TEST that pins its absence, and one owner-queue note
```

`cli/test/unit.test.mjs:575` is the pin: it reads the `### 5a. The three gates` section out of
`references/contract.md` and asserts the TOOL and the ACT each gate names, then asserts the loop in
`SKILL.md` carries them as steps. `cli/test/unit.test.mjs:610` is the pin that the deferring
sentence is gone from every reference topic and from `SKILL.md`.

## What was observed

- The generated copies and the source agree, so the eleven shipped files cannot drift from the one
  authored text without `--check` failing. That is the criterion's "every generated copy follows
  from `cli/scripts/build-skill.mjs --check`".
- `SKILL.md` names the gates at lines 28, 47 and 58, in the loop, as steps - not as a reference
  section an agent may skip. Gate 2 is the one with a human in it and the loop says so in bold.

## Limitations

- The CLI's unit tests need `npm run build` first: a fresh worktree has no `cli/dist`, and
  `node --test test/unit.test.mjs` then dies with `ERR_MODULE_NOT_FOUND` on
  `cli/dist/commands/docs.js` rather than with a test failure. That cost a confused minute here and
  is worth knowing before reading a red run as a defect.
- This receipt judges the TEXT and its pins. Whether the text makes an agent author a correct
  machine is AC-2's question, and it is answered there.
