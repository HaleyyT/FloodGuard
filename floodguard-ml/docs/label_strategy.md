# FloodGuard Label Strategy

FloodGuard's current Python ML layer is real, but the training supervision is still limited. This document separates the labels we have now from the labels we ultimately need.

## Current position

- The live prototype training target is still rule-derived.
- The rule engine remains the operational authority.
- Joined event labels are being added as a preparation layer, not as proof of validated flood prediction.
- ML stays shadow mode until stronger labels and event coverage exist.
- Supervision quality means how trustworthy the training labels are, not whether the Python pipeline runs.

## Label types

| Label type | Example | Strength | Why it matters |
|---|---|---|---|
| `rule_derived` | `Low` / `Moderate` / `High` from FloodGuard rule engine | weak | Useful for plumbing and model-comparison baselines, but models may simply imitate the rule engine |
| `warning_derived` | official warning active during a time window | moderate | Better than rule-only labels, but often broad in space and time |
| `event_period` | known historical flood or severe-weather period | moderate | Useful weakly independent event signal when exact impact timing is unavailable |
| `gauge_threshold` | river or rainfall threshold crossed using defensible local calibration | moderate to strong | Stronger if domain experts approve the threshold logic |
| `impact_derived` | road closure, verified report, observed inundation, council evidence | strong | Closest to real-world impact and best for meaningful validation |

## Review status

FloodGuard now tracks whether a label is only scaffolding, still under review, or strong enough to be considered for shadow-mode event supervision.

| Review status | Meaning |
|---|---|
| `scaffold_only` | proves the join/reporting pipeline works, but must not be treated as validation evidence |
| `candidate_review` | plausible event window or warning period that still needs evidence review |
| `reviewed_for_shadow_mode` | reviewed enough to support shadow-mode event supervision, but not operational promotion |
| `expert_validated` | strongest available status; still not equivalent to official emergency authority |

## Backlog review contract

The event backlog now also tracks:

| Field | Meaning |
|---|---|
| `independence_level` | how independent the label is from FloodGuard's own rule engine |
| `review_priority` | how urgently the row should be reviewed for calibration or holdout use |
| `join_status` | whether the row is backlog-only, already joined into `labels.csv`, or intentionally excluded |
| `promotion_ready` | whether the row is strong enough to be considered for the next supervision upgrade step |
| `evidence_link` | pointer to the supporting note, warning, report, or future evidence artifact |

This keeps backlog planning separate from joined validation rows and helps FloodGuard report what is merely a candidate versus what is actually reviewable supervision.

## Recommended targets

Primary future target:

```text
target_event_elevated = 1 when a known flood, warning, or impact event overlaps the area and time window
```

Current prototype target:

```text
target_rule_elevated = 1 when FloodGuard rule concern is Moderate or High
```

FloodGuard should keep both targets, but never blur them together in reporting.

## Current dataset contract

The label-joined training dataset now carries:

- `targetRuleElevated`
- `targetEventElevated`
- `ruleLabelSource`
- `eventLabelSource`
- `eventLabelStrength`
- `eventLabelNotes`
- `eventLabelAvailable`

The pipeline still trains on the rule-derived target for now, while tracking event-label availability separately.

FloodGuard should only switch to event-style supervision when:

1. enough labelled rows exist;
2. enough elevated examples exist;
3. the label strengths are not all weak; and
4. the review status is stronger than `scaffold_only` / `candidate_review`.

## Honest limitation

The current `labels.csv` file is an initial scaffold that proves label joins and reporting work. It is not yet a strong independent flood-outcome dataset.

## Next upgrade path

1. Add verified warning windows for known severe-weather periods.
2. Add curated event-period labels for historical flood-relevant dates.
3. Add gauge-threshold labels only after hydrologist or council review.
4. Add impact-derived labels from verified reports, road closures, or council evidence.
5. Switch evaluation emphasis from rule-derived imitation toward event-based validation when coverage is strong enough.
