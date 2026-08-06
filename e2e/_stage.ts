import { expect, type Page } from '@playwright/test';

/**
 * Wait for the production page's machine-state chip to report a given state.
 *
 * WHY THIS IS NOT JUST `expect(chip).toHaveText(...)`. The chip is fed asynchronously by the
 * local PROGRAM monitor: a Take posts a command into a sandboxed iframe, the runtime boots,
 * composes, runs its entrance, and only then answers the stage's state request. That whole hop
 * happens off the main thread of the test, and on a machine already running six workers it can
 * take longer than the suite's 7s `expect` budget — which is exactly how quiz-pilot.spec.ts went
 * red once under load while passing 6/6 in isolation.
 *
 * The chip has THREE phases and they are diagnostically different:
 *
 *   'not on air'            nothing is up on this layer — the Take has not landed
 *   'no state reported yet' the Take landed, the reply is still in flight
 *   '<state name>'          a state was reported
 *
 * So this waits in two bounded hops instead of one opaque one: first that a state was reported
 * AT ALL (generously, because that is the slow hop and its length is the machine's business),
 * then that it is the right one (at the default budget, because by then the answer is in hand
 * and a wrong state is a real failure, not a slow one). A failure now says WHICH hop missed —
 * "still not on air" and "reported the wrong state" are different bugs, and the single-assertion
 * form reported them identically.
 *
 * This is a wait on a precondition, not a longer sleep: nothing here is timed against a
 * debounce, and a page that answers immediately costs the poll interval and no more.
 */
export async function expectMachineState(page: Page, expected: string | RegExp): Promise<void> {
  const chip = page.getByTestId('machine-state-chip');
  await expect(chip).not.toHaveText(/^(not on air|no state reported yet)$/, { timeout: 20_000 });
  await expect(chip).toHaveText(expected);
}
