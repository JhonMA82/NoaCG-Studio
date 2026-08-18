/* Fight Night - judges' scorecards. play() airs the empty panel; each next()
   reveals a judge, the last one lands the winner line too. Replaying resets the
   reveals. No ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;
  var revealed = 0;

  function rows() {
    return [
      document.querySelector('.js-row[data-judge="1"]'),
      document.querySelector('.js-row[data-judge="2"]'),
      document.querySelector('.js-row[data-judge="3"]'),
    ];
  }

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
    revealed = 0;
    var all = rows();
    for (var i = 0; i < all.length; i++) {
      if (all[i]) { gsap.set(all[i], { visibility: 'hidden' }); }
    }
    gsap.set('.js-winner', { visibility: 'hidden' });
    entrance = gsap.timeline();
    entrance.set('#js-root', { autoAlpha: 1 });
    entrance.fromTo('.js-panel',
      { clipPath: 'inset(0 50% 0 50%)' },
      { clipPath: 'inset(0 0% 0 0%)', duration: 0.55, ease: 'power3.out' }, 0);
    entrance.from('.js-kicker', { autoAlpha: 0, duration: 0.4, ease: 'power2.out' }, 0.25);
  };

  window.next = function () {
    if (revealed >= 3) { return; }
    revealed += 1;
    var row = rows()[revealed - 1];
    if (row) {
      gsap.fromTo(row,
        { visibility: 'visible', autoAlpha: 0, y: -12 },
        { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' });
    }
    if (revealed === 3) {
      gsap.fromTo('.js-winner',
        { visibility: 'visible', autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out', delay: 0.5 });
    }
  };

  window.stop = function () {
    gsap.to('#js-root', { y: 16, autoAlpha: 0, duration: 0.4, ease: 'power2.in', onComplete: function () {
      gsap.set('#js-root', { y: 0 });
    } });
  };
})();
