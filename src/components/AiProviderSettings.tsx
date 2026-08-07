import { useEffect, useMemo, useRef, useState } from 'react';
import {
  discoverAiModels,
  modelPriceLabel,
  videoCompatibleModels,
  type AiDiscoveredModel,
} from '../ai/modelCatalog';
import {
  AI_PROVIDERS,
  deleteUserAiKey,
  modelsForProvider,
  refreshAiConfiguration,
  saveUserAiKey,
  type AiProviderStatus,
  type AiSettings,
} from '../ai/settings';

interface Props {
  settings: AiSettings;
  onChange: (patch: Partial<AiSettings>) => void;
  /** Lock the surface to ONE provider (the key/status rows target it and the provider select
   *  disappears). The managed Pro tier uses this so key management reuses the one secure
   *  credential surface without offering a provider choice. */
  fixedProvider?: AiSettings['provider'];
  /** Hide the model row - a managed tier picks its own routes. Defaults to shown. */
  showModel?: boolean;
}

/** Shared provider/model/key controls. The secret input is submitted once and never persisted in app settings. */
export default function AiProviderSettings({ settings, onChange, fixedProvider, showModel = true }: Props) {
  const onChangeRef = useRef(onChange);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<AiProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [discovered, setDiscovered] = useState<AiDiscoveredModel[]>([]);
  // The provider every row below acts on. A fixed provider never touches the saved
  // provider/model routing preferences - those belong to the custom tier.
  const provider = fixedProvider ?? settings.provider;
  const curatedModels = useMemo(() => modelsForProvider(provider), [provider]);
  const current = status.find((p) => p.id === provider);
  const selectedDiscovered = discovered.find((model) => model.id === settings.model);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let live = true;
    void refreshAiConfiguration()
      .then((config) => {
        if (!live) return;
        setStatus(config.providers);
        onChangeRef.current({
          configuredProviders: config.providers.filter((provider) => provider.available).map((provider) => provider.id),
          keyStorageAvailable: config.keyStorageAvailable,
        });
      })
      .catch(() => {
        if (live) setMessage('Could not read server AI configuration.');
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setDiscovered([]);
    if (!showModel) return;
    if (provider !== 'openrouter' && provider !== 'huggingface') return;
    void discoverAiModels(provider)
      .then((catalog) => {
        if (live) setDiscovered(videoCompatibleModels(catalog.models));
      })
      .catch(() => {
        if (live) setMessage('Live model discovery is unavailable. You can still enter a model id.');
      });
    return () => { live = false; };
  }, [provider, showModel]);

  const applyConfig = (config: Awaited<ReturnType<typeof refreshAiConfiguration>>) => {
    setStatus(config.providers);
    onChange({
      configuredProviders: config.providers.filter((provider) => provider.available).map((provider) => provider.id),
      keyStorageAvailable: config.keyStorageAvailable,
    });
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      await saveUserAiKey(provider, key);
      setKey('');
      applyConfig(await refreshAiConfiguration());
      setMessage('Provider key stored securely.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not store the provider key.');
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    setBusy(true);
    setMessage('');
    try {
      await deleteUserAiKey(provider);
      applyConfig(await refreshAiConfiguration());
      setMessage('User-provided key removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove the provider key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    /* Label column | control column (re-design/handoff.md §6). The key row's button nests its
       own grid inside the control cell, so "Store key" can never wrap under the field. */
    <div className="dlg-rows">
      {!fixedProvider && (
        <div className="dlg-row">
          <label htmlFor="ai-provider">Provider</label>
          <select
            id="ai-provider"
            value={settings.provider}
            onChange={(event) => {
              setKey('');
              setMessage('');
              onChange({ provider: event.target.value as AiSettings['provider'] });
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} title={p.blurb}>{p.label}</option>
            ))}
          </select>
          <p className="dlg-hint">{AI_PROVIDERS.find((p) => p.id === settings.provider)?.blurb}</p>
        </div>
      )}

      {showModel && (
        <div className="dlg-row">
          <label htmlFor="ai-model">Model</label>
          <input
            id="ai-model"
            className="mono"
            list={`ai-models-${provider}`}
            value={settings.model}
            onChange={(event) => onChange({ model: event.target.value.trim() })}
            placeholder="Provider model id"
          />
          <datalist id={`ai-models-${provider}`}>
            {discovered.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} - {modelPriceLabel(model)}
              </option>
            ))}
            {curatedModels
              .filter((model) => !discovered.some((item) => item.id === model.id))
              .map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </datalist>
          <p className="dlg-hint">
            {selectedDiscovered
              ? `${selectedDiscovered.contextLength?.toLocaleString() ?? 'Unknown'} context - ${
                  selectedDiscovered.inputModalities.join(', ')
                } input - ${modelPriceLabel(selectedDiscovered)}`
              : curatedModels.find((model) => model.id === settings.model)?.blurb
                ?? 'Any model id supported by this provider.'}
          </p>
        </div>
      )}

      <div className="dlg-row">
        <label htmlFor="ai-user-key">
          {fixedProvider ? `${AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider} key` : 'Key'}
        </label>
        <div className="dlg-pair">
          <input
            id="ai-user-key"
            type="password"
            autoComplete="off"
            placeholder="Paste a provider key"
            value={key}
            disabled={busy || settings.keyStorageAvailable === false}
            onChange={(event) => setKey(event.target.value)}
          />
          <span className="row" style={{ gap: 8 }}>
            <button disabled={busy || !key.trim()} onClick={() => void saveKey()}>Store key</button>
            {current?.userKey && <button disabled={busy} onClick={() => void removeKey()}>Remove</button>}
          </span>
        </div>
        <p className="dlg-hint">
          {settings.keyStorageAvailable === false
            ? 'This server has not configured encrypted user-key storage.'
            : current?.userKey
              ? 'A user key is stored in an encrypted HttpOnly cookie. It cannot be read by the app.'
              : current?.managedKey
                ? current.requiresSignIn
                  ? 'A NoaCG-managed key is available after sign-in.'
                  : 'Blank key = NoaCG-managed server key. Any model id the provider supports.'
                : 'The key is sent once to this server and is never saved in browser-readable storage.'}
        </p>
        {message && <p className="dlg-hint" role="status">{message}</p>}
      </div>
    </div>
  );
}
