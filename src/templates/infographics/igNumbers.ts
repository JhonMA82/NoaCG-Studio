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

/** The Number style field's title - also how Browse knows it is a setting, not content. */
export const NUMBER_STYLE_TITLE = 'Number style';

/** The number-style helpers, emitted in every infographic before the motion builders. */
export const IG_NUMBERS_JS = `// ---- Number style: how this board reads and prints figures ----

// igNordic(): true when the board's Number style field says Finnish or Swedish. Read on every
// call, never cached, so an update() that changes the field is honoured at once.
function igNordic() {
  var holder = document.querySelector('[data-number-style]');
  return !!holder && /^\\s*(fi|sv)/i.test(holder.textContent);
}

// igEnglishGroups(): does this run of digits and commas group thousands the English way -
// "124,213", "1,234,567"? A leading zero ("0,125") or a group that is not three digits ("52,3")
// makes the comma a decimal mark instead.
function igEnglishGroups(run) {
  return /^[1-9]\\d{0,2}(?:,\\d{3})+$/.test(run);
}

// igNumberSource(): operator text with its figures rewritten in the notation parseFloat reads.
// English text is returned untouched. Finnish/Swedish text loses the spaces that group digits in
// threes, and a comma between digits becomes the decimal point it is: "1 234 567" -> "1234567",
// "52,3 %" -> "52.3 %". A figure grouped the English way ("124,213", which feeds and pasted text
// carry) still reads as the whole number, so only a comma that cannot be a thousands group is
// taken as a decimal: a Finnish "12,345" with three decimals is the one reading given up for it.
function igNumberSource(text) {
  var s = String(text);
  if (!igNordic()) return s;
  return s.replace(/(\\d)[ \\u00a0\\u202f](?=\\d{3}(?!\\d))/g, '$1')
    .replace(/\\d+(?:,\\d+)+/g, function (run) {
      return igEnglishGroups(run) ? run.replace(/,/g, '') : run.replace(',', '.');
    });
}

// igReadNumber(): read the number out of operator text - tolerant of the currency marks and
// thousand separators people paste in ("€124,213" -> 124213; in Finnish style "52,3" -> 52.3).
// NaN when the text holds no number, so a list rebuild can skip the line.
function igReadNumber(text) {
  return parseFloat(igNumberSource(text).replace(/[^0-9.+-]/g, ''));
}

// parseIgNumber(): igReadNumber(), with 0 for text that holds no number.
function parseIgNumber(text) {
  var n = igReadNumber(text);
  return isNaN(n) ? 0 : n;
}

// igLeadingNumber(): the figure a readout's text starts with, in the board's style - the run of
// characters it takes and whether its thousands are grouped - or null when it starts with none.
// A Finnish figure groups with spaces, so only a space with exactly three digits after it belongs
// to the number: "52 %" keeps its " %". English keeps the reading the count builders always had.
function igLeadingNumber(text) {
  if (!igNordic()) {
    var english = /^\\s*[-+]?[0-9.,]+/.exec(text);
    return english && { run: english[0], grouped: text.indexOf(',') >= 0 };
  }
  var nordic = /^\\s*[-+]?\\d+(?:[ \\u00a0\\u202f]\\d{3}(?!\\d))*(?:[.,]\\d+)*/.exec(text);
  return nordic && { run: nordic[0], grouped: /\\d[ \\u00a0\\u202f]\\d/.test(nordic[0]) };
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

// igStyleFields(): after update() has written its values, print the bare decimal in each NUMBER
// field in the board's style. A number input sends "71.4" whatever language the operator works
// in, and a Finnish board has to show it as "71,4"; switch the board back to English and it reads
// "71.4" again rather than "71,4", which English would read as 714. Only the fields the holder
// lists as number fields are touched, so a time typed "12.30" into a text field stays as typed.
function igStyleFields() {
  var holder = document.querySelector('[data-number-style]');
  if (!holder) return;
  var mark = igNordic() ? ',' : '.';
  var ids = (holder.getAttribute('data-number-fields') || '').split(' ');
  for (var i = 0; i < ids.length; i++) {
    var el = ids[i] ? document.getElementById(ids[i]) : null;
    if (!el) continue;
    var value = el.getAttribute('data-target');
    if (value === null) value = el.textContent;
    var bare = /^\\s*[-+]?(\\d+[.,]\\d+)\\s*$/.exec(value);
    // Read as a comma, a thousands group is left alone either way: "1,234" stays a whole number
    // in English, and a Finnish "1.234" is not turned into a "1,234" that reads as 1234.
    if (!bare || igEnglishGroups(bare[1].replace('.', ','))) continue;
    var styled = value.replace(/[.,]/, mark);
    if (styled === value) continue;
    el.textContent = styled;
    el.setAttribute('data-target', styled);
  }
}`;
