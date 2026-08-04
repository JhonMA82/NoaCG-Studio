/**
 * Copy text, answering whether it actually landed. A clipboard write can be REFUSED — permission
 * denied, or a page served over plain http, where `navigator.clipboard` is not there at all — and
 * a button that claims "Copied" when nothing was is worse than one that says nothing. Also keeps
 * the refusal from surfacing as an unhandled rejection.
 */
export function copyLink(text: string): Promise<boolean> {
  return navigator.clipboard?.writeText(text).then(() => true, () => false) ?? Promise.resolve(false);
}
