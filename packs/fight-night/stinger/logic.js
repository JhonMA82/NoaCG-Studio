/* Fight Night - stinger. One-shot sweep: play() runs the whole pass and ends
   transparent; stop() only force-clears a pass in flight. No ?. or ?? (old CEF). */

(function () {
  var pass = null;

  window.update = function () {};

  window.play = function () {
    if (pass) { pass.kill(); }
    var xIn = 1920 * 1.35;
    pass = gsap.timeline();
    pass.set('#stg-root', { autoAlpha: 1 });
    pass.set(['.stg-panel-a', '.stg-panel-b', '.stg-panel-c'], { x: -xIn });
    pass.set('.stg-mark', { autoAlpha: 0 });
    // Sweep in: accent blade leads, carbon follows, near-black seals the frame.
    pass.to('.stg-panel-b', { x: 0, duration: 0.34, ease: 'power3.in' }, 0);
    pass.to('.stg-panel-a', { x: 0, duration: 0.36, ease: 'power3.in' }, 0.05);
    pass.to('.stg-panel-c', { x: 0, duration: 0.3, ease: 'power3.in' }, 0.16);
    // The mark flashes while the frame is covered - the edit point.
    pass.to('.stg-mark', { autoAlpha: 1, duration: 0.16, ease: 'power1.out' }, 0.48);
    pass.to('.stg-mark', { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, 0.92);
    // Sweep out the same direction, blade trailing.
    pass.to('.stg-panel-c', { x: xIn, duration: 0.34, ease: 'power3.out' }, 1.0);
    pass.to('.stg-panel-a', { x: xIn, duration: 0.36, ease: 'power3.out' }, 1.06);
    pass.to('.stg-panel-b', { x: xIn, duration: 0.32, ease: 'power3.out' }, 1.14);
    pass.set('#stg-root', { autoAlpha: 0 });
    pass.set(['.stg-panel-a', '.stg-panel-b', '.stg-panel-c'], { x: -xIn });
  };

  window.stop = function () {
    if (pass) { pass.kill(); pass = null; }
    gsap.set('#stg-root', { autoAlpha: 0 });
  };

  window.next = function () {};
})();
