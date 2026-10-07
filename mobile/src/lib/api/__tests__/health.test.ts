/// <reference types="jest" />

import { HealthCheckError, checkReady } from "../health";

type FetchSpy = jest.SpyInstance<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

let fetchSpy: FetchSpy;

beforeEach(() => {
  jest.useFakeTimers();
  fetchSpy = jest.spyOn(globalThis, "fetch") as unknown as FetchSpy;
});

afterEach(() => {
  fetchSpy.mockRestore();
  jest.useRealTimers();
});

/** A fetch that never settles on its own but rejects with AbortError when aborted. */
function hangingFetch() {
  return (_url: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
}

describe("checkReady", () => {
  it("resolves on 200 and calls exactly {base}/health/ready", async () => {
    fetchSpy.mockResolvedValue(new Response("Healthy", { status: 200 }));

    await expect(checkReady()).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toMatch(/^http:\/\/[^/]+\/health\/ready$/);
  });

  it("does not produce a double slash when the env url has a trailing slash", async () => {
    const original = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = "https://api.example.com/";
    fetchSpy.mockResolvedValue(new Response("Healthy", { status: 200 }));
    try {
      let isolated: typeof import("../health") | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        isolated = require("../health") as typeof import("../health");
      });
      await isolated?.checkReady();
      expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://api.example.com/health/ready");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
      else process.env.EXPO_PUBLIC_API_URL = original;
    }
  });

  it("treats any 2xx as ready", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(checkReady()).resolves.toBeUndefined();
  });

  it("throws kind not-ready on 503", async () => {
    fetchSpy.mockResolvedValue(new Response("Unhealthy", { status: 503 }));

    const error = await captureError(checkReady());

    expect(error).toBeInstanceOf(HealthCheckError);
    expect((error as HealthCheckError).kind).toBe("not-ready");
  });

  it("throws kind network when fetch rejects", async () => {
    fetchSpy.mockRejectedValue(new TypeError("Network request failed"));

    const error = await captureError(checkReady());

    expect(error).toBeInstanceOf(HealthCheckError);
    expect((error as HealthCheckError).kind).toBe("network");
  });

  it("throws kind timeout after 10 000 ms and aborts the request", async () => {
    fetchSpy.mockImplementation(hangingFetch());

    const outcome = captureError(checkReady());
    await jest.advanceTimersByTimeAsync(9_999);
    const signal = fetchSpy.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const error = await outcome;

    expect(error).toBeInstanceOf(HealthCheckError);
    expect((error as HealthCheckError).kind).toBe("timeout");
    expect(signal?.aborted).toBe(true);
  });

  it("honours a custom timeoutMs", async () => {
    fetchSpy.mockImplementation(hangingFetch());

    const outcome = captureError(checkReady({ timeoutMs: 500 }));
    await jest.advanceTimersByTimeAsync(500);

    expect(await outcome).toMatchObject({ kind: "timeout" });
  });

  it("re-throws a caller abort as an abort error, not a timeout", async () => {
    fetchSpy.mockImplementation(hangingFetch());
    const caller = new AbortController();

    const outcome = captureError(checkReady({ signal: caller.signal }));
    await jest.advanceTimersByTimeAsync(100);
    caller.abort();
    const error = await outcome;

    expect(error).not.toBeInstanceOf(HealthCheckError);
    expect((error as Error).name).toBe("AbortError");
  });

  it("does not leave a pending timeout behind after success", async () => {
    fetchSpy.mockResolvedValue(new Response("Healthy", { status: 200 }));

    await checkReady();

    expect(jest.getTimerCount()).toBe(0);
  });
});
