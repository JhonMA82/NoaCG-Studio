import { useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { variantById, variantsFor } from '../../templates/catalog';
import { createBlankTemplate } from '../../templates/blank';
import {
  brandPatch,
  buildDraftTemplate,
  draftFormatSelection,
  draftName,
  draftResolution,
  formatDraftPatch,
  initialDraft,
  mergeDraft,
  type DraftPatch,
  type WizardDraft,
} from './draft';
import { loadBrand, saveBrand, type ProjectBrand } from '../../model/brand';
import { commitStagedSelection } from '../../ai/preferences';
import { formatTemplate } from '../../format/formatCode';
import { paletteById } from '../../model/wizard';
import WizardPreview from './WizardPreview';
import BrandLogo from '../BrandLogo';
import EntryStep from './steps/EntryStep';
import ImportStep from './steps/ImportStep';
import ImportDesignStep from './steps/ImportDesignStep';
import PrepareDesignStep from './steps/PrepareDesignStep';
import PlaceFieldsStep from './steps/PlaceFieldsStep';
import TemplateStep from './steps/TemplateStep';
import BrowseStep from './steps/BrowseStep';
import { NO_BROWSE_FILTERS, type BrowseFilters } from '../../templates/search';
import FieldsStep from './steps/FieldsStep';
import StyleStep from './steps/StyleStep';
import AnimationStep from './steps/AnimationStep';
import AiStep from './steps/AiStep';
import VideoStep from './steps/VideoStep';
import BlankStep from './steps/BlankStep';
import FinishStep, { aiSummaryRows, catalogSummaryRows, type SummaryStepKey } from './steps/FinishStep';
import { useExportUi } from '../ExportWindow';
import type { SpxTemplate } from '../../model/types';
import { clearSpecDraft, type GenerationSpec } from '../../model/generationSpec';
import type { AiThread } from '../../model/aiThread';
import type { VideoProject } from '../../model/videoTypes';
import { useVideoProjectStore } from '../../store/videoProjectStore';
import { useDocKindStore } from '../../store/docKindStore';
import { useModalGate } from '../spaceKey';
import { useIsMobile } from '../useIsMobile';
import { useRouter } from '../../app/router';
import { saveGraphicAs } from '../../store/saveActions';
import { recordLiteOutcome } from '../../ai/liteClient';
import { DEFAULT_VIDEO_FORMAT, formatProjectSummary } from '../../model/projectFormat';
import { trackEvent } from '../../backend/events';
import KitStep from './steps/KitStep';
import { createGraphic } from '../../model/library';
import { captureLookFromTemplate } from '../../model/packets';
import { addGraphicToShow, createShowNamed, createShowNamedChecked, loadShows, setShowLook, type Show } from '../../model/shows';
import { raiseStorageAlert } from '../../store/storageAlert';
import type { ProductionDest } from './steps/FinishStep';
import { useAdvancedMode } from '../useAdvancedMode';
import type { TemplatePack } from '../../templates/packs';
import { kitItems } from '../../templates/kit';
import type { StyleTag } from '../../model/fonts';

// The catalog flow browses ONE faceted step (search + programme + category + refinements —
// docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12) instead of the old Category → Template pair.
// Every catalog-shaped flow ends on FINISH: the graphic is named there, and the wizard's one
// branch is taken — open it in the editor, or go straight to its export packages without the
// editor ever being involved (steps/FinishStep.tsx + components/ExportWindow.tsx).
/**
 * A Finish door whose SAVE failed. Every such door reaches a surface the wizard no longer owns
 * (applyGenerated replaces the route, which closes the wizard), so the report has to come from
 * the app-level dialog - an inline message here would unmount before anyone read it. The
 * outcome line says where the work actually is, which is the part a "storage is full" string
 * alone never answers.
 */
function reportFailedCreateSave(name: string, error: string | null): void {
  raiseStorageAlert({
    action: `Saving “${name}”`,
    error: error ?? 'The graphic could not be saved.',
    outcome:
      'It is still open in the editor — free some room, then press Save. You can still export it from here without saving.',
  });
}

const STEP_TITLES = ['Start', 'Browse', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_IMPORT = ['Start', 'Images', 'Template', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_AI = ['Start', 'Create', 'Finish'];
const STEP_TITLES_VIDEO = ['Start', 'Video'];
const STEP_TITLES_BLANK = ['Start', 'Blank project'];
// A kit is ONE decision - which show am I running - so it has no chain of steps.
const STEP_TITLES_KIT = ['Start', 'Kit'];
// Import-graphic mode is a SETUP flow, not a second editor: bring the artwork in, prepare it
// (erase baked-in text, pick how it meets long text), PLACE editable text on it, choose the
// in/out animation, create — and land in the real canvas editor with a graphic that already
// works. Text and Animation are optional stops: Create is available from the Design step on
// (docs/IMPORT_MVP.md).
const STEP_TITLES_DESIGN = ['Start', 'Design', 'Prepare', 'Text', 'Animation', 'Finish'];

/* What each step is FOR, in the reader's words — the second line of every rail entry
   (re-design/handoff.md §2). A title alone says where you are; the sub says what the step
   will ask you. Parallel to the arrays above, index for index, so the two cannot drift.
   The vocabulary follows docs/DESIGN_LANGUAGE.md §0: a family is a TYPEFACE, never a font. */
const STEP_SUBS: Record<string, string[]> = {
  template: ['Choose mode', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
  import: ['Choose mode', 'Add pictures', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
  ai: ['Choose mode', 'Describe it', 'Name & save'],
  video: ['Choose mode', 'Brief & format'],
  blank: ['Choose mode', 'Format & name'],
  kit: ['Choose mode', 'Pick a show'],
  design: ['Choose mode', 'Your artwork', 'Erase & scale', 'Place fields', 'In & out motion', 'Name & save'],
};

/**
 * The choose-first creation wizard (replaces the old template gallery). Six steps —
 * Entry → Browse → Fields → Style → Animation → Finish — with a persistent live preview
 * from step 2 on. Creating writes the complete, teachable template code; Finish decides
 * where that lands: the editor (and the live panels) take over, or the graphic is saved
 * and goes straight to its export packages with the editor never opening.
 */
export default function CreationWizard() {
  const open = useTemplateStore((s) => s.galleryOpen);
  // Mounted for the session, rendering null when closed — so the gate keys on `open`, not on
  // mount, or every editor shortcut in the app would be dead from first paint.
  useModalGate(open);
  const closeGallery = useTemplateStore((s) => s.closeGallery);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);

  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'template' | 'import' | 'design' | 'ai' | 'video' | 'blank' | 'kit'>('template');
  const [draft, setDraft] = useState<WizardDraft>(initialDraft);
  // Browse-step facet state lives here (not in the step) so Back returns with the
  // filters intact for the wizard session; a fresh open starts clean.
  const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(NO_BROWSE_FILTERS);
  const [replayKey, setReplayKey] = useState(0);
  // Describe-it mode: the AI's current (validated) result, previewed live like any draft —
  // plus the structured setup it was generated under (saved with the created project).
  const [aiResult, setAiResult] = useState<{
    template: SpxTemplate;
    valid: boolean;
    spec?: GenerationSpec | null;
    generationId?: string;
    /** Pipeline provenance — 'pro' marks a Pro-tier result for the activation event. */
    path?: string | null;
  } | null>(null);
  // The Create-with-AI conversation as it stands (talk turns only), reported by AiStep on every
  // change — committed to the created project so the graphic carries the reasoning that made it.
  const [aiThread, setAiThread] = useState<AiThread | null>(null);
  const acceptedAiGeneration = useRef<string | null>(null);
  // The saved project brand (the "Use current project's colors & typeface" toggle keeps new
  // graphics in the same package).
  const [brand, setBrand] = useState<ProjectBrand | null>(null);
  const [matchBrand, setMatchBrand] = useState(false);
  // The production this open is FOR (one-shot from pendingProductionId; Finish preselects it).
  const [contextProductionId, setContextProductionId] = useState<string | null>(null);
  const advanced = useAdvancedMode((s) => s.advanced);
  // Prepare step's content-width slider (Import graphic, stretch mode): preview-only demo
  // text pushed into the live preview — never part of the draft or the created template.
  const [stretchDemo, setStretchDemo] = useState<string | null>(null);
  // Kit mode: building writes N graphics + a package, so it reports progress and any
  // partial-failure reason inline rather than failing silently.
  const [kitBusy, setKitBusy] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  // The step scroller flags when content hides below the fold (short laptop windows), so the
  // CSS can show a bottom fade cue — without it the overflow is invisible and a first-run
  // user never learns the lower entry cards exist. Scroll + resize + DOM changes all re-check.
  const stepRef = useRef<HTMLDivElement>(null);
  const [stepOverflow, setStepOverflow] = useState(false);
  // Each route/step starts at its own first control. This is especially important on phones:
  // the Video entry sits at the bottom of Entry, and carrying that scrollTop forward used to
  // land Video below its project-format picker.
  useEffect(() => {
    if (stepRef.current) stepRef.current.scrollTop = 0;
  }, [step, mode]);
  useEffect(() => {
    if (!open) return;
    const el = stepRef.current;
    if (!el) return;
    const check = () =>
      setStepOverflow(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
      mo.disconnect();
    };
  }, [open]);

  // Fresh wizard every time it opens; reload the brand (it may have just been saved).
  useEffect(() => {
    if (open) {
      setStep(0);
      setMode('template');
      setDraft(initialDraft());
      setBrowseFilters(NO_BROWSE_FILTERS);
      setAiResult(null);
      acceptedAiGeneration.current = null;
      setAiThread(null);
      setStretchDemo(null);
      const b = loadBrand();
      setBrand(b);
      // Off by default: reusing the previous project's look is an explicit choice,
      // not something a new graphic silently inherits.
      setMatchBrand(false);
      // PRODUCTION CONTEXT (step 6): opened FOR a production (its page's "+ New graphic"),
      // the wizard pre-applies that production's look — the unified brand its graphics
      // share — and the Finish step preselects it. One-shot, like pendingDesignId.
      const forProduction = useTemplateStore.getState().pendingProductionId;
      useTemplateStore.setState({ pendingProductionId: null });
      setContextProductionId(forProduction);
      if (forProduction) {
        const show = loadShows().find((s) => s.id === forProduction);
        if (show?.look) {
          setBrand(show.look);
          setMatchBrand(true);
          setDraft((d) => mergeDraft(d, brandPatch(show.look!)));
        }
      }
    }
  }, [open]);

  // A `#/new/<designId>` deep link (docs/PRERENDER.md's template-page CTA) preselects that
  // catalog design and drops straight to Fields — the same patch BrowseStep's onPickVariant
  // applies — WITHOUT creating a project; Finish is still the only door that does. A
  // subscribed selector (not a getState() read in the effect above) because a first-ever
  // visit already opens the wizard by default, before the router's `openGallery(designId)`
  // call reaches the store — `open` never flips false→true in that race, so only a change in
  // `pendingDesignId` itself can trigger this. It clears `pendingDesignId` itself the moment
  // it runs, so it fires exactly once per deep link and never re-applies after the user has
  // moved on.
  const pendingDesignId = useTemplateStore((s) => s.pendingDesignId);
  useEffect(() => {
    if (!open || !pendingDesignId) return;
    const pending = variantById(pendingDesignId);
    useTemplateStore.setState({ pendingDesignId: null });
    // Imported-design designs create BARE through a dedicated setup flow (mode 'design'),
    // never through the Browse pick path — excluded here for the same reason Browse never
    // lists it. An id that fails to resolve at all (missing, retired, or a manually edited
    // URL) leaves the wizard exactly where the reset effect above put it: Entry.
    if (!pending || pending.category === 'imported-design') return;
    setMode('template');
    setDraft(
      mergeDraft(initialDraft(), {
        category: pending.category,
        variantId: pending.id,
        lines: pending.suggestedLines.map((l) => ({ ...l })),
        zone: null,
        logoEnabled: null,
        animation: { presetId: null, outPresetId: null },
        paletteId: null,
        customPalette: null,
        fontId: null,
      }),
    );
    setStep(2);
  }, [open, pendingDesignId]);

  useEffect(() => {
    if (open || !aiResult?.generationId || acceptedAiGeneration.current === aiResult.generationId) return;
    void recordLiteOutcome({
      generationId: aiResult.generationId,
      action: 'discarded',
      discardReason: 'closed',
    }).catch(() => undefined);
  }, [open, aiResult]);

  // Escape closes (keeps the current project).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeGallery();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeGallery]);

  const variant = draft.variantId ? variantById(draft.variantId) : undefined;

  // The live preview always renders the draft as real template code. Design mode's preview
  // may additionally carry the stretch-demo line (preview-only; create() builds without it).
  const previewTemplate = useMemo(
    () => (variant ? buildDraftTemplate(variant, draft, { stretchDemo: mode === 'design' }) : null),
    [variant, draft, mode],
  );
  const blankPreview = useMemo(
    () => (mode === 'blank' ? createBlankTemplate(draftResolution(draft), draft.fps) : null),
    [mode, draft],
  );

  // The Animation step's index per mode: the one-step Browse flow ends at 4, the import
  // continuation keeps the old six-step shape. Finish always follows it.
  const animStep = mode === 'import' ? 5 : 4;
  // AI has no configuring steps of its own — the result IS the configuration — so its
  // Finish sits right after the working step (index 2), not after an animation step it
  // never shows.
  const finishStep = mode === 'ai' ? 2 : animStep + 1;
  // On the Animation step the preview demos the full lifecycle (in → hold → out → in)
  // so the exit is actually seen — unless the user is tuning the entrance only.
  const onAnimationStep = step === animStep && mode !== 'ai' && mode !== 'video';
  const demoOut =
    onAnimationStep &&
    !!variant &&
    ['lower-third', 'info-card', 'scoreboard', 'corner-bug', 'imported-design'].includes(variant.category) &&
    draft.animation.direction !== 'in';

  // The productions the Finish step offers - read fresh each time Finish shows (another tab
  // may have made one), never while it doesn't (localStorage churn for nothing). MUST sit
  // above the closed-wizard early return: a hook after it changes the hook count between
  // open and closed renders, which React refuses mid-transition.
  const onFinish = open && step === finishStep;
  const finishProductions: Show[] = useMemo(
    () => (onFinish ? loadShows() : []),
    [onFinish],
  );

  if (!open) return null;

  const patch = (p: DraftPatch) => setDraft((d) => mergeDraft(d, p));

  // Creating an SPX graphic (any path) lands in the SPX shell; creating/opening a video
  // lands in the video shell. Only the wizard flips the persisted doc-kind switch.
  const toSpxShell = () => useDocKindStore.getState().setKind('spx');

  /** Every create that ENDS IN A WORKSPACE names its route in the same tick. Without this,
   *  the `#/new` route-agreement effect reads a closed-but-still-routed wizard as a ✕ close,
   *  and a default-mode ✕ close rewinds to HOME (docs/GOALS.md "Student release" step 4) -
   *  which would swallow the surface the create just promised. */
  const landAt = (view: 'editor' | 'video') => useRouter.getState().replace({ view });

  const createVideo = (project: VideoProject) => {
    useVideoProjectStore.getState().loadProject(project);
    useDocKindStore.getState().setKind('video');
    // ACTIVATION, same as every SPX door: a visitor who made something. The video path used to
    // report nothing at all, so a whole project kind was invisible to the funnel and to the
    // admin overview - which showed as an honest-looking zero rather than as a gap.
    trackEvent('activation', 'video');
    landAt('video');
    closeGallery();
  };

  // Apply a freshly GENERATED template as a new project. Its HTML is tidied through Prettier
  // first (HTML only - the CSS keeps its hand-aligned property comments and the JS animation
  // region stays strict-JSON; see formatTemplate's defaults / docs/FORMATTING.md), so every
  // project starts from one consistent, formatted baseline. Formatting once at birth also keeps
  // later canvas/timeline edits to tight, minimal diffs - the editor's change-highlight stays
  // accurate. Imported templates are NOT routed here: they stay byte-faithful to the user's file.
  const applyGenerated = async (template: SpxTemplate) => {
    const formatted = await formatTemplate(template); // HTML-only by default
    landAt('editor'); // the seam every editor-ending create flows through
    applyTemplate(formatted, { resetSampleData: true });
    setActiveTab('html');
    toSpxShell();
  };

  const createBlank = () => {
    void applyGenerated(createBlankTemplate(draftResolution(draft), draft.fps));
  };

  /**
   * Build a KIT: every graphic in the pack, saved to the library and pooled into one new
   * PRODUCTION - the unit that airs (docs/GOALS.md "Student release" step 3).
   *
   * It deliberately does NOT touch the editor - no applyTemplate, no working project. A kit's
   * outcome is a production of several graphics, and silently opening one of them would pick
   * for the user and leave the other N-1 looking like they had not been made. Landing on the
   * production page puts all of them - and the road to air - in front of them instead.
   *
   * Graphics are written straight through `createGraphic` rather than the store's save path,
   * because that path saves THE OPEN PROJECT and there is exactly one of those. A partial
   * failure (a full quota is the realistic cause) stops and reports rather than leaving a
   * half-built kit behind with nothing saying so.
   */
  const createKit = (pack: TemplatePack, family: StyleTag) => {
    setKitBusy(true);
    setKitError(null);
    try {
      // kitItems is the SAME resolution the step's contents list shows - types resolved
      // through the matrix PLUS the pack's extras. Reading only the resolved types here
      // silently dropped every extra (end credits, the versus card) while the card still
      // counted them, so the kit built fewer graphics than it promised.
      // A pack that declares its palette (step 7 - the curated production-ready ones) gets
      // it imposed on EVERY graphic: a style family is not one palette, and the measured
      // audit found a single kit mixing four. Packs without one keep each design's own
      // default - the pre-step-7 behavior their pinned looks (esports' Volt) rely on.
      const kitPalette = pack.paletteId ? paletteById(pack.paletteId) : undefined;
      const built = kitItems(pack, family).map((item) => ({
        name: item.variant.name,
        // Beyond palette, only the project format is imposed - everything else stays the
        // design's own tasteful default.
        template: item.variant.create({ resolution: draftResolution(draft), fps: draft.fps, palette: kitPalette }),
      }));

      // Library records first, so the production is only created once every graphic in it
      // saved - a quota failure mid-way never leaves an empty production on Home.
      const docs = built.map((item) => {
        const { doc, error } = createGraphic(item.template, { name: item.name, packageId: null });
        if (error || !doc) throw new Error(error ?? 'Could not save the graphic.');
        return doc;
      });

      // Pool each copy with its library back-link - the same construction the production
      // page's own add uses, cue auto-seeding included. Pool order follows the pack's list
      // order, which is also the layer paint order (index 0 furthest back).
      const show = createShowNamed(pack.name);
      for (const doc of docs) {
        const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
        if (error) throw new Error(error);
      }
      // The kit's curated look becomes the production's look, so a graphic later made FOR
      // this production inherits it.
      if (docs[0]) setShowLook(show.id, captureLookFromTemplate(docs[0].template));

      trackEvent('activation', 'kit');
      closeGallery();
      useRouter.getState().navigate({ view: 'production', id: show.id });
    } catch (error) {
      setKitError(error instanceof Error ? error.message : String(error));
    } finally {
      setKitBusy(false);
    }
  };

  // The AI graphic's name: the Finish field, else the generated design's own name — the same
  // rule catalog modes apply through draftName, just off the result instead of a variant.
  const aiName = (): string => draft.name.trim() || (aiResult?.template.name ?? '');

  /**
   * Build the AI result as the working project. The AI create path DIFFERS from the catalog
   * one and must keep its steps: commit the staged preference pick (aggregated, subtle; see
   * src/ai/preferences.ts — a no-alternatives run staged nothing), and, AFTER the whole-project
   * swap clears the store's spec, adopt the result's own spec so it rides the autosave slot and
   * the next Save. Returns the applied template (read back post-format) or null. Both Finish
   * doors go through here, so the editor and export endings stay byte-identical.
   */
  const applyAiProject = async (): Promise<SpxTemplate | null> => {
    if (!aiResult?.valid) return null;
    if (aiResult.generationId) acceptedAiGeneration.current = aiResult.generationId;
    commitStagedSelection();
    const name = aiName();
    // The Finish name rides the built template, exactly as the catalog path's draftName does,
    // so it reaches the topbar, the Save prefill, and the export slug through one path.
    const template = aiResult.template.name === name ? aiResult.template : { ...aiResult.template, name };
    await applyGenerated(template);
    // AFTER the whole-project swap (which clears the store's spec AND conversation), adopt this
    // result's own so both ride the autosave slot + the next Save. Both Finish doors reach here.
    useTemplateStore.getState().setAiSpec(aiResult.spec ?? null);
    useTemplateStore.getState().setAiThread(aiThread);
    clearSpecDraft();
    if (aiResult.generationId) {
      void recordLiteOutcome({
        generationId: aiResult.generationId,
        action: 'accepted',
      }).catch(() => undefined);
    }
    // A Pro-tier create keeps its own activation mode - the funnel would otherwise lose
    // the tier the moment the separate Pro card disappeared.
    trackEvent('activation', aiResult.path === 'pro' ? 'pro' : 'ai');
    return useTemplateStore.getState().template;
  };

  /** The AI editor door: create and hand over. Saving stays the user's move. */
  const createFromAi = () => {
    void applyAiProject();
  };

  /** The AI export door: create, SAVE, and go straight to the export window (mirrors
   *  createAndExport). The save is not optional — an export-only creation that vanished would
   *  cost the whole AI generation to reproduce. A failed save deliberately stays in the editor. */
  const createFromAiAndExport = () => {
    void applyAiProject().then((template) => {
      if (!template) return;
      const saved = saveGraphicAs(aiName(), { kind: 'standalone' });
      const s = useTemplateStore.getState();
      closeGallery();
      // REPLACE, not navigate - the createAndExport back-stack reasoning.
      if (saved.ok) useRouter.getState().replace({ view: 'home', section: 'graphics' });
      else reportFailedCreateSave(aiName(), saved.error);
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
    });
  };

  /** The AI production door - the same primary ending as the catalog one (byte-identical
   *  doors doctrine: both route through applyAiProject). */
  const createFromAiAndAddToProduction = (dest: ProductionDest) => {
    void applyAiProject().then((template) => {
      if (!template) return;
      addToProduction(dest, aiName());
    });
  };

  /**
   * Build the drafted graphic and make it the working project. BOTH Finish doors go through
   * here — including the export one, which is what keeps the two endings byte-identical: the
   * editor path formats through Prettier (applyGenerated), so an export path that skipped it
   * would ship different HTML for the same choices.
   *
   * Returns the applied template (read back from the store, post-format) or null.
   */
  const applyDraftProject = async (): Promise<SpxTemplate | null> => {
    if (!previewTemplate || !variant) return null;
    // Design mode rebuilds WITHOUT the preview-only stretch-demo line; every other mode's
    // preview is exactly the created code already.
    await applyGenerated(mode === 'design' ? buildDraftTemplate(variant, draft) : previewTemplate);
    // An imported design creates BARE and hands off to the editor's Data tab — that is
    // where its fields are added, as real placed layers (docs/IMPORT_MVP.md). DEFERRED a
    // tick: in the default studio no editor renders under the wizard, so AppShell mounts on
    // the route change this create just made — and the dock reveal is keyed on
    // panelRevealNonce CHANGING after mount (mount itself never reveals). A same-tick bump
    // lands before the mount and is silently missed.
    if (variant.category === 'imported-design') {
      setTimeout(() => useTemplateStore.getState().setActivePanel('data'), 0);
    }
    // Remember this look as the project brand so the next graphic matches it.
    saveBrand({
      styleTag: variant.styleTag,
      palette:
        draft.customPalette ??
        (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette),
      fontId: draft.fontId && draft.fontId !== 'custom' ? draft.fontId : draft.fontId === 'custom' ? null : variant.defaultFontId,
      customFont: draft.fontId === 'custom' ? draft.customFont : null,
    });
    // ACTIVATION: the funnel's one quality signal - a visitor who made something. Recorded
    // per create rather than once per visitor, so the analysis can ask both "did they ever"
    // and "how often"; the mode says which door produced it.
    trackEvent('activation', mode);
    return useTemplateStore.getState().template;
  };

  /** The editor door (and the quiet from-any-step shortcut): create and hand over. Saving
   *  stays the user's move, exactly as it always has been. */
  const create = () => {
    void applyDraftProject();
  };

  /**
   * The export door: create it, SAVE it, and go straight to the export window — the editor is
   * never revealed. The save is not optional here. This branch exists for someone who is done,
   * and a graphic that was configured, exported and then dropped would be unrecoverable: every
   * wizard choice would have to be made again to get the same package back.
   *
   * On success the wizard closes onto HOME rather than the editor, so shutting the export
   * window leaves the user in the library holding the thing they just made. If the save fails
   * (a full quota is the realistic cause) we deliberately stay in the editor instead: the
   * topbar's failed-save status is visible there and Save can be retried, where Home would
   * just be a library missing the graphic with nothing saying why.
   */
  const createAndExport = () => {
    void applyDraftProject().then((template) => {
      if (!template || !variant) return;
      const saved = saveGraphicAs(draftName(variant, draft), { kind: 'standalone' });
      // Read AFTER the save: it renames the working template to the record's name, which is
      // what the export slugs the zip and the SPX/CasparCG template folder from.
      const s = useTemplateStore.getState();
      closeGallery();
      // REPLACE, not navigate: applyGenerated already replaced the route with the editor's,
      // and pushing over it would leave Back landing a default-mode user in the editor.
      if (saved.ok) useRouter.getState().replace({ view: 'home', section: 'graphics' });
      else reportFailedCreateSave(draftName(variant, draft), saved.error);
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
    });
  };

  /**
   * THE PRIMARY DOOR (docs/GOALS.md "Student release" step 6): create it, SAVE it (library
   * record first - never lose the work), pool a copy into the chosen production with its
   * auto-seeded first cue, capture the look onto a production that has none yet, and land on
   * the production page - the road to air. A FAILED save stays in the editor exactly like the
   * export door: the topbar's failed status is visible there and Save can be retried.
   */
  const addToProduction = (dest: ProductionDest, name: string) => {
    const saved = saveGraphicAs(name, { kind: 'standalone' });
    if (!saved.ok) {
      // NEVER a silent return. `applyDraftProject` has already replaced the route with the
      // editor's, which closes the wizard (App.tsx's route-agreement effect) - so by now there
      // is no wizard left to show an inline message, and swallowing the error left the user
      // standing in the canvas with no production, no saved graphic and nothing said. That is
      // the acceptance-pass blocker of 2026-08-06.
      raiseStorageAlert({
        action: `Adding “${name}” to a production`,
        error: saved.error ?? 'The graphic could not be saved.',
        outcome:
          'Your graphic is still open and unsaved — free some room, then press Save and add it from Home.',
      });
      return;
    }
    const s = useTemplateStore.getState();
    let created: string | null = null;
    let show: Show | undefined;
    if (dest.kind === 'existing') {
      show = loadShows().find((x) => x.id === dest.id);
    } else {
      const made = createShowNamedChecked(dest.name);
      show = made.show;
      created = made.error;
    }
    // A picked production deleted mid-wizard (another tab/device): fall back to a new one
    // named after the graphic rather than dropping the work on the floor.
    if (!show) {
      const made = createShowNamedChecked(name);
      show = made.show;
      created = made.error;
    }
    const target = show;
    if (created) {
      raiseStorageAlert({
        action: `Creating the production “${target.name}”`,
        error: created,
        outcome: `“${name}” is saved in your library — free some room, then add it to a production from Home.`,
      });
      return;
    }
    const pooled = addGraphicToShow(target.id, s.template, { graphicId: s.saved.graphicId ?? undefined });
    if (pooled.error) {
      raiseStorageAlert({
        action: `Adding “${name}” to “${target.name}”`,
        error: pooled.error,
        outcome: `“${name}” is saved in your library — free some room, then add it to the production from Home.`,
      });
      return;
    }
    if (!target.look) setShowLook(target.id, captureLookFromTemplate(s.template));
    closeGallery();
    useRouter.getState().replace({ view: 'production', id: target.id });
  };

  const createAndAddToProduction = (dest: ProductionDest) => {
    void applyDraftProject().then((template) => {
      if (!template || !variant) return;
      addToProduction(dest, draftName(variant, draft));
    });
  };

  const nextDisabled =
    mode === 'template'
      ? step === 1 && !draft.variantId
      : (step === 1 &&
          (mode === 'import'
            ? draft.importedImages.length === 0 || !draft.category
            : !draft.category)) ||
        (step === 2 && !draft.variantId);

  // Design mode previews from the moment the artwork lands, through the Prepare step —
  // the user sees the real graphic (and its default entrance) before creating.
  //
  // FINISH ON A PHONE IS THE ONE EXCEPTION. Stacked, the preview claims a fixed 38vh and the
  // step scrolls in what is left — which put BOTH doors below the fold on arrival, on the one
  // step that exists to offer a choice. Every earlier step had already shown the graphic, and
  // the step's own read-back says what was built, so the actions win the room here.
  const showPreview =
    (mode === 'ai' ? (step === 1 || step === finishStep) && !!aiResult
    : mode === 'video' ? false
    : mode === 'kit' ? false
    : mode === 'blank' ? step === 1
    : mode === 'design' ? step >= 1 && !!previewTemplate
    : mode === 'template' ? step >= 1 && !!previewTemplate
    : step >= 2 && !!previewTemplate) && !(isMobile && step === finishStep);
  const stepTitles =
    mode === 'ai' ? STEP_TITLES_AI
    : mode === 'video' ? STEP_TITLES_VIDEO
    : mode === 'kit' ? STEP_TITLES_KIT
    : mode === 'blank' ? STEP_TITLES_BLANK
    : mode === 'design' ? STEP_TITLES_DESIGN
    : mode === 'import' ? STEP_TITLES_IMPORT
    : STEP_TITLES;
  // Rail position → step index (1:1 in every mode).
  const stepIndexes = stepTitles.map((_, i) => i);
  const railPos = stepIndexes.indexOf(step);
  const goToStep = (delta: number) => setStep(stepIndexes[railPos + delta] ?? step);

  /* Finish's read-back rows are clickable: each goes back to the step it was decided on.
     The row names its decision, not a step NUMBER, because import mode carries an extra
     Images step and every later index shifts by one (animStep above says the same thing). */
  const editSummaryStep = (key: SummaryStepKey) => {
    const browse = mode === 'import' ? 2 : 1;
    setStep({ design: browse, format: browse, fields: browse + 1, look: browse + 2, motion: animStep }[key]);
  };

  // The rail's format read-back. The real CONTROL stays in the step that owns it, so this is
  // a reminder plus the way back: reveal the picker where it already lives, or go to the step
  // that carries it. Duplicating the control would give the same decision two homes — the
  // mistake the AI step's second reference uploader made (src/components/AGENTS.md).
  const formatSummary = formatProjectSummary(draftResolution(draft), draft.fps);
  const revealFormatPicker = () => {
    const picker = document.querySelector<HTMLElement>('.wz-step [data-testid$="-format-aspect"]');
    if (picker) {
      picker.scrollIntoView({ block: 'center', behavior: 'smooth' });
      picker.focus();
      return;
    }
    setStep(stepIndexes[1] ?? step);
  };

  /* The step footer. It belongs to the CENTRE COLUMN, not to the whole sheet: the preview
     beside it carries its own transport, and a footer spanning both put Next under the
     graphic rather than under the form it advances (re-design/handoff.md §2). */
  const wizardFooter = (
    <div className="wz-footer">
      {step > 0 && <button className="wz-back" onClick={() => goToStep(-1)}>← Back</button>}
      {brand && (mode === 'import' ? step >= 2 : mode === 'ai' ? step === 1 : step >= 1) && (
        <label className="wz-match" title="Reuse this project's palette and typeface so the new graphic belongs to the same package">
          <input
            type="checkbox"
            checked={matchBrand}
            onChange={(e) => {
              setMatchBrand(e.target.checked);
              patch(
                e.target.checked
                  ? brandPatch(brand)
                  : { paletteId: null, customPalette: null, fontId: null },
              );
            }}
          />
          Colors &amp; typeface from this project
        </label>
      )}
      <div className="spacer" />
      {/* TEMPLATE MODE's quiet shortcut is "Skip to finish" (docs/GOALS.md "Student
          release" step 6): remaining steps keep their defaults and the Finish step's
          doors decide where the graphic goes - it no longer creates straight into the
          editor, which default mode does not even surface. It stands down ON Finish,
          whose door cards ARE the actions.
          DESIGN/IMPORT keep the classic "Create project" (create from any step - a
          design needing no erase, fields, or animation choice creates immediately);
          KIT stands down for the same reason as Finish: its own Create IS the action. */}
      {mode === 'template' && step >= 1 && step < finishStep && (
        <button
          className="wz-skip"
          disabled={!draft.variantId}
          onClick={() => setStep(finishStep)}
          title="Happy with the defaults? Jump straight to naming it and choosing where it goes"
          data-testid="wz-skip-to-finish"
        >
          Skip to finish
        </button>
      )}
      {(mode === 'design' || mode === 'import') && step < finishStep && (mode === 'import' ? step >= 2 : step >= 1) && (
        <button
          disabled={!previewTemplate}
          onClick={create}
          title={
            mode === 'design'
              ? 'Create the project with everything chosen so far — refine anything later in the editor'
              : 'Create the project now — remaining steps keep their defaults'
          }
        >
          Create project
        </button>
      )}
      {/* AI's Create step advances to Finish once a valid result stands — the two doors
          (open in the editor / export) live there, same as every catalog mode. */}
      {mode === 'ai' && step === 1 && (
        <button
          className="primary wz-next"
          disabled={!aiResult?.valid}
          onClick={() => goToStep(1)}
          title={aiResult && !aiResult.valid ? 'The result has validation errors — refine or regenerate first' : undefined}
        >
          Next →
        </button>
      )}
      {mode !== 'ai' && mode !== 'video' && mode !== 'blank' && mode !== 'kit' && step > 0 && step < finishStep && (
        <button className="primary wz-next" disabled={nextDisabled} onClick={() => goToStep(1)}>
          Next →
        </button>
      )}
    </div>
  );

  // Ordering: imported images put logo-slot designs first; a matched brand puts its
  // style family first (so the package's siblings lead).
  const orderedVariants = [...variantsFor(draft.category)].sort((a, b) => {
    if (draft.importedImages.length > 0) {
      const logo = Number(b.logo !== 'none') - Number(a.logo !== 'none');
      if (logo !== 0) return logo;
    }
    if (matchBrand && brand) {
      return Number(b.styleTag === brand.styleTag) - Number(a.styleTag === brand.styleTag);
    }
    return 0;
  });

  return (
    // No backdrop-click close: the wizard is FULL-SCREEN (docs/GOALS.md "Student release"
    // step 4 - `.wz-wizard`), so there is no visible backdrop to click; ✕ and Escape close.
    // `.wz-full` drops the backdrop blur: it composited every frame under a 100% opaque
    // full-screen surface — pure paint cost, and part of the open-transition jank.
    <div className="gallery-backdrop wz-full">
      {/* `.wz-modal` is shared styling — the save dialogs wear it too — so the wizard carries
          `.wz-wizard` (the full-screen override) + its own test id for anything that must
          name THIS dialog and not one of those. */}
      <div className="wz-modal wz-wizard" data-testid="creation-wizard">
        {/* Header: what is being made, how far along, and the way out. The step LIST moved to
            the left rail (re-design/handoff.md §2) — six labelled pills across the top could
            never say what a step was FOR, and they wrapped to four rows on a phone. */}
        <div className="wz-header">
          <div className="wz-title">
            {/* The brand is the Home door on every topbar — the wizard's included. */}
            <button
              className="brand brand-home"
              title="NoaCG Studio — Home"
              onClick={() => {
                closeGallery();
                useRouter.getState().navigate({ view: 'home', section: null });
              }}
            >
              <BrandLogo size={24} />
            </button>
            <span className="wz-title-sep">·</span>
            <span className="wz-title-step">
              {mode === 'ai' ? 'Create with AI'
                : mode === 'video' ? 'Video with AI'
                : mode === 'kit' ? 'Start from a kit'
                : mode === 'design' ? 'Import graphic'
                : 'New graphic'}
            </span>
            {/* Once a design is chosen it names the thing being built, so the header answers
                "what am I working on" without the reader looking at the preview. */}
            {variant && <span className="wz-title-doc">· {variant.name}</span>}
          </div>
          <span className="wz-stepcount">
            Step <b>{railPos + 1}</b> / {stepTitles.length}
          </span>
          <button className="gallery-close" onClick={closeGallery} title="Cancel (keep current project)">✕</button>
        </div>

        {/* Body: step content (+ live preview from step 2). The Text step (design mode, step 3)
            is the one step whose LEFT pane is a WORKING surface — fields are placed and dragged
            on the artwork there — so it takes the room and the preview steps back; every other
            step splits evenly. */}
        <div
          className={`wz-body ${showPreview ? 'with-preview' : ''}${
            mode === 'design' && step === 3 ? ' wz-body-working' : ''
          }`}
        >
          {/* THE RAIL (handoff §2): where you are, what each step is for, and the project
              format pinned at its foot. Vertical, so a step can carry a second line. */}
          <nav className="wz-rail" aria-label="Creation steps">
            <div className="wz-dots">
              {stepTitles.map((t, i) => {
                const s = stepIndexes[i];
                const done = s < step;
                return (
                  <button
                    key={t}
                    className={`wz-dot ${s === step ? 'active' : ''} ${done ? 'done' : ''}`}
                    // Backward always. FORWARD jumps unlock in template mode once a design is
                    // picked (docs/GOALS.md "Student release" step 6): every later step holds
                    // a tasteful default, so "the template is good enough" must not cost four
                    // Next presses. Other modes keep their sequential walks - their steps
                    // build state a jump would skip.
                    disabled={
                      s > step
                        ? !(mode === 'template' && !!draft.variantId)
                        : s > (mode === 'template' ? 1 : 2) && !draft.variantId
                    }
                    onClick={() => setStep(s)}
                    title={t}
                  >
                    <span className="wz-dot-num" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    {/* The label is its own element so a PHONE can drop the sub-line and lay
                        the rail out as a horizontal strip of numbered chips. */}
                    <span className="wz-dot-text">
                      <span className="wz-dot-label">{t}</span>
                      <span className="wz-dot-sub">{STEP_SUBS[mode]?.[i] ?? ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The authored frame, read back where it stays visible for the whole walk. The
                CONTROL itself stays in the step that owns it (the Browse step's picker, the
                AI and blank steps' own) — one control, one home; this is the reminder plus
                the way back to it. */}
            {step > 0 && mode !== 'kit' && (
              <div className="wz-rail-foot">
                <p className="dlg-caption">Project format</p>
                <p className="wz-rail-format">{formatSummary}</p>
                <button className="wz-rail-change" onClick={revealFormatPicker}>Change ▾</button>
              </div>
            )}
          </nav>

          <div className="wz-main">
          <div className="wz-step" ref={stepRef} data-overflow={stepOverflow || undefined}>
            {step === 0 && (
              <EntryStep
                onTemplates={() => { setMode('template'); setStep(1); }}
                onImportGraphic={() => { setMode('design'); setStep(1); }}
                onAi={() => { setMode('ai'); setStep(1); }}
                onVideo={() => {
                  if (!draft.formatTouched) patch(DEFAULT_VIDEO_FORMAT);
                  setMode('video');
                  setStep(1);
                }}
                onKit={() => { setMode('kit'); setStep(1); }}
                onBlank={() => { setMode('blank'); setStep(1); }}
                onHome={() => {
                  closeGallery();
                  useRouter.getState().navigate({ view: 'home', section: null });
                }}
              />
            )}
            {step === 1 && mode === 'video' && (
              <VideoStep
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onCreate={createVideo}
                onOpen={createVideo}
              />
            )}
            {step === 1 && mode === 'kit' && (
              <KitStep
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onCreate={createKit}
                busy={kitBusy}
                error={kitError}
              />
            )}
            {step === 1 && mode === 'blank' && (
              <BlankStep draft={draft} onDraft={patch} onCreate={createBlank} />
            )}
            {/* AiStep stays MOUNTED across the Create → Finish move (hidden on Finish), so
                stepping to the doors and back never discards the thread, the three directions,
                or the refinement history — none of which is lifted into the draft. */}
            {mode === 'ai' && (step === 1 || step === finishStep) && (
              <div hidden={step === finishStep}>
                <AiStep
                  format={draftFormatSelection(draft)}
                  onFormat={(selection) => patch(formatDraftPatch(selection))}
                  brandPalette={matchBrand && brand ? brand.palette : null}
                  result={aiResult?.template ?? null}
                  onResult={(template, valid, spec, generationId, path) =>
                    setAiResult(template ? { template, valid, spec, generationId, path } : null)}
                  onThread={setAiThread}
                  onOpenImported={(imported) => {
                    // The byte-faithful path (deliberately NOT applyGenerated/Prettier): the
                    // user's file opens exactly as written, and the Export panel's inline
                    // validation shows what (if anything) needs fixing before it is
                    // SPX/CasparCG/OGraf-ready. applyTemplate closes the wizard.
                    landAt('editor');
                    applyTemplate(imported, { resetSampleData: true });
                    setActiveTab('html');
                    // Deferred a tick for the same reason as the imported-design Data
                    // reveal above: AppShell mounts on this route change, and a same-tick
                    // nonce bump lands before the mount and is missed.
                    setTimeout(() => useTemplateStore.getState().setActivePanel('export'), 0);
                    toSpxShell();
                  }}
                  onUseTemplates={(images) => {
                    // Skip the AI: design AROUND the images with the catalog — the existing
                    // images -> category -> template-picker continuation (logo-slot first).
                    patch({ importedImages: images, logoAssetPath: images[0]?.path ?? null });
                    setMode('import');
                  }}
                />
              </div>
            )}
            {step === 1 && mode === 'design' && (
              <ImportDesignStep
                art={draft.designArt}
                images={draft.importedImages}
                resolution={draftResolution(draft)}
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onArt={(designArt, importedImages) => {
                  patch({
                    designArt,
                    importedImages,
                    // A fresh drop resets the Prepare step: the pristine pixels become the
                    // erase's source, and any erase from a previous artwork is meaningless.
                    designOriginal: importedImages[0] ?? null,
                    designErases: [],
                    designFields: [],
                    category: 'imported-design',
                    // There is no design to choose — the artwork IS it — so the variant is
                    // settled here, and the graphic creates BARE: its text/number/image
                    // fields are added in the editor's Data tab as real placed layers.
                    variantId: 'imp01',
                    lines: [],
                    zone: null,
                    animation: { presetId: null, outPresetId: null },
                    ...(matchBrand && brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  });
                }}
                onClear={() =>
                  patch({
                    designArt: null,
                    importedImages: [],
                    variantId: null,
                    designOriginal: null,
                    designErases: [],
                  })
                }
              />
            )}
            {step === 1 && mode === 'import' && (
              <ImportStep
                images={draft.importedImages}
                draft={draft}
                onDraft={patch}
                onImages={(importedImages) =>
                  patch({ importedImages, logoAssetPath: importedImages[0]?.path ?? null })
                }
                onContinue={(category) => {
                  patch({ category });
                  setStep(2);
                }}
              />
            )}
            {step === 1 && mode === 'template' && (
              <BrowseStep
                draft={draft}
                filters={browseFilters}
                onFilters={setBrowseFilters}
                onDraft={patch}
                onPickVariant={(v) =>
                  patch({
                    category: v.category,
                    variantId: v.id,
                    lines: v.suggestedLines.map((l) => ({ ...l })),
                    zone: null,
                    logoEnabled: null, // the logo decision belongs to the picked design
                    animation: { presetId: null, outPresetId: null },
                    // Matched brand carries the package look into every new graphic.
                    ...(matchBrand && brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  })
                }
                onAi={() => { setMode('ai'); setStep(1); }}
                // Ranking context, not a filter: with the footer's brand toggle on, the
                // package's siblings lead the results (proposal §13.3).
                brandFamily={matchBrand && brand ? brand.styleTag : null}
              />
            )}
            {step === 3 && mode === 'design' && draft.designArt && (
              <PlaceFieldsStep art={draft.designArt} draft={draft} onDraft={patch} />
            )}
            {step === 4 && mode === 'design' && variant && (
              <AnimationStep
                variant={variant}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {step === 2 && mode === 'design' && draft.designArt && (
              <PrepareDesignStep
                art={draft.designArt}
                resolution={draftResolution(draft)}
                images={draft.importedImages}
                original={draft.designOriginal}
                erases={draft.designErases}
                onErases={(designErases, importedImages) =>
                  patch({
                    designErases,
                    // Clearing every mark hands the pristine upload back as the artwork.
                    importedImages:
                      importedImages.length > 0
                        ? importedImages
                        : draft.designOriginal
                          ? [draft.designOriginal]
                          : draft.importedImages,
                  })
                }
                onStretch={(stretch) =>
                  patch({ designArt: { ...draft.designArt!, stretch: stretch ?? undefined } })
                }
                onDemoText={setStretchDemo}
              />
            )}
            {step === 2 && mode === 'import' && (
              <TemplateStep
                variants={orderedVariants}
                draft={draft}
                onDraft={patch}
                onPickVariant={(v) =>
                  patch({
                    variantId: v.id,
                    lines: v.suggestedLines.map((l) => ({ ...l })),
                    zone: null,
                    logoEnabled: null, // the logo decision belongs to the picked design
                    // Motion AND the steps decision belong to the picked design too: a
                    // checklist is stepped by construction and a name strap is not, so
                    // switching design re-asks instead of carrying the last answer across.
                    animation: { presetId: null, outPresetId: null, steps: null },
                    // Matched brand carries the package look into every new graphic.
                    ...(matchBrand && brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  })
                }
              />
            )}
            {/* The catalog flow's later steps — one index earlier in the Browse flow;
                design mode has its own step 3/4 above. */}
            {step === (mode === 'template' ? 2 : 3) && (mode === 'template' || mode === 'import') && variant && (
              <FieldsStep variant={variant} draft={draft} onDraft={patch} />
            )}
            {step === (mode === 'template' ? 3 : 4) && (mode === 'template' || mode === 'import') && variant && (
              <StyleStep variant={variant} draft={draft} onDraft={patch} builtCss={previewTemplate?.css ?? null} />
            )}
            {step === animStep && (mode === 'template' || mode === 'import') && variant && (
              <AnimationStep
                variant={variant}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {/* Finish — shared by every catalog-shaped mode, design included. */}
            {step === finishStep && mode !== 'ai' && mode !== 'video' && variant && (
              <FinishStep
                name={draft.name}
                namePlaceholder={variant.name}
                onName={(name) => patch({ name })}
                summary={catalogSummaryRows(variant, draft)}
                onEditStep={editSummaryStep}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                onAddToProduction={createAndAddToProduction}
                onOpenEditor={create}
                showEditorDoor={advanced}
                onExport={createAndExport}
                busy={!previewTemplate}
              />
            )}
            {/* Finish — Create with AI takes the SAME branch: the result is summarised off the
                template itself (no catalog variant behind it), and both doors route through
                applyAiProject so the editor and export endings stay byte-identical. */}
            {step === finishStep && mode === 'ai' && aiResult && (
              <FinishStep
                name={draft.name}
                namePlaceholder={aiResult.template.name}
                onName={(name) => patch({ name })}
                summary={aiSummaryRows(aiResult.template, aiResult.valid)}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                onAddToProduction={createFromAiAndAddToProduction}
                onOpenEditor={createFromAi}
                showEditorDoor={advanced}
                onExport={createFromAiAndExport}
                busy={!aiResult.valid}
              />
            )}
            <div className="wz-step-fade" aria-hidden="true" />
          </div>
          {wizardFooter}
          </div>

          {showPreview && (mode === 'ai' ? aiResult : mode === 'blank' ? blankPreview : previewTemplate) && (
            <aside className="wz-side">
              <WizardPreview
                template={
                  mode === 'ai'
                    ? aiResult!.template
                    : mode === 'blank'
                      ? blankPreview!
                      : previewTemplate!
                }
                replayKey={replayKey}
                demoOut={demoOut}
                demoText={mode === 'design' ? stretchDemo : null}
              />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
