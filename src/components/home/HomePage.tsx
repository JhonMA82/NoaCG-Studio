import { useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { useRouter, type Route } from '../../app/router';
import { syncSampleData, useTemplateStore } from '../../store/templateStore';
import { openGraphicById, useSaveUi } from '../../store/saveActions';
import { useExportUi } from '../ExportWindow';
import {
  deleteGraphic,
  duplicateGraphic,
  loadGraphics,
  updateGraphic,
  type GraphicDoc,
} from '../../model/library';
import {
  addLook,
  applyLookToTemplate,
  captureLookFromTemplate,
  deleteLook,
  importLook,
  loadLooks,
  type SavedLook,
} from '../../model/packets';
import { saveBrand } from '../../model/brand';
import { loadShows, createShow, deleteShow, type Show } from '../../model/shows';
import { outputPageUrl } from '../../control/hostedControl';
import {
  deleteSavedVideoProject,
  listSavedVideoProjects,
  saveCurrentVideoProject,
  type SavedVideoRecord,
} from '../../model/videoProject';
import { useDocKindStore } from '../../store/docKindStore';
import { slug } from '../../export/common';
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
import GraphicThumb from './GraphicThumb';

/**
 * Copy text, answering whether it actually landed. A clipboard write can be REFUSED — permission
 * denied, or a page served over plain http, where `navigator.clipboard` is not there at all — and
 * a button that claims "Copied" when nothing was is worse than one that says nothing. Also keeps
 * the refusal from surfacing as an unhandled rejection.
 */
export function copyLink(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}

/** A saved graphic's thumbnail shows the data an operator last selected, when there is one. */
function activeValues(g: GraphicDoc): Record<string, string> | undefined {
  return g.entries.find((e) => e.id === g.activeEntryId)?.values;
}

type Section = 'recent' | 'graphics' | 'controls' | 'productions' | 'videos' | 'looks';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'recent', label: 'Recent', icon: '🕘' },
  { id: 'graphics', label: 'Graphics', icon: '◫' },
  { id: 'controls', label: 'Control panels', icon: '🎛' },
  // Productions replaced Rundowns (docs/CLOUD_PLAYOUT.md): the same Show records, now with a
  // cue rundown, a persistent browser-output URL, and their own page (#/production/<id>).
  { id: 'productions', label: 'Productions', icon: '📺' },
  { id: 'videos', label: 'Videos', icon: '🎬' },
  { id: 'looks', label: 'Brand looks', icon: '🎨' },
];

/**
 * HOME (docs/SAVED_CONTENT_MODEL.md §3) — the routed dashboard over everything saved:
 * recent work, the graphics library, control panels, productions, videos, and brand looks.
 * (Packages are retired - docs/GOALS.md "Student release" step 3: a PRODUCTION is the one
 * grouping, and the flat library carries everything else.)
 * Local-first and open to everyone (auth posture: no gate — sign-in only adds sync).
 * Rendered for `#/home[/<section>]`; browser Back/Forward walk it like any pages.
 */
