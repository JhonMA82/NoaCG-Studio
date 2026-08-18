/* Fight Night - tale of the tape. Rows cascade in on play; no ?. or ?? (old CEF). */

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
    entrance.set('#tt-root', { autoAlpha: 1 });
    entrance.fromTo('.tt-head',
      { clipPath: 'inset(0 50% 0 50%)' },
      { clipPath: 'inset(0 0% 0 0%)', duration: 0.55, ease: 'power3.out' }, 0);
    entrance.from('.tt-row',
      { autoAlpha: 0, y: -14, duration: 0.42, ease: 'power2.out', stagger: 0.09 }, 0.28);
    entrance.from(['.tt-headname', '.tt-division'],
      { autoAlpha: 0, duration: 0.4, ease: 'power2.out', stagger: 0.05 }, 0.2);
  };

  window.stop = function () {
    gsap.to('#tt-root', { autoAlpha: 0, duration: 0.45, ease: 'power2.in' });
  };

  window.next = function () {};
})();
