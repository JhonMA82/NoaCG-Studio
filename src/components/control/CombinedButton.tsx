import {
  askSteps,
  combineBlocked,
  stepWords,
  type ArmedWait,
  type CombineNow,
  type StepNames,
} from '../../control/combine';
import type { CombinedControl, ProfileStep } from '../../model/profile';

/**
 * ONE COMBINED CONTROL, as both dashboards draw it: the button, its tick list and its countdown
 * (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b, docs/PLAYOUT_DASHBOARD.md §7d).
 *
 * Shared rather than written twice because the in-app production page and the hosted control page
 * are one design (docs/CONTROL_PANEL_PARITY.md), and the part most likely to drift is exactly the
 * part written out longhand here — the three tooltips. Two copies of "Greyed because the first
 * step cannot go" would survive one edit and disagree by the second, on the two surfaces a class
 * is taught to treat as the same product.
 *
 * It holds no state and no scheduler. The page owns the run (`CombineScheduler`), the ticks and
 * the press; this draws what they currently are.
 */
export default function CombinedButton({
  control,
  now,
  names,
  wait,
  tickOn,
  onTick,
  onPress,
  testPrefix = '',
}: {
  control: CombinedControl;
  /** The production as a press would find it — what decides the greying. */
  now: CombineNow;
  /** How this surface spells the things a step points at. */
  names: StepNames;
  /** The run's remaining wait, or null when the control is not armed. */
  wait: ArmedWait | null;
  /** Whether one `ask` step's tick is on: what the operator moved it to, else its declared
   *  default. The page holds that, because it survives this component re-rendering. */
  tickOn: (index: number, declared: boolean) => boolean;
  onTick: (index: number, on: boolean) => void;
  /** Press — or, while it counts down, cancel. The page decides which; this only reports it. */
  onPress: () => void;
  /** Prefixes every test id, so the two surfaces stay tellable apart in a spec. */
  testPrefix?: string;
}) {
  const asks = askSteps(control);
  /** The step indices this press WOULD send. The greying reads it too, so a control whose first
   *  step the operator has un-ticked is judged by the step that would actually go. */
  const ticked = new Set(asks.filter((a) => tickOn(a.index, a.on)).map((a) => a.index));
  const blocked = combineBlocked(control, now, ticked);
  const delayed = control.steps.some((s) => s.after);
  const sentence = control.steps.map((s: ProfileStep) => stepWords(s, names)).join('; ');
  return (
    <span className="pd-combined" data-testid={`${testPrefix}combined-${control.id}`}>
      <button
        className={`pd-action${wait ? ' pd-combined-waiting' : ''}`}
        // While it counts down the button is a CANCEL, so it must stay pressable even when the
        // first step would now be illegal — that is the whole point of the countdown.
        disabled={!wait && !!blocked}
        title={
          wait
            ? `Press to cancel, with ${wait.steps} step${wait.steps === 1 ? '' : 's'} still to send`
            : blocked
              ? `Greyed because the first step cannot go: ${blocked}`
              : `Sends ${control.steps.length} step${control.steps.length === 1 ? '' : 's'}: ${sentence}.${
                  delayed
                    ? ' The wait runs in this browser tab, so reloading it loses any step that has not been sent yet.'
                    : ''
                }`
        }
        onClick={onPress}
        data-testid={`${testPrefix}combined-press-${control.id}`}
      >
        ⚡ {control.name}
        {/* THE SEPARATOR AND THE UNIT EARN THEIR PLACE. A bare figure after the name read as
            part of it — "Spotlight, then level 2" looked like a control called that, seen on
            the surface itself — and the whole job of the countdown is to be unmistakable. */}
        {wait && <b className="pd-combined-count"> · {Math.ceil(wait.left / 1000)}s</b>}
      </button>
      {asks.length > 0 && (
        <span className="pd-combined-asks" data-testid={`${testPrefix}combined-asks-${control.id}`}>
          {asks.map((ask) => (
            <label key={ask.index} data-testid={`${testPrefix}combined-ask-${control.id}-${ask.index}`}>
              <input
                type="checkbox"
                checked={tickOn(ask.index, ask.on)}
                onChange={(e) => onTick(ask.index, e.target.checked)}
              />
              {stepWords(ask.step, names, { marks: false })}
            </label>
          ))}
        </span>
      )}
    </span>
  );
}
