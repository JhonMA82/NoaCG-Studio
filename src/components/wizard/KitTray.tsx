import { useEffect, useRef } from 'react';
import MiniPreview from './MiniPreview';
import type { KitPlan } from './kitPlan';

/**
 * THE KIT TRAY — the second axis of progress, above the form column.
 *
 * The 216px rail already says where you are INSIDE one graphic; the tray says which graphic of
 * the set you are on. Two axes, one vocabulary: the chip's mark is the rail's `.wz-dot-num`
 * square (number, or a green ✓ once it is behind you), the current chip carries the rail's
 * amber active treatment, and a pending one is dimmed exactly as a disabled rail step is. A
 * reader who has understood the rail has already understood this.
 *
 * A DONE chip carries a LIVE thumbnail of the graphic as it was actually built — the whole
 * promise of a kit is that the set shares one look, and a row of names cannot show that. It is
 * `MiniPreview` in `lazy` mode: a big kit is thirty-odd built templates in one scroller, so a
 * chip mounts its iframe only when it scrolls into view.
 *
 * Chips are NOT navigation. Going back to a finished graphic would mean re-opening a template
 * that is already built and re-deciding whether its look still propagates — a second, quieter
 * way to answer the question the look card asks out loud. The tray reports; the rail and the
 * footer move.
 */
export default function KitTray({ plan }: { plan: KitPlan }) {
  const currentRef = useRef<HTMLLIElement>(null);
  // Keep the graphic being worked on in view: past the first handful of chips the strip
  // scrolls, and a tray whose current chip is off to the left reports nothing. Destructured
  // because a `plan.current` dependency is a property read on a prop object, which the hook
  // linter cannot see change.
  const current = plan.current;
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [current]);

  return (
    <div className="wz-kit-tray" data-testid="kit-tray">
      <p className="wz-kit-tray-label mono">
        {plan.pack.name} · graphic {Math.min(plan.current + 1, plan.items.length)} of {plan.items.length}
      </p>
      <ol className="wz-kit-tray-strip">
        {plan.items.map((item, i) => {
          const built = plan.built[i];
          const state = built ? 'done' : i === plan.current ? 'current' : 'pending';
          return (
            <li
              key={`${item.variant.id}-${i}`}
              ref={i === plan.current ? currentRef : undefined}
              className={`wz-kit-chip is-${state}`}
              data-kit-chip={item.variant.id}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="wz-kit-chip-thumb">
                {built ? <MiniPreview template={built} lazy /> : null}
              </span>
              <span className="wz-kit-chip-mark" aria-hidden="true">
                {built ? '✓' : i + 1}
              </span>
              <span className="wz-kit-chip-name">{item.variant.name}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
