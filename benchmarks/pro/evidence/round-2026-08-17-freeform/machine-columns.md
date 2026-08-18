# Free-form coder round - the machine columns

Counts, rates and dollars only. No verdict on this page; the blind notes carry those.

|  | pro-spike-out-minimax-m2.7 | pro-spike-out-grok-4.3 | pro-spike-out-gemini-3.7-flash | pro-spike-out-claude-opus-5 | round-2026-08-16 |
|---|---|---|---|---|---|
| model | minimax/minimax-m2.7 | xai/grok-4.3 | google/gemini-3.7-flash | anthropic/claude-opus-5 | google/gemini-2.5-flash |
| cells completed / planned | 12 / 12 | 10 / 12 | 12 / 12 | 12 / 12 | 18 / 18 |
| contract ok | 10 of 12 | 10 of 10 | 12 of 12 | 12 of 12 | 18 of 18 |
| cells with blocking errors | 2 | 0 | 0 | 0 | 0 |
| repair rounds fired (total) | 8 | 2 | 2 | 0 | 0 |
| device present | 1 of 12 | 1 of 10 | 0 of 12 | 2 of 12 | 0 of 0 |
| device channels | axis 1 | axis 1 | - | shape 2 | - |
| input tokens / graphic | 11954 | 8061 | 7928 | 8218 | 1991 |
| output tokens / graphic | 6562 | 6930 | 6684 | 5116 | 2147 |
| reasoning tokens / graphic | 2275 | 4038 | 3289 | 0 | not recorded |
| reasoning share of output | 35% | 58% | 49% | 0% | not recorded |
| cost / graphic | $0.0097 | $0.0274 | $0.0310 | $0.1690 (priced) | $0.0059 |
| cost / 100 graphics | $0.97 | $2.74 | $3.10 | $16.90 (priced) | $0.59 |
| round spend | $0.1160 | $0.2740 | $0.3721 | $2.0279 (priced) | $0.1070 |
Footnotes, all about what the numbers can and cannot say:

- **claude-opus-5**: the anthropic route reports neither cost nor a reasoning split through
  the gateway. Cost is priced from usage at $5/$25 per million (the `(priced)` marker);
  "reasoning 0%" means NOT REPORTED, not "did not think".
- **grok-4.3**: the 2 failed cells (`portrait-logo.sunbeam`, `non-latin.aldervale`) hit the
  output ceiling twice - at 25,000 and again at 41,000 tokens - a reasoning runaway that never
  produced a complete answer. A throw carries no usage, so their spend is unrecorded and the
  round's true spend is higher than its ledger row.
- **round-2026-08-16** (the accepted Phase A set): "device 0 of 0" means captured before the
  device instrument existed, not measured-plain. Its cells are one design-language call each,
  which is why its token and cost rows sit an order of magnitude under the coder arms.
