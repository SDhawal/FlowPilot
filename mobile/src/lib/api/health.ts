import { apiBaseUrl } from "./base-url";

/**
 * The only hand-written HTTP call in the app. Health checks are not route handlers, so they are
 * not in the OpenAPI document and the generated client cannot call them.
 */

export type HealthCheckErrorKind = "not-ready" | "network" | "timeout";

export class HealthCheckError extends Error {
  readonly kind: HealthCheckErrorKind;

  constructor(kind: HealthCheckErrorKind, message: string) {
    super(message);
    this.name = "HealthCheckError";
    this.kind = kind;
  }
}

export const DEFAULT_HEALTH_TIMEOUT_MS = 10_000;

type CheckReadyOptions = {
  /** Caller cancellation (TanStack Query). Re-thrown as-is, never turned into a timeout. */
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Resolves on any 2xx from GET /health/ready. Only the status code is read. */
export async function checkReady(options: CheckReadyOptions = {}): Promise<void> {
  const { signal, timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS } = options;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) onCallerAbort();
  else signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const response = await fetch(`${apiBaseUrl}/health/ready`, { signal: controller.signal });
    if (!response.ok) {
      throw new HealthCheckError("not-ready", `Server responded with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof HealthCheckError) throw error;
    if (timedOut && !signal?.aborted) {
      throw new HealthCheckError("timeout", `No response within ${timeoutMs} ms`);
    }
    if (signal?.aborted) throw error;
    throw new HealthCheckError("network", "Could not reach the server");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }
}
