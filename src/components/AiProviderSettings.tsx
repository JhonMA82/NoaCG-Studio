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
}

/** Shared provider/model/key controls. The secret input is submitted once and never persisted in app settings. */
export default function AiProviderSettings({ settings, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<AiProviderStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [discovered, setDiscovered] = useState<AiDiscoveredModel[]>([]);
  const curatedModels = useMemo(() => modelsForProvider(settings.provider), [settings.provider]);
  const current = status.find((provider) => provider.id === settings.provider);
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
    if (settings.provider !== 'openrouter' && settings.provider !== 'huggingface') return;
    void discoverAiModels(settings.provider)
      .then((catalog) => {
        if (live) setDiscovered(videoCompatibleModels(catalog.models));
      })
      .catch(() => {
        if (live) setMessage('Live model discovery is unavailable. You can still enter a model id.');
      });
    return () => { live = false; };
  }, [settings.provider]);

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
      await saveUserAiKey(settings.provider, key);
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
      await deleteUserAiKey(settings.provider);
      applyConfig(await refreshAiConfiguration());
      setMessage('User-provided key removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove the provider key.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <label>Provider</label>
      <select
        value={settings.provider}
        onChange={(event) => {
          setKey('');
          setMessage('');
          onChange({ provider: event.target.value as AiSettings['provider'] });
        }}
      >
        {AI_PROVIDERS.map((provider) => (
          <option key={provider.id} value={provider.id} title={provider.blurb}>{provider.label}</option>
        ))}
      </select>
      <p className="hint">{AI_PROVIDERS.find((provider) => provider.id === settings.provider)?.blurb}</p>

      <label style={{ marginTop: 8 }}>Model</label>
      <input
        list={`ai-models-${settings.provider}`}
        value={settings.model}
        onChange={(event) => onChange({ model: event.target.value.trim() })}
        placeholder="Provider model id"
      />
      <datalist id={`ai-models-${settings.provider}`}>
        {discovered.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} - {modelPriceLabel(model)}
          </option>
        ))}
        {curatedModels
          .filter((model) => !discovered.some((item) => item.id === model.id))
          .map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      </datalist>
      <p className="hint">
        {selectedDiscovered
          ? `${selectedDiscovered.contextLength?.toLocaleString() ?? 'Unknown'} context - ${
              selectedDiscovered.inputModalities.join(', ')
            } input - ${modelPriceLabel(selectedDiscovered)}`
          : curatedModels.find((model) => model.id === settings.model)?.blurb
            ?? 'Any model id supported by this provider.'}
      </p>

      <label style={{ marginTop: 8 }}>User-provided key</label>
      <div className="row" style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <input
          type="password"
          autoComplete="off"
          placeholder="Paste a provider key"
          value={key}
          style={{ flex: '1 1 180px', minWidth: 0 }}
          disabled={busy || settings.keyStorageAvailable === false}
          onChange={(event) => setKey(event.target.value)}
        />
        <button disabled={busy || !key.trim()} onClick={() => void saveKey()}>Store key</button>
        {current?.userKey && <button disabled={busy} onClick={() => void removeKey()}>Remove</button>}
      </div>
      <p className="hint">
        {settings.keyStorageAvailable === false
          ? 'This server has not configured encrypted user-key storage.'
          : current?.userKey
            ? 'A user key is stored in an encrypted HttpOnly cookie. It cannot be read by the app.'
            : current?.managedKey
              ? current.requiresSignIn
                ? 'A NoaCG-managed key is available after sign-in.'
                : 'This route uses a NoaCG-managed server key.'
              : 'The key is sent once to this server and is never saved in browser-readable storage.'}
      </p>
      {message && <p className="hint" role="status">{message}</p>}
    </>
  );
}
