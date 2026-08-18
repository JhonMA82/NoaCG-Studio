/* Fight Night - round card. SPX lifecycle; no ?. or ?? (old CasparCG CEF). */

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
    entrance.set('#rc-root', { autoAlpha: 1 });
    entrance.fromTo('.rc-card',
      { clipPath: 'inset(50% 0 50% 0)', scale: 0.96 },
      { clipPath: 'inset(0% 0 0% 0)', scale: 1, duration: 0.55, ease: 'power3.out' }, 0);
    entrance.from('.rc-number', { y: 26, autoAlpha: 0, duration: 0.5, ease: 'power3.out' }, 0.18);
    entrance.from(['.rc-kicker', '.rc-rule', '.rc-tag'],
      { autoAlpha: 0, duration: 0.4, ease: 'power2.out', stagger: 0.07 }, 0.3);
  };

  window.stop = function () {
    gsap.to('#rc-root', { autoAlpha: 0, duration: 0.4, ease: 'power2.in' });
    gsap.to('.rc-card', { scale: 0.97, duration: 0.4, ease: 'power2.in', onComplete: function () {
      gsap.set('.rc-card', { scale: 1 });
    } });
  };

  window.next = function () {};
})();
