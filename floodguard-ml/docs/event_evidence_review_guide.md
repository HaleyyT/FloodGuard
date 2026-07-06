# FloodGuard Event Evidence Review Guide

This guide explains how to turn a `candidate_review` event window into a defensible reviewed label without overstating ML readiness.

## Purpose

FloodGuard is now blocked by evidence quality, not ML plumbing.

That means:

- candidate event windows can stay in the pipeline for tracking and queueing;
- placeholder links must not count as real evidence;
- reviewed labels must only be created when the evidence is real, verifiable, and documented;
- ML must remain shadow mode until reviewed elevated event windows are strong enough for event-holdout validation.

## What counts as placeholder evidence

The following do **not** count as real evidence:

- `example.test` links
- placeholder URLs or stub references
- notes that mention an event but do not link to a verifiable source
- internal demo records with no external source

FloodGuard now marks these as placeholder evidence and blocks them from review promotion.

## What counts as real evidence

Examples of acceptable evidence include:

- official warning archive or warning page
- gauge observation record
- council flood report
- road closure notice
- verified local impact report

The evidence should be stable enough that another reviewer can inspect it later.

## Review workflow

1. Start from `floodguard-ml/data/event_evidence_review_queue.csv` and `floodguard-ml/reports/event_evidence_review_queue.md`.
2. Replace placeholder or missing evidence links with real verifiable sources.
3. Confirm the event window, area, and label are still defensible.
4. Record review notes explaining why the label is reasonable.
5. If the row is good enough for shadow-mode supervision, upgrade `review_status` to `reviewed_for_shadow_mode`.
6. Only use `expert_validated` when `reviewer`, `reviewed_at`, and `review_notes` are all completed.

## Required fields before review promotion

For `reviewed_for_shadow_mode`:

- real `evidence_link`, or an explicitly reviewed state already supported by evidence
- defensible `label_source`
- meaningful `review_notes`

For `expert_validated`:

- real `evidence_link`
- `reviewer`
- `reviewed_at`
- `review_notes`

## Hard rules

- `manual_demo` rows cannot be promoted.
- `scenario_generated` rows cannot be promoted.
- `candidate_review` rows with placeholder evidence cannot be promoted.
- Placeholder links do not count toward event-holdout readiness.
- Reviewed status must never be added just to improve ML metrics.

## Current honest limitation

FloodGuard may contain joined event windows in `labels.csv`, but that does not make them validated supervision by itself.

Reviewed elevated event windows remain the key gating signal for:

- event-holdout viability
- stronger threshold calibration claims
- any future move beyond ML shadow mode
