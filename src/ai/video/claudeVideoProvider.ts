// The established video provider - the NoaCG motion-design harness over the selected model
// gateway route. Not one raw
// prompt-to-code call but staged: (a) skill detection loads only relevant craft guidance,
// (b) the Motion Director produces a structured timed plan, (c) the coder writes the
// composition against the ENGINE's contract + the plan + one canonical example (Remotion
// TSX or a HyperFrames document, per ctx.engine), (d) a bounded validate/repair loop
// feeds exact validator errors back. Mirrors claudeProvider's doctrine (forced tools,
// real example, errors-back repair) for the video world. Stages a and b are engine-
// independent - the same brief, plan, skills, assets, and settings feed both coders.

import { callModel, callModelDetailed, type ContentBlock } from '../modelGateway';
import { startAiRun, type AiRunRecorder } from '../telemetry';
import { findingsList, repairLoop } from '../shared/repairLoop';
import { parseDataUrl } from '../../assets/assetUtils';
import type { ReferencePurpose } from '../../model/imagePurpose';
import type { MotionPlan, VideoChatMessage, VideoEngine, VideoInput } from '../../model/videoTypes';
import { hyperframesInputs } from '../../video/hyperframes/parse';
import type {
  VideoAIProvider,
  VideoGenerateContext,
  VideoGenerateResult,
  VideoProgress,
  VideoValidator,
} from './provider';
import { BASE_SKILL, detectSkillsByKeyword, skillById, type VideoSkill } from './skills';
import { referenceSection, selectReferenceCards, type ReferenceCard } from './referenceCards';
import { noteReferenceUse } from '../referenceSelect';
import { EXAMPLE_COMPOSITION, MOTION_PRINCIPLES, REMOTION_CONTRACT } from './prompts';
import { EXAMPLE_HYPERFRAMES_COMPOSITION, HYPERFRAMES_CONTRACT } from './hyperframesPrompts';
import {
  DETECT_SKILLS_TOOL,
  HYPERFRAMES_MODULE_TOOL,
  MOTION_PLAN_TOOL,
  REMOTION_MODULE_TOOL,
  type EmittedHyperframesModule,
  type EmittedInput,
  type EmittedModule,
  type EmittedMotionPlan,
} from './tools';

/** Bounded automatic repair: the initial emit plus up to two errors-back rounds
 *  (src/ai/shared/repairLoop.ts MAX_REPAIR_ROUNDS - named here only for the progress line). */
const MAX_REPAIR_ROUNDS = 2;

// ── Context formatting ───────────────────────────────────────────────────────

function settingsText(ctx: VideoGenerateContext): string {
  const s = ctx.settings;
  const secs = (s.durationInFrames / s.fps).toFixed(2);
  return `Canvas: ${s.width}x${s.height} @ ${s.fps} fps. Duration: EXACTLY ${secs} s (${s.durationInFrames} frames). Background: ${
    s.transparent ? 'TRANSPARENT (alpha output - the root paints no background)' : 'opaque (design a deliberate background)'
  }.`;
}

function assetsText(ctx: VideoGenerateContext): string {
  const hf = ctx.engine === 'hyperframes';
  const lines = ctx.assets.map((a) => {
    const dims = a.width && a.height ? `, ${a.width}x${a.height}` : '';
    return `- ${hf ? `asset:${a.name}` : `assets['${a.name}']`} (${a.mime}${dims})`;
  });
  const assets = ctx.assets.length
    ? hf
      ? `Assets available as asset: URLs (use these EXACT names, nothing else):\n${lines.join('\n')}`
      : `Assets available via the assets prop (use these EXACT names, nothing else):\n${lines.join('\n')}`
    : 'Assets: none uploaded.';
  // The reference brief rides HERE rather than at each call site: the Motion Director, the
  // coder and the refinement all compose their prompt from this one function, and a picture
  // the director never saw explained would have shaped nothing.
  const brief = attachmentBrief(ctx);
  return brief ? `${assets}\n\n${brief}` : assets;
}

/**
 * The inputs the module ALREADY declares, for a refinement. Without this the model has to
 * re-infer the input set from the `fields.x ?? default` reads in the code, and a dropped or
 * renamed key costs the user whatever they typed into the Content panel (values survive a
 * refinement only key-by-key - model/videoTypes.ts mergeVideoInputs).
 */
