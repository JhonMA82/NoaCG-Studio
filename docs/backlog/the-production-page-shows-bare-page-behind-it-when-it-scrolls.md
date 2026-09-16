---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
note: found by the HJ proof walk while scrolling to the Controls panel; cosmetic, on the surface an operator holds
found: "the production page's app background ends at 100vh while its content is taller, so scrolling shows the bare page behind the dashboard"
serves: NOW
size: small
touches: src/components/home/ProductionPage.tsx, src/styles/
needs-owner: none
---
# The production page shows bare page behind it when it scrolls

## What was measured

On the production page at a 1600×1000 viewport, with the cue editor showing a sixteen-field
graphic and the Controls panel open:

```
#root                      height 1000 px   (100vh)
.app.playout-dashboard     height 1268.5 px
document.scrollingElement  scrollHeight 1269, innerHeight 1000
no element with overflow-y auto/scroll anywhere on the page
```

So the WINDOW scrolls, the dashboard is 269 px taller than the box that paints its background, and
scrolling down to reach the Controls panel slides `#root`'s background up and leaves the page's own
ground showing above the header. It reads as a black band across the top of the app.

## Why it is worth a row

It is cosmetic, but it is on the surface a production is operated from, and it appears exactly when
an operator goes looking for the panel that authors the show's controls - the deepest thing on that
page. A panel worth building is worth reaching without the app appearing to come apart.

## What it is not

Not the Controls panel's fault: the document was already 1269 px tall with the panel collapsed. It
is the shell's height rule, so the fix belongs to whoever owns the dashboard's layout rather than
to the control-profile chain, which is why this is filed rather than fixed in that chain's own
review branch.
