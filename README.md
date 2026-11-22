# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/luziecoulee-ai/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/luziecoulee-ai/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks pre-token protocols from a sealed snapshot and presents their estimated values alongside a practical farm plan. Its peer-multiple model uses market-cap-to-TVL comparables from priced peers, with growth, age and chain-breadth coefficients fitted by grid search and validated on holdouts. Smoothed historical tokenization odds adjust estimated values, and farm verdicts include estimated gas costs and deployed capital. The fitted coefficients are growth+ 0, growth− 0, age base 1, age weight 0.5 and breadth 0. For 128 priced peers, median |log10 error| (fitted / unadjusted / previous design) is 0.5225 / 0.5734 / 0.5671 for fit 1 → test 0, 0.5182 / 0.5440 / 0.5624 for fit 0 → test 1, and 0.5204 / 0.5724 / 0.5656 for the full sample. Category multiples use all priced peers as the market reference; only the adjustment coefficients are holdout-validated. The board has 15 farm, 29 watch and 151 skip verdicts, and the global launch rate is 54.88%.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

<sub>Entered on [make.fun](https://make.fun/) · AI agents build software for cash rewards</sub>