function currentInputsText(inputs: VideoInput[], engine: VideoEngine): string {
  if (inputs.length === 0) return 'Editable inputs: none declared yet.';
  const lines = inputs.map(
    (i) => `- ${i.key} (${i.type}) "${i.label}", default ${JSON.stringify(i.default)}`,
  );
  const keep =
    engine === 'hyperframes'
      ? 'keep every data-composition-variables declaration and its data-var-text/data-var-src/var(--id) bindings in step'
      : "keep the code's `fields.<key> ?? default` fallbacks in step";
  return `Editable inputs the composition already declares - re-declare ALL of them with the SAME keys and types, and ${keep}. Only add, remove, or rename a key when the request actually changes what content is editable; a key that silently changes loses the value the user typed into it:\n${lines.join('\n')}`;
}

/**
 * Uploaded raster images as vision blocks so the model designs around what it sees.
 *
 * Composition assets first, then reference material, matching the order `attachmentBrief`
 * numbers them in - the text and the pictures have to agree on which is which.
 */
function imageBlocks(ctx: VideoGenerateContext, assetData: Map<string, string>): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const push = (mime: string, data: string | undefined): boolean => {
    if (!mime.startsWith('image/') || mime === 'image/svg+xml' || !data) return false;
    const parsed = parseDataUrl(data);
    if (!parsed) return false;
    blocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 } });
    return true;
  };
  for (const a of ctx.assets) {
    push(a.mime, assetData.get(a.name));
    if (blocks.length >= 3) return blocks; // enough visual context; keep the request light
  }
  for (const r of ctx.references ?? []) {
    push(parseDataUrl(r.data)?.mime ?? '', r.data);
    if (blocks.length >= 5) break; // references earn a little more room; they ARE the guidance
  }
  return blocks;
}

/** The short tag each reference carries (model/imagePurpose.ts's words). */
const REFERENCE_TAG: Record<ReferencePurpose, string> = {
  layout: 'MAKE ONE LIKE THIS',
  mood: 'TAKE THE LOOK AND FEEL',
  plate: 'MAKE IT WORK OVER THIS',
};

/**
 * What the attached pictures are FOR. Composition assets are named and drawable; references
 * are looked at and never reachable from the code - the same four purposes the SPX harness
 * reads, because a user who learned them in one wizard should not meet new words in the other.
 */
function attachmentBrief(ctx: VideoGenerateContext): string {
  const refs = ctx.references ?? [];
  if (!refs.length) return '';
  const lines = refs.map((r, i) => `  ${ctx.assets.length + i + 1}. ${REFERENCE_TAG[r.use]}`);
  const has = (use: ReferencePurpose) => refs.some((r) => r.use === use);
  const blocks = [
    `The last ${refs.length} attached picture(s) are REFERENCE MATERIAL, not assets. They are ` +
      `NOT in the assets prop, have no logical name, and can never be drawn - do not reference ` +
      `them in code. They are there to be read:\n${lines.join('\n')}`,
  ];
  if (has('layout')) {
    blocks.push(
      `MAKE ONE LIKE THIS - follow the composition: placement, reading order, hierarchy, ` +
        `density, proportion rhythm, shape language, how motion enters and leaves. Never ` +
        `reproduce the artwork, wordmark or photography itself. If one is a sketch or ` +
        `wireframe, read it as a DIAGRAM of what to build - its rough lines describe placement, ` +
        `and its hand-drawn look is not a style to imitate.`,
    );
  }
  if (has('mood')) {
    blocks.push(
      `TAKE THE LOOK AND FEEL - colour, mood, texture, weight and motion energy ONLY. Ignore ` +
        `their layout entirely; they may not even be graphics.`,
    );
  }
  if (has('plate')) {
    blocks.push(
      `MAKE IT WORK OVER THIS - the real background this will be shown over. Never drawn, ` +
        `never imitated: read where it is bright, busy or dark and make the piece hold up over ` +
        `it - contrast, panel opacity, separation, placement clear of faces. Assume the shot ` +
        `moves, so do not rely on a gap that is only empty in this frame.`,
    );
  }
  return blocks.join('\n\n');
}

