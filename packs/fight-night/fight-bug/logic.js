/* Fight Night - fight bug. The clock counts DOWN from the f4 field, starts when the
   bug airs, stops itself at 0:00, and RE-SYNCS whenever the operator types a new
   value + Update (the match-clock rule). gsap.ticker drives it - never setTimeout -
   so a settled preview does not tick. No ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;
  var running = false;
  var remaining = 0; // seconds
  var lastShown = '';

  function parseClock(text) {
    var m = /^(\d+):([0-5]\d)$/.exec(String(text).replace(/^\s+|\s+$/g, ''));
    if (!m) { return null; }
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function formatClock(totalSeconds) {
    var s = Math.max(0, Math.ceil(totalSeconds));
    var mm = Math.floor(s / 60);
    var ss = s - mm * 60;
    return mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function show(text) {
    var el = document.getElementById('f4');
    if (el && text !== lastShown) {
      el.textContent = text;
      lastShown = text;
    }
  }

  function tick(time, deltaMs) {
    if (!running) { return; }
    remaining -= deltaMs / 1000;
    if (remaining <= 0) {
      remaining = 0;
      running = false;
    }
    show(formatClock(remaining));
  }

  function seedFromField() {
    var el = document.getElementById('f4');
    var secs = el ? parseClock(el.textContent) : null;
    if (secs !== null) { remaining = secs; }
  }

  gsap.ticker.add(tick);

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (el) {
        if (key === 'f4') { lastShown = ''; }
        el.textContent = parsed[key];
      }
    }
    // A typed clock value is a correction: re-seed and keep counting from it.
    if ('f4' in parsed) { seedFromField(); }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    seedFromField();
    running = false;
    entrance = gsap.timeline({
      onComplete: function () { running = remaining > 0; },
    });
    entrance.set('#fb-root', { autoAlpha: 1 });
    entrance.fromTo('.fb-bar > *',
      { clipPath: 'inset(0 100% 0 0)' },
      { clipPath: 'inset(0 0% 0 0)', duration: 0.45, ease: 'power3.out', stagger: 0.06 }, 0);
  };

  window.stop = function () {
    running = false;
    gsap.to('#fb-root', { y: 12, autoAlpha: 0, duration: 0.35, ease: 'power2.in', onComplete: function () {
      gsap.set('#fb-root', { y: 0 });
    } });
  };

  window.next = function () {};
})();
