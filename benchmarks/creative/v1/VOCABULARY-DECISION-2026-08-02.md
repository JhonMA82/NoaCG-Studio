# Decision brief: does CREATE get a design vocabulary?

**The question, in one sentence:** may the CREATE path compose its design from parameterized
NoaCG primitives - a panel with padding, an accent with a weight and an inset, a measure, a
legibility treatment - instead of writing every pixel of CSS from nothing?

This is plan §3.3's parked question, and §4's anti-anchoring rule is what makes it a decision
rather than a task. **Owner ruling required.** Everything else in the "make it actually good"
column is waiting behind it.

---

## 1. Why it is on the table now

The 2026-08-02 blind review: **11 of 16 pairs neither arm airable, staged arms 0 of 5 on the
pairs that were decisive**, reviewer self-consistent. Then six frames of per-item notes. The
faults, in the reviewer's own words:

| fault | frames | clampable? |
|---|---|---|
| **Proportion and spacing** - banner too large, name-to-title gap too wide, too much empty space, a rule that "reads as accidental" | 1, 3, 6 | **no - relationships, not out-of-range values** |
| Hierarchy by KIND - "all three lines use the same style even though they contain different types of information" | 4 | no |
| Legibility without a panel | 1 | yes - **done** |
| Decoration over the words it decorates | 6 | yes |
| Content on the frame edge | 4 | yes - **done** |
| Does not read as its category at all | 5 | no |

Everything in the "yes" column is now done or cheap. **Proportion is the most repeated complaint
in the review and there is no clamp that produces it** - a padding that is *correct* is not a
value brought into range, it is a relationship between panel, text, and the size of the type.

Two more things bound the question:

- **Clamping correctness is finished.** Four rounds of platform fixes (fields render, type at
  broadcast size, panel painted, palette legible) have produced correct, plain graphics. Every
  fault fixed was a correctness fault, and correctness was never what was missing.
- **References land but only reach the surface.** A mood board came back as the right ink on the
  right paper - the first taste input to reach the output at all - and the composition did not
  move. The reference tells the model WHAT look; it does not give it anything to build the look
  FROM.

And the finding that outranks them: a frame that passed every test this project has was judged
**"essentially just text in a chosen font… not something people would come to the service
specifically to generate."** The bar is not airworthy. It is worth coming for.

---

## 2. The §4 tension, stated fairly

**§4 says:** "the CREATE path never sees catalog design code… Catalog knowledge reaches CREATE
only as machine-readable constraints."

**The case that a vocabulary violates it.** `pack4/skin.ts` is catalog design code. Its emitters
were written to make catalog designs look the way they look. Handing them to CREATE is handing
over the catalog's taste, and §4 exists because the measured failure of the control arm is that
it *reproduces the catalog* - the reviewer's own words on the one card that worked: "looks
exactly the same as we have in the templates."

**The case that it does not.** §4's stated target is the catalog as a *compositional example* -
a design shown to be imitated. A parameterized emitter is not a composition: `panelCss` takes a
padding box and returns a padded surface. It carries no layout, no reading order, no content
arrangement. It is the same class of thing as the type ladder and the safe area, both of which
CREATE already uses without anyone calling it anchoring. §3.4 assigns "clamps, zones and safe
areas" to the platform explicitly.

**Where the line actually is, on this reading:** a primitive that answers *how thick, how much
air, how far in* is a constraint. A primitive that answers *what goes where* is a composition,
and stays forbidden.

**The honest risk either way.** The vocabulary might narrow the output. §3.3's named risk is
that a scaffold pre-deciding too much makes every result a reskin - and this pilot has already
observed the F3 version of that in arm A. Criterion 6's nearest-catalog distance is the existing
instrument for watching it, and it should be watched rather than argued about.

---

## 3. The options, with real costs

### A. Do nothing
CREATE keeps writing CSS from a blank stylesheet. **Cost: none. Expected outcome: more correct,
plain graphics.** The last four rounds are the evidence. Not recommended, but it is the honest
baseline the other options are measured against.

### B. Adopt the pack4 skins as selectable presets
`CreativeSpec` picks one of `clean | frost | volt | house` and the emitters do the rest.

**Cheap - a day.** And **I do not recommend it.** The emitters branch on `skin.id`: they are four
discrete looks, not free parameters. CREATE would gain four appearances and lose the argument
for existing - "reskin of one skeleton" with the skeleton count raised from one to four. It is
§3.3's named risk, arriving through the door we opened to avoid it.

### C. Extract a parameterized vocabulary *(recommended)*
Take the STRUCTURAL knowledge out of the four skins and let the spec set it continuously:

| primitive | what the spec would set | what stays the platform's |
|---|---|---|
| panel | present/absent, opacity, radius, padding box | contrast floor, safe area |
| accent | weight, inset, edge or underline or none | that it is pinned inside the panel |
| measure | how wide the text column runs | the frame's safe-area cap |
| legibility | halo/stroke when no panel | that one of the two exists |
| rhythm | line gap and label-to-value gap as ratios of type size | the type floor |

The model chooses *values*; the platform owns *what those values mean and where they stop*. No
skin id, no four looks, no catalog composition. Roughly **3-5 days**, most of it in extracting
the skins' branching into parameters without breaking the 36 pack4 designs that use them - the
factory gates and catalog baseline cover that, so the risk is bounded.

**Why proportion is the thing to parameterize first:** it is the most repeated fault, it is a
pure relationship, and the numbers already exist in DESIGN_LANGUAGE §8's family table.

---

## 4. Recommendation

**Take option C**, and rule that a parameterized primitive answering *how much* is a
machine-readable constraint under §4, while anything answering *what goes where* is not.

**Falsify it cheaply before committing the 3-5 days.** One paid round, lower thirds only, arm C
with a hand-written vocabulary against arm C without - roughly $0.10 and one review pass. If
frames with a parameterized panel, accent and rhythm are not visibly better, the hypothesis is
wrong and no amount of extraction will save it.

**Stated plainly: two confident predictions in this line of work were wrong** - loosening the
critique acceptance rule (no measured benefit, ROUND-2026-08-02.md) and declaring clamping
finished as a strategy (four of the six fault groups turned out clampable). The vocabulary
argument is better evidenced than either, being the reviewer's own list of faults, but it is
still a hypothesis and the cheap test above should run before the expensive work.

---

## 5. What the ruling needs to say

1. **Is a parameterized primitive a "machine-readable constraint" under §4?** Yes / no.
2. If yes: **option B or C** - four looks cheaply, or a parameterized vocabulary properly.
3. **Does the cheap falsification round run first?** Recommended yes.

A "no" on (1) is a coherent position and closes the question: CREATE then stays a blank-stylesheet
generator, and the product answer for quality becomes ADAPT plus the user's own reference. That
should be recorded as a decision rather than left as a gap, because it makes the pilot's
remaining §11 criteria unreachable and the plan should say so.
