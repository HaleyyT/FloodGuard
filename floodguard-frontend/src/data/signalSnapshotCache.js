const snapshots = new Map();

export function readSignalSnapshot(areaId) {
  return snapshots.get(areaId) ?? null;
}

export function writeSignalSnapshot(areaId, signals) {
  if (!areaId || !signals) return null;

  const snapshot = {
    areaId,
    cachedAt: new Date().toISOString(),
    signals,
  };
  snapshots.set(areaId, snapshot);
  return snapshot;
}

export function clearSignalSnapshots() {
  snapshots.clear();
}
