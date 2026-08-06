import { useEffect, useMemo, useState } from 'react';
import { addShowCue, type Show } from '../../model/shows';
import { broadcastValues, type AudienceMode, type AudienceSubmission } from '../../audience/audienceTypes';
import { localAudienceFor, type LocalAudience } from '../../audience/localAudience';

/**
 * The production's AUDIENCE workspace (route `#/production/<id>/audience`, the third tab of the
 * playout dashboard — docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 5).
 *
 * WHAT IT IS: the moderation surface. Viewers send questions and comments; the operator reads
 * them, edits a BROADCAST version without touching what was actually sent, approves or rejects,
 * shortlists, and — the only exit — turns one into an ordinary cue on the rundown.
 *
 * **Nothing here airs anything.** Send to rundown creates a `ShowCue` and stops; the cue is
 * previewed and taken with the same verbs as every other cue. That is enforced by construction
 * rather than by discipline: the audience backend interface has no method that reaches the
 * command log, so there is no path from a viewer's text to Program that does not pass through
 * an operator pressing Take.
 *
 * TODAY IT RUNS ON THE LOCAL PROVIDER ONLY (`createLocalAudience`) — rehearsal, teaching, and
 * the offline e2e suite. The Supabase provider and the public /join page are the same
 * interface's second implementation and are not built yet; this surface will not change when
 * they land, which is the point of having built the seam first.
 */