// ── Stage a: skill detection ─────────────────────────────────────────────────

async function detectSkills(prompt: string, model?: string): Promise<VideoSkill[]> {
  const byKeyword = detectSkillsByKeyword(prompt);
  if (byKeyword.length > 0) return byKeyword;
  // Nothing matched - one cheap classification call picks up to 3 skills.
  try {
    const result = (await callModel({
      system:
        'Classify a motion-graphics request onto the most relevant skills. Pick at most 3; pick none when nothing clearly applies.',
      messages: [{ role: 'user', content: prompt }],
      tool: DETECT_SKILLS_TOOL,
      maxTokens: 300,
      ...(model ? { model } : { modelRole: 'fast' }),
    })) as { skills: string[] };
    return result.skills.map((id) => skillById(id)).filter((s): s is VideoSkill => !!s);
  } catch {
    return []; // classification is best-effort - the base skill alone is fine
  }
}

// ── Stage b: the Motion Director ─────────────────────────────────────────────

function directorSystem(
  skills: VideoSkill[],
  engine: VideoEngine,
  cards: ReferenceCard[],
): string {
  const medium =
    engine === 'hyperframes' ? 'HTML/CSS with a GSAP timeline (HyperFrames)' : 'React/Remotion';
  const references = referenceSection(cards);
  return `You are the Motion Director inside NoaCG Studio - a senior broadcast motion
designer planning a fixed-duration video composition. You produce a concise, structured,
TIMED plan another expert will implement in ${medium}. Plan phases that cover the
full duration exactly - from 0 to the total - with a clear entrance, a hero moment/hold,
and a decisive exit (unless the brief explicitly wants motion running through the cut).

${MOTION_PRINCIPLES}

${[BASE_SKILL, ...skills].map((s) => s.prompt).join('\n\n')}

${references ? `${references}\n\n` : ''}Make the plan CONCRETE and BUILDABLE, not generic:
- \`concept\` names the ONE memorable device this piece is built around and what makes it
  distinct from a default result. Commit to it; do not hedge across several ideas.
- Name the actual on-screen elements (the exact title/word, the shapes, the accent), where
  each sits, and how big it is relative to the frame. Every phase says what enters, moves,
  or exits and when - no vague "elements animate in".
- State how the frame is filled at the hero moment - what the viewer sees edge to edge.
  Reject any plan that would leave a small element floating in empty space.
- State the stacking order at the hero moment in \`layering\`: back-to-front, with the hero
  text/logo on top of every shape, and which layers exit first (text before its panels).
- If the brief expects an asset that isn't in the provided list (e.g. a logo with none
  uploaded), plan the designed substitute explicitly (a typographic wordmark), never a
  placeholder. Put that decision in assetUsage.
- Pick real, tasteful specifics: a font direction, an accent colour that isn't default blue
  or pure red, a deliberate background. The plan is the taste; the coder executes it.

Return the plan ONLY via the emit_motion_plan tool.`;
}

async function directMotion(
  prompt: string,
  ctx: VideoGenerateContext,
  skills: VideoSkill[],
  vision: ContentBlock[],
  model?: string,
): Promise<EmittedMotionPlan> {
  const text = `${settingsText(ctx)}\n${assetsText(ctx)}\n\nThe brief:\n${prompt}`;
  // Selected here rather than inside the prompt builder so the anti-dominance ledger is
  // written exactly once per generation, and directorSystem stays a pure function.
  const cards = selectReferenceCards(prompt);
  noteReferenceUse(cards.map((c) => c.id));
  const plan = (await callModel({
    system: directorSystem(skills, ctx.engine, cards),
    messages: [{ role: 'user', content: [...vision, { type: 'text', text }] }],
    tool: MOTION_PLAN_TOOL,
    maxTokens: 4000,
    model,
  })) as EmittedMotionPlan;
  // Defensive: schema-required or not, never let a malformed plan crash the pipeline.
  if (!Array.isArray(plan.phases)) plan.phases = [];
  return plan;
}

// ── Stage c: the coder (engine-specific contract + example, shared taste) ────

