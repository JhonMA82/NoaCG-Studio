import { useEffect, useState } from 'react';
import { resolutionForSelection, type ProjectFormatSelection } from '../../../model/projectFormat';
import { aiConfigured, loadAiSettings, saveAiSettings } from '../../../ai/settings';
import { discoverAiModels, imageCapableModels, modelPriceLabel, type AiDiscoveredModel } from '../../../ai/modelCatalog';
import { productionSpxValidator } from '../../../ai/litePipeline';
import {
  compileProConcept,
  generateProConcept,
  type ProConcept,
  type ProResult,
  type ProStage,
} from '../../../ai/pro/pipeline';
import { stubCompilePro, stubProConcept } from '../../../ai/pro/stub';
import type { ProBrief } from '../../../ai/pro/contract';
import { useAuthState } from '../../auth/useAuthState';
import SignInPrompt from '../../auth/SignInPrompt';
import { useAiConsent } from '../../AiConsentDialog';
import ProjectFormatPicker from '../../ProjectFormatPicker';

interface Props {
  format: ProjectFormatSelection;
  onFormat: (selection: ProjectFormatSelection) => void;
  result: ProResult | null;
  onResult: (result: ProResult | null) => void;
}

type Phase = 'brief' | 'generating' | 'review' | 'compiling' | 'ready';

const STAGE_LABELS: Record<ProStage, string> = {
  concept: 'Generating the visual concept…',
  interpret: 'Interpreting the design…',
  compile: 'Rebuilding it as editable layers…',
  validate: 'Validating and testing playout…',
};

/**
 * The NoaCG Pro step (docs/NOACG_PRO_PLAN.md §7): a structured lower-third brief, one
 * generated visual concept with its cost, an explicit compile into editable layers, and an
 * honest review of what became editable before the Finish doors. The states are the plan's
 * states - generating / interpreting / compiling / validating / ready - and a failure never
 * discards what already stands (the brief, a generated concept, a previous result).
 *
 * Offline (no AI configured) the whole flow runs on the deterministic stub, exactly like
 * Create with AI's stubProvider path, so the surface works - and is e2e-testable - without
 * tokens.
 */
