# FloodGuard Event Evidence Review Queue

This report highlights the current best candidate event windows for human evidence review.

## Queue Summary

- Candidate windows in queue: 26
- High-priority candidate windows: 2
- Windows with real evidence links: 0
- Windows still using placeholder evidence: 2
- Windows currently eligible to become `reviewed_for_shadow_mode`: 0

## Top Candidate Windows

### Candidate elevated warning window for review

- Area: `parramatta`
- Window: `2026-06-29 00:00:00+00:00` to `2026-06-29 12:00:00+00:00`
- Supervision kind: `warning-derived`
- Label strength: `moderate`
- Review status: `candidate_review`
- Evidence link real: `False`
- Evidence link placeholder: `True`
- Area match status: `area_mapping_missing`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Replace placeholder link with a real warning archive, gauge record, council report, road closure notice, or verified local impact source.

### Candidate local impact window for review

- Area: `toongabbie`
- Window: `2026-06-30 00:00:00+00:00` to `2026-06-30 06:00:00+00:00`
- Supervision kind: `impact-derived`
- Label strength: `weak`
- Review status: `candidate_review`
- Evidence link real: `False`
- Evidence link placeholder: `True`
- Area match status: `area_mapping_missing`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Replace placeholder link with a real warning archive, gauge record, council report, road closure notice, or verified local impact source.

### North Parramatta gauge-threshold candidate window

- Area: `north-parramatta`
- Window: `2026-06-12 05:24:44.242000+00:00` to `2026-06-12 05:24:44.242000+00:00`
- Supervision kind: `gauge-threshold`
- Label strength: `weak`
- Review status: `candidate_review`
- Evidence link real: `False`
- Evidence link placeholder: `False`
- Area match status: `direct_history_match`
- Time window status: `instant_window_review`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Add a real evidence link before this label can be considered for review.

### North Parramatta gauge-threshold candidate window

- Area: `north-parramatta`
- Window: `2026-06-13 06:44:51.865000+00:00` to `2026-06-13 06:54:32.863000+00:00`
- Supervision kind: `gauge-threshold`
- Label strength: `weak`
- Review status: `candidate_review`
- Evidence link real: `False`
- Evidence link placeholder: `False`
- Area match status: `direct_history_match`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Add a real evidence link before this label can be considered for review.

### North Parramatta gauge-threshold candidate window

- Area: `north-parramatta`
- Window: `2026-06-14 09:33:49.773000+00:00` to `2026-06-14 09:39:37.035000+00:00`
- Supervision kind: `gauge-threshold`
- Label strength: `weak`
- Review status: `candidate_review`
- Evidence link real: `False`
- Evidence link placeholder: `False`
- Area match status: `direct_history_match`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Add a real evidence link before this label can be considered for review.

## Interpretation

- This queue is a review aid, not automatic ML validation.
- Placeholder links and missing evidence still block promotion.
- FloodGuard ML remains shadow mode until reviewed elevated windows become real and defensible.
