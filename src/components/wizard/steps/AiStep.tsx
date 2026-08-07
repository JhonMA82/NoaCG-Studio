import { useEffect, useMemo, useRef, useState } from 'react';
import { getAiProvider } from '../../../ai';
import { brainstorm, type ChatMessage } from '../../../ai/brainstorm';
import { EXAMPLE_PROMPTS } from '../../../ai/examplePrompts';
import { aiConfigured, loadAiSettings, saveAiSettings, type AiTier } from '../../../ai/settings';
import type { AiPath, AiTemplateChange, GenerateContext, GenerateOptions, SpxValidator } from '../../../ai/provider';
import type { DesignSpec } from '../../../ai/designSpec';
import { clearStagedSelection, facetsOf, stageSelection } from '../../../ai/preferences';
import { AI_CATEGORIES, aiCategoryForTemplateCategory } from '../../../ai/spec/categories';
import { variantById } from '../../../templates/catalog';
import type { TemplateVariant } from '../../../model/wizard';
import { mergeSafety } from '../../../ai/safety';
import { assembleGroundedTemplate, productionSpxValidator } from '../../../ai/litePipeline';
import { benchStructuralIntent } from '../../../validation/structuralIntentCheck';
import { demoteSpecFields, withSpecChecks } from '../../../ai/spec/specValidate';
import {
  compileProConcept,
  generateProConcept,
  PRO_STANDARD_ROUTES,
  type ProResult,
  type ProStage,
} from '../../../ai/pro/pipeline';
import { stubCompilePro, stubProConcept } from '../../../ai/pro/stub';
import { PRO_SUPPORTED_CATEGORIES, standardProBrief } from '../../../ai/pro/brief';
import {
  emptyGenerationSpec,
  loadSpecDraft,
  saveSpecDraft,
  specIsEmpty,
  type AiCategoryId,
  type GenerationSpec,
} from '../../../model/generationSpec';
import { useAuthState } from '../../auth/useAuthState';
import SignInPrompt from '../../auth/SignInPrompt';
import AiProviderSettings from '../../AiProviderSettings';
import { useAiConsent } from '../../AiConsentDialog';
import { fileToDataUrl, uniqueAssetPath } from '../../../assets/assetUtils';
import { extractBrandColors, paletteFromAccent, type BrandColor } from '../../../assets/paletteExtract';
import {
  importTemplateFile,
  isTemplateFile,
  type AuthoredFormatDetection,
} from '../../../model/importTemplate';
import { loadLooks } from '../../../model/packets';
import {
  guessPurpose,
  isReferencePurpose,
  splitByPurpose,
  type PurposedImage,
} from '../../../model/imagePurpose';
import { UploadCard } from './ai/UploadCard';
import type { AssetFile, SpxTemplate } from '../../../model/types';
import {
  resolutionForSelection,
  type ProjectFormatSelection,
} from '../../../model/projectFormat';
import type { AiThread, AiThreadMessage } from '../../../model/aiThread';
import type { Palette } from '../../../model/wizard';
import { validateTemplate, type ValidationResult } from '../../../validation/validateTemplate';
import { readinessRows, unclaimedFindings } from '../../../validation/readiness';
import { formatDuration, formatTokens, hasTokenCounts, lastRun, runCost, runExpectation, type RunCost } from '../../../ai/runStats';
import MiniPreview from '../MiniPreview';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import MoreControlPanel from './ai/MoreControlPanel';
import { GenerationRating } from '../../feedback/GenerationRating';
import { LITE_AI_CATEGORIES } from '../../../ai/liteContract';
import { LiteUnsupportedError, loadLiteStatus, recordLiteOutcome } from '../../../ai/liteClient';
import type { LiteStatusResponse } from '../../../ai/liteTypes';

interface Props {
  format: ProjectFormatSelection;
  onFormat: (format: ProjectFormatSelection) => void;
  /** Brand colors to honor (when "Use current project's colors & typeface" is on and a brand exists). */
  brandPalette: Palette | null;
  /** The current AI result shown in the live preview (null until the first generation). */
  result: SpxTemplate | null;
  /** `spec` is the structured setup the result was generated under (null = prompt-only) —
   *  the wizard saves it with the created project. `path` is the pipeline provenance (the
   *  wizard's activation event distinguishes a Pro-tier create from a standard one). */
  onResult: (
    template: SpxTemplate | null,
    valid: boolean,
    spec?: GenerationSpec | null,
    generationId?: string,
    path?: AiPath | null,
  ) => void;
  /** The conversation as it stands (talk turns only), reported on every change so the created
   *  project can carry the reasoning that produced it (persisted as GraphicDoc.aiThread). Fires
   *  independently of onResult so talk added AFTER the last result, before Create, is caught. */
  onThread: (thread: AiThread | null) => void;
  /** Byte-faithful open of a dropped .html/.zip template — no AI, applies and closes. */
  onOpenImported: (template: SpxTemplate) => void;
  /** Continue into the catalog flow designing AROUND the dropped images (no AI needed). */
  onUseTemplates: (images: AssetFile[]) => void;
}

/** How each harness route is presented on the result card. */
function routeLabel(path: AiPath | null): string | null {
  switch (path) {
    case 'grounded':
      return '▤ Adapted from a proven catalog design — editable everywhere, exactly like wizard output.';
    case 'grounded+polish':
      return '▤ A proven catalog design, adapted, plus a bounded custom flourish.';
    case 'grounded+skin':
      return '▤ Deterministic canvas structure with an AI-designed look.';
    case 'custom':
      return '✦ Custom build — exercised end to end in the live playout bench.';
    case 'pro':
      return '✧ Image-model visual direction, rebuilt as ordinary editable layers.';
    default:
      return null;
  }
}

/** The same route, as one glyph for a picker card. */
const routeMark = (path: AiPath | undefined): string =>
  path === 'custom' ? '✦' : path === 'pro' ? '✧' : '▤';

/**
 * WHICH proven design this result was adapted from - the honest half of the promise
 * (docs/ADAPT_FIRST_PLAN.md §3, Stage U). A result that says only "built on the catalog"
 * cannot be checked; naming the design lets the user open that design in Browse and see for
 * themselves what changed. Null on a free-form or Pro result, which started from no design.
 */
/**
 * The paths whose template really IS `spec.variantId` assembled. 'stub' is the offline
 * provider's own grounded assembly, so it earns the same treatment. Deliberately NOT
 * 'grounded+skin': that path assembles the neutral canvas chassis (`ltc01`) while carrying the
 * house spec, so naming the spec's design would credit a design the user is not looking at.
 * 'custom', 'raw' and 'pro' started from no catalog design at all.
 */
const ADAPTED_PATHS: AiPath[] = ['grounded', 'grounded+polish', 'stub'];
const isAdapted = (change: AiTemplateChange | undefined): boolean =>
  Boolean(change?.path && ADAPTED_PATHS.includes(change.path));

function adaptedFrom(change: AiTemplateChange | undefined): string | null {
  if (!isAdapted(change)) return null;
  const variant = change?.spec?.variantId ? variantById(change.spec.variantId) : undefined;
  return variant ? `Adapted from “${variant.name}” — a ${variant.styleTag} ${variant.category.replace(/-/g, ' ')}.` : null;
}

/** The retrieved designs behind a result, resolved to real variants. A catalog id that no
 *  longer resolves is dropped rather than rendered as a dead card.
 *
 *  Gated on the ADAPTED paths, not merely on a shortlist being present: retrieval runs before
 *  the design stage decides, so a free-form alternative under auto->adapt legitimately carries
 *  the shortlist it was chosen against. Offering the swap there would replace the model's own
 *  code with a catalog assembly while the card still read "custom-generated code". */
function shortlistOf(change: AiTemplateChange | undefined): TemplateVariant[] {
  if (!isAdapted(change) || !change?.shortlist?.length || !change.spec) return [];
  return change.shortlist.map((id) => variantById(id)).filter((v): v is TemplateVariant => Boolean(v));
}

/** The Pro pipeline's stage names, in the busy line's voice (docs/NOACG_PRO_PLAN.md §7). */
const PRO_STAGE_LABELS: Record<ProStage, string> = {
  concept: 'Generating the visual concept…',
  interpret: 'Interpreting the design…',
  compile: 'Rebuilding it as editable layers…',
  validate: 'Validating and testing playout…',
};

/** The three execution tiers as the settings panel offers them. Descriptions deliberately
 *  name no vendor or model - those belong to each tier's own detail area. */
