# Free-form coder round - the machine columns

Counts, rates and dollars only. No verdict on this page; the blind notes carry those.

|  | pro-iterate-out-gemini-3.7-flash-rules | pro-iterate-out-anchors-rules |
|---|---|---|
| model | google/gemini-3.7-flash | catalog |
| cells completed / planned | 21 / 21 | 7 / 7 |
| contract ok | 21 of 21 | 7 of 7 |
| cells with blocking errors | 0 | 0 |
| repair rounds fired (total) | 33 | 0 |
| device present | 15 of 21 | 0 of 0 |
| device channels | shape 12, axis 11, fill 5, radius 2 | - |
| input tokens / graphic | 37248 | 0 |
| output tokens / graphic | 23385 | 0 |
| reasoning tokens / graphic | 5602 | not recorded |
| reasoning share of output | 24% | not recorded |
| cost / graphic | $0.1177 | $0.0000 |
| cost / 100 graphics | $11.77 | $0.00 |
| round spend | $2.4720 | $0.0000 |

## Per-type - pro-iterate-out-gemini-3.7-flash-rules

| type | cells | delivered clean | iterations avg | unpainted-field catches | drivable | cost / graphic |
|---|---|---|---|---|---|---|
| lower-third | 3 | 3 of 3 | 0.3 | 0 | - | $0.0419 |
| scoreboard | 3 | 3 of 3 | 1.0 | 0 | 3 of 3 | $0.0830 |
| quiz-board | 3 | 3 of 3 | 2.3 | 0 | 2 of 3 | $0.1649 |
| ticker | 3 | 3 of 3 | 1.3 | 0 | - | $0.0989 |
| stat-panel | 3 | 3 of 3 | 0.7 | 0 | - | $0.0613 |
| countdown | 3 | 1 of 3 | 3.3 | 0 | - | $0.2208 |
| podium-score | 3 | 3 of 3 | 2.0 | 0 | - | $0.1532 |

## Per-type - pro-iterate-out-anchors-rules

| type | cells | delivered clean | iterations avg | unpainted-field catches | drivable | cost / graphic |
|---|---|---|---|---|---|---|
| lower-third | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| scoreboard | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| quiz-board | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| ticker | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| stat-panel | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| countdown | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |
| podium-score | 1 | 1 of 1 | 0.0 | 0 | - | $0.0000 |

## Escape-class findings FED per type (the §22.1 classes, now measured and blocking)

Counts are blocking findings fed to the model across all rounds - what the loop CAUGHT and made it fix, not what shipped (delivered-clean cells ended at zero blocking).

| type | collision (accent/text overlap) | model-placed logo (guard) | size floor | step-frame geometry | stress-frame findings | contrast | ticker margins | safe area |
|---|---|---|---|---|---|---|---|---|
| lower-third | 0 | 0 | 1 | 0 | 1 | 1 | 0 | 0 |
| scoreboard | 0 | 0 | 5 | 0 | 3 | 0 | 0 | 0 |
| quiz-board | 0 | 0 | 11 | 5 | 9 | 3 | 0 | 6 |
| ticker | 0 | 0 | 3 | 0 | 3 | 0 | 0 | 0 |
| stat-panel | 0 | 0 | 4 | 0 | 3 | 4 | 0 | 0 |
| countdown | 0 | 0 | 8 | 0 | 8 | 3 | 0 | 0 |
| podium-score | 3 | 0 | 17 | 0 | 16 | 1 | 0 | 27 |
