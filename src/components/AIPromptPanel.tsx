import { useState } from 'react';
import { getAiProvider } from '../ai';
import { mergeSafety } from '../ai/safety';
import { aiConfigured } from '../ai/settings';
import { useAuthState } from './auth/useAuthState';
import SignInPrompt from './auth/SignInPrompt';
import { useTemplateStore } from '../store/templateStore';
import { validateTemplate, type ValidationResult } from '../validation/validateTemplate';
import { formatTemplate } from '../format/formatCode';
import type { TemplateChange } from '../model/types';

type Pending = { change: TemplateChange; validation: ValidationResult } | null;

/**
 * AI panel. Backed by Claude when an API key is configured (see the wizard's Describe-it
 * step for settings), by the deterministic stub otherwise. Every result is validated and
 * shown for confirm-before-apply so the platform keeps SPX compatibility.
 */
export default function AIPromptPanel() {
  const template = useTemplateStore((s) => s.template);
  const activeTab = useTemplateStore((s) => s.activeTab);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  // The Create-with-AI conversation this graphic was created from (null unless it was an AI
  // creation). Carried with the project (GraphicDoc.aiThread) and shown read-only below, so
  // the reasoning that produced the graphic travels with it.
  const aiThread = useTemplateStore((s) => s.aiThread);
  const { needsSignIn } = useAuthState();

  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  // Hosted mode, no account: AI is an account feature (creating/exporting never is). The offline
  // build has no backend, so needsSignIn is always false there and nothing changes.
  if (needsSignIn) {
    return (
      <SignInPrompt
        feature="AI assistant"
        reason="Sign in to use AI — generate, modify, fix, and explain graphics with Claude."
      />
    );
  }

  // `autoFormat` runs Prettier on the result before it's shown for review. It's on only for a
  // full Generate (a brand-new template, no cursor or surgical intent to preserve) and formats
  // HTML only — CSS keeps its house comment alignment and JS keeps its timeline-owned animation
  // region (see src/format/formatCode.ts). Modify/Fix stay byte-faithful to the AI's edit.
  //
  // The result is screened for unsafe JS as well as validated (src/ai/safety.ts): what the AI
  // wrote can be steered by an uploaded reference or by an imported file, and the confirm-before-
  // apply card is where that has to be caught. A MODIFY passes the current template as the source,
  // so code the user themselves put there (a Live data block calls fetch) is not reported as
  // something the AI introduced; a GENERATE — a brand-new template — passes none.
  const runChange = async (fn: () => Promise<TemplateChange>, autoFormat = false) => {
    setBusy(true);
    setExplanation(null);
    try {
      let change = await fn();
      if (autoFormat) change = { ...change, template: await formatTemplate(change.template) };
      const base = validateTemplate(change.template);
      setPending({ change, validation: mergeSafety(base, change.template, autoFormat ? null : template) });
    } finally {
      setBusy(false);
    }
  };

  const onExplain = async () => {
    setBusy(true);
    setPending(null);
    try {
      const code = activeTab === 'html' ? template.html : activeTab === 'css' ? template.css : template.js;
      setExplanation(await getAiProvider().explain(code));
    } finally {
      setBusy(false);
    }
  };

  const applyPending = () => {
    if (pending) applyTemplate(pending.change.template);
    setPending(null);
  };

  return (
    <div>
      <div className="panel-section">
        <h3>AI assistant</h3>
        <p className="hint">
          Describe what you want. The assistant proposes a change you review before applying. Every
          result is validated for SPX compatibility.
          {!aiConfigured() && (
            <>
              {' '}Currently using the offline stub — add an Anthropic API key (New project →
              Describe it → AI settings) for full Claude-powered edits.
            </>
          )}
        </p>
      </div>

      {aiThread && aiThread.messages.length > 0 && (
        // Read-only: the conversation is a record of how the graphic was described, not a live
        // thread. Refining here is the Modify/Fix buttons below; this just carries the reasoning.
        <details className="ai-origin" data-testid="ai-origin">
          <summary>Created from this conversation</summary>
          <div className="ai-origin-thread">
            {aiThread.messages.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role === 'user' ? 'user' : 'assistant'}`}>
                <span>{m.text}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <textarea
        rows={3}
        placeholder='e.g. "make a fullscreen title", "add a fade-in", "add a text field"'
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />

      <div className="row wrap" style={{ marginTop: 8 }}>
        <button disabled={busy || !prompt.trim()} onClick={() => runChange(() => getAiProvider().generate(prompt), true)}>
          Generate
        </button>
        <button disabled={busy || !prompt.trim()} onClick={() => runChange(() => getAiProvider().modify(prompt, template))}>
          Modify
        </button>
      </div>
      <div className="row wrap" style={{ marginTop: 6 }}>
        <button disabled={busy} onClick={() => runChange(() => getAiProvider().makeSpxReady(template))}>
          Make SPX-ready
        </button>
        <button disabled={busy} onClick={() => runChange(() => getAiProvider().fix(template))}>
          Fix
        </button>
        <button disabled={busy} onClick={onExplain}>
          Explain {activeTab.toUpperCase()}
        </button>
      </div>

      {busy && <p className="hint" style={{ marginTop: 10 }}>Working…</p>}

      {explanation && (
        <div className="change-preview">
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 13 }}>{explanation}</pre>
        </div>
      )}

      {pending && (
        <div className="change-preview">
          <strong>Proposed change</strong>
          <p style={{ marginTop: 6 }}>{pending.change.summary}</p>
          <p className={pending.validation.ok ? 'status-ok' : 'status-bad'} style={{ marginTop: 6 }}>
            {pending.validation.ok
              ? '✓ Passes validation'
              : `✗ ${pending.validation.errors.length} validation error(s)`}
          </p>
          {!pending.validation.ok && (
            <ul className="hint" style={{ margin: '4px 0 0 16px' }}>
              {pending.validation.errors.map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
          <div className="change-actions">
            <button className="primary" onClick={applyPending} disabled={!pending.validation.ok}>
              Apply
            </button>
            <button onClick={() => setPending(null)}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
