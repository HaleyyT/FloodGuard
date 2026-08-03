export const defaultRequestTimeoutMs = 10_000;

export class FloodguardTimeoutError extends Error {
  constructor(label, timeoutMs) {
    super(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchJsonWithTimeout(
  input,
  {
    errorLabel = "FloodGuard API",
    init = {},
    parseError,
    signal,
    timeoutMs = defaultRequestTimeoutMs,
  } = {},
) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });

    if (!response.ok) {
      const customMessage = parseError ? await parseError(response) : null;
      throw new Error(customMessage || `${errorLabel} returned ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (timedOut) {
      throw new FloodguardTimeoutError(errorLabel, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
