# FloodGuard Label Audit Report

This report audits the current label files used to improve ML supervision credibility.

## Joined Label Windows (`labels.csv`)

- Rows: 5
- Time span: 2026-06-24T00:00:00+00:00 to 2026-07-02T00:00:00+00:00
- Areas covered: north-parramatta, parramatta, toongabbie
- Label sources: {'manual_demo': 3, 'warning_derived': 1, 'impact_candidate': 1}
- Label strengths: {'weak': 4, 'moderate': 1}
- Label classes: {}
- Review status: {'scaffold_only': 3, 'candidate_review': 2}
- Positive event windows: 2
- Reviewed joined rows: 0
- Independent positive joined rows: 2
- Evidence-linked joined rows: 2
- Evidence-linked joined positive rows: 2
- Reviewable joined rows: 2
- Reviewable joined positive rows: 2
- Reviewed joined positive rows: 0

## Event Label Backlog (`event_label_backlog.csv`)

- Rows: 5
- Time span: 2026-06-24T00:00:00+00:00 to 2026-07-02T00:00:00+00:00
- Areas covered: north-parramatta, parramatta, toongabbie
- Label sources: {'manual_demo': 3, 'warning_derived': 1, 'impact_candidate': 1}
- Label strengths: {'weak': 4, 'moderate': 1}
- Label classes: {0: 3, 1: 2}
- Review status: {'scaffold_only': 3, 'candidate_review': 2}
- Promotion ready: {'no': 3, 'promoted': 2}
- Independence levels: {'low': 3, 'moderate': 2}
- Review priorities: {'low': 3, 'high': 2}
- Join status: {'joined_to_labels': 5}
- Positive event windows: 2
- Independent positive backlog rows: 2
- Evidence-linked backlog rows: 2
- Evidence-linked backlog positive rows: 2
- Reviewed backlog rows: 0
- Reviewed backlog positive rows: 0
- Promotion-ready backlog rows: 0
- Reviewable backlog rows: 2
- Reviewable backlog positive rows: 2

## Supervision Quality

- Grade: `developing`
- Viable for independent supervision: `False`
- Summary: Independent label scaffolding exists, but coverage or review quality is still too weak for validated ML claims.
- Primary limitation: Joined labels still lack enough reviewed elevated windows to support validated ML claims.
- Event-holdout currently viable: `False`

## Unlabelled Periods / Current Gap

- Most real-export historical rows still do not have strong independently verified elevated labels.
- Backlog rows are planning and review artifacts, not automatic validation evidence.
- Scenario-generated rows must never be treated as real-world label evidence.

## Promotion Path

- Backlog candidates become stronger only after evidence is linked, review status improves, and joined labels are refreshed.
- Promotion-ready backlog rows should stay explicit so event-holdout validation can depend on reviewed evidence rather than placeholders.
- Evidence links or explicit reviewed states are required before a label can count toward independent supervision claims.

## Interpretation

- FloodGuard is now stronger at tracking label provenance and strength explicitly.
- FloodGuard is still weak on validated real-event supervision until backlog items are reviewed and promoted into stronger joined labels.

