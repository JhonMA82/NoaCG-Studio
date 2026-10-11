// The NUMBER STYLE every infographic reads and prints its figures in (issue #971).
//
// Two styles, chosen per board by its Number style field:
//   - English, the default and what every board did before the choice existed: "1,234.5" reads as
//     1234.5, totals print "124,213", a share prints "42%".
//   - Finnish/Swedish ("fi", "sv"): "52,3" reads as 52.3, a space or a no-break space groups the
//     thousands, totals print "124 213" (a no-break space, so a figure never wraps) and a share
//     prints "42 %".
//
// The field is a hidden holder marked `data-number-style` (infographics/shared.ts adds it to the
// boards that opt in), so the style travels with the graphic into every playout - SPX, CasparCG,
// OGraf, /output - and a production sets every board at once by binding one production-data
// value to the field.
//
// The English branch of every helper below is the code the boards ran before the style existed,
// unchanged, so an existing graphic cannot read or print a figure differently. The Finnish branch
// stays tolerant of a point: a number field and most data feeds deliver "52.3" whatever the
// operator's language, and it must still read as 52.3.
//
// Everything here is a function DECLARATION and nothing runs at load: a rebuild that runs the
// moment its script loads (dataRuntimes.ts) calls these before this block's text is reached, and
// only a hoisted declaration is defined by then.
//
// The block is plain text - no interpolation - because scripts/ig-number-style.test.mjs cuts it
// out of this file and runs it exactly as a template ships it.

/** The number-style helpers, emitted in every infographic before the motion builders. */
export const IG_NUMBERS_JS = `// ---- Number style: how this board reads and prints figures ----

// igNordic(): true when the board's Number style field says Finnish or Swedish. Read on every
// call, never cached, so an update() that changes the field is honoured at once.
function igNordic() {
  var holder = document.querySelector('[data-number-style]');
  return !!holder && /^\\s*(fi|sv)/i.test(holder.textContent);
}

// igNumberSource(): operator text with its figures rewritten in the notation parseFloat reads.
// English text is returned untouched. Finnish/Swedish text loses the spaces that group digits in
// threes and has its decimal comma turned into a point: "1 234 567" -> "1234567", "52,3 %" ->
// "52.3 %".
function igNumberSource(text) {
  var s = String(text);
  if (!igNordic()) return s;
  return s.replace(/(\\d)[ \\u00a0\\u202f](?=\\d{3}(?!\\d))/g, '$1').replace(/(\\d),(?=\\d)/g, '$1.');
}

// parseIgNumber(): read the number out of operator text - tolerant of the currency marks and
// thousand separators people paste in ("€124,213" -> 124213; in Finnish style "52,3" -> 52.3).
function parseIgNumber(text) {
  var n = parseFloat(igNumberSource(text).replace(/[^0-9.+-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// formatThousands(): a whole figure grouped in threes - "124,213", or "124 213" in Finnish style.
// Broadcast totals always group their digits.
function formatThousands(n) {
  return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, igNordic() ? '\\u00a0' : ',');
}

// igNumberText(): a figure with the board's decimal mark - "52.3", or "52,3" in Finnish style.
// Takes a number or the text toFixed() made of one.
function igNumberText(n) {
  var s = String(n);
  return igNordic() ? s.replace('.', ',') : s;
}

// igPercent(): a share with its sign - "42%", or "42 %" in Finnish style.
function igPercent(text) {
  return text + (igNordic() ? '\\u00a0%' : '%');
}

// igStyleFields(): after update() has written its values, print every bare decimal in the board's
// style. A number field and a data feed send "71.4" whatever language the operator works in, and
// a Finnish board has to show it as "71,4". English boards, and anything that is not exactly a
// decimal number, are left as they arrived.
function igStyleFields(fields) {
  if (!igNordic()) return;
  for (var key in fields) {
    var el = document.getElementById(key);
    var value = String(fields[key]);
    if (!el || !/^\\s*[-+]?\\d+\\.\\d+\\s*$/.test(value)) continue;
    var styled = value.replace('.', ',');
    el.textContent = styled;
    el.setAttribute('data-target', styled);
  }
}`;
