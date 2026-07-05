import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { collectScheduledSources } from "../scheduledCollection.js";

async function readJsonl(filePath) {
  const content = await readFile(filePath, "utf8");
  return content
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test("collectScheduledSources appends raw and parsed evidence without overwriting prior snapshots", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-source-evidence-"));

  try {
    const rawDir = path.join(rootDir, "raw");
    const parsedDir = path.join(rootDir, "parsed");
    const definitions = [
      {
        key: "test_warning_feed",
        label: "Test warning feed",
        envUrl: "FLOODGUARD_TEST_WARNING_URL",
        defaultUrl: "https://warnings.example/feed.xml",
        rawFormat: "xml",
        rawAccept: "application/xml",
        evidenceType: "warning_context",
        sourceStrength: "official_warning",
        parsedLoader: (definition, rawSnapshot, url) => ({
          sourceKey: definition.key,
          label: definition.label,
          sourceUrl: url,
          sourceStrength: definition.sourceStrength,
          evidenceType: definition.evidenceType,
          fetchedAt: rawSnapshot.fetchedAt,
          observedAt: "2026-07-06T00:00:00.000Z",
          status: "ok",
          failureReason: null,
          itemCount: 1,
          warningCount: 1,
          matchedAreas: ["parramatta"],
          items: [
            {
              title: "Parramatta warning",
              link: "https://warnings.example/archive/parramatta",
              observedAt: "2026-07-06T00:00:00.000Z",
              description: "Official warning",
              matchedAreas: ["parramatta"],
            },
          ],
        }),
      },
    ];
    let fetchCount = 0;
    const rawFetcher = async () => {
      fetchCount += 1;
      return {
        fetchedAt: `2026-07-06T00:00:0${fetchCount}.000Z`,
        httpStatus: 200,
        contentType: "application/xml",
        rawPayload: "<rss><channel><item><title>Parramatta warning</title></item></channel></rss>",
      };
    };

    await collectScheduledSources({ definitions, rawDir, parsedDir, rawFetcher });
    await collectScheduledSources({ definitions, rawDir, parsedDir, rawFetcher });

    const rawRows = await readJsonl(path.join(rawDir, "test_warning_feed.jsonl"));
    const parsedRows = await readJsonl(path.join(parsedDir, "test_warning_feed.jsonl"));

    assert.equal(rawRows.length, 2);
    assert.equal(parsedRows.length, 2);
    assert.equal(parsedRows[0].matchedAreas[0], "parramatta");
    assert.equal(parsedRows[1].warningCount, 1);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("collectScheduledSources records parsed failure rows when a source fetch fails", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "floodguard-source-evidence-"));

  try {
    const rawDir = path.join(rootDir, "raw");
    const parsedDir = path.join(rootDir, "parsed");
    const definitions = [
      {
        key: "test_transport_feed",
        label: "Test transport feed",
        envUrl: "FLOODGUARD_TEST_TRANSPORT_URL",
        defaultUrl: "https://transport.example/feed.json",
        rawFormat: "json",
        rawAccept: "application/json",
        evidenceType: "impact_context",
        sourceStrength: "impact_proxy",
        parsedLoader: () => {
          throw new Error("should not run");
        },
      },
    ];

    await collectScheduledSources({
      definitions,
      rawDir,
      parsedDir,
      rawFetcher: async () => {
        throw new Error("timeout while fetching");
      },
    });

    const parsedRows = await readJsonl(path.join(parsedDir, "test_transport_feed.jsonl"));

    assert.equal(parsedRows.length, 1);
    assert.equal(parsedRows[0].status, "failed");
    assert.equal(parsedRows[0].failureReason, "network_timeout");
    assert.equal(parsedRows[0].incidentCount, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
