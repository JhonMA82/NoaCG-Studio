// A clock, frames and timers a test advances by hand, for running catalog designs in a page.
//
// GSAP reads `Date.now` and `requestAnimationFrame` when it loads, and a hidden iframe's frames
// are throttled, so real time would be both slow and flaky. `DRIVEN_CLOCK` is a <script> to put
// ahead of everything else in a composed document; it replaces the clock, the frame callback and
// the timers, and `window.__advance(ms)` then moves them in 40 ms steps. `new Date()` stays real,
// so a time-of-day readout is not driven.

export const DRIVEN_CLOCK = `<script id="test-clock">
(function () {
  var origin = 1700000000000, now = origin, seq = 0, timers = [], frames = [];
  Date.now = function () { return now; };
  performance.now = function () { return now - origin; };
  window.requestAnimationFrame = function (cb) { frames.push({ id: ++seq, cb: cb }); return seq; };
  window.cancelAnimationFrame = function (id) { frames = frames.filter(function (f) { return f.id !== id; }); };
  function add(cb, ms, args, repeat) {
    if (typeof cb !== 'function') return 0;
    var wait = Math.max(0, Number(ms) || 0);
    timers.push({ id: ++seq, cb: cb, at: now + wait, every: Math.max(1, wait), args: args, repeat: repeat });
    return seq;
  }
  window.setTimeout = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), false); };
  window.setInterval = function (cb, ms) { return add(cb, ms, [].slice.call(arguments, 2), true); };
  window.clearTimeout = window.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  // A callback that throws must not stop the others, as in a real frame.
  function run(fn, args) { try { fn.apply(window, args); } catch (e) { /* the template's own error */ } }
  window.__advance = function (ms) {
    var end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 40);
      // Capped, so a zero-delay timer that re-arms itself cannot hold one step for ever.
      for (var fired = 0; fired < 1000; fired++) {
        var due = null;
        for (var i = 0; i < timers.length; i++) if (timers[i].at <= now && (!due || timers[i].at < due.at)) due = timers[i];
        if (!due) break;
        if (due.repeat) due.at += due.every; else timers.splice(timers.indexOf(due), 1);
        run(due.cb, due.args);
      }
      var batch = frames; frames = [];
      for (var j = 0; j < batch.length; j++) run(batch[j].cb, [now - origin]);
    }
  };
})();
</script>`;
