# FloodGuard Expert Review Plan

_Updated: 2026-07-02_

## Purpose

This document records the expert-review pathway for FloodGuard after reviewer feedback highlighted that flood-risk guidance is high stakes and requires domain input.

FloodGuard is currently a reliability-aware flood-awareness and decision-support prototype. It does not replace NSW SES, Bureau of Meteorology, councils, hydrologists, or emergency-management judgement.

## Review groups

FloodGuard should be reviewed by:

1. Hydrologists or flood-modelling specialists
2. Local council flood engineers
3. Emergency-management stakeholders
4. Community and user-safety reviewers

## Review goals by group

### 1. Hydrologists

Focus:

- whether rainfall-window thresholds are meaningful for the selected catchments
- whether river rate-of-rise and steady-delta thresholds are defensible
- whether the system is overreacting or underreacting to short-lived signal changes
- whether the current features are scientifically reasonable for a prototype

Key questions:

- Are the rainfall-window thresholds reasonable for Parramatta, North Parramatta, and Toongabbie?
- Are the river-height trend thresholds meaningful for the configured stations?
- Should different catchments or suburbs use different thresholds?
- Which historical events should be used first for calibration?

### 2. Local council flood engineers

Focus:

- whether the mapped stations are the right local context
- whether local flood-prone roads, creek crossings, and drainage trouble spots are reflected well enough
- whether council flood overlays, closure information, or drainage context should be integrated later

Key questions:

- Are the current station mappings the best available local signals for each pilot area?
- Which local impact zones should influence future guidance or labels?
- What local non-gauge evidence would most improve decision-support usefulness?

### 3. Emergency-management stakeholders

Focus:

- whether the next-step wording is safe and non-authoritative
- whether the separation between official warnings and FloodGuard concern is clear enough
- whether strong alerts are correctly suppressed during degraded evidence states

Key questions:

- Are the current next-step recommendations conservative enough?
- When should the system suppress advice because confidence is too low?
- What wording is safest for residents during uncertainty or stale-source conditions?
- How should official-warning prominence be handled when an official source is connected?

### 4. Community and user-safety reviewers

Focus:

- whether ordinary users can understand trust labels such as live, partial, stale, blocked, and fallback
- whether the dashboard avoids implying safety where evidence is incomplete
- whether community-report features introduce confusing or unsafe expectations

Key questions:

- Do users understand the difference between FloodGuard concern and official advice?
- Are source-quality warnings visible enough before people act on them?
- Does any wording imply a safety guarantee that should be removed?

## Review materials to prepare

For future expert sessions, prepare:

- screenshot set of overview, signals, notifications, and ML shadow-mode views
- current threshold configuration file
- example ingestion-readiness outputs for both submission and strict live modes
- historical event dates or weak labels used for calibration
- model card and ML report artifacts

## Immediate review targets

The highest-priority items for expert review are:

1. rainfall and river thresholds in `risk-thresholds.json`
2. wording of recommended next steps
3. when strong alerts should be suppressed due to degraded evidence
4. how official-warning data should be integrated once connected
5. which event labels are credible enough for ML validation

## Current safety boundary

Until expert review is completed:

- thresholds remain `not_expert_validated`
- ML remains `shadow mode`
- official warnings remain separate from FloodGuard-generated concern
- stale or cached evidence must never be presented as live
- next-step guidance must remain awareness-oriented rather than authoritative

## Definition of successful review

FloodGuard should only move closer to operational use after experts can confirm:

- threshold choices are defensible
- wording is safe and appropriately conservative
- station mappings are locally meaningful
- degraded-state handling is adequate
- ML labels and validation strategy are credible for future calibration work
