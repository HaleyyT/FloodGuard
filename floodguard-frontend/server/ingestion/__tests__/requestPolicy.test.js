import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchJsonWithTimeout,
  FloodguardTimeoutError,
} from "../../../src/data/requestPolicy.js";
import {
  clearSignalSnapshots,
  readSignalSnapshot,
  writeSignalSnapshot,
} from "../../../src/data/signalSnapshotCache.js";

function abortablePendingFetch(_input, { signal }) {
  return new Promise((_resolve, reject) => {
    const rejectAsAborted = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) rejectAsAborted();
    else signal.addEventListener("abort", rejectAsAborted, { once: true });
  });
}

test("request policy returns parsed JSON for a successful response", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 });

  const result = await fetchJsonWithTimeout("https://example.test/signals", { timeoutMs: 50 });

  assert.deepEqual(result, { status: "ok" });
});

test("request policy aborts a stalled response at the configured deadline", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = abortablePendingFetch;

  await assert.rejects(
    fetchJsonWithTimeout("https://example.test/signals", {
      errorLabel: "FloodGuard signals API",
      timeoutMs: 20,
    }),
    (error) => error instanceof FloodguardTimeoutError && error.name === "TimeoutError",
  );
});

test("request policy preserves caller cancellation as an AbortError", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = abortablePendingFetch;
  const controller = new AbortController();

  const request = fetchJsonWithTimeout("https://example.test/signals", {
    signal: controller.signal,
    timeoutMs: 1_000,
  });
  controller.abort();

  await assert.rejects(request, (error) => error.name === "AbortError");
});

test("signal snapshots remain isolated by area", () => {
  clearSignalSnapshots();
  const parramatta = { area: { id: "parramatta" }, ingestedAt: "2026-08-04T00:00:00Z" };
  const toongabbie = { area: { id: "toongabbie" }, ingestedAt: "2026-08-04T00:01:00Z" };

  writeSignalSnapshot("parramatta", parramatta);
  writeSignalSnapshot("toongabbie", toongabbie);

  assert.equal(readSignalSnapshot("parramatta").signals, parramatta);
  assert.equal(readSignalSnapshot("toongabbie").signals, toongabbie);
  assert.equal(readSignalSnapshot("north-parramatta"), null);
  clearSignalSnapshots();
});
