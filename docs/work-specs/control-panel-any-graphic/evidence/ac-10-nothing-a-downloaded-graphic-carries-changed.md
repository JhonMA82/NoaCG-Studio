# AC-10 - nothing a downloaded graphic carries changed, and the generated panel is unchanged without a profile

**Verdict: pass.** The exported controller's SOURCE grew; what it RENDERS for a profile-less
production is identical, and the package carries no profile and no production path. Reviewed at
`dfac5b9cf230532565f57d6988517bb25cdbf94d` on 2026-09-16.

## How the comparison was made

One production, one graphic (`sb22` House Podiums, four scores beside a spotlight index), no
profile, exported as `html-overlay` through `buildShowZipFor` - twice, on the same machine and the
same dev server, with only the source tree swapped:

- **after the chain:** this revision;
- **before the chain:** `git checkout 1fc7ffc6 -- src/`, which is `main` at pull request 269, the
  commit before HA's 270 - then restored with `git checkout HEAD -- src/`.

Both zips were read in the page, every uuid replaced with `<uuid>` so two runs are comparable, and
each file digested with SHA-256.

## The bytes

| File | Before | After | Same? |
|---|---|---|---|
| `house_podiums/house_podiums.html` | 302 678 B, `2bdae25a…` | 302 678 B, `2bdae25a…` | identical |
| `house_podiums/payload.json` | 175 B, `14b868ec…` | 175 B, `14b868ec…` | identical |
| `payload.json` (production) | 192 B, `98b74d0f…` | 192 B, `98b74d0f…` | identical |
| `house_podiums/controlpanel.html` | 40 115 B, `baa5b085…` | 41 631 B, `aee1cb43…` | **+1 516 B** |
| `show_controlpanel.html` | 40 121 B, `a8b8cdfb…` | 41 637 B, `a1316589…` | **+1 516 B** |
| `controller.html` | 59 300 B, `e9e3cb47…` | 62 907 B, `657b8510…` | **+3 607 B** |

**The graphic itself is byte-identical**, which is the criterion's first clause: nothing a
downloaded graphic carries changed. The three operator pages grew.

## What grew, and whether it matters

The added lines are CSS for the pinned block, the "More" drawer and §6f's one line; the comments
that explain them; and one new read. The payload gained exactly two keys for a production with no
profile:

- `combined: false` at the top level - HG's one boolean, and nothing else about a combined control:
  not its name, not its steps, not its timings;
- `arranged` per graphic - here `{"pinned":[],"sections":[["Podiums",[…]],["Result",[…]]],"more":[]}`,
  which is the author's own grouping in the author's own order.

Searched for the things the criterion forbids: the payload contains no `profile` key and no
production path. The words "profile" and "combine" appear in the file only inside comments and CSS
class names.

## What it renders

Source bytes are not the panel. Both controllers were loaded into an iframe, the first cue clicked,
and the rendered text compared with the activity feed's clock normalised:

```
identical: true   947 characters both sides
```

Same header, same PREVIEW/PROGRAM blocks, same transport row, the same nine field rows with their
± steppers, the same `PODIUMS` (⚡ Spotlight podium, ⚡ All level) and `RESULT` (⚡ Final scores)
sections in the same order, no "More" drawer and no combined line. A profile-less package renders
the panel it always rendered.

## The specs

Through the queue at this revision: `e2e/exports.spec.ts` (job `j-1140`) 15 passed and one load
flake - a 60 s download timeout on the h2r target while four playwright jobs shared a 2 GB-free box
- which passed alone on re-run in 3.4 s (job `j-1143`). `e2e/control-panel-types.spec.ts`
(job `j-1141`): **8 passed**, exit 0, the catalog's control-panel specs unchanged.

## Limitations

- The comparison covers ONE export target (`html-overlay`) and one graphic. The other targets are
  covered by `exports.spec.ts` rather than by a before-and-after of their bytes.
- Reverting `src/` in place, rather than building a second checkout, means the two runs shared this
  branch's `node_modules` and its Vite. That cannot affect what `buildShowZipFor` emits, which is
  application code, but it is not a clean-room build and should not be read as one.
