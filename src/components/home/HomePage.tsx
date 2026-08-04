import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, type Route } from '../../app/router';
import { useTemplateStore } from '../../store/templateStore';
import { openGraphicById, useSaveUi } from '../../store/saveActions';
import { loadGraphics, type GraphicDoc } from '../../model/library';
import { loadLooks } from '../../model/packets';
import { loadShows } from '../../model/shows';
import {
  listSavedVideoProjects,
  saveCurrentVideoProject,
  type SavedVideoRecord,
} from '../../model/videoProject';
import { useDocKindStore } from '../../store/docKindStore';
import { isBackendConfigured } from '../../backend/config';
import { subscribeAuth } from '../../backend/auth';
import {
  listMySubmissions,
  publishGraphic,
  STATUS_LABEL,
  unpublish,
  type MySubmission,
} from '../../community/communityData';
import { publishGate } from '../../community/gate';
import type { ValidationResult } from '../../validation/validateTemplate';
import type { SpxTemplate } from '../../model/types';
import BrandLogo from '../BrandLogo';
import AuthStatus from '../auth/AuthStatus';
import SyncStatus from '../SyncStatus';
import SignInDialog from '../auth/SignInDialog';
import SaveDialogs from '../save/SaveDialogs';
import SettingsDialog from '../SettingsDialog';
import { useAdvancedMode } from '../useAdvancedMode';
import { copyLink } from './copyLink';
import GraphicRow from './GraphicRow';
import ProductionsSection from './sections/ProductionsSection';
import VideosSection, { VideoList } from './sections/VideosSection';
import LooksSection from './sections/LooksSection';
import { IconFilm, IconGrid, IconLink, IconPalette, IconSliders, IconTv } from '../icons';

type Section = 'productions' | 'graphics' | 'videos' | 'looks';

/** Productions lead (docs/GOALS.md "Student release" step 8) — the production is the unit that
 *  airs, so it is the first thing Home offers. Recent/Control-panels are retired sections: the
 *  dashboard covers "recent", and every graphic row reaches its control panel. */
const SECTIONS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: 'productions', label: 'Productions', icon: <IconTv /> },
  { id: 'graphics', label: 'Graphics', icon: <IconGrid /> },
  { id: 'videos', label: 'Videos', icon: <IconFilm /> },
  { id: 'looks', label: 'Brand looks', icon: <IconPalette /> },
];

/**
 * HOME (docs/SAVED_CONTENT_MODEL.md §3) — the routed dashboard over everything saved.
 * `#/home` is the DASHBOARD: productions first (open a dashboard, copy an output URL — one
 * click), then the top graphics with search, then recent videos. The nav's four sections are
 * the full lists. Local-first and open to everyone (auth posture: no gate — sign-in only adds
 * sync). Rendered for `#/home[/<section>]`; browser Back/Forward walk it like any pages.
 * Retired section routes (`recent`, `controls`, old `#/package/*` links) land on the dashboard.
 */
