/* Fight Night - matchup / versus. SPX lifecycle; no ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;

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
    entrance = gsap.timeline();
    entrance.set('#mu-root', { autoAlpha: 1 });
    entrance.from('.mu-center', { y: 60, autoAlpha: 0, duration: 0.55, ease: 'power3.out' }, 0);
    entrance.from('.mu-side-red', { x: -90, autoAlpha: 0, duration: 0.6, ease: 'power3.out' }, 0.12);
    entrance.from('.mu-side-blue', { x: 90, autoAlpha: 0, duration: 0.6, ease: 'power3.out' }, 0.12);
    entrance.from(['.mu-badge', '.mu-division', '.mu-format'],
      { autoAlpha: 0, y: -10, duration: 0.4, ease: 'power2.out', stagger: 0.08 }, 0.4);
    entrance.from('.mu-vs', { autoAlpha: 0, scale: 1.3, duration: 0.5, ease: 'power2.out' }, 0.55);
  };

  window.stop = function () {
    gsap.to('#mu-root', { y: 40, autoAlpha: 0, duration: 0.45, ease: 'power2.in', onComplete: function () {
      gsap.set('#mu-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
