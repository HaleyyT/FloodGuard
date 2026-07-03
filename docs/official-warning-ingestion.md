# FloodGuard Official Warning Ingestion

## Selected target source

FloodGuard currently targets **HazardWatch / NSW SES official warnings** as the primary public warning layer.

This source is kept separate from FloodGuard's rule-based concern score and ML shadow-mode outputs.

## Adapter states

The warning adapter now reports one of these explicit states:

- `live`: a current relevant official warning was fetched and parsed safely
- `no_relevant_warning`: the source was current, but no relevant warning matched the area and warning-type filter
- `stale`: the source exists but the latest warning timestamp is too old for current reliance
- `source_unavailable`: the configured source could not be fetched and no safe live result was available
- `not_configured`: no warning source URL is configured yet
- `parser_error`: the configured payload did not match the expected warning schema

## Relevance filtering

FloodGuard currently filters official warnings using:

- area id or suburb-name matching
- catchment-name matching
- warning-type relevance for flood, storm, and emergency wording

This keeps bushfire and unrelated hazard notices from being treated as local flood-context evidence.

## Safety boundary

- Official warning wording stays official and is never rewritten into FloodGuard's own concern level.
- FloodGuard only displays official warning headlines beside local sensor-derived concern.
- Future work should add polygon/catchment intersection once warning geometry is available.
