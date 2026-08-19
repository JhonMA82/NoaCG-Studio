# Two rounds' packages, read blind - notes

Open `two-rounds-sets-blind.html` (36 rows, S-01 to S-36). Each row is ONE design language
rendered as the whole package (lower third, sponsor bug, countdown) by the same platform code;
the languages come from two paid rounds on two checkpoints. Nothing on the page says which.

Write the notes BEFORE any reveal, then run:

    node scripts/pro-set-compare-gallery.mjs benchmarks/pro/evidence/round-2026-08-16 \
      benchmarks/pro/evidence/round-2026-08-17 \
      --out=benchmarks/pro/evidence/two-rounds-sets-blind.html --reveal

## What this read decides

The Pro tier's pinned model. Today it is `google/gemini-2.5-flash` (`src/ai/pro/contract.ts`);
the labelled 2026-08-17 read preferred 3.7-flash ("better taste"), but a per-item page cannot
see a BETWEEN-item property, and the machine diff says 3.7-flash's vocabulary is narrower
(solid panel on 17/18, accents 0.196 apart in OKLab vs 0.282 - plan §19.2). Decision inputs:
quality, reliability, cost (measured equal), latency, VARIETY - not variety alone. Legitimate
outcomes: switch, stay, or "rounds not comparable - run a fresh paired round".

## Pass 1 - each row as a set

Do the three graphics visibly belong to each other? Note only rows that fail or stand out.

- S-__:

## Pass 2 - across the rows

Scan the whole page. Does it hold a broad range of looks, or do many rows repeat one
vocabulary (same panel treatment, near-identical accents, one typographic voice)? If you see
a repeating cluster, name a few of its row ids - the reveal will show whether the cluster is
one checkpoint.

- Clusters / repeats:
- Overall spread verdict:

## Verdict

- Coherence (sets): 
- Variety (between rows): 
- Route decision (switch to 3.7-flash / stay on 2.5-flash / fresh paired round): 
