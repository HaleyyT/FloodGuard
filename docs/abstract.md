# FloodGuard Abstract

FloodGuard is a reliability-aware flood-awareness and decision-support prototype for local urban catchments. The system combines rainfall, river, weather, community-signal, and separate official-warning context to generate an explainable local concern level for pilot areas in Parramatta, North Parramatta, and Toongabbie. Unlike dashboards that only aggregate data, FloodGuard also records source freshness, fallback state, provenance, and area relevance so the interface can show when evidence is current, partial, stale, or unavailable.

The backend ingests public signals, normalises them into a consistent structure, and applies an explainable rule engine that combines rainfall pressure, river pressure, wetness, public-signal pressure, and confidence adjustments. The frontend presents the resulting concern level together with source diagnostics, recommended next steps, public-signal summaries, notification previews, and a decision audit that explains why the current status was assigned.

FloodGuard also prepares for future modelling by storing historical area snapshots, exporting tabular feature rows, and running a Python ML pipeline in shadow mode. This pipeline trains baseline tabular models, reports metrics and limitations, and compares model outputs against rule-derived labels without overriding the live rule engine. The current ML layer is therefore valuable for plumbing, safeguards, and future calibration, but not yet for validated operational flood prediction.

Overall, FloodGuard demonstrates a more honest and safety-aware approach to local flood decision support: not just producing a risk label, but also showing whether the underlying evidence is strong enough to trust.
