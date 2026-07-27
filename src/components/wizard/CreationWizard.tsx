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
import FinishStep, { aiSummaryRows, catalogSummaryRows } from './steps/FinishStep';
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
import { openGraphicDoc, saveGraphicAs, useSaveUi } from '../../store/saveActions';
import { recordLiteOutcome } from '../../ai/liteClient';
import { DEFAULT_VIDEO_FORMAT } from '../../model/projectFormat';

// The catalog flow browses ONE faceted step (search + programme + category + refinements —
// docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12) instead of the old Category → Template pair.
// Every catalog-shaped flow ends on FINISH: the graphic is named there, and the wizard's one
// branch is taken — open it in the editor, or go straight to its export packages without the
// editor ever being involved (steps/FinishStep.tsx + components/ExportWindow.tsx).
const STEP_TITLES = ['Start', 'Browse', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_IMPORT = ['Start', 'Images', 'Template', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_AI = ['Start', 'Create', 'Finish'];
const STEP_TITLES_VIDEO = ['Start', 'Video'];
const STEP_TITLES_BLANK = ['Start', 'Blank project'];
// Import-graphic mode is a SETUP flow, not a second editor: bring the artwork in, prepare it
// (erase baked-in text, pick how it meets long text), PLACE editable text on it, choose the
// in/out animation, create — and land in the real canvas editor with a graphic that already
// works. Text and Animation are optional stops: Create is available from the Design step on
// (docs/IMPORT_MVP.md).
const STEP_TITLES_DESIGN = ['Start', 'Design', 'Prepare', 'Text', 'Animation', 'Finish'];

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
  const [mode, setMode] = useState<'template' | 'import' | 'design' | 'ai' | 'video' | 'blank'>('template');
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
  } | null>(null);
  // The Create-with-AI conversation as it stands (talk turns only), reported by AiStep on every
  // change — committed to the created project so the graphic carries the reasoning that made it.
  const [aiThread, setAiThread] = useState<AiThread | null>(null);
  const acceptedAiGeneration = useRef<string | null>(null);
  // The saved project brand (the "Use current project's colors & font" toggle keeps new
  // graphics in the same package).
  const [brand, setBrand] = useState<ProjectBrand | null>(null);
  const [matchBrand, setMatchBrand] = useState(false);
  // Prepare step's content-width slider (Import graphic, stretch mode): preview-only demo
  // text pushed into the live preview — never part of the draft or the created template.
  const [stretchDemo, setStretchDemo] = useState<string | null>(null);
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

  // Backdrop click-to-close must only fire on a genuine outside click - not when a text
  // selection drag STARTED inside an input (e.g. the video duration field) and released
  // over the backdrop. The browser routes that release's `click` to the backdrop (the
  // nearest common ancestor), so we additionally require the press to have begun there.
  const pressedOnBackdrop = useRef(false);

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
    }
  }, [open]);

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
  // AI has no configuring steps of its own — the result IS the configuration — so its Finish
  // sits right after Create (index 2), not after an animation step it never shows.
  const finishStep = mode === 'ai' ? 2 : animStep + 1;
  // On the Animation step the preview demos the full lifecycle (in → hold → out → in)
  // so the exit is actually seen — unless the user is tuning the entrance only.
  const onAnimationStep = step === animStep && mode !== 'ai' && mode !== 'video';
  const demoOut =
    onAnimationStep &&
    !!variant &&
    ['lower-third', 'info-card', 'scoreboard', 'corner-bug', 'imported-design'].includes(variant.category) &&
    draft.animation.direction !== 'in';

  if (!open) return null;

  const patch = (p: DraftPatch) => setDraft((d) => mergeDraft(d, p));

  // Creating an SPX graphic (any path) lands in the SPX shell; creating/opening a video
  // lands in the video shell. Only the wizard flips the persisted doc-kind switch.
  const toSpxShell = () => useDocKindStore.getState().setKind('spx');

  const createVideo = (project: VideoProject) => {
    useVideoProjectStore.getState().loadProject(project);
    useDocKindStore.getState().setKind('video');
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
    applyTemplate(formatted, { resetSampleData: true });
    setActiveTab('html');
    toSpxShell();
  };

  const createBlank = () => {
    void applyGenerated(createBlankTemplate(draftResolution(draft), draft.fps));
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
      if (saved.ok) useRouter.getState().navigate({ view: 'home', section: 'graphics' });
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
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
    // where its fields are added, as real placed layers (docs/IMPORT_MVP.md).
    if (variant.category === 'imported-design') useTemplateStore.getState().setActivePanel('data');
    // Remember this look as the project brand so the next graphic matches it.
    saveBrand({
      styleTag: variant.styleTag,
      palette:
        draft.customPalette ??
        (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette),
      fontId: draft.fontId && draft.fontId !== 'custom' ? draft.fontId : draft.fontId === 'custom' ? null : variant.defaultFontId,
      customFont: draft.fontId === 'custom' ? draft.customFont : null,
    });
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
      if (saved.ok) useRouter.getState().navigate({ view: 'home', section: 'graphics' });
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
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
    : mode === 'blank' ? step === 1
    : mode === 'design' ? step >= 1 && !!previewTemplate
    : mode === 'template' ? step >= 1 && !!previewTemplate
    : step >= 2 && !!previewTemplate) && !(isMobile && step === finishStep);
  const stepTitles =
    mode === 'ai' ? STEP_TITLES_AI
    : mode === 'video' ? STEP_TITLES_VIDEO
    : mode === 'blank' ? STEP_TITLES_BLANK
    : mode === 'design' ? STEP_TITLES_DESIGN
    : mode === 'import' ? STEP_TITLES_IMPORT
    : STEP_TITLES;
  // Rail position → step index (1:1 in every mode).
  const stepIndexes = stepTitles.map((_, i) => i);
  const railPos = stepIndexes.indexOf(step);
  const goToStep = (delta: number) => setStep(stepIndexes[railPos + delta] ?? step);

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
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) closeGallery();
        pressedOnBackdrop.current = false;
      }}
    >
      {/* `.wz-modal` is shared styling — the save dialogs wear it too — so the wizard carries
          its own test id for anything that must name THIS dialog and not one of those. */}
      <div className="wz-modal" data-testid="creation-wizard">
        {/* Header: title + step dots */}
        <div className="wz-header">
          <div className="wz-title">
            <BrandLogo size={20} />
            <span className="wz-title-sep">·</span>
            <span className="wz-title-step">
              {mode === 'ai' ? 'Create with AI'
                : mode === 'video' ? 'Video with AI'
                : mode === 'design' ? 'Import graphic'
                : 'New project'}
            </span>
          </div>
          <div className="wz-dots">
            {stepTitles.map((t, i) => {
              const s = stepIndexes[i];
              return (
                <button
                  key={t}
                  className={`wz-dot ${s === step ? 'active' : ''} ${s < step ? 'done' : ''}`}
                  disabled={s > step || (s > (mode === 'template' ? 1 : 2) && !draft.variantId)}
                  onClick={() => setStep(s)}
                  title={t}
                >
                  {/* The label is its own element so a PHONE can drop it from every step but
                      the active one: six labelled pills wrap to four rows and ate ~290px of an
                      812px screen before any content appeared. Numbers still name the step,
                      and the one you are on keeps its word. */}
                  <span>{i + 1}</span> <span className="wz-dot-label">{t}</span>
                </button>
              );
            })}
          </div>
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
                onBlank={() => { setMode('blank'); setStep(1); }}
                onHome={() => {
                  closeGallery();
                  useRouter.getState().navigate({ view: 'home', section: null });
                }}
                onOpenGraphic={(g) => {
                  useSaveUi.getState().requestSwitch(() => {
                    openGraphicDoc(g);
                    closeGallery();
                    useRouter.getState().navigate({ view: 'graphic', id: g.id });
                  });
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
                  onResult={(template, valid, spec, generationId) =>
                    setAiResult(template ? { template, valid, spec, generationId } : null)}
                  onThread={setAiThread}
                  onOpenImported={(imported) => {
                    // The byte-faithful path (deliberately NOT applyGenerated/Prettier): the
                    // user's file opens exactly as written, and the Export panel's inline
                    // validation shows what (if anything) needs fixing before it is
                    // SPX/CasparCG/OGraf-ready. applyTemplate closes the wizard.
                    applyTemplate(imported, { resetSampleData: true });
                    setActiveTab('html');
                    useTemplateStore.getState().setActivePanel('export');
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
              <StyleStep variant={variant} draft={draft} onDraft={patch} />
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
                onOpenEditor={create}
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
                onOpenEditor={createFromAi}
                onExport={createFromAiAndExport}
                busy={!aiResult.valid}
              />
            )}
            <div className="wz-step-fade" aria-hidden="true" />
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

        {/* Footer */}
        <div className="wz-footer">
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            {step > 0 && <button onClick={() => goToStep(-1)}>‹ Back</button>}
            {brand && (mode === 'import' ? step >= 2 : mode === 'ai' ? step === 1 : step >= 1) && (
              <label className="wz-match" title="Reuse this project's palette and font so the new graphic belongs to the same package">
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
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
                Use current project's colors &amp; font
              </label>
            )}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {/* AI's Create step advances to Finish once a valid result stands — the two doors
                (open in the editor / export) live there, same as every catalog mode. */}
            {mode === 'ai' && step === 1 && (
              <button
                className="primary wz-next"
                disabled={!aiResult?.valid}
                onClick={() => goToStep(1)}
                title={aiResult && !aiResult.valid ? 'The result has validation errors — refine or regenerate first' : undefined}
              >
                Next ›
              </button>
            )}
            {/* "Create project" is the quiet shortcut out of any configuring step — create
                now, remaining steps keep their defaults. It stands down entirely on FINISH,
                whose two door cards ARE the actions: a third button saying almost the same
                thing as one of them would only make the branch harder to read.
                Design mode: Create is available from the Design step on (a design that
                needs no erase, fields, or animation choice creates immediately). */}
            {mode !== 'ai' && mode !== 'video' && mode !== 'blank' && step < finishStep && (mode === 'import' ? step >= 2 : step >= 1) && (
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
            {mode !== 'ai' && mode !== 'video' && mode !== 'blank' && step > 0 && step < finishStep && (
              <button className="primary wz-next" disabled={nextDisabled} onClick={() => goToStep(1)}>
                Next ›
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