export default function ProStep({ format, onFormat, result, onResult }: Props) {
  const remote = aiConfigured();
  const { needsSignIn } = useAuthState();
  const { ensureAiConsent, consentDialog } = useAiConsent();

  const [name, setName] = useState('Alexandra Riva');
  const [title, setTitle] = useState('Chief Correspondent');
  const [direction, setDirection] = useState('');
  const [includeLogo, setIncludeLogo] = useState(false);
  const [imageModel, setImageModel] = useState(loadAiSettings().proImageModel ?? '');
  const [imageModels, setImageModels] = useState<AiDiscoveredModel[]>([]);
  const [phase, setPhase] = useState<Phase>(result ? 'ready' : 'brief');
  const [stage, setStage] = useState<ProStage | null>(null);
  const [concept, setConcept] = useState<ProConcept | null>(result?.concept ?? null);
  const [error, setError] = useState<string | null>(null);

  // Live image-model discovery, remote only - the picker offers real image-output routes
  // with live prices, and an opaque id still works when discovery is unavailable.
  useEffect(() => {
    if (!remote) return;
    let stale = false;
    discoverAiModels('openrouter', { output: 'image' })
      .then((catalog) => { if (!stale) setImageModels(imageCapableModels(catalog.models)); })
      .catch(() => undefined);
    return () => { stale = true; };
  }, [remote]);

  const brief = (): ProBrief => ({
    brief: direction.trim(),
    name: name.trim() || 'Alexandra Riva',
    title: title.trim() || 'Chief Correspondent',
    includeLogo,
  });

  const pickImageModel = (value: string) => {
    setImageModel(value);
    saveAiSettings({ proImageModel: value.trim() || null });
  };

  const generate = async () => {
    setError(null);
    if (remote && !(await ensureAiConsent())) return;
    setPhase('generating');
    onResult(null);
    try {
      const generated = remote
        ? await generateProConcept(brief(), { provider: 'openrouter', model: imageModel.trim() })
        : await stubProConcept(brief());
      setConcept(generated);
      setPhase('review');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setPhase(concept ? 'review' : 'brief');
    }
  };

  const compile = async () => {
    if (!concept) return;
    setError(null);
    if (remote && !(await ensureAiConsent())) return;
    setPhase('compiling');
    setStage(remote ? 'interpret' : 'compile');
    const options = {
      resolution: resolutionForSelection(format),
      fps: format.fps,
      validate: productionSpxValidator(),
      onStage: setStage,
    };
    try {
      const compiled = remote
        ? await compileProConcept(brief(), concept, options)
        : await stubCompilePro(brief(), concept, options);
      onResult(compiled);
      setPhase('ready');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setPhase('review');
    } finally {
      setStage(null);
    }
  };

  const busy = phase === 'generating' || phase === 'compiling';

  if (needsSignIn) {
    return (
      <div className="wz-pro" data-testid="pro-step">
        <SignInPrompt
          feature="NoaCG Pro"
          reason="NoaCG Pro generates a visual concept with an image model on your own provider key. Sign in to use AI features on the hosted service."
        />
      </div>
    );
  }

  return (
    <div className="wz-pro" data-testid="pro-step">
      <div>
        <h3>NoaCG Pro — image-guided design</h3>
        <p className="hint">
          An image model draws the visual direction; NoaCG rebuilds it as an ordinary editable
          graphic - live text fields, reconstructed shapes, deterministic motion, every export
          target. The concept costs real model usage; compiling it is deterministic.
        </p>
        {!remote && (
          <p className="hint" data-testid="pro-offline-note">
            No AI provider is configured, so this runs the built-in offline concept - the full
            flow, without any model calls.
          </p>
        )}
      </div>

      <ProjectFormatPicker
        value={format}
        onChange={onFormat}
        idPrefix="pro-format"
        disabled={busy}
        description="Fixed before generation - the compiled graphic is built for this canvas."
      />

      <div className="row" style={{ gap: 8 }}>
        <label style={{ flex: 1 }}>
          Name line
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} data-testid="pro-name" />
        </label>
        <label style={{ flex: 1 }}>
          Title line
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} data-testid="pro-title" />
        </label>
      </div>
      <label>
        Design direction
        <textarea
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="e.g. public-broadcast election night: calm, authoritative, deep blue with a thin gold rule"
          data-testid="pro-brief"
        />
      </label>
      <div className="row" style={{ gap: 14, alignItems: 'center' }}>
        <label className="row" style={{ gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={includeLogo}
            onChange={(e) => setIncludeLogo(e.target.checked)}
            disabled={busy}
          />
          Logo slot
        </label>
        {remote && (
          <label style={{ flex: 1 }}>
            Image model
            <input
              list="pro-image-models"
              value={imageModel}
              onChange={(e) => pickImageModel(e.target.value)}
              disabled={busy}
              placeholder="an OpenRouter image-output model id"
              data-testid="pro-image-model"
            />
            <datalist id="pro-image-models">
              {imageModels.map((model) => (
                <option key={model.id} value={model.id}>{`${model.name} · ${modelPriceLabel(model)}`}</option>
              ))}
            </datalist>
          </label>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button
          className="primary"
          onClick={() => void generate()}
          disabled={busy || (remote && !imageModel.trim())}
          title={remote && !imageModel.trim() ? 'Pick the image model first' : undefined}
          data-testid="pro-generate"
        >
          {concept ? 'Generate a new concept' : 'Generate concept'}
        </button>
        {busy && (
          <span className="hint" data-testid="pro-busy">
            {phase === 'generating' ? STAGE_LABELS.concept : STAGE_LABELS[stage ?? 'compile']}
          </span>
        )}
      </div>

      {error && <p className="status-bad" data-testid="pro-error">✗ {error}</p>}

      {concept && phase !== 'generating' && (
        <div className="wz-pro-concept" data-testid="pro-concept">
          <img
            src={concept.dataUrl}
            alt="Generated concept"
            style={{ maxWidth: '100%', borderRadius: 6, display: 'block' }}
          />
          <p className="hint">
            {concept.model === 'stub'
              ? 'Offline concept - drawn locally, no cost.'
              : `Concept by ${concept.model}${concept.costUsd !== null ? ` · $${concept.costUsd.toFixed(4)}` : ''}`}
          </p>
          {phase !== 'ready' && (
            <button className="primary" onClick={() => void compile()} disabled={busy} data-testid="pro-compile">
              Compile into an editable graphic
            </button>
          )}
        </div>
      )}

      {result && phase === 'ready' && (
        <div className="wz-pro-report" data-testid="pro-report">
          {result.validation && (
            <p className={result.validation.ok ? 'status-ok' : 'status-bad'}>
              {result.validation.ok
                ? '✓ Compiled, validated, and exercised in a live playout test.'
                : `✗ ${result.validation.errors.length} validation error(s) - regenerate or compile again.`}
            </p>
          )}
          <p className="hint">
            {result.report.textFields} editable text field(s) · {result.report.panelsRebuilt} rebuilt
            shape(s){result.report.artDropped ? ' · fully reconstructed, no raster left' : ''}
            {result.report.flattened > 0 ? ` · ${result.report.flattened} region(s) left flattened` : ''}
          </p>
          <ul className="hint" data-testid="pro-outcomes">
            {result.report.outcomes.map((outcome, index) => (
              <li key={index}>
                <strong>{outcome.label}</strong> — {outcome.note}
              </li>
            ))}
          </ul>
          {result.report.warnings.map((warning, index) => (
            <p key={index} className="hint" data-testid="pro-warning">⚠ {warning}</p>
          ))}
          <p className="hint">Continue to name it and open it in the editor - or export it directly.</p>
        </div>
      )}

      {consentDialog}
    </div>
  );
}