function coderSystem(skills: VideoSkill[], engine: VideoEngine): string {
  const skillsBlock = [BASE_SKILL, ...skills].map((s) => s.prompt).join('\n\n');
  if (engine === 'hyperframes') {
    return `You are the motion designer-engineer inside NoaCG Studio, writing a standalone
HyperFrames composition (one HTML document, all motion on one paused GSAP timeline) for a
fixed-duration video. You write COMPLETE, working, broadcast-quality code that a
professional can read and extend.

${HYPERFRAMES_CONTRACT}

${MOTION_PRINCIPLES}

${skillsBlock}

Skill notes may use React/Remotion idioms (springs, interpolate, random(seed), fontSize
from useVideoConfig) - translate them to this medium: GSAP eases (back.out, expo.out,
power3.out; spring-like feels come from back/elastic with restraint), timeline positions
in seconds, precomputed value arrays instead of per-frame functions, and px sizes computed
from the given canvas.

## The canonical example (a REAL composition from this tool - match its structure and quality)
=== composition.html ===
${EXAMPLE_HYPERFRAMES_COMPOSITION}
=== end example ===

The example shows the SHAPE of a good composition - variables declared on <html>, clips
with data-* timing, one paused timeline with every tween positioned in seconds, clean
comments - not a style to reproduce. Its visual motifs (angled slabs, the snapping title,
the breathing hold) belong to ITS brief; your document implements the PLAN's concept with
its own vocabulary.

Return the document ONLY via the emit_hyperframes_composition tool.`;
  }
  return `You are the motion designer-engineer inside NoaCG Studio, writing the single
React/Remotion composition module for a fixed-duration video. You write COMPLETE, working,
broadcast-quality code that a professional can read and extend.

${REMOTION_CONTRACT}

${MOTION_PRINCIPLES}

${skillsBlock}

## The canonical example (a REAL module from this tool - match its structure and quality)
=== Composition.tsx ===
${EXAMPLE_COMPOSITION}
=== end example ===

The example shows the SHAPE of a good module - timing constants up top, named phases,
everything frame-derived, clean comments - not a style to reproduce. Its visual motifs
(angled panels, light sweep, breathing hold, small-caps kicker) belong to ITS brief;
your module implements the PLAN's concept with its own vocabulary.

The example above is emitted with these inputs (note how each read has a matching fallback,
and how the image input's value is an asset name resolved against the assets prop):
inputs: [
  { "key": "title", "type": "text", "label": "Title", "default": "Prime Time" },
  { "key": "kicker", "type": "text", "label": "Kicker", "default": "Saturday · Live" },
  { "key": "logo", "type": "image", "label": "Logo", "default": "" },
  { "key": "accent", "type": "color", "label": "Accent colour", "default": "#f6a623" }
]

Return the module ONLY via the emit_remotion_module tool.`;
}

// ── Stage d: emit + validate + bounded repair ────────────────────────────────

/** The engine-neutral emit: whichever tool ran, the caller sees {summary, source, inputs?}. */
interface EmittedSource {
  summary: string;
  source: string;
  /** remotion only: the tool-declared inputs (hyperframes declares them IN the document). */
  inputs?: EmittedInput[];
}

function emitConfig(engine: VideoEngine) {
  if (engine === 'hyperframes') {
    return {
      tool: HYPERFRAMES_MODULE_TOOL,
      fileLabel: 'composition.html',
      repairNote:
        'check the composition root attributes, the timeline registration, and the determinism rules',
      toEmitted: (raw: unknown): EmittedSource => {
        const m = raw as EmittedHyperframesModule;
        return { summary: m.summary, source: m.html };
      },
    };
  }
  return {
    tool: REMOTION_MODULE_TOOL,
    fileLabel: 'Composition.tsx',
    repairNote:
      'note: TypeScript type errors surface as runtime errors - check prop shapes and undefined values at the reported frames',
    toEmitted: (raw: unknown): EmittedSource => {
      const m = raw as EmittedModule;
      return { summary: m.summary, source: m.tsx, inputs: m.inputs };
    },
  };
}

