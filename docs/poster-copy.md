# FloodGuard Poster Copy

## Title

FloodGuard: Reliability-Aware Local Flood Awareness with Explainable Risk Logic and Shadow-Mode ML

## One-line hook

FloodGuard turns local rainfall, river, and community evidence into an explainable concern level while clearly showing when the underlying data is live, partial, stale, or fallback-only.

## Problem

- Flood information is often fragmented across multiple feeds.
- Residents may see signal values without understanding whether those values are current or trustworthy.
- Many prototypes overclaim “live intelligence” without exposing stale, fallback, or missing data.

## Solution

- Ingest local rainfall, river, weather, and community-signal evidence.
- Track freshness, provenance, fallback state, and area relevance for each source.
- Combine explainable risk signals into a local concern level and action guidance.
- Keep official warnings separate from FloodGuard-generated local concern.
- Surface ML as a shadow-mode comparison layer rather than operational alerting.

## What FloodGuard does

- Multi-area pilot for Parramatta, North Parramatta, and Toongabbie
- Layered ingestion health and source-trust reporting
- Explainable risk scoring and decision audit
- Notification-decision preview with degraded-data safeguards
- Community-report intake and review-safe image-link evidence
- Historical feature export and Python ML shadow pipeline

## Core innovation

FloodGuard is not only a flood dashboard. It is a reliability-aware decision-support system that checks whether the evidence is good enough to support a live claim before presenting that evidence as current.

## Architecture summary

Public sources -> Normalisation -> Source trust + freshness -> Area relevance -> Rule engine -> Dashboard + notifications -> Historical export -> Python ML shadow mode

## ML note

FloodGuard includes a Python-based prototype ML pipeline that trains baseline tabular models on exported feature rows and compares them against the explainable rule engine in shadow mode.

Important limitation:

- current labels are rule-derived
- the real export is strongly imbalanced
- no real `High` examples exist yet
- thresholds are prototype-calibration pending and not yet backed by reviewed event evidence
- ML is implemented for comparison and future calibration, not validated live prediction

## Honest limitations

- Official warning integration is connected and visible through a public HazardWatch adapter, but it is not yet fully operational as a stable live feed.
- Live gauge ingestion can degrade to stale cache or fallback depending on source availability.
- Historical storage is still prototype-grade JSONL storage.
- Risk thresholds remain heuristic and are not yet event-calibrated.

## Safety and expert oversight

FloodGuard is a flood-awareness prototype and does not replace official emergency advice. Future deployment requires hydrologist, council, and emergency-management review to calibrate rainfall and river thresholds, validate next-step guidance, and reduce the risk of unsafe automated recommendations.

Current safeguards:

- official warnings stay separate from FloodGuard-generated concern
- stale or cached evidence is labelled explicitly
- strong alerts are suppressed when core evidence is degraded
- ML remains shadow mode until independent validation is available
- threshold choices remain review-oriented rather than presented as expert-validated flood triggers

## Takeaway

FloodGuard shows that a flood-awareness prototype becomes much more credible when it explains not only the risk level, but also the strength and reliability of the evidence behind that risk.