const TIER_OPTIONS: { id: AiTier; name: string; hint: string }[] = [
  { id: 'lite', name: 'NoaCG Lite', hint: 'Included free — one excellent editable graphic per request, nothing to configure.' },
  { id: 'pro', name: 'NoaCG Pro', hint: 'An image model draws the visual direction; NoaCG rebuilds it as editable code. Curated routes, priced per generation, on your own key.' },
  { id: 'custom', name: 'Custom provider', hint: 'Advanced — bring your own provider, key, and models.' },
];

/**
 * ONE transcript for the whole step: what the user said, what the AI said back, and every
 * set of directions it produced. `past` turns are earlier generations — they stay restorable,
 * so exploring a second idea never costs you the first one.
 */
type TalkTurn = { kind: 'you'; text: string; attached: number } | { kind: 'ai'; text: string };
type PastTurn = {
  kind: 'past';
  changes: AiTemplateChange[];
  originals: AiTemplateChange[];
  selected: number;
};
type Turn = TalkTurn | PastTurn;

/**
 * How many talk turns travel with a request. The whole conversation is the brief, but an
 * unbounded transcript would grow the design-stage prompt without bound — and the last
 * exchanges are where the decisions actually live.
 */
const CONVERSATION_TURNS = 10;

const LITE_EXAMPLE_PROMPTS = [
  { label: 'News lower third', prompt: 'A restrained public-news lower third for a reporter name and role. Dark editorial palette, clear hierarchy, calm entrance.' },
  { label: 'University speaker', prompt: 'A university lecture lower third for a speaker name and academic role. Modern, credible, calm, and accessible.' },
  { label: 'Esports player', prompt: 'An energetic esports lower third for a player nickname and team. Sharp hierarchy, fast controlled entrance, excellent legibility.' },
  { label: 'Documentary guest', prompt: 'A quiet cinematic lower third for a documentary interview subject and location. Integrated with the shot, restrained, and highly readable.' },
] as const;

/**
 * The design decisions behind one direction, in the user's words. The whole point of the
 * three alternatives is that they differ in REAL decisions (composition, density, weight,
 * shape) — a card that showed only a name would hide exactly what the choice is about.
 *
 * Returned as separate terms, not one joined string: a term must wrap as a WHOLE. Joined,
 * a narrow card broke "center-aligned" across two lines at its own hyphen.
 */
function designWords(alt: AiTemplateChange): string[] {
  const spec = alt.spec;
  if (!spec) return [];
  return [
    spec.density,
    spec.typography?.headingWeight,
    spec.alignment ? `${spec.alignment}-aligned` : null,
    spec.shape?.panel && spec.shape.panel !== 'none' ? `${spec.shape.panel} panel` : null,
  ].filter((w): w is string => Boolean(w));
}

/**
 * Step 1 (Create-with-AI mode) — the merged create/import step: describe what you need,
 * drop in a logo, brand stills, or an existing .html / SPX template to convert. Every AI
 * result runs the full harness (validation + the live runtime bench); the no-AI import
 * ("Open as code") stays one click away and never gates on sign-in.
 */