export default function ProductionAudienceWorkspace({
  show,
  setShows,
}: {
  show: Show;
  setShows: (shows: Show[]) => void;
}) {
  // ONE provider per PRODUCTION, held above this component: the workspace unmounts on every
  // trip to Playout or Data, and an inbox that emptied itself on a tab switch would be the
  // PROGRAM monitor's round-trip defect wearing different clothes. Nothing durable — see
  // localAudience.ts.
  const backend = useMemo(() => localAudienceFor(show.id, show.name), [show.id, show.name]);

  const [rows, setRows] = useState<AudienceSubmission[]>([]);
  const [mode, setMode] = useState<AudienceMode>('question');
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'inbox' | 'approved' | 'shortlist' | 'all'>('inbox');
  const [note, setNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void backend.list().then((list) => {
        if (alive) setRows(list);
      });
    };
    refresh();
    const off = backend.onChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  const patch = (id: string, p: Parameters<LocalAudience['update']>[1]) => void backend.update(id, p);

  const shown = useMemo(() => {
    const ordered = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (filter === 'inbox') return ordered.filter((r) => r.status === 'new');
    if (filter === 'approved') return ordered.filter((r) => r.status === 'approved' && !r.usedAt);
    if (filter === 'shortlist') return ordered.filter((r) => r.shortlisted);
    return ordered;
  }, [rows, filter]);

  const counts = {
    inbox: rows.filter((r) => r.status === 'new').length,
    approved: rows.filter((r) => r.status === 'approved' && !r.usedAt).length,
    shortlist: rows.filter((r) => r.shortlisted).length,
    all: rows.length,
  };

  /**
   * THE ONE EXIT: a submission becomes an ordinary cue at the end of the rundown.
   *
   * The values are matched to the target graphic's fields BY TITLE, the same by-the-words
   * binding a dataset row uses — an audience card titles its fields "Message" and "Name", so a
   * question lands in the right slots with no mapping UI and no per-template special case. A
   * graphic that carries neither still gets a cue, with the text in its first text field, which
   * is honest: the operator can see where it went.
   */
  const sendToRundown = (row: AudienceSubmission) => {
    const target = show.graphics[0];
    if (!target) {
      setNote('This production has no graphics yet — add one, then send a question to it.');
      return;
    }
    const { author, body } = broadcastValues(row);
    const fields = target.template.fields ?? [];
    const byTitle = (...wanted: string[]): string | null => {
      for (const f of fields) {
        const title = (f.title ?? '').trim().toLowerCase();
        if (wanted.some((w) => title === w)) return f.field;
      }
      return null;
    };
    const bodyField = byTitle('message', 'question', 'comment', 'body', 'text') ?? fields.find((f) => f.ftype === 'textfield' || f.ftype === 'textarea')?.field ?? null;
    const authorField = byTitle('name', 'author', 'from', 'sender');
    const values: Record<string, string> = {};
    if (bodyField) values[bodyField] = body;
    if (authorField) values[authorField] = author;
    if (!bodyField) {
      setNote(`“${target.name}” has no text field to put a message in — pick a graphic that does.`);
      return;
    }
    const label = body.length > 40 ? `${body.slice(0, 40)}…` : body;
    setShows(addShowCue(show.id, target.id, { label, values }).shows);
    patch(row.id, { status: 'approved', usedAt: new Date().toISOString() });
    setNote(`✓ Added a cue to the rundown for “${target.name}”. It airs when you Take it — nothing has gone out.`);
  };

  return (
    <section className="pd-audience" data-testid="production-audience">
      <div className="pd-data-head">
        <h2>Audience</h2>
        <p className="hint">
          What viewers sent in. Nothing here goes on air by itself: you edit a broadcast version,
          approve it, and send it to the rundown as a normal cue.
        </p>
      </div>

      <div className="pd-aud-bar">
        <label className="pd-aud-open">
          <input
            type="checkbox"
            checked={open}
            onChange={(e) => {
              setOpen(e.target.checked);
              void backend.setState({ open: e.target.checked });
            }}
            data-testid="audience-open"
          />
          Accepting messages
        </label>
        <select
          value={mode}
          onChange={(e) => {
            const next = e.target.value as AudienceMode;
            setMode(next);
            void backend.setState({ mode: next });
          }}
          data-testid="audience-mode"
        >
          <option value="question">Questions</option>
          <option value="comment">Comments</option>
        </select>
        <div className="spacer" />
        {/* REHEARSAL. The public join page is not built yet, and until it is this is the only
            way to exercise the workflow — which is also exactly what an operator wants before a
            show. The simulated rows are marked as such in their own text, so a rehearsal can
            never be mistaken for real material. */}
        <button onClick={() => backend.simulate(3)} data-testid="audience-simulate">
          ⟳ Simulate 3 arrivals
        </button>
      </div>

      <div className="pd-aud-filters" data-testid="audience-filters">
        {([
          ['inbox', 'Inbox'],
          ['approved', 'Approved'],
          ['shortlist', 'Shortlist'],
          ['all', 'All'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
            data-testid={`audience-filter-${id}`}
          >
            {label} ({counts[id]})
          </button>
        ))}
      </div>

      {note && (
        <p className={note.startsWith('✓') ? 'status-ok pd-data-note' : 'status-bad pd-data-note'} data-testid="audience-note">
          {note}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="hint pd-data-empty" data-testid="audience-empty">
          {open
            ? 'Nothing waiting. Messages appear here as they arrive.'
            : 'Not accepting messages yet — turn it on above, or simulate a few to rehearse.'}
        </p>
      ) : (
        <ul className="pd-aud-list" data-testid="audience-list">
          {shown.map((row) => {
            const air = broadcastValues(row);
            const edited = row.broadcastBody !== row.body || row.broadcastAuthor !== row.author;
            return (
              <li key={row.id} className={`pd-aud-row${row.usedAt ? ' used' : ''}`} data-testid={`audience-row-${row.id}`}>
                <div className="pd-aud-main">
                  <span className="pd-aud-author">{air.author}</span>
                  <span className="pd-aud-body">{air.body}</span>
                  {row.usedAt && <span className="pd-aud-used" data-testid="audience-used">on air already</span>}
                  {/* The ORIGINAL is always one click away and never editable. A moderation
                      surface that only showed the edited text would make it impossible to tell
                      a tidy-up from a rewrite. */}
                  {edited && (
                    <button
                      className="pd-aud-orig"
                      onClick={() => setExpanded((e) => (e === row.id ? null : row.id))}
                      data-testid="audience-show-original"
                    >
                      {expanded === row.id ? 'hide what was sent' : 'what was sent'}
                    </button>
                  )}
                </div>
                {expanded === row.id && (
                  <p className="hint pd-aud-original" data-testid="audience-original">
                    Sent by {row.author || 'no name'}: “{row.body}”
                  </p>
                )}
                <div className="pd-aud-edit">
                  <input
                    value={row.broadcastAuthor}
                    onChange={(e) => patch(row.id, { broadcastAuthor: e.target.value })}
                    placeholder="Name on air"
                    aria-label="Name on air"
                    disabled={row.anonymize}
                    data-testid="audience-edit-author"
                  />
                  <input
                    value={row.broadcastBody}
                    onChange={(e) => patch(row.id, { broadcastBody: e.target.value })}
                    aria-label="Message on air"
                    data-testid="audience-edit-body"
                  />
                </div>
                <div className="pd-aud-actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.anonymize}
                      onChange={(e) => patch(row.id, { anonymize: e.target.checked })}
                      data-testid="audience-anonymize"
                    />
                    Anonymous
                  </label>
                  <button
                    className={row.shortlisted ? 'active' : ''}
                    onClick={() => patch(row.id, { shortlisted: !row.shortlisted })}
                    title="Keep it back for later — not the same as approving it"
                    data-testid="audience-shortlist"
                  >
                    ★ Shortlist
                  </button>
                  <button onClick={() => patch(row.id, { status: 'approved' })} data-testid="audience-approve">
                    ✓ Approve
                  </button>
                  <button onClick={() => patch(row.id, { status: 'rejected' })} data-testid="audience-reject">
                    ✕ Reject
                  </button>
                  <div className="spacer" />
                  <button className="primary" onClick={() => sendToRundown(row)} data-testid="audience-send">
                    → Send to rundown
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
