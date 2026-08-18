/* Fight Night - official result. SPX lifecycle; no ?. or ?? (old CasparCG CEF). */

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
    entrance.set('#res-root', { autoAlpha: 1 });
    entrance.fromTo('.res-plate',
      { clipPath: 'inset(0 50% 0 50%)' },
      { clipPath: 'inset(0 0% 0 0%)', duration: 0.6, ease: 'power3.out' }, 0);
    entrance.from('.res-kicker', { autoAlpha: 0, y: -10, duration: 0.4, ease: 'power2.out' }, 0.25);
    entrance.from('.res-name', { autoAlpha: 0, y: 16, duration: 0.5, ease: 'power3.out' }, 0.32);
    entrance.from('.res-row', { autoAlpha: 0, y: 10, duration: 0.4, ease: 'power2.out' }, 0.48);
  };

  window.stop = function () {
    gsap.to('#res-root', { y: 16, autoAlpha: 0, duration: 0.38, ease: 'power2.in', onComplete: function () {
      gsap.set('#res-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
