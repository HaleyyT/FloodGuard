export function buildWarningAdapterState(areaSignals) {
  const warningSource = (areaSignals.sourceMetadata ?? []).find((source) => source.type === "warnings");
  const warningSummary = areaSignals.warningSummary ?? {};

  if (!warningSource || warningSource.status === "not-connected") return "not_configured";
  if (warningSummary.parseStatus === "parser_error") return "parser_error";
  if (warningSource.status === "failed") return "source_unavailable";
  if (warningSource.freshnessStatus === "stale") return "stale";
  if ((warningSummary.warningCount ?? 0) === 0 || warningSummary.status === "no_current_warning") {
    return "no_relevant_warning";
  }

  return "live";
}

export function buildLegacyWarningAdapterStatus(adapterState) {
  return adapterState === "live" ? "connected" : adapterState;
}
