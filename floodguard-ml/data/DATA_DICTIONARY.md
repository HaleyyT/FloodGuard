# FloodGuard ML Data Dictionary

This dictionary describes the feature export and the label-joined training dataset written to:

- `floodguard-ml/data/floodguard_features.csv`
- `floodguard-ml/data/floodguard_training_dataset.csv`
- `floodguard-ml/data/floodguard_features.json`

The live training target is currently `rule_derived`, not an independent real flood outcome label.

| Feature | Type | Unit | Source | Meaning | Missing handling | Used in live rule scoring | Leakage risk |
|---|---|---|---|---|---|---|---|
| `areaId` | string | n/a | area config | Stable area key for joins and grouping | never expected | no | low |
| `areaName` | string | n/a | area config | Human-readable area label | never expected | no | low |
| `observedAt` | ISO datetime | timestamp | history snapshot | Snapshot time used for chronological modelling | row dropped only if timestamp unusable | indirectly | low |
| `riskScore` | number | score 0-100 | rule engine history | Current explainable rule score at snapshot time | defaults from history record only | yes | high because it comes from rule logic |
| `ruleConcernLevel` | string | category | rule engine history | Rule-based concern label (`Low`, `Moderate`, `High`) | null becomes unknown | yes | high because it defines the current prototype label |
| `targetElevatedConcern` | integer | 0/1 | derived from `ruleConcernLevel` | Binary prototype training target | recomputed from label | yes | target field, not a predictor |
| `labelSource` | string | n/a | export contract | States whether labels are rule-derived or independently observed | fixed to `rule_derived` for now | no | low |
| `targetRuleElevated` | integer | 0/1 | derived from `ruleConcernLevel` | Explicit copy of the rule-derived training target used for joined datasets | recomputed from label | yes | target field, not a predictor |
| `ruleLabelSource` | string | n/a | dataset builder | Records the provenance of the rule-derived target | fixed to `rule_derived` for real export | no | low |
| `targetEventElevated` | integer / null | 0/1 | joined label windows | Independent or weakly independent event-style label when a curated time window overlaps the row | null when no event label window is joined | no | low as a target, but coverage is currently limited |
| `eventLabelSource` | string / null | n/a | joined label windows | Source of the joined event label, such as `manual_demo` or `warning_derived` | null when no event label is available | no | low |
| `eventLabelStrength` | string / null | weak/moderate/strong | joined label windows | Communicates how trustworthy the joined event label is | null when no event label is available | no | low |
| `eventLabelNotes` | string / null | n/a | joined label windows | Human explanation for why the event label exists | null when no event label is available | no | low |
| `eventLabelAvailable` | integer | 0/1 | dataset builder | Flags whether the row matched any curated event label window | defaults to `0` when no match exists | no | low |
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

## Joined label note

`targetEventElevated` is the preparation path toward stronger ML supervision, but the current label file is still an early scaffold. It should be treated as label-plumbing infrastructure until verified event, warning, gauge-threshold, or impact-derived windows are added.
