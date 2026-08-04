import { useState, type ReactNode } from 'react';
import { IconDots } from '../icons';

export interface RowMenuItem {
  /** The menu row's label — may change while armed (e.g. Delete → "Delete?"). */
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  testid?: string;
  destructive?: boolean;
  /** Keep the menu open after the click — the first press of a two-step delete arms it and
   *  the operator must see the armed row to confirm on. */
  keepOpen?: boolean;
}

/**
 * The row OVERFLOW menu (docs/GOALS.md "Student release" step 8): a library row keeps three
 * visible actions — Open, add to a production, and this — and everything rarer lives here.
 * Seven visible buttons per row was a control surface only its author could scan.
 *
 * A plain popover, not a portal: the row grid keeps `overflow: visible` and the menu is
 * positioned against the button. The full-viewport backdrop closes it on any outside press.
 */
export default function RowMenu({ items, label = 'More actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lib-menu-host">
      <button
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        data-testid="row-menu"
      >
        <IconDots />
      </button>
      {open && (
        <>
          <div className="lib-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="lib-menu" role="menu">
            {items.map((item) => (
              <button
                key={item.label + (item.testid ?? '')}
                role="menuitem"
                className={item.destructive ? 'lib-menu-destructive' : undefined}
                onClick={() => {
                  item.onClick();
                  if (!item.keepOpen) setOpen(false);
                }}
                data-testid={item.testid}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