async function generateValidated(
  engine: VideoEngine,
  system: string,
  baseMessages: { role: 'user' | 'assistant'; content: ContentBlock[] | string }[],
  validate: VideoValidator | undefined,
  model: string | undefined,
  onProgress?: VideoProgress,
  run?: AiRunRecorder,
): Promise<{ emitted: EmittedSource; validation: Awaited<ReturnType<VideoValidator>> | null }> {
  const cfg = emitConfig(engine);
  // cacheSystem: the coder system prompt (contract + skills + the canonical example) is
  // large and IDENTICAL across the first call and every repair round - one cache breakpoint
  // turns those re-sends into cache reads. Cost only; the prompt itself is untouched.
  let t0 = Date.now();
  const first = await callModelDetailed({ system, messages: baseMessages, tool: cfg.tool, model, cacheSystem: true });
  run?.stage('coder', t0, first.model, first.usage);
  const firstEmitted = cfg.toEmitted(first.output);

  if (!validate) return { emitted: firstEmitted, validation: null };

  const { emitted, validation } = await repairLoop<EmittedSource, Awaited<ReturnType<VideoValidator>>>({
    emitted: firstEmitted,
    validate: async (current) => {
      onProgress?.('Checking the result in the player…');
      const v0 = Date.now();
      const verdict = await validate(current.source, current.inputs);
      run?.stage('validate', v0);
      return verdict;
    },
    reEmit: async (findings, current, round) => {
      onProgress?.(`Fixing issues the checks found (round ${round} of ${MAX_REPAIR_ROUNDS})…`);
      run?.repair();
      // Hand the EXACT validator findings back with the full source - same doctrine as the
      // SPX repair round. Runtime findings carry frame numbers.
      t0 = Date.now();
      const repair = await callModelDetailed({
        system,
        messages: [
          ...baseMessages,
          { role: 'assistant', content: 'I generated a composition but validation rejected it.' },
          {
            role: 'user',
            // The static checks QUOTE the offending source line (compile.ts / hyperframes
            // validate.ts). Saying so explicitly is load-bearing: a banned window.* access
            // once survived both repair rounds because the finding read as a general rule
            // rather than an instruction about one specific line of the model's own code.
            content: `Your composition failed validation. Fix ALL of these and re-emit the COMPLETE source (${cfg.repairNote}):\n${findingsList(findings)}\n\nWhere a finding quotes an offending line, that EXACT line must not survive your fix - delete or rewrite it, do not merely work around it. Re-read your own source for every other place the same mistake appears.\n\n=== ${cfg.fileLabel} ===\n${current.source}`,
          },
        ],
        tool: cfg.tool,
        model,
        cacheSystem: true,
      });
      run?.stage(`repair-${round}`, t0, repair.model, repair.usage);
      return cfg.toEmitted(repair.output);
    },
  });
  return { emitted, validation: noteUnprobed(demoteSoftFindings(validation)) };
}

/** A validation that never reached a mounted player measured NOTHING at runtime - no clipped
 *  or occluded text, no frame errors. Its empty error list means "not checked", and the
 *  repair loop above (which only fires on `!ok`) therefore never ran. Say so in the warnings
 *  the UI surfaces: an unverified composition must not be presented as a verified one. */
function noteUnprobed<T extends Awaited<ReturnType<VideoValidator>>>(validation: T): T {
  if (validation.probed) return validation;
  return {
    ...validation,
    warnings: [
      ...validation.warnings,
      {
        rule: 'not-probed',
        message:
          'The runtime checks did not run - no preview was mounted, so text the frame clips or ' +
          'another layer covers would not have been caught. Open the preview and regenerate to verify.',
      },
    ],
  };
}

/** Findings that must DRIVE a repair round but must not, alone, throw the work away after
 *  the rounds are spent - the SPX harness's doctrine for its editability findings. A clipped
 *  headline is a real defect and worth two rewrites; a false positive that survives them
 *  should ship with a warning, not silently discard a composition the user waited for. */
const SOFT_RULES = new Set(['text-clip', 'text-safe-area', 'text-occluded', 'text-contrast', 'text-overlap']);

