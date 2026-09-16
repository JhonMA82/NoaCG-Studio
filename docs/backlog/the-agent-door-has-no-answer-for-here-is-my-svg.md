# The agent door has no answer for "here is my SVG"

**Filed:** 2026-09-16. **Source:** measurement in the agent-door audit (`docs/AGENT_DOOR_AUDIT.md`)

## Why
"Hand over a design you already have and get a template back" is one of the three things we say the
product does. The studio does it well: `src/assets/svgImport.ts` parses, sanitizes and inventories a
dropped SVG, `ImportDesignStep` accepts `image/*,.svg,.html,.htm,.zip`, and `MapSvgFieldsStep` binds
its text nodes to fields. None of that is reachable from the agent door.

The CLI has no import verb at all - the verb set is doctor, types, scaffold, validate, inspect,
screenshot, pack, docs, login, logout, whoami, save, caspar, mcp. Handing it a file gets:

```
$ noacg validate ./lower-third.svg
noacg: ./lower-third.svg: expected a package directory or a .zip file.   (exit 2)
```

That message is correct and the exit code is right. The problem is what happens next, and it is a
problem because of who is on the other side. The `noacg-graphic` skill never uses the word SVG - its
only mention of importing is zipping a finished package for the studio's Import door. So an agent
handed a customer's SVG has no instruction, and a capable model will do the obvious thing: quietly
re-draw the artwork as HTML from scratch. That is the one outcome the studio's import path exists to
prevent, and its module header says so in as many words - a layered SVG imported verbatim "is the
user's exact graphic", which is why it "never redraws, reflows or prettifies anything".

So the door's failure mode is not a refusal a user can see. It is a silently different product: an
approximation of their brand instead of their brand, produced confidently, with a clean validate at
the end of it.

## What it would take
The smallest fix is text, not code, and it should land first: teach the skill what to do when the
user supplies artwork. A short section in `cli/plugin/skills/noacg-graphic/SKILL.md` saying that the
CLI cannot import a design, that redrawing someone's SVG by hand is not the same graphic and is not
wanted, and that the honest move is to send the user to the studio's Import door (drag the file in,
map the text layers, and the result lands in the same library `save` writes to). An agent that says
"I can't take your SVG here, do this instead" is a far better answer than one that improvises.

The real fix, later and larger, is a verb: `noacg import <file.svg> --out <dir>` running the same
sanitize-and-inventory code the wizard uses, emitting a package with the detected text nodes already
bound to `id="fN"` fields, so the agent can go straight to `validate` and `save`. The module is
already separated from the React layer (`src/assets/svgImport.ts` + `svgGeometry.ts` are plain TS
and import nothing from `components/`), so the work is a CLI entry point plus the field-mapping
defaults the wizard currently collects from a human. Field mapping is the genuinely hard part and is
why this is not the small fix: the wizard asks a person which layers are editable, and a CLI has to
either guess from layer names (the `f:` / `field:` prefix convention already exists) or take them as
flags.

A raster PNG has no import road anywhere except the wizard's raster tier, and should stay that way
here; naming that limit in the skill is part of the same text fix.

## Evidence
Run on 2026-09-16 with `noacg` 0.3.3: `noacg import` -> `Unknown command "import"`; `noacg validate
<file>.svg` and `<file>.png` -> both `expected a package directory or a .zip file`, exit 2 (read
from the command's own exit code, not a pipeline's). `noacg --help` lists the full verb set above.
`grep -ci "svg" cli/plugin/skills/noacg-graphic/SKILL.md` returns **0** - the word does not appear in
the skill at all; its one sentence about importing (`SKILL.md:66`) is about zipping a finished
package for the Import door and never mentions artwork. Studio side: `src/assets/svgImport.ts:1-16`,
`src/components/wizard/import/ImportDesignStep.tsx:384`.
