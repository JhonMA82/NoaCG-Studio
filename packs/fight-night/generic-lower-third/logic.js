/* Fight Night - generic lower third. SPX lifecycle; no ?. or ?? (old CasparCG CEF). */

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
    entrance.set('#glt-root', { autoAlpha: 1 });
    entrance.fromTo('.glt-bar',
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'power3.out' }, 0);
    entrance.from('.glt-name', { x: -16, autoAlpha: 0, duration: 0.4, ease: 'power2.out' }, 0.16);
    entrance.from('.glt-role', { x: -16, autoAlpha: 0, duration: 0.4, ease: 'power2.out' }, 0.24);
  };

  window.stop = function () {
    gsap.to('#glt-root', { y: 14, autoAlpha: 0, duration: 0.35, ease: 'power2.in', onComplete: function () {
      gsap.set('#glt-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