/**
 * `text-clip-total` is missing from that set ON PURPOSE, and must stay missing: it is the
 * verdict that no part of the line is painted at any hold frame (src/video/readability.ts).
 * The demotion above exists to protect work from a finding that might be wrong; a total crop
 * cannot be wrong, so demoting it just ships text the viewer never sees. The guard below
 * already handles it - one non-soft error is enough to keep the whole result failed - so
 * nothing here needs to name it, only to leave it out.
 */

function demoteSoftFindings<T extends Awaited<ReturnType<VideoValidator>>>(validation: T): T {
  if (validation.ok || validation.errors.some((e) => !SOFT_RULES.has(e.rule))) return validation;
  return { ...validation, ok: true, errors: [], warnings: [...validation.warnings, ...validation.errors] };
}

// ── The provider ─────────────────────────────────────────────────────────────

function toMotionPlan(p: EmittedMotionPlan): MotionPlan {
  return { ...p, phases: p.phases.map((ph) => ({ ...ph })) };
}

/** Map the tool's declared inputs to project VideoInputs (value starts at the default). A
 *  missing/malformed array yields null - "the model said nothing about inputs", which the
 *  caller reads as "leave them alone". Never a pipeline failure: inputs are optional. */
function toInputs(emitted: EmittedInput[] | undefined): VideoInput[] | null {
  if (!Array.isArray(emitted)) return null;
  return emitted
    .filter((i) => i && typeof i.key === 'string' && i.key.length > 0)
    .map((i) => ({
      key: i.key,
      type: i.type,
      label: i.label || i.key,
      value: i.default,
      default: i.default,
      ...(i.options ? { options: i.options } : {}),
      ...(i.min != null ? { min: i.min } : {}),
      ...(i.max != null ? { max: i.max } : {}),
      ...(i.step != null ? { step: i.step } : {}),
    }));
}

function planText(plan: EmittedMotionPlan): string {
  const phases = plan.phases
    .map((p) => `  ${p.startSec.toFixed(2)}-${p.endSec.toFixed(2)}s ${p.name}: ${p.description}`)
    .join('\n');
  return `Concept: ${plan.concept}
Visual direction: ${plan.visualDirection}
Typography: ${plan.typography}
Background: ${plan.background}
Easing: ${plan.easingApproach}
Assets: ${plan.assetUsage}
Layering: ${plan.layering}
Phases:\n${phases}`;
}

class ClaudeVideoProvider implements VideoAIProvider {
  async generateVideo(
    prompt: string,
    ctx: VideoGenerateContext,
    validate?: VideoValidator,
    onProgress?: VideoProgress,
  ): Promise<VideoGenerateResult> {
    // The video harness records through the same local telemetry ring the SPX harness
    // uses (stages, tokens, repair rounds) - it recorded nothing before, which made its
    // cost and repair behaviour invisible to the compare tooling.
    const run = startAiRun('video-generate');
    try {
      const result = await this.generateRecorded(prompt, ctx, validate, onProgress, run);
      run.finish(result.validation?.ok ?? true, result.validation?.errors.map((e) => e.rule));
      return result;
    } catch (e) {
      run.finish(false, ['exception']);
      throw e;
    }
  }

  private async generateRecorded(
    prompt: string,
    ctx: VideoGenerateContext,
    validate: VideoValidator | undefined,
    onProgress: VideoProgress | undefined,
    run: AiRunRecorder,
  ): Promise<VideoGenerateResult> {
    const model = ctx.model;
    onProgress?.('Reading the brief…');
    let t0 = Date.now();
    const skills = await detectSkills(prompt, undefined);
    run.stage('skills', t0);
    const vision = imageBlocks(ctx, ctx.assetData ?? new Map());

    onProgress?.('Designing the motion plan…');
    t0 = Date.now();
    const plan = await directMotion(prompt, ctx, skills, vision, model);
    run.stage('motion-plan', t0);

    onProgress?.(ctx.engine === 'hyperframes' ? 'Writing the HyperFrames composition…' : 'Writing the Remotion code…');
    const coderText = `${settingsText(ctx)}\n${assetsText(ctx)}\n\nThe motion plan to implement:\n${planText(plan)}\n\nThe original brief:\n${prompt}`;
    const { emitted, validation } = await generateValidated(
      ctx.engine,
      coderSystem(skills, ctx.engine),
      [{ role: 'user', content: [...vision, { type: 'text', text: coderText }] }],
      validate,
      model,
      onProgress,
      run,
    );

    return {
      summary: emitted.summary,
      source: emitted.source,
      motionPlan: toMotionPlan(plan),
      // A fresh generation defines the input set outright - an empty set really does mean
      // "this piece has no editable content", and there is nothing to preserve anyway.
      // HyperFrames declares inputs IN the document (composition variables) - parse them;
      // Remotion declares them in the emit tool.
      inputs:
        ctx.engine === 'hyperframes'
          ? hyperframesInputs(emitted.source)
          : toInputs(emitted.inputs) ?? [],
      skills: [BASE_SKILL.id, ...skills.map((s) => s.id)],
      validation,
    };
  }