export default function HomePage({ route }: { route: Route }) {
  const navigate = useRouter((s) => s.navigate);
  const requestSwitch = useSaveUi((s) => s.requestSwitch);
  const workingName = useTemplateStore((s) => s.template.name);
  const workingSaved = useTemplateStore((s) => s.saved);

  // One nonce refreshes every list after any mutation (the model layer is the store).
  const [rev, setRev] = useState(0);
  const refresh = () => setRev((r) => r + 1);
  /* eslint-disable react-hooks/exhaustive-deps */
  const graphics = useMemo(() => loadGraphics().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [rev]);
  const looks = useMemo(() => loadLooks(), [rev]);
  const rundowns = useMemo(() => loadShows(), [rev]);
  const videos = useMemo(() => listSavedVideoProjects(), [rev]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q ? graphics.filter((g) => g.name.toLowerCase().includes(q)) : graphics;

  // Community publishing (moved here from the retired packet manager): only surfaces with a
  // configured backend AND a signed-in account — the offline app grows zero community UI.
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

  const section: Section =
    route.view === 'home' && SECTIONS.some((s) => s.id === route.section)
      ? (route.section as Section)
      : 'recent';

  const openGraphic = (g: GraphicDoc) => {
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

  return (
    <div className="app home-page" data-testid="home-page">
      <header className="topbar">
        <button className="brand brand-home" onClick={() => navigate({ view: 'editor' })} title="Back to the editor">
          <BrandLogo size={24} />
        </button>
        <span className="divider-dot" aria-hidden="true">·</span>
        <span className="tpl-name">Home</span>
        <div className="spacer" />
        <button
          onClick={() => navigate({ view: 'editor' })}
          data-testid="home-continue-editing"
          title="Back to the graphic open in the editor"
        >
          ↩ Continue editing <strong style={{ marginLeft: 4 }}>{workingName}</strong>
          {workingSaved.dirty ? ' •' : ''}
        </button>
        <button className="primary" onClick={() => navigate({ view: 'new' })} data-testid="home-new-project">
          + New project
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
              onClick={() => navigate(s.id === 'recent' ? { view: 'home', section: null } : { view: 'home', section: s.id })}
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
          <>
              {(section === 'graphics' || section === 'recent') && (
                <div className="home-search row">
                  <input
                    className="grow"
                    placeholder="Search graphics…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    data-testid="home-search"
                  />
                </div>
              )}

              {section === 'recent' && (
                <>
                  <h2>Recent work</h2>
                  {filtered.length === 0 && videos.length === 0 && (
                    <EmptyHint onNew={() => navigate({ view: 'new' })} />
                  )}
                  <GraphicList
                    graphics={filtered.slice(0, 8)}
                    onOpen={openGraphic}
                    onChanged={refresh}
                  />
                  {filtered.length > 8 && (
                    <button className="link-inline" onClick={() => navigate({ view: 'home', section: 'graphics' })}>
                      View all {filtered.length} graphics →
                    </button>
                  )}
                  {videos.length > 0 && (
                    <>
                      <h2 style={{ marginTop: 18 }}>Recent videos</h2>
                      <VideoList videos={videos.slice(0, 4)} onOpen={openVideo} onChanged={refresh} />
                    </>
                  )}
                </>
              )}

              {section === 'graphics' && (
                <>
                  <h2>Graphics <span className="muted">({filtered.length})</span></h2>
                  {filtered.length === 0 && <EmptyHint onNew={() => navigate({ view: 'new' })} />}
                  <GraphicList
                    graphics={filtered}
                    onOpen={openGraphic}
                    onChanged={refresh}
                    onPublish={communityOn ? (g) => setPublish({ name: g.name, template: g.template, gate: publishGate(g.template) }) : undefined}
                  />
                  {communityOn && mySubs.length > 0 && (
                    <div className="panel-section" style={{ marginTop: 14 }}>
                      <h3>🌐 My community templates</h3>
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
                          >
                            {copiedSub === s.id ? '✓ Copied' : '🔗'}
                          </button>
                          <button onClick={() => { void unpublish(s.id).then(refresh); }} title="Remove from the community">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {section === 'controls' && (
                <>
                  <h2>Control panels</h2>
                  <p className="hint">
                    Every saved graphic has a control panel: its fields, its saved entries, and
                    the buttons its state machine defines — for rehearsing here and for driving
                    the exported graphic live.
                  </p>
                  {graphics.length === 0 && <EmptyHint onNew={() => navigate({ view: 'new' })} />}
                  {graphics.map((g) => (
                    <div className="pk-graphic" key={g.id}>
                      <strong>{g.name}</strong>
                      <span className="muted">
                        {g.entries.length} entr{g.entries.length === 1 ? 'y' : 'ies'}
                      </span>
                      <div className="spacer" />
                      <button
                        className="primary"
                        onClick={() => navigate({ view: 'control', id: g.id })}
                        data-testid={`open-control-${g.id}`}
                      >
                        🎛 Open control panel
                      </button>
                    </div>
                  ))}
                </>
              )}

              {section === 'productions' && (
                <ProductionsSection
                  productions={rundowns}
                  onOpen={(p) => navigate({ view: 'production', id: p.id })}
                  onChanged={refresh}
                />
              )}

              {section === 'videos' && (
                <>
                  <h2>Videos <span className="muted">({videos.length})</span></h2>
                  <p className="hint">
                    Standalone AI video / animation projects — separate from live broadcast
                    graphics. The video editor has its own workspace.
                  </p>
                  {videos.length === 0 && (
                    <p className="hint">Nothing yet — create one with “Video or animation with AI” in the wizard.</p>
                  )}
                  <VideoList videos={videos} onOpen={openVideo} onChanged={refresh} />
                </>
              )}

              {section === 'looks' && <LooksSection looks={looks} onChanged={refresh} onDone={() => navigate({ view: 'editor' })} />}
          </>
        </main>
      </div>

      {/* The guard + save dialogs can appear over Home too (e.g. opening a graphic while the
          editor holds unsaved work), and account features need their sign-in dialog. */}
      <SaveDialogs />
      <SignInDialog />
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
        Create a graphic and press 💾 Save in the editor — it appears here, and syncs across
        your devices while you are signed in.
      </p>
      <button className="primary" onClick={onNew}>+ New project</button>
    </div>
  );
}

/** One graphic row with the full action set: open, control panel, rename, duplicate, delete. */
function GraphicRow({
  g,
  onOpen,
  onChanged,
  onPublish,
}: {
  g: GraphicDoc;
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  /** Present only when community publishing is available (backend + signed in). */
  onPublish?: (g: GraphicDoc) => void;
}) {
  const navigate = useRouter((s) => s.navigate);
  const openExport = useExportUi((s) => s.openExport);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(g.name);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  const commitRename = () => {
    setRenaming(false);
    if (name.trim() && name.trim() !== g.name) {
      updateGraphic(g.id, { name: name.trim() });
      // The open working copy keeps its own name until re-opened; the row updates now.
      onChanged();
    }
  };

  return (
    <div className="pk-graphic" data-testid={`graphic-row-${g.id}`}>
      <GraphicThumb template={g.template} values={activeValues(g)} label={g.name} />
      <div className="pk-info">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setName(g.name); setRenaming(false); }
            }}
            data-testid="rename-input"
          />
        ) : (
          <strong>{g.name}</strong>
        )}
        <span className="muted">
          {g.type}
          {' · '}
          {new Date(g.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="spacer" />
      <div className="pk-actions">
          <button className="primary" onClick={() => onOpen(g)} title="Open in the editor" data-testid="open-graphic">
            Open
          </button>
          <button onClick={() => navigate({ view: 'control', id: g.id })} title="Open its control panel">🎛</button>
          {/* Export without opening the editor first. The same window the wizard finishes
              into, over this record's own template + its active entry's values. */}
          <button
            onClick={() =>
              openExport({
                template: g.template,
                sampleData: syncSampleData(g.template, activeValues(g) ?? {}),
                graphicId: g.id,
              })
            }
            title="Export this graphic"
            data-testid="export-graphic"
          >
            ⬇
          </button>
          <button onClick={() => { setName(g.name); setRenaming(true); }} title="Rename">✎</button>
          <button
            onClick={() => { duplicateGraphic(g.id); onChanged(); }}
            title="Duplicate"
          >
            ⧉
          </button>
          {onPublish && (
            <button onClick={() => onPublish(g)} title="Publish to the community" data-testid="publish-graphic">🌐</button>
          )}
          <button
            className={deleteArmed ? 'reset-armed' : ''}
            onClick={() => {
              if (deleteArmed) {
                if (deleteTimer.current) clearTimeout(deleteTimer.current);
                setDeleteArmed(false);
                deleteGraphic(g.id);
                onChanged();
              } else {
                setDeleteArmed(true);
                if (deleteTimer.current) clearTimeout(deleteTimer.current);
                deleteTimer.current = setTimeout(() => setDeleteArmed(false), 3500);
              }
            }}
            title={deleteArmed ? 'Click again to delete this graphic' : 'Delete'}
            data-testid="delete-graphic"
          >
            {deleteArmed ? 'Delete?' : '🗑'}
          </button>
      </div>
    </div>
  );
}

function GraphicList({
  graphics,
  onOpen,
  onChanged,
  onPublish,
}: {
  graphics: GraphicDoc[];
  onOpen: (g: GraphicDoc) => void;
  onChanged: () => void;
  onPublish?: (g: GraphicDoc) => void;
}) {
  return (
    <>
      {graphics.map((g) => (
        <GraphicRow
          key={g.id}
          g={g}
          onOpen={onOpen}
          onChanged={onChanged}
          onPublish={onPublish}
        />
      ))}
    </>
  );
}

/**
 * The Productions Home section (docs/CLOUD_PLAYOUT.md §5): create and open productions — the
 * live unit over the Show record. Unlike the old Rundowns section this is a first-class door:
 * everything about one production (graphics, cues, publish, links, operating) lives on its own
 * page at #/production/<id>; the editor's Rehearse panel keeps its "add current graphic" hook.
 */
function ProductionsSection({
  productions,
  onOpen,
  onChanged,
}: {
  productions: Show[];
  onOpen: (p: Show) => void;
  onChanged: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  return (
    <>
      <h2>Productions</h2>
      <p className="hint">
        A production is the live unit: its graphics, a prepared CUE rundown, one persistent
        browser-<strong>output URL</strong> for CasparCG/OBS/vMix, and one <strong>control
        page</strong> for operating — see each production’s page for all of it.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          value={newName}
          placeholder="New production name…"
          onChange={(e) => setNewName(e.target.value)}
          data-testid="new-production-name"
        />
        <button
          className="primary"
          disabled={!newName.trim()}
          onClick={() => {
            const next = createShow(newName);
            setNewName('');
            onChanged();
            const made = next[next.length - 1];
            if (made) onOpen(made);
          }}
          data-testid="new-production"
        >
          ＋ Create
        </button>
      </div>
      {productions.length === 0 && (
        <p className="hint" data-testid="no-productions">No productions yet — create one above, then add graphics and cues.</p>
      )}
      {productions.map((r) => (
        <div className="pk-graphic" key={r.id} data-testid={`production-row-${r.id}`}>
          <strong>📺 {r.name}</strong>
          <span className="muted">
            {r.graphics.length} graphic{r.graphics.length === 1 ? '' : 's'}
            {r.cues?.length ? ` · ${r.cues.length} cue${r.cues.length === 1 ? '' : 's'}` : ''}
            {r.hostedSlug ? ' · 🌐 live' : ''}
          </span>
          <div className="spacer" />
          {r.outputSlug && (
            <button
              onClick={() => {
                void copyLink(outputPageUrl(r.outputSlug!)).then((ok) => {
                  if (!ok) return;
                  setCopiedLink(r.id);
                  setTimeout(() => setCopiedLink((c) => (c === r.id ? null : c)), 2000);
                });
              }}
              title="Copy the browser-output URL (the one your playout client loads)"
            >
              {copiedLink === r.id ? '✓ Copied' : '🔗 Output URL'}
            </button>
          )}
          <button className="primary" onClick={() => onOpen(r)} data-testid="open-production">
            Open
          </button>
          {confirmDelete === r.id ? (
            <button
              className="destructive"
              onClick={() => { deleteShow(r.id); setConfirmDelete(null); onChanged(); }}
              title="Delete this production (its graphics stay saved wherever else they live)"
            >
              Delete?
            </button>
          ) : (
            <button onClick={() => setConfirmDelete(r.id)} title="Delete this production">🗑</button>
          )}
        </div>
      ))}
    </>
  );
}

function VideoList({
  videos,
  onOpen,
  onChanged,
}: {
  videos: SavedVideoRecord[];
  onOpen: (v: SavedVideoRecord) => void;
  onChanged: () => void;
}) {
  return (
    <>
      {videos.map((v) => (
        <div className="pk-graphic" key={v.id}>
          <div className="pk-info">
            <strong>{v.name}</strong>
            <span className="muted">{v.project.engine} · {new Date(v.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="spacer" />
          <div className="pk-actions">
            <button className="primary" onClick={() => onOpen(v)} title="Open in the video editor">Open</button>
            <button onClick={() => { deleteSavedVideoProject(v.id); onChanged(); }} title="Delete">🗑</button>
          </div>
        </div>
      ))}
    </>
  );
}

function LooksSection({ looks, onChanged, onDone }: { looks: SavedLook[]; onChanged: () => void; onDone: () => void }) {
  const template = useTemplateStore((s) => s.template);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const [newLookName, setNewLookName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const onImportLook = async (file: File | undefined) => {
    if (!file) return;
    const { error } = importLook(await file.text());
    setNote(error ?? '✓ Look imported.');
    onChanged();
  };

  return (
    <>
      <h2>Brand looks</h2>
      <p className="hint">
        A look = colors + font captured as a named brand. Apply it to the graphic open in the
        editor, or use it as the default for new graphics.
      </p>
      <div className="row">
        <input
          className="grow"
          placeholder="Look name, e.g. Channel A7 red"
          value={newLookName}
          onChange={(e) => setNewLookName(e.target.value)}
        />
        <button
          className="primary"
          onClick={() => {
            addLook(newLookName || 'My look', captureLookFromTemplate(template));
            setNewLookName('');
            setNote('✓ Look saved from the graphic open in the editor.');
            onChanged();
          }}
        >
          Save current look
        </button>
        <input
          ref={importInput}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => { void onImportLook(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button onClick={() => importInput.current?.click()} title="Import a shared .look.json file">⬆ Import…</button>
      </div>
      {looks.map((look) => (
        <div className="pk-graphic" key={look.id}>
          <span className="pk-swatches" aria-hidden>
            {[look.brand.palette.accent, look.brand.palette.panel, look.brand.palette.text].map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </span>
          <div className="pk-info">
            <strong>{look.name}</strong>
            <span className="muted">{look.brand.customFont?.family ?? look.brand.fontId ?? ''}</span>
          </div>
          <div className="spacer" />
          <div className="pk-actions">
          <button
            onClick={() => {
              applyTemplate(applyLookToTemplate(template, look.brand));
              setActiveTab('css'); // land on the retinted :root vars, highlighted like any patch
              setNote(`✓ Applied "${look.name}" to the open graphic — back in the editor now.`);
              onDone();
            }}
            title="Retint the graphic open in the editor"
          >
            Apply
          </button>
          <button
            onClick={() => { saveBrand(look.brand); setNote(`✓ "${look.name}" is now the brand for new graphics.`); }}
            title="New graphics from the wizard will match this look"
          >
            Use for new
          </button>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify({ name: look.name, brand: look.brand }, null, 2)], { type: 'application/json' });
              saveAs(blob, `${slug(look.name)}.look.json`);
            }}
            title="Download as a shareable .look.json"
          >
            ⬇
          </button>
          <button onClick={() => { deleteLook(look.id); onChanged(); }} title="Delete this look">✕</button>
          </div>
        </div>
      ))}
      {note && <p className={note.startsWith('✓') ? 'status-ok' : 'status-bad'}>{note}</p>}
    </>
  );
}
