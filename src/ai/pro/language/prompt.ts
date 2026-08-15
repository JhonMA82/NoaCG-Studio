// THE PHASE A PROMPT - what a model is asked for once the panel is not its job.
//
// It is SHORT on purpose, and shorter than every Pro prompt before it. The concept-and-rebuild
// prompt had to teach framing, safe areas, text size, panel geometry and erase-ability, and it
// still lost the composition in reconstruction (§16). The custom coder's prompt has to teach the
// whole engineering contract. This one teaches neither, because the platform now owns both -
// there is nothing left to say about geometry, and saying it anyway would invite the model back
// into the decision this phase removes.
//
// WRITTEN AS INSPECTION, NOT AS A LIST OF FAILURES (src/ai/AGENTS.md). Nothing below says "do
// not"; a prohibition suppresses the behaviour it constrains, and the one thing this prompt
// cannot afford is a timid answer - a design language that hedges produces the sameness Lite
// already has, and Pro has to be worth money.

import { DENSITIES, MOTION_CHARACTERS } from './contract';

export function designLanguageSystemPrompt(): string {
  return `You are a broadcast design director deciding a channel's ON-AIR LOOK.

A channel does not need one lower third. It needs a lower third, an info card, a ticker, a
scoreboard and a holding screen that visibly belong to each other. Your answer is the DESIGN
LANGUAGE all of them are built in - the palette, the typographic voice, the shape and accent
language, the density and the motion character.

You are not composing a graphic. The platform lays every graphic type out: it owns the
structure, the spacing, the safe areas, the placement of the mark and the size relationships
between the parts. It is very good at that and it is consistent across the whole package.
What it cannot decide is what the package should FEEL like, which is the whole of your answer.

Judge your language the way a viewer meets it: over real footage, at broadcast distance, on a
graphic that will carry a name typed by an operator on the day. Answer the brief's own world -
a public-service newsroom and a Saturday-night entertainment show are not the same design
problem with different colours, and a language that would suit both suits neither.

Two things are worth more than any single choice:
- the palette has to READ. The primary text on the surface you chose is the difference between
  a graphic and a rumour of one.
- the type sizes carry the hierarchy. A supporting line that is nearly the heading's size reads
  as a mistake; one that is a clear step down reads as a decision.

Density: ${DENSITIES.join(', ')}. Motion character: ${MOTION_CHARACTERS.join(', ')}.
Return your answer with the emit_design_language tool.`;
}

export interface LanguageBrief {
  /** The channel or show the package is for, in the user's own words. */
  brief: string;
  /**
   * The customer's brand, ALREADY RENDERED by whoever owns that vocabulary - the spike's
   * `brandBlock` on the bench, the product's own brand section later.
   *
   * A rendered string rather than a brand object, and the layering rule is only half the reason
   * (`pro/` may not import the bench-only `spike/`). The other half is that this repo has paid
   * for a second copy of a vocabulary before: one place renders a brand, everywhere else passes
   * what it rendered.
   */
  brandSection?: string;
}

export function designLanguageUserMessage(input: LanguageBrief): string {
  const brand = input.brandSection ? `\n\n${input.brandSection}` : '';
  return `Decide the on-air design language for this channel.

## The brief
${input.brief}${brand}

## What the platform will build in it
Every graphic the show needs, starting with its lower third: a primary line and a supporting
line, both live operator fields, over footage. The platform sizes and spaces them; your language
decides the colour, the typographic voice, the shape and accent language, the density and the
motion.`;
}
