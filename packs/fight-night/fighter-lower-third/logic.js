/* Fight Night - fighter info lower third.
   SPX lifecycle: play() / stop() / update(data). GSAP timeline; entrance is a
   left-to-right cell reveal, facts slide in after. No ?. or ?? - CasparCG 2.3.x CEF. */

(function () {
  var entrance = null;

  function cells() {
    return gsap.utils.toArray('.lt-cell');
  }

  function buildEntrance() {
    var tl = gsap.timeline({ paused: true });
    tl.set('#lt-root', { autoAlpha: 1 });
    // Cells wipe open left to right.
    tl.fromTo(
      cells(),
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 0.55, ease: 'power3.out', stagger: 0.07 },
      0
    );
    // Text settles a beat behind its cell.
    tl.from(
      ['.lt-badge-name', '.lt-badge-num', '.lt-name-line', '.lt-rec-value', '.lt-rec-label'],
      { x: -14, autoAlpha: 0, duration: 0.4, ease: 'power2.out', stagger: 0.04 },
      0.18
    );
    tl.from(
      '.lt-fact',
      { x: -18, autoAlpha: 0, duration: 0.45, ease: 'power2.out', stagger: 0.09 },
      0.34
    );
    return tl;
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (!el) { continue; }
      if (el.tagName === 'IMG') {
        if (parsed[key]) { el.src = parsed[key]; }
      } else {
        el.textContent = parsed[key];
      }
    }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    entrance = buildEntrance();
    entrance.play(0);
  };

  window.stop = function () {
    // Out: whole bar drops and fades - quick, unfussy.
    gsap.to('#lt-root', { y: 14, autoAlpha: 0, duration: 0.35, ease: 'power2.in', onComplete: function () {
      gsap.set('#lt-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