export default function AiStep({
  format,
  onFormat,
  brandPalette,
  result,
  onResult,
  onThread,
  onOpenImported,
  onUseTemplates,
}: Props) {
  const resolution = resolutionForSelection(format);
  const fps = format.fps;
  const { needsSignIn } = useAuthState();
  // undefined = still resolving; null = no Lite on this server (offline builds, errors).
  const [liteStatus, setLiteStatus] = useState<LiteStatusResponse | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadLiteStatus()
      .then((status) => {
        if (alive) setLiteStatus(status);
      })
      .catch(() => {
        if (alive) setLiteStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [needsSignIn]);
  const [settings, setSettings] = useState(loadAiSettings);
  // THE EXECUTION TIER. Lite and Pro are managed experiences of the SAME creation workflow;
  // 'custom' is the advanced BYO surface. The saved preference wins where it is honourable:
  // a saved 'lite' on a server that stopped offering it falls back to custom, and no saved
  // choice resolves to Lite when the server offers it (the historical default) else custom.
  const liteOffered = Boolean(liteStatus?.enabled);
  const tier: AiTier =
    settings.tier === 'lite'
      ? liteOffered ? 'lite' : 'custom'
      : settings.tier ?? (liteOffered ? 'lite' : 'custom');
  const liteMode = tier === 'lite';
  const proMode = tier === 'pro';
  const liteActive = liteMode && Boolean(liteStatus?.available);

  /* The one-line read-back beside the ⚙ button (re-design/handoff.md §3a): which tier is
     running and, on the tier where models are the user's own, what it will call. A managed
     tier deliberately names no model — that is the point of it. */
  const settingsSummary =
    tier === 'lite' ? 'NoaCG Lite · included'
    : tier === 'pro' ? 'NoaCG Pro · image-guided'
    : [settings.provider, settings.model].filter(Boolean).join(' · ');
  // Pro's standard routes ride the Vercel AI Gateway; without a credential there the flow runs
  // the deterministic offline stub (and says so), exactly like the custom tier's stub provider.
  const proRemote = settings.configuredProviders.includes('vercel');
  const aiReady = liteMode ? liteActive : proMode ? true : aiConfigured(settings);
  // Every action on this step runs against a remote route when it runs at all (aiReady
  // gates the buttons; the stub is unreachable here), so the disclosure gate applies to
  // generate, refine, and talk alike.
  const { ensureAiConsent, consentDialog } = useAiConsent();
  // Opens itself ONCE, after the tier is known: a custom-tier visitor with no provider
  // configured needs the setup in front of them, a Lite visitor does not.
  const [showSettings, setShowSettings] = useState(false);
  const settingsAutoOpened = useRef(false);

  useEffect(() => {
    if (liteStatus === undefined || settingsAutoOpened.current) return;
    settingsAutoOpened.current = true;
    if (!liteStatus?.enabled && loadAiSettings().tier !== 'pro' && !aiConfigured()) {
      setShowSettings(true);
    }
  }, [liteStatus]);
  const [prompt, setPrompt] = useState('');
  // ONE list of uploads, each carrying what it is FOR (model/imagePurpose.ts). The step used
  // to keep two: everything dropped here became a bundled asset, and the only way to say
  // "this is a reference" was a second uploader buried in the More-control accordion. Two
  // uploaders for one gesture is what made the whole thing feel narrow.
  const [uploads, setUploads] = useState<PurposedImage[]>([]);
  const { assets: images, references, fixedPaths } = useMemo(() => splitByPurpose(uploads), [uploads]);
  // The structured setup ("More control"): persisted as a cross-session draft so closing
  // the wizard never loses it; an empty spec injects nothing anywhere.
  const [spec, setSpec] = useState<GenerationSpec>(() => loadSpecDraft() ?? emptyGenerationSpec());
  const [moreOpen, setMoreOpen] = useState(() => !specIsEmpty(loadSpecDraft()));
  useEffect(() => saveSpecDraft(spec), [spec]);
  useEffect(() => {
    if (!liteMode) return;
    if (spec.category !== 'auto' && !LITE_AI_CATEGORIES.some((category) => category === spec.category)) {
      setSpec((current) => ({ ...current, category: 'auto', categoryInferred: false }));
    }
    // Lite takes no reference material at all, so a purpose it cannot honour is dropped
    // rather than silently ignored.
    setUploads((current) =>
      current.some((u) => isReferencePurpose(u.purpose))
        ? current.filter((u) => !isReferencePurpose(u.purpose))
        : current,
    );
  }, [liteMode, spec.category]);
  // The Pro tier's v1 pipeline compiles lower thirds only - a category it cannot carry
  // resets to 'auto' (the Lite pattern) rather than being silently reinterpreted.
  useEffect(() => {
    if (!proMode) return;
    if (spec.category !== 'auto' && !(PRO_SUPPORTED_CATEGORIES as readonly string[]).includes(spec.category)) {
      setSpec((current) => ({ ...current, category: 'auto', categoryInferred: false }));
    }
  }, [proMode, spec.category]);
  const activeSpec = specIsEmpty(spec) ? null : spec;
  const [imported, setImported] = useState<{
    fileName: string;
    template: SpxTemplate;
    detection: AuthoredFormatDetection;
    confirmed: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  // Harness provenance for the result card + the spec that produced a grounded result
  // (passed back on refine so "warmer colours" re-assembles instead of editing code).
  const [lastPath, setLastPath] = useState<AiPath | null>(null);
  const [lastSpec, setLastSpec] = useState<DesignSpec | null>(null);
  // The Pro concept + editability report behind each pro-path template, keyed by the
  // template OBJECT so an archived then restored result still shows its own concept.
  const proDetails = useRef(new WeakMap<SpxTemplate, ProResult>());
  // Harness mode: the generated directions (one, or the harness's three) + which one is
  // picked (the pick is staged as preference data and committed when the project is actually
  // created). The list SURVIVES a refinement — refining replaces only the picked entry, so
  // the other directions stay one click away instead of being lost to a wording change.
  const [alternatives, setAlternatives] = useState<AiTemplateChange[]>([]);
  // Each direction as it was FIRST generated: the restore point behind "↺ Undo refinements",
  // and the population a preference pick was actually chosen FROM.
  const [originals, setOriginals] = useState<AiTemplateChange[]>([]);
  const [selected, setSelected] = useState(0);
  // An example brief is armed before it replaces a brief the user already wrote (the
  // two-step pattern used for every other destructive click in the app).
  const [armedExample, setArmedExample] = useState<string | null>(null);
  // What the run that produced the current result actually cost. Read from telemetry after
  // each run rather than threaded back through the provider — the provider is UI-free.
  const [spent, setSpent] = useState<RunCost | null>(null);
  // BRAND. Colours read out of the uploaded artwork (deterministic, no model call) and the
  // looks already saved in this install — both PROPOSE, and land on `spec.brandColors`,
  // which is the existing lock the assembler already honours over anything the AI picks.
  const [extracted, setExtracted] = useState<BrandColor[]>([]);
  const looks = useMemo(() => loadLooks(), []);
  useEffect(() => {
    // The first upload of ANY purpose. Colour is the one thing every purpose can give: a
    // mood board exists to be read for its palette, and reading only the bundled assets meant
    // the picture chosen precisely for its colours was the one the brand strip ignored.
    const first = uploads[0]?.asset;
    if (!first || typeof first.data !== 'string') {
      setExtracted([]);
      return;
    }
    let alive = true;
    void extractBrandColors(first.data).then((colors) => {
      if (alive) setExtracted(colors);
    });
    return () => {
      alive = false;
    };
  }, [uploads]);
  const fileInput = useRef<HTMLInputElement>(null);
  // THE THREAD: talk and generations in one transcript. The brainstorm used to be a separate
  // panel producing a string the user copied into the prompt box — two chat-shaped surfaces
  // that could not see each other, neither of which the generator ever read.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [latestBrief, setLatestBrief] = useState<string | null>(null);

  /** What the model is told the conversation was: the talk turns, bounded, oldest first. */
  const conversation = (): ChatMessage[] =>
    turns
      .filter((t): t is TalkTurn => t.kind === 'you' || t.kind === 'ai')
      .slice(-CONVERSATION_TURNS)
      .map((t) => ({ role: t.kind === 'you' ? 'user' : 'assistant', text: t.text }));

  const say = (turn: Turn) => setTurns((prev) => [...prev, turn]);

  // Report the conversation up whenever it changes, so the created project carries it (persisted
  // as GraphicDoc.aiThread). Only the talk turns travel — the `past` generation snapshots are a
  // wizard-session affordance the editor cannot show, and would be heavy to persist (aiThread.ts).
  useEffect(() => {
    const messages: AiThreadMessage[] = turns
      .filter((t): t is TalkTurn => t.kind === 'you' || t.kind === 'ai')
      .map((t) => ({ role: t.kind === 'you' ? 'user' : 'assistant', text: t.text }));
    onThread(messages.length ? { version: 1, messages } : null);
  }, [turns, onThread]);

  /** Move the current result into the transcript before a new one takes its place. */
  const archiveCurrent = () => {
    if (!alternatives.length) return;
    const generationId = alternatives[selected]?.generationId;
    if (generationId) {
      void recordLiteOutcome({
        generationId,
        action: 'discarded',
        discardReason: 'regenerated',
      }).catch(() => undefined);
    }
    say({ kind: 'past', changes: alternatives, originals, selected });
  };

  const sendChat = async () => {
    const text = prompt.trim();
    if (!text || chatBusy || busy) return;
    // The talk turn goes to the model gateway, so it is disclosure-gated like a generation.
    if (!(await ensureAiConsent())) return;
    const history: ChatMessage[] = [...conversation(), { role: 'user', text }];
    say({ kind: 'you', text, attached: 0 });
    setPrompt('');
    setChatBusy(true);
    setError(null);
    try {
      const { reply, brief } = await brainstorm(history);
      say({ kind: 'ai', text: reply });
      if (brief) setLatestBrief(brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTurns((prev) => prev.slice(0, -1)); // the failed turn goes back into the box
      setPrompt(text);
    } finally {
      setChatBusy(false);
    }
  };

  const saveSetting = (patch: Parameters<typeof saveAiSettings>[0]) => {
    saveAiSettings(patch);
    setSettings(loadAiSettings());
  };

  // One drop zone, three inputs: images become generation assets, an .html/.zip becomes
  // an imported template (deterministic parse first — the AI only ever sees parsed code).
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const list = Array.from(files);
    const templateFile = list.find(isTemplateFile);
    if (templateFile) {
      try {
        const parsed = await importTemplateFile(templateFile);
        setImported({
          fileName: templateFile.name,
          template: parsed.template,
          detection: parsed.detection,
          confirmed: parsed.detection.certain,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    const next = [...uploads];
    const paths = () => next.map((u) => u.asset);
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue;
      if (liteMode && (liteStatus?.limits.logos ?? 0) < 1) {
        setError('The lower-third quality release does not accept image uploads yet.');
        return;
      }
      if (liteMode && next.length >= (liteStatus?.limits.logos ?? 0)) {
        setError('NoaCG Lite accepts only the configured number of compatible logo uploads.');
        break;
      }
      if (liteMode && file.size > (liteStatus?.limits.logoBytes ?? 2_000_000)) {
        setError('The NoaCG Lite logo limit is 2 MB.');
        continue;
      }
      const asset = { path: uniqueAssetPath(file.name, paths()), data: await fileToDataUrl(file) };
      // The guess is a PRESELECT, not a decision: it is shown on the card and one click
      // changes it. Lite has only one legal purpose, so nothing is guessed there.
      const purpose = liteMode ? 'asset' : await guessPurpose(asset);
      next.push({ asset, purpose, ...(purpose === 'asset' ? { binding: 'swappable' as const } : {}) });
    }
    if (next.length !== uploads.length) setUploads(next);
  };

  // The harness's injected validation pipeline (static rules + the live runtime bench,
  // wrapped in the safety screen) comes from litePipeline.productionSpxValidator — the ONE
  // composition, shared with the Lite benchmark runners. The safety screen sits INSIDE the
  // injected validator on purpose: the bench executes the result the moment it lands, so a
  // finding has to reach the provider's repair loop rather than a review step the code has
  // already run past. `imported` is the source for a convert, so a template that already
  // called fetch() before the AI touched it is not reported as something the AI introduced.
  // The structured setup adds its own checks on top (requested fields present, fonts used).
  // Every "use it as it is" upload is protected: the as-is screen rides inside the injected
  // validator so a tinted or cropped mark reaches the repair loop, not just the result card.
  const safeValidate: SpxValidator = productionSpxValidator(
    imported?.template ?? null,
    images.map((a) => a.path),
  );
  const validate: SpxValidator = withSpecChecks(safeValidate, activeSpec) ?? safeValidate;

  const showChange = (change: AiTemplateChange) => {
    // Screened here as well as inside the injected validator, because `generateRaw` (the harness
    // OFF path) validates itself and never runs ours — this is the one place every path passes
    // through on its way to the user.
    const v = mergeSafety(change.validation ?? validateTemplate(change.template), change.template, imported?.template);
    setSummary(change.summary);
    setValidation(v);
    setLastPath(change.path ?? null);
    setLastSpec(change.spec ?? null);
    onResult(change.template, v.ok, activeSpec, change.generationId, change.path ?? null);
    return v;
  };

  /**
   * The actuals for the run that just finished, read off the telemetry ring the provider
   * already writes. Called after a RUN, never from showChange — picking a different
   * alternative costs nothing, and attributing the run's tokens to that click would be a
   * quiet lie about what the user just spent.
   */
  const recordSpend = () => {
    const record = lastRun();
    setSpent(record ? runCost(record) : null);
  };

  /**
   * Stage the current pick for preference learning.
   *
   * The CHOSEN facets are the direction as it stands NOW — a refinement is part of what the
   * user settled on, and clearing the stage on every refine meant the most engaged users
   * (pick a direction, improve it, create it) trained the model with nothing at all. The
   * SHOWN population stays the ORIGINALS, because that is the choice they actually faced.
   * A single result is not a choice, so it stages nothing: counting it would score every
   * facet as picked 100% of the times it was shown.
   */
  const stagePick = (chosen: AiTemplateChange, shown: AiTemplateChange[]) => {
    if (shown.length < 2) {
      clearStagedSelection();
      return;
    }
    stageSelection(
      facetsOf(chosen.spec, chosen.path),
      shown.map((alt) => facetsOf(alt.spec, alt.path)),
    );
  };

  /** A whole-result run (convert / raw generate): one direction, replacing whatever stood. */
  const run = async (fn: (options: GenerateOptions) => Promise<AiTemplateChange>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const change = await fn({
        validate,
        // The structural-satisfaction check (docs/CREATIVE_MODE_PLAN.md §8): browser-only,
        // so it is injected like the bench; the provider runs it on CREATE-routed results.
        structuralCheck: benchStructuralIntent,
        onProgress: (stage) => setBusy(stage),
        ...(liteActive ? { profile: 'lite' as const } : {}),
      });
      setAlternatives([change]);
      setOriginals([change]);
      setSelected(0);
      clearStagedSelection();
      showChange(change);
      recordSpend();
    } catch (e) {
      setError(
        e instanceof LiteUnsupportedError && e.suggestedBrief
          ? `${e.message} Try: ${e.suggestedBrief}`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(null);
    }
  };

  /** Show direction `i` in the preview + stage the pick as preference data. */
  const selectAlternative = (i: number) => {
    setSelected(i);
    showChange(alternatives[i]);
    stagePick(alternatives[i], originals);
  };

  /**
   * Re-assemble the selected direction on a DIFFERENT design from the shortlist it was chosen
   * from — deterministically, with no model call and no cost. Everything the design stage
   * decided (lines, palette, typography, density, motion, shape) is in the spec and applies to
   * the new chassis exactly as it did to the old one; only the proven design underneath swaps.
   *
   * That is what makes the promise checkable rather than a slogan: the user sees the designs
   * the AI chose between and can overrule the choice without paying for another generation.
   *
   * No structural KIND check is needed here, unlike a generation: every design on the shortlist
   * satisfies the anchor the brief resolved to, by construction (src/ai/retrieval.ts), so a
   * swap inside it cannot produce the wrong kind of graphic.
   */
  const rebuildOnChassis = async (variantId: string) => {
    const current = alternatives[selected];
    if (!current?.spec || current.spec.variantId === variantId) return;
    setBusy('Rebuilding on that design…');
    try {
      const spec: DesignSpec = { ...current.spec, variantId };
      const { template } = assembleGroundedTemplate(spec, contextFor(), { keepChassisZone: true });
      const change: AiTemplateChange = {
        ...current,
        template,
        spec,
        // A plain grounded assembly is what this now IS. Spreading `current` would carry a
        // 'grounded+polish' path onto a template the polish pass never touched, so the card
        // would keep promising "plus a bounded custom flourish" for a flourish that is gone.
        path: 'grounded',
        validation: demoteSpecFields(await validate(template)),
      };
      setAlternatives(alternatives.map((alt, i) => (i === selected ? change : alt)));
      showChange(change);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Exact brand colours from the setup win over the project-brand toggle; the setup's
  // uploaded primary font rides as the wizard-style custom font.
  const specPalette: Palette | null = spec.brandColors
    ? { id: 'ai-user-brand', name: 'Brand colors', styleTags: ['noacg'], ...spec.brandColors }
    : null;
  /** `seed` = "three more like this": the direction whose spirit the new ones should keep. */
  const contextFor = (seed?: DesignSpec): GenerateContext => {
    // An existing imported template is the exception to new-project format selection.
    // Once its format is detected or explicitly confirmed, conversion and later refinement
    // stay pinned to that authored canvas instead of silently adopting the picker defaults.
    const authoredResolution = imported?.confirmed ? imported.template.resolution : resolution;
    const authoredFps = imported?.confirmed ? imported.template.fps : fps;
    return {
      images: liteActive ? images.slice(0, 1) : images,
      references: !liteActive && references.length ? references : undefined,
      ...(fixedPaths.length && !liteActive ? { fixedAssetPaths: fixedPaths } : {}),
      palette: specPalette ?? brandPalette,
      customFont: spec.fonts?.primary?.customFont,
      spec: activeSpec,
      conversation: turns.length ? conversation() : undefined,
      ...(seed ? { seed } : {}),
      resolution: authoredResolution,
      fps: authoredFps,
    };
  };

  /** The brief a Generate press acts on: what is typed, else what the talk arrived at. */
  const briefNow = (): string => prompt.trim() || latestBrief || '';

  /** Take a colour as the brand accent; the rest of the system follows the house neutrals. */
  const applyAccent = (hex: string) => setSpec({ ...spec, brandColors: paletteFromAccent(hex) });

  /** Apply a saved look: its exact palette, and its font when it carries one. */
  const applySavedLook = (id: string) => {
    const look = looks.find((l) => l.id === id);
    if (!look) return;
    const p = look.brand.palette;
    const font = look.brand.customFont
      ? { customFont: look.brand.customFont }
      : look.brand.fontId
        ? { fontId: look.brand.fontId }
        : null;
    setSpec({
      ...spec,
      brandColors: { accent: p.accent, text: p.text, textDim: p.textDim, panel: p.panel },
      ...(font ? { fonts: { ...spec.fonts, primary: { ...spec.fonts?.primary, ...font } } } : {}),
    });
  };

  const generate = async (seed?: DesignSpec) => {
    // Gate BEFORE any transcript or prompt-box state changes, so a decline leaves the
    // step exactly as it was - nothing archived, nothing cleared, nothing recorded.
    // The one path that reaches here WITHOUT a remote call is Pro's offline stub - a
    // deterministic local run needs no AI disclosure.
    const remoteRun = !proMode || proRemote;
    if (remoteRun && !(await ensureAiConsent())) return;
    const brief = briefNow();
    // ARCHIVE FIRST, then record the request. The transcript is chronological: the result
    // standing now happened BEFORE the thing that replaces it, and appending the new turn
    // first put the request above the result it superseded.
    archiveCurrent();
    // Say what was asked for even when the box was empty and the brief came out of the
    // talk — otherwise a generation leaves no trace of what it was asked to make.
    const asked = prompt.trim() || (seed ? 'More directions like the one I picked.' : brief);
    if (asked) say({ kind: 'you', text: asked, attached: uploads.length });
    setPrompt('');
    setArmedExample(null);
    const context = contextFor(seed);
    // Conversion always runs the validated conversion flow; plain generation branches on
    // the harness switch: OFF = the default one-shot (statically validated, no repair
    // loop), ON = three harness alternatives with the live bench injected.
    if (imported) {
      if (!imported.confirmed) {
        setError('Confirm the imported template project format before opening or converting it.');
        return;
      }
      if (liteActive) {
        setError('NoaCG Lite does not convert imported templates. Open it as code, or remove it and describe one new lower third.');
        return;
      }
      if (proMode) {
        setError('NoaCG Pro designs from a visual concept and does not convert imported templates. Open it as code, or switch the AI tier to Custom provider to convert it.');
        return;
      }
      void run(
        (options) => getAiProvider().convertImport(brief, imported.template, context, options),
        'Converting your template…',
      );
      return;
    }
    if (proMode) {
      // THE PRO TIER: the same brief, mapped deterministically onto the image-guided
      // pipeline (src/ai/pro/brief.ts) and run on the STANDARD routes - a normal Pro user
      // never picks models (PRO_STANDARD_ROUTES documents the choice). Offline (no gateway
      // credential) the deterministic stub runs the identical flow without tokens.
      // Spec-field findings demote to warnings: Pro is a fixed lower-third contract with no
      // repair loop, the grounded-assembly rule (src/ai/spec/specValidate.ts).
      const proValidate: SpxValidator = async (t) => demoteSpecFields(await validate(t));
      void run(async (options) => {
        const proBrief = standardProBrief(brief, activeSpec, uploads);
        options.onProgress?.(PRO_STAGE_LABELS.concept);
        const concept = proRemote
          ? await generateProConcept(proBrief, PRO_STANDARD_ROUTES.concept)
          : await stubProConcept(proBrief);
        const compileOptions = {
          resolution,
          fps,
          validate: proValidate,
          onStage: (stage: ProStage) => options.onProgress?.(PRO_STAGE_LABELS[stage]),
          interpretRoute: PRO_STANDARD_ROUTES.interpret,
          // The user's own mark goes INTO the slot the compile places - deterministically,
          // inside the pipeline, because nothing about which file belongs there is a model
          // decision (src/ai/pro/logoAsset.ts) AND the gate must see the filled template.
          // Without it an as-is upload asked the concept for a logo area, got a slot, and
          // left the file behind.
          logoMark: uploads.find((upload) => upload.purpose === 'asset') ?? null,
        };
        const compiled = proRemote
          ? await compileProConcept(proBrief, concept, compileOptions)
          : await stubCompilePro(proBrief, concept, compileOptions);
        proDetails.current.set(compiled.template, compiled);
        const change: AiTemplateChange = {
          template: compiled.template,
          summary: `Image-guided design: ${compiled.report.textFields} editable text field(s), ${compiled.report.panelsRebuilt} rebuilt shape(s).`,
          path: 'pro',
          ...(compiled.validation ? { validation: compiled.validation } : {}),
        };
        return change;
      }, PRO_STAGE_LABELS.concept);
      return;
    }
    if (liteActive) {
      void run(
        (options) => getAiProvider('lite').generate(brief, context, options),
        'Creating one NoaCG Lite graphic…',
      ).then(() => {
        void loadLiteStatus().then(setLiteStatus).catch(() => undefined);
      });
      return;
    }
    if (!settings.useHarness) {
      void run(
        (options) => getAiProvider().generateRaw(brief, context, { onProgress: options.onProgress }),
        'Generating…',
      );
      return;
    }
    void (async () => {
      setBusy(seed ? 'Designing three more in that spirit…' : 'Designing three directions…');
      setError(null);
      try {
        const list = await getAiProvider().generateAlternatives(brief, context, {
          validate,
          structuralCheck: benchStructuralIntent,
          onProgress: (stage) => setBusy(stage),
        });
        if (!list.length) return;
        setAlternatives(list);
        setOriginals(list);
        // Start on the first option that passes; the pick is the user's to change.
        const first = Math.max(0, list.findIndex((alt) => alt.validation?.ok ?? false));
        setSelected(first);
        showChange(list[first]);
        stagePick(list[first], list);
        recordSpend();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    })();
  };

  /** Bring an earlier generation back as the current result; the displaced one is kept. */
  const restore = (index: number) => {
    const turn = turns[index];
    if (turn?.kind !== 'past' || busy) return;
    archiveCurrent();
    setTurns((prev) => prev.filter((_, i) => i !== index));
    setAlternatives(turn.changes);
    setOriginals(turn.originals);
    setSelected(turn.selected);
    showChange(turn.changes[turn.selected]);
    stagePick(turn.changes[turn.selected], turn.originals);
  };

  /**
   * One refinement turn on the PICKED direction. It replaces that entry in place — the other
   * directions keep their own designs and stay pickable — and re-stages the pick, so
   * improving a direction before creating it still trains the preference data.
   *
   * `useSpec` chooses the level: a wording refinement of a still-house-shaped result refines
   * at SPEC level (it re-assembles deterministically, src/ai/CLAUDE.md), while a fix works on
   * the emitted CODE, because that is what the findings are about.
   */
  const applyRefinement = (instruction: string, useSpec: boolean, label: string) => {
    if (!result) return;
    void (async () => {
      if (!(await ensureAiConsent())) return;
      setBusy(label);
      setError(null);
      try {
        const change = await getAiProvider(liteActive ? 'lite' : undefined).modify(instruction, result, contextFor(), {
          validate,
          onProgress: (stage) => setBusy(stage),
          ...(liteActive ? { profile: 'lite' as const } : {}),
          ...(useSpec && lastSpec ? { spec: lastSpec } : {}),
        });
        setAlternatives(alternatives.map((alt, i) => (i === selected ? change : alt)));
        showChange(change);
        stagePick(change, originals);
        recordSpend();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    })();
  };

  const refineNow = () => {
    const p = prompt.trim();
    if (!p) return;
    say({ kind: 'you', text: p, attached: uploads.length });
    setPrompt('');
    setArmedExample(null);
    applyRefinement(p, true, 'Refining…');
  };

  /**
   * User-pressed repair on a failing result: the exact validator findings go back as the
   * instruction. This is NOT an automatic repair loop on grounded assemblies — one of those
   * failing its own bench is a platform bug worth surfacing (src/ai/CLAUDE.md) — it is a
   * button, so the user decides whether to spend a call rather than reading raw findings
   * they have no way to act on.
   */
  const fixNow = () => {
    if (!validation || validation.ok) return;
    const findings = validation.errors.map((e) => `- ${e.message}`).join('\n');
    applyRefinement(
      `The template fails these checks. Fix every one of them and change nothing else about ` +
        `the design:\n${findings}`,
      false,
      'Fixing the findings…',
    );
  };

  /** Undo every refinement of the picked direction, back to what the AI first proposed. */
  const revertNow = () => {
    const original = originals[selected];
    if (!original) return;
    setAlternatives(alternatives.map((alt, i) => (i === selected ? original : alt)));
    showChange(original);
    stagePick(original, originals);
  };

  const refined = Boolean(originals[selected]) && alternatives[selected] !== originals[selected];

  return (
    <div>
      <div className="panel-section">
        <h3>{liteMode ? 'NoaCG Lite' : proMode ? 'NoaCG Pro' : 'Create with AI'}</h3>
        <p className="hint">
          {liteMode
            ? 'Included for free users. This quality release concentrates on one excellent editable lower third, then validates and exercises it in the live playout bench. Other graphic types are explained instead of being forced into a poor design.'
            : proMode
              ? 'An image model draws the visual direction; NoaCG rebuilds it as an ordinary editable graphic — live text fields, reconstructed shapes, deterministic motion, every export target. This first release designs lower thirds.'
              : 'Describe what you need, and optionally add artwork or an existing template. Every result is validated and exercised in a live playout test before you can create it, and lands as clean, editable code.'}
        </p>
        {liteMode && liteStatus?.allowance && (
          <p className="hint" data-testid="lite-allowance">
            {liteStatus.allowance.dailySuccessesRemaining} successful generation(s) left today ·{' '}
            {liteStatus.allowance.monthlySuccessesRemaining} this month
          </p>
        )}
        {proMode && !proRemote && (
          <p className="hint" data-testid="pro-offline-note">
            No AI Gateway key is configured, so this runs the built-in offline concept — the
            full flow, without any model calls. Add a key under ⚙ AI settings.
          </p>
        )}
      </div>

      <ProjectFormatPicker
        value={format}
        onChange={onFormat}
        idPrefix="ai-format"
        description="This resolution and frame rate are fixed before the first generation. AI cannot override them."
      />

      {/* The drop zone (images + existing templates). Never gated: the no-AI import lives here. */}
      <div
        className={`wz-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.html,.htm,.zip"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
        />
        <strong>{liteMode ? 'Drop an existing template to open as code' : 'Drop pictures or an existing template here'}</strong>
        <span className="hint">
          {liteMode ? (
            <>Image input is paused while Lite concentrates on lower-third quality. Existing <code className="inline">.html</code> or <code className="inline">.zip</code> templates can still be opened unchanged.</>
          ) : (
            <>A logo to place, a design to follow, a mood board, or a shot of the real background —
              you say what each one is for after dropping it. An{' '}
              <code className="inline">.html</code> file or an SPX-style <code className="inline">.zip</code>{' '}
              can be opened as code unchanged, or converted to house standards with AI.</>
          )}
        </span>
      </div>

      {imported && (
        <div className="change-preview" style={{ marginTop: 10 }}>
          <strong>{imported.template.name}</strong>
          <span className="hint" style={{ marginLeft: 8 }}>{imported.fileName} — existing template</span>
          <p className="hint" style={{ marginTop: 6 }}>
            <b>Open as code</b> keeps it byte-for-byte (validate and re-export it as SPX /
            CasparCG / OGraf).
            {!liteMode && <> Or describe what to change and <b>Convert</b> brings it to the house standards with AI.</>}
          </p>
          <div data-testid="import-format-detection">
            {imported.detection.messages.map((message) => (
              <p className="hint" key={message} style={{ margin: '3px 0' }}>{message}</p>
            ))}
            {imported.confirmed ? (
              <p className="status-ok" style={{ margin: '6px 0' }}>
                Authored project format: {imported.template.resolution.width}×
                {imported.template.resolution.height} · {imported.template.fps} fps
              </p>
            ) : (
              <>
                <p className="status-bad" style={{ margin: '6px 0' }}>
                  The authored format is uncertain. NoaCG will not assume or rewrite it.
                </p>
                <button
                  data-testid="confirm-import-format"
                  onClick={() => {
                    const chosenResolution = resolutionForSelection(format);
                    setImported({
                      ...imported,
                      template: {
                        ...imported.template,
                        resolution: chosenResolution,
                        fps: format.fps,
                      },
                      confirmed: true,
                    });
                  }}
                >
                  Use selected project format ({resolution.width}×{resolution.height} · {fps} fps)
                </button>
              </>
            )}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="primary"
              disabled={!imported.confirmed}
              onClick={() => onOpenImported(imported.template)}
            >
              ‹› Open as code (no AI)
            </button>
            <button onClick={() => setImported(null)}>✕ Remove</button>
          </div>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="wz-uploads" data-testid="ai-uploads">
          {uploads.map((item) => (
            <UploadCard
              key={item.asset.path}
              item={item}
              // Lite has exactly one legal purpose, so offering four would be a lie.
              choosable={!liteMode}
              onChange={(patch) =>
                setUploads((current) =>
                  current.map((u) => (u.asset.path === item.asset.path ? { ...u, ...patch } : u)),
                )
              }
              onRemove={() =>
                setUploads((current) => current.filter((u) => u.asset.path !== item.asset.path))
              }
            />
          ))}
          {proMode && (
            <p className="hint" data-testid="pro-upload-note">
              Uploads do not steer the image concept yet — an as-is mark asks the design for a
              logo slot and is bundled into it, and colours read from your image can be applied
              as the exact brand accent below.
            </p>
          )}
          {images.length > 0 && (
            <button
              onClick={() => onUseTemplates(images)}
              title="Skip the AI: pick a catalog design with a logo slot and your first image pre-placed"
            >
              ▤ Design around these with a catalog template ›
            </button>
          )}
        </div>
      )}

      {needsSignIn ? (
        // Hosted mode, no account: AI is an account feature — but only the AI. The import
        // above (Open as code) and the catalog continuation stay fully open.
        <div style={{ marginTop: 12 }}>
          <SignInPrompt
            feature={liteMode ? 'NoaCG Lite' : proMode ? 'NoaCG Pro' : 'Create with AI'}
            reason={liteMode
              ? 'Sign in to use the included NoaCG Lite allowance for common editable graphics.'
              : 'Sign in to use AI and get a validated, editable template.'}
          />
        </div>
      ) : (
        <>
          {liteMode && !liteActive && (
            <p className="status-bad" style={{ marginTop: 10 }}>
              NoaCG Lite is temporarily unavailable. Existing templates and the normal editor still work.
            </p>
          )}
          {/* THE THREAD: talk turns and earlier generations, oldest first. */}
          {turns.length > 0 && (
            <div className="ai-thread" data-testid="ai-thread">
              {turns.map((turn, i) =>
                turn.kind === 'past' ? (
                  <div key={i} className="ai-past" data-testid="ai-past">
                    <div className="ai-past-shots">
                      {turn.changes.map((alt, k) => (
                        <span
                          key={k}
                          className={`ai-past-shot ${k === turn.selected ? 'picked' : ''}`}
                          title={alt.template.name}
                        >
                          <MiniPreview template={alt.template} />
                        </span>
                      ))}
                    </div>
                    <div className="ai-past-foot">
                      <span className="hint">
                        {turn.changes.length > 1
                          ? `${turn.changes.length} directions — you had "${turn.changes[turn.selected].template.name}" picked`
                          : turn.changes[turn.selected].template.name}
                      </span>
                      <button onClick={() => restore(i)} disabled={!!busy}>
                        ↩ Bring back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={i} className={`ai-msg ${turn.kind === 'you' ? 'user' : 'assistant'}`}>
                    <span>
                      {turn.text}
                      {turn.kind === 'you' && turn.attached > 0 && (
                        <em className="ai-attached"> — with {turn.attached} image(s)</em>
                      )}
                    </span>
                  </div>
                ),
              )}
              {chatBusy && <p className="hint">⏳ Thinking…</p>}
              {/* What a Generate press would act on, while that is still the next move. Once
                  a result exists the brief has been consumed and the request is a turn in
                  the thread above — repeating it here would just be a second copy. */}
              {latestBrief && !chatBusy && !busy && !result && (
                <div className="ai-brief">
                  <span className="hint">Brief so far: {latestBrief}</span>
                  <button onClick={() => setPrompt(latestBrief)}>Edit it</button>
                </div>
              )}
            </div>
          )}

          {/* Example briefs: show the range (most have no starting template) + teach the shape.
              They belong to the empty state — once there is a thread they are noise. */}
          {turns.length === 0 && (
          <div className="row wrap" style={{ marginTop: 12, marginBottom: 6, gap: 6 }}>
            {/* Pro shares Lite's example briefs: both are lower-third-first releases. */}
            {((liteMode || proMode) ? LITE_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS).map((ex) => {
              // A brief the user wrote themselves is real work; replacing it takes two clicks.
              const examples = (liteMode || proMode) ? LITE_EXAMPLE_PROMPTS : EXAMPLE_PROMPTS;
              const dirty = Boolean(prompt.trim()) && !examples.some((e) => e.prompt === prompt);
              const armed = armedExample === ex.label;
              return (
                <button
                  key={ex.label}
                  className={`wz-example ${armed ? 'armed' : ''}`}
                  title={ex.prompt}
                  onClick={() => {
                    if (dirty && !armed) {
                      setArmedExample(ex.label);
                      return;
                    }
                    setPrompt(ex.prompt);
                    setArmedExample(null);
                  }}
                  disabled={!!busy}
                >
                  {armed ? 'Replace your brief?' : ex.label}
                </button>
              );
            })}
          </div>
          )}

          {/* ONE composer for the whole step. What it does depends on where you are: with no
              result it describes the graphic, with one it refines it — and either way the
              same box can be talked into instead of generated from. */}
          <textarea
            rows={result ? 3 : 4}
            placeholder={
              result && !proMode
                ? 'Refine it — e.g. "bigger name, move it bottom-left, calmer entrance"'
                : imported
                  ? 'e.g. "Keep the layout but bring it to our look: darker panel, our amber accent, calmer entrance."'
                  : liteMode
                    ? 'e.g. "A calm university lower third for speaker name and academic role. Editorial, spacious, accessible, with a restrained entrance."'
                    : proMode
                      ? 'e.g. "Public-broadcast election night: calm, authoritative, deep blue with a thin gold rule."'
                      : 'e.g. "An election results lower third for channel A7: candidate name, party, and a\nvote percentage that counts up. Dark, serious, uses our logo as a small badge on the left."'
            }
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setArmedExample(null); // typing is the clearest "no, keep mine"
            }}
            disabled={!!busy}
          />

          {turns.length === 0 && !liteMode && (
            <p className="hint" style={{ marginTop: 6 }}>
              Not sure yet? Describe the show or the moment ("halftime of a local derby, we need
              something for substitutions") and press <b>Talk it through</b> — the conversation
              travels with the brief when you generate.
            </p>
          )}

          {/* BRAND: colours read out of the uploaded artwork, and the looks already saved.
              Both only PROPOSE — the machine cannot tell whether the red in a crest is the
              identity or the shirt behind it, so the pick stays the user's. */}
          {(extracted.length > 0 || looks.length > 0) && (
            <div className="ai-brand" data-testid="ai-brand">
              {extracted.length > 0 && (
                <div className="ai-brand-row">
                  <span className="hint">Colours in your image:</span>
                  {extracted.map((c) => (
                    <button
                      key={c.hex}
                      className={`ai-swatch ${spec.brandColors?.accent === c.hex ? 'picked' : ''}`}
                      style={{ background: c.hex }}
                      data-swatch={c.hex}
                      aria-label={`Use ${c.hex} as the brand accent`}
                      title={`${c.hex} — ${Math.round(c.share * 100)}% of the image`}
                      onClick={() => applyAccent(c.hex)}
                      disabled={!!busy}
                    />
                  ))}
                </div>
              )}
              {looks.length > 0 && (
                <div className="ai-brand-row">
                  <span className="hint">Or a saved look:</span>
                  <select
                    aria-label="Saved brand look"
                    value=""
                    onChange={(e) => applySavedLook(e.target.value)}
                    disabled={!!busy}
                  >
                    <option value="">Pick a look…</option>
                    {looks.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {spec.brandColors && (
                <div className="ai-brand-row">
                  <span className="hint">
                    Brand accent <code className="inline">{spec.brandColors.accent}</code> — the AI
                    must use it exactly.
                  </span>
                  <button onClick={() => setSpec({ ...spec, brandColors: null })} disabled={!!busy}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {brandPalette && !spec.brandColors && (
            <p className="hint" style={{ marginTop: 6 }}>
              Using this project's brand colors (accent {brandPalette.accent}) — toggle "Match current
              project" below to let the AI pick its own.
            </p>
          )}

          <div className="row wrap" style={{ marginTop: 10, alignItems: 'center' }}>
            {/* With a result standing, the typed text is a REFINEMENT of it — that is the
                primary move, and starting over is the deliberate one beside it. */}
            {result && !imported && !proMode ? (
              <button
                className="primary"
                disabled={!!busy || !aiReady || !prompt.trim()}
                onClick={refineNow}
              >
                Refine
              </button>
            ) : (
              <button
                className="primary"
                disabled={
                  !!busy
                  || !aiReady
                  || (!briefNow() && !imported)
                  || ((liteMode || proMode) && Boolean(imported))
                  || (Boolean(imported) && !imported?.confirmed)
                }
                onClick={() => void generate()}
              >
                {imported && !liteMode && !proMode
                  ? '⚡ Convert with AI'
                  : liteMode
                    ? '✦ Create one Lite graphic'
                    : proMode
                      ? result ? '✧ Generate a new design' : '✧ Generate'
                      : '✦ Generate'}
              </button>
            )}
            {!liteMode && (
              <button
                disabled={chatBusy || !!busy || !prompt.trim() || !aiConfigured(settings)}
                onClick={() => void sendChat()}
                data-testid="ai-talk"
                title="Think it through with the AI first - the conversation travels with the brief when you generate."
              >
                🗨 Talk it through
              </button>
            )}
            {!liteMode && (
              <button
                disabled={!!busy}
                onClick={() => fileInput.current?.click()}
                data-testid="ai-attach"
                title="Attach an image to this turn — it is bundled with the result, not just described."
              >
                📎 Attach
              </button>
            )}
            {result && !imported && !proMode && (
              <button disabled={!!busy || !aiReady || !briefNow()} onClick={() => void generate()}>
                ↻ Start over
              </button>
            )}
            {tier === 'custom' && result && !imported && alternatives[selected]?.spec && settings.useHarness && (
              <button
                disabled={!!busy || !aiConfigured(settings)}
                data-testid="ai-more-like"
                onClick={() => void generate(alternatives[selected].spec)}
                title="Three new directions in the spirit of the one you picked."
              >
                ✦ 3 more like this
              </button>
            )}
            {tier === 'custom' && !imported && (
              <label
                className="wz-match"
                title="On: three design directions built on the catalog design system, each exercised in a live playout test, learning from your picks. Off: one quick draft — the model's own take, checked but never played."
              >
                <input
                  type="checkbox"
                  checked={settings.useHarness}
                  onChange={(e) => saveSetting({ useHarness: e.target.checked })}
                  disabled={!!busy}
                />
                Design 3 options and test them live
              </label>
            )}
            {!imported && (
              <button
                onClick={() => setMoreOpen((o) => !o)}
                data-testid="more-control-toggle"
                title="Optional structured setup: category, data fields, references, fonts, animation — better, more predictable results, especially on smaller models."
              >
                {moreOpen ? '▾' : '▸'} More control{activeSpec ? ' ●' : ''}
              </button>
            )}
            {/* Always offered: the settings panel is where the execution TIER is chosen,
                so a Lite or Pro user has to be able to reach it too. The button carries a
                one-line read-back of what is configured (handoff §3a), so the common case
                needs no click at all. */}
            <div className="ai-settings-host">
              <button onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
                ⚙ AI settings
              </button>
              {/* What it currently resolves to, so the common case needs no click at all. */}
              <span className="ai-settings-summary">{settingsSummary}</span>
            </div>
          </div>

          {/* What a run like this has cost lately. Shown only once this browser has done
              enough of them to have an answer — a first-time user gets no number rather
              than an invented one. Tokens and seconds, never money: prices are not in this
              codebase and a stale figure presented as cost would be believed. */}
          {tier === 'custom' && (() => {
            const expected = runExpectation(imported ? 'convert' : 'generate', settings.useHarness);
            if (!expected || busy) return null;
            return (
              <p className="hint" style={{ marginTop: 6 }} data-testid="ai-expectation">
                Typically ~{formatDuration(expected.ms)}
                {hasTokenCounts(expected) && (
                  <> and ~{formatTokens(expected.inputTokens)} in / {formatTokens(expected.outputTokens)} out</>
                )}
                {settings.useHarness ? ' for all three options' : ''} — median of your last{' '}
                {expected.runs} runs.
              </p>
            );
          })()}

          {moreOpen && !imported && (
            <MoreControlPanel
              spec={spec}
              onSpec={setSpec}
              // Reference images are uploaded ONCE, in the drop zone above, where every other
              // picture arrives. This panel only reports what is attached.
              uploads={uploads}
              disabled={!!busy}
              allowUploads={!liteMode}
              // Pro v1 compiles lower thirds carrying name + title + an optional logo
              // slot, so the category list and the field budget say so up front.
              allowedCategories={liteMode ? LITE_AI_CATEGORIES : proMode ? PRO_SUPPORTED_CATEGORIES : undefined}
              maxFields={liteMode ? liteStatus?.limits.fields ?? 8 : proMode ? 3 : undefined}
            />
          )}

          {showSettings && (
            <div
              className="panel-section ai-settings-sheet"
              data-testid="ai-settings"
            >
              <div className="wz-header ai-settings-head">
                <h2>AI settings</h2>
                <button className="gallery-close" onClick={() => setShowSettings(false)} title="Close">✕</button>
              </div>
              {/* THE EXECUTION TIER. Lite and Pro are managed experiences of this same
                  creation workflow — no model picking; Custom is the deliberate advanced
                  route where provider, key, and models are the user's own. */}
              <div className="ai-tier" role="radiogroup" aria-label="AI tier" data-testid="ai-tier">
                {TIER_OPTIONS.map((option) => {
                  const unavailable = option.id === 'lite' && !liteOffered;
                  return (
                    <label
                      key={option.id}
                      className={`ai-tier-option ${tier === option.id ? 'selected' : ''}`}
                      data-testid={`ai-tier-${option.id}`}
                    >
                      <input
                        type="radio"
                        name="ai-tier"
                        checked={tier === option.id}
                        disabled={!!busy || unavailable}
                        onChange={() => saveSetting({ tier: option.id })}
                      />
                      <span className="ai-tier-body">
                        <strong>{option.name}</strong>
                        <span className="hint">
                          {unavailable ? 'Not offered by this server.' : option.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {proMode && (
                <div style={{ marginTop: 10 }} data-testid="ai-pro-settings">
                  <p className="hint">
                    NoaCG Pro picks its own models for every stage — there is nothing to
                    configure. The standard route draws one visual concept and one design
                    interpretation per generation; the concept's real cost is shown on the
                    result. Until a hosted Pro plan exists it runs on your own AI Gateway key.
                  </p>
                  <AiProviderSettings
                    settings={settings}
                    onChange={saveSetting}
                    fixedProvider="vercel"
                    showModel={false}
                  />
                </div>
              )}
              {tier === 'custom' && (
                <div style={{ marginTop: 10 }}>
                  <AiProviderSettings settings={settings} onChange={saveSetting} />
                </div>
              )}
            </div>
          )}


          {busy && <p className="hint" style={{ marginTop: 10 }}>⏳ {busy}</p>}
          {error && <p className="status-bad" style={{ marginTop: 10 }}>✗ {error}</p>}

          {alternatives.length > 1 && !busy && (
            // The three directions as they actually LOOK. They differ in real decisions —
            // chassis, composition, typography, density, motion — and a list of names showed
            // none of it, so the choice was made blind on the one thing that matters.
            <div className="wz-alt-grid" data-testid="ai-alternatives">
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  className={`wz-variant wz-alt ${i === selected ? 'selected' : ''}`}
                  data-alt={i + 1}
                  aria-pressed={i === selected}
                  title={alt.summary ?? alt.template.name}
                  onClick={() => selectAlternative(i)}
                >
                  <MiniPreview template={alt.template} />
                  <div className="wz-variant-cap">
                    <span className="wz-alt-name">
                      <span className="wz-alt-route mono" aria-hidden="true">{routeMark(alt.path)}</span>
                      {/* The name needs its own box to ellipsize: a bare text node inside a
                          flex container is an anonymous item, which text-overflow cannot
                          reach — so a long name was cut mid-letter with no "…". */}
                      <span className="wz-alt-title">{alt.template.name}</span>
                    </span>
                    {/* Deliberately NOT .status-ok/.status-bad: those name the verdict on the
                        CURRENT result, and a step showing three cards plus a verdict must not
                        have four elements answering to the same words. */}
                    <span
                      className={`wz-alt-mark ${alt.validation?.ok ? 'ok' : 'bad'}`}
                      title={alt.validation?.ok ? 'Passes every check' : 'Some checks are failing'}
                    >
                      {alt.validation?.ok ? '✓' : '✗'}
                    </span>
                  </div>
                  {designWords(alt).length > 0 && (
                    <span className="wz-alt-words">
                      {designWords(alt).map((word) => (
                        <span key={word} className="wz-alt-word">{word}</span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {result && !busy && (
            <div className="change-preview" style={{ marginTop: 10 }}>
              <strong>{result.name}</strong>
              {summary && <p style={{ marginTop: 6 }}>{summary}</p>}
              {adaptedFrom(alternatives[selected]) && (
                <p className="hint" style={{ marginTop: 4 }} data-testid="ai-adapted-from">
                  {adaptedFrom(alternatives[selected])}
                </p>
              )}
              {/* The proven designs this result was chosen FROM (src/ai/retrieval.ts). Shown
                  because "adapted from a proven design" is a claim, and a claim whose
                  alternatives the user can see — and swap onto — is checkable. The swap is
                  deterministic: no model call, no cost, everything the brief decided carried
                  over onto the other design. */}
              {shortlistOf(alternatives[selected]).length > 1 && !busy && (
                <div className="wz-shortlist" data-testid="ai-shortlist">
                  <p className="hint" style={{ marginTop: 8 }}>
                    Chosen from {shortlistOf(alternatives[selected]).length} proven designs for this brief — pick another to
                    rebuild on it, free.
                  </p>
                  <div className="wz-shortlist-grid">
                    {shortlistOf(alternatives[selected]).map((variant) => {
                      const current = variant.id === alternatives[selected]?.spec?.variantId;
                      return (
                        <button
                          key={variant.id}
                          className={`wz-variant wz-shortlist-card ${current ? 'selected' : ''}`}
                          data-variant={variant.id}
                          aria-pressed={current}
                          title={variant.description}
                          onClick={() => void rebuildOnChassis(variant.id)}
                        >
                          <MiniPreview variant={variant} />
                          {/* The NAME gets the whole caption. A style-family tag beside it read
                              well on a Browse tile, where it is also a filter facet — here it
                              took a third of a 132px card and clipped "Scripture Reading" and
                              "House Handle" to nothing useful, to name something the picture
                              above it already shows. */}
                          <div className="wz-variant-cap">
                            <span className="wz-alt-title">{variant.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {routeLabel(lastPath) && <p className="hint" style={{ marginTop: 4 }}>{routeLabel(lastPath)}</p>}
              {/* The Pro result's own story: the concept it was rebuilt from (with its real
                  cost) and the per-region editability report - what became a live field, a
                  rebuilt shape, or stayed raster, and why. */}
              {lastPath === 'pro' && (() => {
                const pro = proDetails.current.get(result);
                if (!pro) return null;
                return (
                  <div className="wz-pro-concept" style={{ marginTop: 8 }} data-testid="pro-report">
                    <img
                      src={pro.concept.dataUrl}
                      alt="Generated concept"
                      style={{ maxWidth: '100%', borderRadius: 6, display: 'block' }}
                    />
                    <p className="hint">
                      {pro.concept.model === 'stub'
                        ? 'Offline concept — drawn locally, no cost.'
                        : `Concept by ${pro.concept.model}${pro.concept.costUsd !== null ? ` · $${pro.concept.costUsd.toFixed(4)}` : ''}`}
                    </p>
                    <p className="hint">
                      {pro.report.textFields} editable text field(s) · {pro.report.panelsRebuilt} rebuilt
                      shape(s){pro.report.artDropped ? ' · fully reconstructed, no raster left' : ''}
                      {pro.report.textErased > 0 ? ` · ${pro.report.textErased} baked text region(s) erased from the artwork` : ''}
                      {pro.report.flattened > 0 ? ` · ${pro.report.flattened} region(s) left flattened` : ''}
                    </p>
                    <ul className="hint" data-testid="pro-outcomes">
                      {pro.report.outcomes.map((outcome, index) => (
                        <li key={index}>
                          <strong>{outcome.label}</strong> — {outcome.note}
                        </li>
                      ))}
                    </ul>
                    {pro.report.warnings.map((warning, index) => (
                      <p key={index} className="hint" data-testid="pro-warning">⚠ {warning}</p>
                    ))}
                  </div>
                );
              })()}
              {lastSpec && (!activeSpec || activeSpec.category === 'auto') && (
                // The category the AI inferred — surfaced as EDITABLE metadata, never a
                // silent decision. Changing it pins the next generation.
                <p className="hint" style={{ marginTop: 4 }}>
                  Detected category:{' '}
                  <select
                    aria-label="Detected graphic category"
                    value={aiCategoryForTemplateCategory(lastSpec.category)?.id ?? ''}
                    onChange={(e) => {
                      const id = e.target.value as AiCategoryId | '';
                      if (!id) return;
                      setSpec({ ...spec, category: id, categoryInferred: true });
                      setMoreOpen(true);
                    }}
                    disabled={!!busy}
                  >
                    <option value="" disabled>—</option>
                    {AI_CATEGORIES.filter((category) => !liteMode || LITE_AI_CATEGORIES.includes(category.id as never)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>{' '}
                  — change it to pin the next Generate.
                </p>
              )}
              <p className={validation?.ok ? 'status-ok' : 'status-bad'} style={{ marginTop: 6 }}>
                {validation?.ok
                  ? lastPath === 'raw'
                    ? '✓ Passes SPX validation — press Play in the preview, then Create project.'
                    : '✓ Passes SPX validation and the live playout test — press Play in the preview, then Create project.'
                  : `✗ ${validation?.errors.length} check(s) failing — refine or regenerate.`}
              </p>
              {/* ON-AIR READINESS: the checks that already ran, grouped into what an
                  operator cares about. It adds no checks — it reports the findings the
                  bench and the validator produced, which is what lets a row say "not
                  tested" honestly when the live bench was never part of this result. */}
              {validation && (
                <div className="ai-ready" data-testid="ai-readiness">
                  {readinessRows(validation, lastPath !== 'raw' && lastPath !== null).map((row) => (
                    <div key={row.id} className={`ai-ready-row ${row.state}`}>
                      <span className="ai-ready-mark" aria-hidden="true">
                        {row.state === 'pass' ? '✓' : row.state === 'warn' ? '⚠' : row.state === 'fail' ? '✗' : '·'}
                      </span>
                      <span className="ai-ready-label">
                        {row.label}
                        {row.state === 'untested' && <em> — not played, so not tested</em>}
                      </span>
                      {row.messages.length > 0 && (
                        <ul className="ai-ready-notes">
                          {row.messages.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {unclaimedFindings(validation).map((f, i) => (
                    <div key={`x${i}`} className="ai-ready-row warn">
                      <span className="ai-ready-mark" aria-hidden="true">⚠</span>
                      <span className="ai-ready-label">{f.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {validation && !validation.ok && tier === 'custom' && (
                // The findings are the app's words, not the user's job to translate —
                // one press sends them back as the instruction.
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="primary" data-testid="ai-fix" onClick={fixNow}>
                    ⟳ Fix these
                  </button>
                  <span className="hint">Sends the failing checks back to the AI to repair.</span>
                </div>
              )}
              {validation && !validation.ok && liteMode && (
                <p className="hint" style={{ marginTop: 8 }}>
                  This is a NoaCG platform failure, so Lite will not spend another model call trying to rewrite generated code.
                </p>
              )}
              {validation && !validation.ok && proMode && (
                <p className="hint" style={{ marginTop: 8 }}>
                  The compile from a concept is deterministic, so a failing check here is a
                  NoaCG platform defect — generate a new design rather than spending repair calls.
                </p>
              )}
              {spent && (
                <p className="hint" style={{ marginTop: 6 }} data-testid="ai-spent">
                  This run: {formatDuration(spent.ms)}
                  {hasTokenCounts(spent) && (
                    <>
                      , {formatTokens(spent.inputTokens)} tokens in / {formatTokens(spent.outputTokens)} out
                    </>
                  )}
                  .
                </p>
              )}
              {refined && (
                // A refinement is a bet: it may be worse than what the AI first proposed, and
                // regenerating would return three DIFFERENT designs rather than this one.
                <div className="row" style={{ marginTop: 8 }}>
                  <button data-testid="ai-revert" onClick={revertNow}>↺ Undo refinements</button>
                  <span className="hint">Back to this direction as it was first designed.</span>
                </div>
              )}
              {/* LAST on the card, and nothing depends on it. Create project, Refine and
                  Regenerate are all reachable without touching it - a rating standing between
                  somebody and their finished graphic is a toll, and a toll collects resentment
                  rather than data. */}
              <GenerationRating
                generationId={alternatives[selected]?.generationId}
                tier={tier}
                // The chassis the harness actually assembled, off the returned DesignSpec -
                // not the one the setup panel asked for. A grounded result can clamp an
                // out-of-range chassis to the nearest legal one, and a rating filed against
                // the request rather than the result would point at the wrong design.
                variantId={alternatives[selected]?.spec?.variantId}
              />
            </div>
          )}
        </>
      )}

      {consentDialog}
    </div>
  );
}
