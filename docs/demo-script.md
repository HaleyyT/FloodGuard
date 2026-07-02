# FloodGuard Demo Script

## 30-second version

1. Open the overview page and point to the selected pilot area.
2. Show the current FloodGuard concern level and the reliability summary.
3. Highlight rainfall trend, river status, and recent public signals.
4. Point out the source diagnostics and official-warning separation.
5. Finish on the ML shadow-mode card and say the rule engine remains the live authority and FloodGuard does not replace official emergency advice.

## 2-minute version

1. Start with the overview page.
   Explain that FloodGuard is designed to show local flood concern and whether the supporting evidence is trustworthy enough for a live claim.

2. Show the monitored area and concern summary.
   Mention the top-line reliability state, area fit, freshness, and latest update time.

3. Show the front-page evidence cards.
   Explain that rainfall trend, river status, local reports, and the map are the fastest way to understand current local conditions.

4. Show source diagnostics.
   Emphasise that FloodGuard labels current, partial, stale, fallback, and not-connected states instead of hiding them.

5. Show the official-warning card.
   Explain that official warnings stay separate from FloodGuard’s own rule-based local concern score.

6. Show the notification preview.
   Explain that notification logic is conservative and can suppress strong app-generated notices when evidence quality is degraded.

7. Show the model page or ML card.
   Say that FloodGuard already exports historical features and runs a Python ML shadow pipeline, but it does not use ML to control live alerts because the current labels are rule-derived and not yet strong enough for validated prediction.

8. Close with the safety boundary.
   Say that FloodGuard is a flood-awareness and decision-support prototype, not an official warning system, and future deployment would require hydrologist, council, and emergency-management review.

## One-sentence closer

FloodGuard’s main value is not only turning public signals into a local concern level, but doing so honestly by showing how reliable those signals are before people act on them.

## Safety line for demos

Use this exact phrasing when needed:

FloodGuard does not replace NSW SES, BoM, council, or emergency-service advice. Its next steps are deliberately conservative, official warnings stay separate, degraded evidence suppresses stronger alerts, and ML remains shadow mode until reviewed and validated more rigorously.
