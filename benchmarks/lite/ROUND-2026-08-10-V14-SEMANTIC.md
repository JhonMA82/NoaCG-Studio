# Lite semantic round 2026-08-10 - v14

One real-model arm tested the eight locked semantic briefs against
`google/gemini-2.5-flash-lite` through the production Lite endpoint and compiler. The gallery was
read manually before the machine results were accepted.

**Budget: US$0.08. Ceiling-accounted spend: US$0.0718.** Failed calls are charged here at the
ledger's conservative US$0.007 reservation even when provider usage never reached the response,
so this is the safe budget number rather than a lower estimate from successful rows.

## Result

**Six of eight briefs are visually usable after deterministic contract corrections.** Seven have
machine-usable endpoint decisions; history lecturer is the only final generation failure.

| Brief | Final chassis | Manual result | Attribution |
|---|---|---|---|
| history lecturer | `ls17` attempted | fail | model |
| fire / heat | `ls29` | usable | none |
| university | `lt02` | usable | none |
| public news | `lt30` | usable after correction | platform |
| documentary | `lt32` | usable | none |
| luxury | `lt25` | usable after correction | platform |
| technology | `lt49` | usable | none |
| esports | `lt41` | not usable in the paid frame; fixed unpaid | model + judge mechanism |

The six accepted frames are readable, correctly anchored, update cleanly with longer copy, and
settle their entrance and exit motion. Public news is appropriately editorial, documentary is
quiet and cinematic, and technology uses the glass chassis without losing legibility. The range
is still one lower-third family, so this round proves inference inside that category rather than
cross-category generation.

## Failures and ownership

### Structured output initially refused all eight - platform

The first pass returned a structured-output mismatch on every brief. A content-free schema-path
diagnostic isolated the rejection to
`$.spec.categoryInference.alternatives:minItems`: a confident inference legitimately had no
alternative, but the schema required one. Removing that minimum made the schema agree with the
already-supported decision contract. No prompt text changed.

### History lecturer - model

After the schema correction, both attempts selected the relevant four-slot `ls17` chassis but
returned supporting fields in roles that did not match its declared secondary and tertiary slots.
The final reason was `slot_role_mismatch:secondary,slot_role_mismatch:tertiary`. The fixture,
retrieved metadata, and chassis catalog all contain the requested name, qualification, lecturer
role, and university slots. This is a model semantic-ordering failure.

### Public news and luxury - platform, corrected

Both first renders painted black model-authored text over a dark transparent stage. The validator
had checked contrast against the model's light `panel` color even though `lt30` and `lt25` declare
`readingSurface: none` and do not paint that panel. The v14 prompt already says to omit a palette
when the user supplied no exact brand colors, so the deterministic boundary now drops unsolicited
model palettes. User-supplied palettes still take the existing contrast-clamp path. Corrected
rerenders are legible and visually usable.

### Esports - model and judge mechanism, corrected unpaid

The first decision merged the requested team and competition into two fields. The validator now
requires exactly the editable field count declared by `generationSpec`, and repair guidance says
to keep each value separate. The corrected endpoint decision contained three fields, but its
`lt41` hold and update showed only the primary line while the two supporting fields remained
invisible. `ruleCodes` and `warningCodes` were both empty.

The unpaid follow-up disproved the initial catalog attribution. The exact corrected-round
adjustment vector renders all three locked esports values in `lt41`. Replacing the two supporting
samples with U+200B zero-width characters recreates the paid frame exactly and passed the old
compiler: three declared fields, two reserved empty bands, no finding. JavaScript `trim()` does
not remove that format character, and the field-paint check deliberately drove fresh sentinels,
so it proved that the slots could paint rather than that the supplied samples did paint.

The semantic boundary now rejects every requested line without a real glyph and gives the repair
round an explicit edit. The compile path independently emits `lite-hold-empty-field-sample` if a
server-bypassing decision reaches it. The free browser benchmark pins both the valid three-line
`lt41` render and the corrupted decision's refusal. No additional paid call was made.

## Changes made from evidence

- The paid gallery runner can select the locked `semantic` fixture bank and forwards its
  `generationSpec`.
- The Lite profile permits the contract's existing maximum of four fields instead of rejecting
  valid three- and four-field requests at a stale two-field cap.
- A confident category inference may return an empty alternatives list.
- Requested editable fields must remain separate.
- Unrequested model palettes cannot override the catalog chassis.
- Structured-output diagnostics reveal only schema paths and rule names, never model content.

## Artifacts

Five source directories were copied and independently verified by file count and structured-file
name set under `C:/claude/noacg-lite-eval-archive/semantic-v14-*-2026-08-10/`. The corrected gallery
is `semantic-v14-corrected-2026-08-10/review.html`; the seven-brief gallery is
`semantic-v14-seven-2026-08-10/review.html`.
