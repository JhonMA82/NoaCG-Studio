/* Fight Night - event slate. SPX lifecycle; no ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (el) { el.textContent = parsed[key]; }
    }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    entrance = gsap.timeline();
    entrance.set('#sl-root', { autoAlpha: 1 });
    entrance.from('.sl-bg', { autoAlpha: 0, duration: 0.7, ease: 'power1.out' }, 0);
    entrance.from('.sl-blade-l', { x: -140, autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, 0.1);
    entrance.from('.sl-blade-r', { x: 140, autoAlpha: 0, duration: 0.9, ease: 'power2.out' }, 0.1);
    entrance.from('.sl-event', { y: -18, autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0.35);
    entrance.from('.sl-main', { y: 28, autoAlpha: 0, duration: 0.65, ease: 'power3.out' }, 0.45);
    entrance.from('.sl-foot', { autoAlpha: 0, duration: 0.5, ease: 'power2.out' }, 0.75);
  };

  window.stop = function () {
    gsap.to('#sl-root', { autoAlpha: 0, duration: 0.55, ease: 'power2.inOut' });
  };

  window.next = function () {};
})();