export default function HomePage({ route }: { route: Route }) {
  const navigate = useRouter((s) => s.navigate);
  const requestSwitch = useSaveUi((s) => s.requestSwitch);
  const workingName = useTemplateStore((s) => s.template.name);
  const workingSaved = useTemplateStore((s) => s.saved);
  const advanced = useAdvancedMode((s) => s.advanced);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // One nonce refreshes every list after any mutation (the model layer is the store).
  const [rev, setRev] = useState(0);
  const refresh = () => setRev((r) => r + 1);
  // Every model layer announces a persisted change (saves, deletes, sync pulls) with
  // 'spx-data-changed'. Refreshing on it is what lets Home stay MOUNTED under the wizard —
  // the old remount-on-key-change repainted a blank Home for one frame before the wizard
  // covered it — while a graphic the wizard just created still appears the moment it lands.
  useEffect(() => {
    const onData = () => setRev((r) => r + 1);
    window.addEventListener('spx-data-changed', onData);
    return () => window.removeEventListener('spx-data-changed', onData);
  }, []);
  /* eslint-disable react-hooks/exhaustive-deps */
  const graphics = useMemo(() => loadGraphics().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [rev]);
  const looks = useMemo(() => loadLooks(), [rev]);
  const productions = useMemo(() => loadShows(), [rev]);
  const videos = useMemo(() => listSavedVideoProjects(), [rev]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q ? graphics.filter((g) => g.name.toLowerCase().includes(q)) : graphics;

  // Community publishing: only surfaces with a configured backend AND a signed-in account —
  // the offline app grows zero community UI.
  const backendConfigured = isBackendConfigured();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => subscribeAuth((s) => setSignedIn(s.status === 'signed-in' && !!s.user)), []);
  const communityOn = backendConfigured && signedIn;
  const [publish, setPublish] = useState<{ name: string; template: SpxTemplate; gate: ValidationResult } | null>(null);
  const [mySubs, setMySubs] = useState<MySubmission[]>([]);
  // Which share link was just copied. A clipboard write is invisible — without this the button
  // looks broken and gets pressed again.
  const [copiedSub, setCopiedSub] = useState<string | null>(null);
  useEffect(() => {
    if (communityOn) void listMySubmissions().then(setMySubs).catch(() => {});
    else setMySubs([]);
  }, [communityOn, rev]);

  /** null = the dashboard. Old bookmarks/specs naming the retired sections land there too. */
  const section: Section | null =
    route.view === 'home' && SECTIONS.some((s) => s.id === route.section)
      ? (route.section as Section)
      : null;

  /** What "Open" means follows the mode (docs/GOALS.md "Student release" step 4): the
   *  default studio opens a graphic onto its CONTROL page (preview + data + operating);
   *  Advanced mode opens the editor. Direct #/graphic links work either way. */
  const openGraphic = (g: GraphicDoc) => {
    if (!advanced) {
      navigate({ view: 'control', id: g.id });
      return;
    }
    requestSwitch(() => {
      openGraphicById(g.id);
      navigate({ view: 'graphic', id: g.id });
    });
  };

  const openVideo = (record: SavedVideoRecord) => {
    saveCurrentVideoProject(record.project);
    useDocKindStore.getState().setKind('video');
    navigate({ view: 'video' });
  };

  const onPublish = communityOn
    ? (g: GraphicDoc) => setPublish({ name: g.name, template: g.template, gate: publishGate(g.template) })
    : undefined;

  const graphicRows = (list: GraphicDoc[]) =>
    list.map((g) => <GraphicRow key={g.id} g={g} onOpen={openGraphic} onChanged={refresh} onPublish={onPublish} />);

  const searchRow = (
    <div className="home-search row">
      <input
        className="grow"
        placeholder="Search graphics…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="home-search"
      />
    </div>
  );

  return (
    <div className="app home-page" data-testid="home-page">
      <header className="topbar">
        <button className="brand brand-home" onClick={() => navigate({ view: 'home', section: null })} title="Home">
          <BrandLogo size={24} />
        </button>
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name">Home</span>
        <div className="spacer" />
        {/* An editor door - Advanced mode only (docs/GOALS.md "Student release" step 4). */}
        {advanced && (
          <button
            onClick={() => navigate({ view: 'editor' })}
            data-testid="home-continue-editing"
            title="Back to the graphic open in the editor"
          >
            ↩ Continue editing <strong style={{ marginLeft: 4 }}>{workingName}</strong>
            {workingSaved.dirty ? ' •' : ''}
          </button>
        )}
        <button className="primary" onClick={() => navigate({ view: 'new' })} data-testid="home-new-project">
          + New project
        </button>
        {/* Settings must be reachable WITHOUT an account (the avatar menu is the other door,
            and offline builds have none) - it is where Advanced mode lives. Not auth UI. */}
        <button onClick={() => setSettingsOpen(true)} title="Settings" aria-label="Settings" data-testid="home-settings">
          <IconSliders />
        </button>
        <SyncStatus />
        <AuthStatus />
      </header>

      <div className="home-body">
        <nav className="home-nav" aria-label="Home sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={s.id === section ? 'active' : ''}
              onClick={() => navigate({ view: 'home', section: s.id })}
              data-testid={`home-nav-${s.id}`}
            >
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>

        <main className="home-content">
          {publish && (
            <PublishSheet
              target={publish}
              onDone={(note) => {
                setPublish(null);
                if (note) refresh();
              }}
            />
          )}

          {section === null && (
            <>
              {/* The dashboard: productions lead — the unit that airs is one click from open. */}
              <ProductionsSection
                productions={productions}
                onOpen={(p) => navigate({ view: 'production', id: p.id })}
                onChanged={refresh}
                limit={5}
              />
              {productions.length > 5 && (
                <button className="link-inline" onClick={() => navigate({ view: 'home', section: 'productions' })}>
                  View all {productions.length} productions →
                </button>
              )}

              <h2 style={{ marginTop: 20 }}><IconGrid size={18} /> Graphics</h2>
              {searchRow}
              {filtered.length === 0 && videos.length === 0 && productions.length === 0 && (
                <EmptyHint onNew={() => navigate({ view: 'new' })} />
              )}
              {graphicRows(filtered.slice(0, 8))}
              {filtered.length > 8 && (
                <button className="link-inline" onClick={() => navigate({ view: 'home', section: 'graphics' })}>
                  View all {filtered.length} graphics →
                </button>
              )}

              {videos.length > 0 && (
                <>
                  <h2 style={{ marginTop: 20 }}><IconFilm size={18} /> Recent videos</h2>
                  <VideoList videos={videos.slice(0, 4)} onOpen={openVideo} onChanged={refresh} />
                </>
              )}
            </>
          )}

          {section === 'productions' && (
            <ProductionsSection
              productions={productions}
              onOpen={(p) => navigate({ view: 'production', id: p.id })}
              onChanged={refresh}
            />
          )}

          {section === 'graphics' && (
            <>
              <h2><IconGrid size={18} /> Graphics <span className="muted">({filtered.length})</span></h2>
              {searchRow}
              {filtered.length === 0 && <EmptyHint onNew={() => navigate({ view: 'new' })} />}
              {graphicRows(filtered)}
              {communityOn && mySubs.length > 0 && (
                <div className="panel-section" style={{ marginTop: 14 }}>
                  <h3>My community templates</h3>
                  {mySubs.map((s) => (
                    <div className="pk-graphic" key={s.id}>
                      <strong>{s.name}</strong>
                      <span className="muted">{s.kind} · {STATUS_LABEL[s.status]}</span>
                      <div className="spacer" />
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}?template=${encodeURIComponent(s.slug)}`;
                          void copyLink(url).then((ok) => {
                            if (!ok) return;
                            setCopiedSub(s.id);
                            setTimeout(() => setCopiedSub((c) => (c === s.id ? null : c)), 2000);
                          });
                        }}
                        title="Copy a share link"
                        aria-label={`Copy a share link for ${s.name}`}
                      >
                        {copiedSub === s.id ? '✓ Copied' : <IconLink />}
                      </button>
                      <button onClick={() => { void unpublish(s.id).then(refresh); }} title="Remove from the community">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {section === 'videos' && <VideosSection videos={videos} onOpen={openVideo} onChanged={refresh} />}

          {section === 'looks' && <LooksSection looks={looks} onChanged={refresh} onDone={() => navigate({ view: 'editor' })} />}
        </main>
      </div>

      {/* The guard + save dialogs can appear over Home too (e.g. opening a graphic while the
          editor holds unsaved work), and account features need their sign-in dialog. */}
      <SaveDialogs />
      <SignInDialog />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/** The publish sheet (moved from the retired packet manager): the automated gate first,
 *  then a one-line summary, then the share. */
function PublishSheet({
  target,
  onDone,
}: {
  target: { name: string; template: SpxTemplate; gate: ValidationResult };
  onDone: (published: boolean) => void;
}) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (!target.gate.ok) return;
    setBusy(true);
    const res = await publishGraphic(target.template, summary);
    setBusy(false);
    if (res.error) setError(res.error);
    else onDone(true);
  };
  return (
    <div className="panel-section" style={{ outline: '2px solid var(--accent)', outlineOffset: 2, marginBottom: 14 }} data-testid="publish-sheet">
      <h3 style={{ marginTop: 0 }}>Publish “{target.name}”</h3>
      {!target.gate.ok && (
        <div className="status-bad">
          <strong>Fix before sharing:</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {target.gate.errors.map((e, i) => <li key={i}>{e.message}</li>)}
          </ul>
        </div>
      )}
      <p className="hint">Shared with other signed-in users; its fonts and images travel with it. Unpublish anytime.</p>
      <div className="row">
        <input
          className="grow"
          placeholder="One-line description — what it is, when to use it"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={140}
        />
      </div>
      {error && <p className="status-bad">{error}</p>}
      <div className="row">
        <button className="primary" disabled={busy || !target.gate.ok} onClick={() => void confirm()}>
          {busy ? 'Publishing…' : 'Publish'}
        </button>
        <button onClick={() => onDone(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

function EmptyHint({ onNew }: { onNew: () => void }) {
  return (
    <div className="panel-section">
      <h3>Nothing saved yet</h3>
      <p className="hint">
        Create a graphic with <strong>+ New project</strong> — it lands here, ready to add to a
        production, and syncs across your devices while you are signed in.
      </p>
      <button className="primary" onClick={onNew}>+ New project</button>
    </div>
  );
}
