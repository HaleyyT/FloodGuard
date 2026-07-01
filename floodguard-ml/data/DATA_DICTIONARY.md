# FloodGuard ML Data Dictionary

This dictionary describes the Day 2 export contract written to:

- `floodguard-ml/data/floodguard_features.csv`
- `floodguard-ml/data/floodguard_features.json`

Labels are currently `rule_derived`, not independent real flood outcomes.

| Feature | Type | Unit | Source | Meaning | Missing handling | Used in live rule scoring | Leakage risk |
|---|---|---|---|---|---|---|---|
| `areaId` | string | n/a | area config | Stable area key for joins and grouping | never expected | no | low |
| `areaName` | string | n/a | area config | Human-readable area label | never expected | no | low |
| `observedAt` | ISO datetime | timestamp | history snapshot | Snapshot time used for chronological modelling | row dropped only if timestamp unusable | indirectly | low |
| `riskScore` | number | score 0-100 | rule engine history | Current explainable rule score at snapshot time | defaults from history record only | yes | high because it comes from rule logic |
| `ruleConcernLevel` | string | category | rule engine history | Rule-based concern label (`Low`, `Moderate`, `High`) | null becomes unknown | yes | high because it defines the current prototype label |
| `targetElevatedConcern` | integer | 0/1 | derived from `ruleConcernLevel` | Binary prototype training target | recomputed from label | yes | target field, not a predictor |
| `labelSource` | string | n/a | export contract | States whether labels are rule-derived or independently observed | fixed to `rule_derived` for now | no | low |
| `rainfallLatestMm` | number | mm | rainfall history | Latest mapped rainfall reading used in the snapshot | defaults to `0` | yes | low |
| `rainfall1hMm` | number | mm | risk features | Rolling 1-hour rainfall accumulation | defaults to `0` | yes | low |
| `rainfall3hMm` | number | mm | risk features | Rolling 3-hour rainfall accumulation | defaults to `0` | yes | low |
| `rainfall24hMm` | number | mm | risk features | Rolling 24-hour rainfall accumulation | defaults to `0` | yes | low |
| `rainfall72hMm` | number | mm | risk features | Rolling 72-hour rainfall accumulation | defaults to `0` | yes | low |
| `antecedentWetnessMm` | number | mm | risk features | Wet-catchment context accumulated from earlier rainfall | defaults to `0` | yes | low |
| `antecedentRainfallIndex` | number | index | risk features | Normalised wetness indicator used to express catchment preconditioning | null allowed | yes | low |
| `riverLatestM` | number | m | river history / risk features | Latest primary river height for the area | null allowed | yes | low |
| `riverDelta1hM` | number | m | risk features | One-hour river rise or fall | null allowed | yes | low |
| `riverDelta3hM` | number | m | risk features | Three-hour river rise or fall | null allowed | yes | low |
| `riverTrendCode` | integer | -1/0/1 | derived from risk features | Encodes falling, steady, or rising river tendency | null for unknown | yes | low |
| `rateOfRiseMPerHour` | number | m/h | derived from risk features | Alias for short-window river change used in modelling | null allowed | yes | low |
| `dataFreshnessScore` | number | score 0-100 | risk features | Higher values mean sources were fresher at ingestion time | defaults to `0` | yes | low |
| `sourceCoverage` | number | ratio | risk features | Share of expected inputs that were available for the snapshot | falls back to input coverage when needed | yes | low |
| `decisionReliabilityScore` | number | score 0-100 | decision audit | Confidence-style reliability assessment for the rule decision | null allowed | yes | medium because it summarises upstream evidence quality |
| `confidence` | number | ratio | risk signals | Rule-engine confidence signal based on evidence coverage and freshness | defaults to `0` | yes | medium because it is derived from live scoring context |
| `warningActive` | integer | 0/1 | warning history | Whether an official warning appeared active in the stored snapshot | null when unavailable | no | low |
| `warningStatus` | string | category | warning history | Raw warning status string kept for auditing and grouping | null when unavailable | no | low |
| `areaRelevanceScore` | number | score 0-100 | spatial relevance | How well the loaded stations matched the area’s configured signal set | defaults to `0` | indirectly | low |
| `nearestStationDistanceKm` | number | km | spatial relevance | Distance from the area to the nearest mapped station in the spatial layer | null allowed | indirectly | low |

## Leakage note

Fields such as `riskScore`, `ruleConcernLevel`, `targetElevatedConcern`, `confidence`, and `decisionReliabilityScore` are useful for baseline comparison, but they are close to the current rule engine. If later ML work aims to move beyond rule imitation, these fields should be reviewed carefully or excluded from stricter experiments.
