/* Fight Night - live stats strip. Values are meant to change ON AIR (the ✎ Update
   verb): update() writes them with a small pop so a bumped number reads as new.
   No ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;
  var aired = false;

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (!el) { continue; }
      var changed = el.textContent !== String(parsed[key]);
      el.textContent = parsed[key];
      if (changed && aired && el.className === 'ls-val') {
        gsap.fromTo(el, { scale: 1.28, color: '#ff5a1f' },
          { scale: 1, color: '#f2f4f7', duration: 0.45, ease: 'power2.out', overwrite: 'auto' });
      }
    }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    entrance = gsap.timeline({ onComplete: function () { aired = true; } });
    aired = false;
    entrance.set('#ls-root', { autoAlpha: 1 });
    entrance.fromTo('.ls-band',
      { clipPath: 'inset(0 50% 0 50%)' },
      { clipPath: 'inset(0 0% 0 0%)', duration: 0.55, ease: 'power3.out' }, 0);
    entrance.from(['.ls-col', '.ls-labels'], { autoAlpha: 0, y: 10, duration: 0.4, ease: 'power2.out', stagger: 0.06 }, 0.24);
  };

  window.stop = function () {
    aired = false;
    gsap.to('#ls-root', { y: 16, autoAlpha: 0, duration: 0.38, ease: 'power2.in', onComplete: function () {
      gsap.set('#ls-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
