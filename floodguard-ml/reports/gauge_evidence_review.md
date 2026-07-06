# FloodGuard Gauge Evidence Review

This report records real FloodSmart gauge evidence packs attached to candidate backlog windows.

## Summary

- Gauge candidates reviewed: 5
- Evidence-confirmed windows: 1
- Evidence-mismatch windows: 4

## Reviewed Gauge Windows

### north-parramatta | 2026-06-12 05:24:44.242000+00:00 to 2026-06-12 05:24:44.242000+00:00

- Station: `Burnside Homes`
- Evidence link: https://parramatta.lizard.net/api/v4/timeseries/23c96cd0-5d16-4e8f-8fcd-0f4b80ad6b00/events/?format=json&ordering=time&time__gte=2026-06-11T23%3A24%3A44.242000Z&time__lte=2026-06-12T05%3A24%3A44.242000Z&page_size=500
- Archived payload: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/data/review_evidence/north-parramatta_2026-06-12T05-24-44.242000+00-00_gauge_evidence.json`
- Evidence support status: `mismatch`
- Non-zero rows: 0
- Max value: 0.0
- Total rainfall: 0.0
- Promotion blocked reason: Gauge archive linked, but the fetched review window still returns zero rainfall values; do not promote without stronger corroborating evidence.

### north-parramatta | 2026-06-13 06:44:51.865000+00:00 to 2026-06-13 06:54:32.863000+00:00

- Station: `Burnside Homes`
- Evidence link: https://parramatta.lizard.net/api/v4/timeseries/23c96cd0-5d16-4e8f-8fcd-0f4b80ad6b00/events/?format=json&ordering=time&time__gte=2026-06-13T00%3A44%3A51.865000Z&time__lte=2026-06-13T06%3A54%3A32.863000Z&page_size=500
- Archived payload: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/data/review_evidence/north-parramatta_2026-06-13T06-44-51.865000+00-00_gauge_evidence.json`
- Evidence support status: `mismatch`
- Non-zero rows: 0
- Max value: 0.0
- Total rainfall: 0.0
- Promotion blocked reason: Gauge archive linked, but the fetched review window still returns zero rainfall values; do not promote without stronger corroborating evidence.

### north-parramatta | 2026-06-14 09:33:49.773000+00:00 to 2026-06-14 09:39:37.035000+00:00

- Station: `Burnside Homes`
- Evidence link: https://parramatta.lizard.net/api/v4/timeseries/23c96cd0-5d16-4e8f-8fcd-0f4b80ad6b00/events/?format=json&ordering=time&time__gte=2026-06-14T03%3A33%3A49.773000Z&time__lte=2026-06-14T09%3A39%3A37.035000Z&page_size=500
- Archived payload: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/data/review_evidence/north-parramatta_2026-06-14T09-33-49.773000+00-00_gauge_evidence.json`
- Evidence support status: `confirmed`
- Non-zero rows: 5
- Max value: 0.5
- Total rainfall: 2.5
- Promotion blocked reason: Gauge archive linked and ready for human review before any manual promotion.

### north-parramatta | 2026-06-15 01:13:35.760000+00:00 to 2026-06-15 06:38:42.695000+00:00

- Station: `Burnside Homes`
- Evidence link: https://parramatta.lizard.net/api/v4/timeseries/23c96cd0-5d16-4e8f-8fcd-0f4b80ad6b00/events/?format=json&ordering=time&time__gte=2026-06-14T19%3A13%3A35.760000Z&time__lte=2026-06-15T06%3A38%3A42.695000Z&page_size=500
- Archived payload: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/data/review_evidence/north-parramatta_2026-06-15T01-13-35.760000+00-00_gauge_evidence.json`
- Evidence support status: `mismatch`
- Non-zero rows: 0
- Max value: 0.0
- Total rainfall: 0.0
- Promotion blocked reason: Gauge archive linked, but the fetched review window still returns zero rainfall values; do not promote without stronger corroborating evidence.

### north-parramatta | 2026-06-16 03:00:15.700000+00:00 to 2026-06-16 03:00:56.085000+00:00

- Station: `Burnside Homes`
- Evidence link: https://parramatta.lizard.net/api/v4/timeseries/23c96cd0-5d16-4e8f-8fcd-0f4b80ad6b00/events/?format=json&ordering=time&time__gte=2026-06-15T21%3A00%3A15.700000Z&time__lte=2026-06-16T03%3A00%3A56.085000Z&page_size=500
- Archived payload: `/Users/haleytran/Desktop/Projects/FloodGuard/floodguard-ml/data/review_evidence/north-parramatta_2026-06-16T03-00-15.700000+00-00_gauge_evidence.json`
- Evidence support status: `mismatch`
- Non-zero rows: 0
- Max value: 0.0
- Total rainfall: 0.0
- Promotion blocked reason: Gauge archive linked, but the fetched review window still returns zero rainfall values; do not promote without stronger corroborating evidence.

## Promotion Outcome

- Promoted rows after evidence attachment: 0
- Reviewed joined event windows: 0
- Reviewed joined elevated event windows: 0

FloodGuard ML remains shadow mode unless evidence-backed reviewed windows become genuinely defensible.
