/* Fight Night - fight card rundown. Rows are built from the hidden textarea field
   (#f1, one bout per line, "Red vs Blue | Division"); Next moves the highlight down
   the card and cycles. No ?. or ?? (old CasparCG CEF). */

(function () {
  var entrance = null;
  var live = -1;

  function buildRows() {
    var holder = document.getElementById('f1');
    var host = document.getElementById('fc-rows');
    if (!holder || !host) { return; }
    var lines = holder.textContent.split('\n');
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s+|\s+$/g, '');
      if (!line) { continue; }
      var parts = line.split('|');
      var bout = parts[0] ? parts[0].replace(/^\s+|\s+$/g, '') : '';
      var division = parts[1] ? parts[1].replace(/^\s+|\s+$/g, '') : '';
      html += '<div class="fc-row"><span class="fc-bout"></span>' +
        (division ? '<span class="fc-division"></span>' : '') + '</div>';
      // Text lands via textContent below - never through innerHTML - so operator
      // input can't inject markup.
      void bout;
    }
    host.innerHTML = html;
    var rows = host.querySelectorAll('.fc-row');
    var r = 0;
    for (var j = 0; j < lines.length; j++) {
      var l = lines[j].replace(/^\s+|\s+$/g, '');
      if (!l) { continue; }
      var p = l.split('|');
      var row = rows[r];
      if (row) {
        row.querySelector('.fc-bout').textContent = p[0] ? p[0].replace(/^\s+|\s+$/g, '') : '';
        var div = row.querySelector('.fc-division');
        if (div) { div.textContent = p[1] ? p[1].replace(/^\s+|\s+$/g, '') : ''; }
      }
      r += 1;
    }
    highlight(live);
  }

  function highlight(index) {
    var rows = document.querySelectorAll('.fc-row');
    for (var i = 0; i < rows.length; i++) {
      if (i === index) { rows[i].className = 'fc-row fc-live'; }
      else { rows[i].className = 'fc-row'; }
    }
  }

  window.update = function (data) {
    var parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed) { return; }
    for (var key in parsed) {
      var el = document.getElementById(key);
      if (el) { el.textContent = parsed[key]; }
    }
    if ('f1' in parsed) { buildRows(); }
  };

  window.play = function () {
    if (entrance) { entrance.kill(); }
    live = -1;
    buildRows();
    entrance = gsap.timeline();
    entrance.set('#fc-root', { autoAlpha: 1 });
    entrance.fromTo('.fc-panel',
      { clipPath: 'inset(0 0 100% 0)' },
      { clipPath: 'inset(0 0 0% 0)', duration: 0.6, ease: 'power3.out' }, 0);
    entrance.from('.fc-row', { autoAlpha: 0, x: 26, duration: 0.4, ease: 'power2.out', stagger: 0.07 }, 0.2);
  };

  window.next = function () {
    var rows = document.querySelectorAll('.fc-row');
    if (!rows.length) { return; }
    live = (live + 1) % rows.length;
    highlight(live);
  };

  window.stop = function () {
    gsap.to('#fc-root', { x: 40, autoAlpha: 0, duration: 0.45, ease: 'power2.in', onComplete: function () {
      gsap.set('#fc-root', { x: 0 });
    } });
  };
})();
