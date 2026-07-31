# FloodGuard Event Evidence Review Queue

This report highlights the current best candidate event windows for human evidence review.

## Queue Summary

- Candidate windows in queue: 2
- High-priority candidate windows: 2
- Windows with real evidence links: 1
- Windows still using placeholder evidence: 1
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
- Evidence support status: `unknown`
- Area match status: `area_mapping_missing`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Replace placeholder link with a real warning archive, gauge record, council report, road closure notice, or verified local impact source.

### Candidate impact window with real notice

- Area: `toongabbie`
- Window: `2026-06-30 00:00:00+00:00` to `2026-06-30 06:00:00+00:00`
- Supervision kind: `impact-derived`
- Label strength: `strong`
- Review status: `candidate_review`
- Evidence link real: `True`
- Evidence link placeholder: `False`
- Evidence support status: `unknown`
- Area match status: `area_mapping_missing`
- Time window status: `window_present`
- Can become `reviewed_for_shadow_mode`: `False`
- Recommended next action: Review the linked evidence pack and record whether it confirms or contradicts the candidate window.

## Interpretation

- This queue is a review aid, not automatic ML validation.
- Placeholder links and missing evidence still block promotion.
- FloodGuard ML remains shadow mode until reviewed elevated windows become real and defensible.