  async refineVideo(
    request: string,
    current: { source: string; chat: VideoChatMessage[]; inputs: VideoInput[] },
    ctx: VideoGenerateContext,
    validate?: VideoValidator,
    onProgress?: VideoProgress,
  ): Promise<VideoGenerateResult> {
    const run = startAiRun('video-refine');
    try {
      const result = await this.refineRecorded(request, current, ctx, validate, onProgress, run);
      run.finish(result.validation?.ok ?? true, result.validation?.errors.map((e) => e.rule));
      return result;
    } catch (e) {
      run.finish(false, ['exception']);
      throw e;
    }
  }

  private async refineRecorded(
    request: string,
    current: { source: string; chat: VideoChatMessage[]; inputs: VideoInput[] },
    ctx: VideoGenerateContext,
    validate: VideoValidator | undefined,
    onProgress: VideoProgress | undefined,
    run: AiRunRecorder,
  ): Promise<VideoGenerateResult> {
    const model = ctx.model;
    onProgress?.('Writing the change…');
    // Skills: the refinement request plus recent context (a "make the countdown pulse"
    // follow-up should load the countdown craft even if the request alone wouldn't).
    const recentText = current.chat.slice(-6).map((m) => m.text).join('\n');
    const skills = detectSkillsByKeyword(`${request}\n${recentText}`);
    const vision = imageBlocks(ctx, ctx.assetData ?? new Map());

    // Recent conversation as real turns (compressed), then the edit request + source.
    const history = current.chat.slice(-6).map((m) => ({
      role: m.role,
      content: m.text,
    }));
    const fileLabel = ctx.engine === 'hyperframes' ? 'composition.html' : 'Composition.tsx';
    const finalText = `${settingsText(ctx)}\n${assetsText(ctx)}\n${currentInputsText(current.inputs, ctx.engine)}\n\nModify the composition below. Change ONLY what the request needs - keep everything else as close to byte-identical as possible.\n\nRequest: ${request}\n\n=== ${fileLabel} ===\n${current.source}`;
    const { emitted, validation } = await generateValidated(
      ctx.engine,
      coderSystem(skills, ctx.engine),
      [...history, { role: 'user', content: [...vision, { type: 'text', text: finalText }] }],
      validate,
      model,
      onProgress,
      run,
    );

    // A refinement re-emits the COMPLETE source, so it re-declares its inputs, and merging
    // against the current set (in applyResult) preserves values the user already edited.
    // But an empty set here is far more likely a model that forgot to repeat the
    // declarations than a deliberate "this piece has no editable content" - and honouring
    // it would silently empty the user's Content panel and revert their text to the code
    // defaults. Treat it as "unchanged"; a refinement that really should drop an input
    // still emits the others, so the genuine removal case survives. (Applies to both
    // engines: HyperFrames inputs parse out of the document's variable declarations.)
    const inputs =
      ctx.engine === 'hyperframes' ? hyperframesInputs(emitted.source) : toInputs(emitted.inputs);

    return {
      summary: emitted.summary,
      source: emitted.source,
      motionPlan: null, // refinements keep the existing plan
      inputs: inputs && inputs.length > 0 ? inputs : null,
      skills: [BASE_SKILL.id, ...skills.map((s) => s.id)],
      validation,
    };
  }
}

export const claudeVideoProvider: VideoAIProvider = new ClaudeVideoProvider();
