import { useMemo } from 'react';
import BrandLogo from '../../BrandLogo';
import { loadGraphics } from '../../../model/library';
import { loadShows } from '../../../model/shows';
import { hasCurrentVideoProject, listSavedVideoProjects } from '../../../model/videoProject';
import { useAdvancedMode } from '../../useAdvancedMode';

interface Props {
  onTemplates: () => void;
  onImportGraphic: () => void;
  onAi: () => void;
  onVideo: () => void;
  /** Start from a KIT: a curated set of graphics for one kind of show. */
  onKit: () => void;
  onBlank: () => void;
  /** Go to Home (all saved work: graphics, productions, control panels, videos). */
  onHome: () => void;
}

/**
 * Step 0 — the app's home moment. A branded hero states what NoaCG Studio is and who it's
 * for, then two halves: the HOME card (all saved work — the wizard is not the place to
 * browse it, Home is) and ways to start something new. Broadcast-graphics paths sit
 * together; "Video or animation with AI" is visually separated and marked Beta, because it
 * creates a STANDALONE video — not a live broadcast graphic.
 *
 * The old per-graphic "Recent" chips are gone deliberately: in the default studio they
 * opened the EDITOR, the demoted surface, and Home's rows (control page, productions,
 * export) are the honest continuation of saved work.
 *
 * "Import graphic" is deliberately its own card and a MANUAL path — no AI anywhere in it.
 * A user who designed their graphic in Photoshop wants NoaCG to make it broadcast-ready
 * (fields, animation, export), not to regenerate it. Existing .html / SPX templates (and
 * logos to design around) go through Create with AI instead.
 */
export default function EntryStep({ onTemplates, onImportGraphic, onAi, onVideo, onKit, onBlank, onHome }: Props) {
  const advanced = useAdvancedMode((s) => s.advanced);
  /** Is there anything to continue? Home holds graphics, productions and videos, so any of
   *  them counts. On a first-ever visit there is nothing, and offering the loudest card on
   *  the screen as a door to an empty room is a false lead - creation leads instead. */
  const hasSavedWork = useMemo(
    () =>
      loadGraphics().length > 0 ||
      loadShows().length > 0 ||
      listSavedVideoProjects().length > 0 ||
      hasCurrentVideoProject(),
    [],
  );

  return (
    <div className="wz-entry-wrap">
      <div className="wz-hero">
        <BrandLogo size={40} />
        <h1 className="wz-hero-title">
          Broadcast graphics, <span>built in minutes.</span>
        </h1>
        <p className="wz-hero-sub">
          Premium, on-air lower thirds, tickers, scoreboards and more — made by choosing, not
          coding. Export working templates for the tools you already run.
        </p>
        <div className="wz-hero-tags mono">
          <span>SPX</span>
          <span>CasparCG</span>
          <span>OGraf</span>
        </div>
      </div>

      {/* ── Home: saved work first — creation is not the only door. Shown only when there
             IS work to continue; see hasSavedWork. ── */}
      {hasSavedWork && (
      <div className="wz-continue" data-testid="wz-continue">
        <button className="wz-entry-card wz-continue-card" onClick={onHome} data-entry="continue">
          <span className="wz-entry-icon">🏠</span>
          <strong>Home</strong>
          <span className="hint">
            Your saved graphics, productions, control panels, and videos — pick up where you
            left off.
          </span>
        </button>
      </div>
      )}

      <div className="wz-entry">
        <button className="wz-entry-card wz-entry-card--primary" onClick={onTemplates} data-entry="template">
          <span className="wz-entry-icon">▤</span>
          <strong>Start from a template</strong>
          <span className="hint">Pick a design, choose your fields, style, and animation — then tweak the code it writes, or never open it.</span>
        </button>
        <button className="wz-entry-card" onClick={onAi} data-entry="ai">
          <span className="wz-entry-icon">✦</span>
          <strong>Create with AI</strong>
          <span className="hint">Describe the graphic you need and NoaCG turns a proven broadcast design into a customized one — drop in a logo, brand stills, or an existing .html / SPX template to convert. Choose the Lite or Pro tier in AI settings; every result is live-tested and lands as clean, editable code.</span>
        </button>
        <button className="wz-entry-card" onClick={onImportGraphic} data-entry="import-graphic">
          <span className="wz-entry-icon">▦</span>
          <strong>Import graphic</strong>
          <span className="hint">Already designed it? Bring the finished image in, place editable text on it, pick fonts and animation — no AI, you place every piece.</span>
        </button>
        <button className="wz-entry-card" onClick={onKit} data-entry="kit">
          <span className="wz-entry-icon">▥</span>
          <strong>Start from a kit</strong>
          <span className="hint">Running a match, a service, an election night? Get the whole set of graphics that show needs, created together into one production — publish or export it as one.</span>
        </button>
        {/* Blank's only outcome is the code editor, so the card is an Advanced-mode door
            (docs/GOALS.md "Student release" step 4). */}
        {advanced && (
          <button className="wz-entry-card" onClick={onBlank} data-entry="blank">
            <span className="wz-entry-icon">‹›</span>
            <strong>Blank project</strong>
            <span className="hint">A minimal valid SPX template — pure code-first, no training wheels.</span>
          </button>
        )}
      </div>

      {/* ── The video world, clearly apart: a standalone rendered video, not a live graphic. ── */}
      <div className="wz-video-strip" data-testid="wz-video-strip">
        <span className="wz-video-strip-label mono">Not a live graphic?</span>
        <button className="wz-entry-card wz-entry-card--video" onClick={onVideo} data-entry="video">
          <span className="wz-entry-icon">▶</span>
          <strong>
            Video or animation with AI <span className="wz-beta-tag">Beta</span>
          </strong>
          <span className="hint">
            Makes a standalone video or animation — a stinger, intro, logo reveal, countdown —
            that you render to a file. It opens in the separate Video workspace, not the
            broadcast-graphics editor.
          </span>
        </button>
      </div>
    </div>
  );
}
