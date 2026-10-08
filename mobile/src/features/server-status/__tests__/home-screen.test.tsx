/// <reference types="jest" />

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { checkReady, HealthCheckError } from "@/lib/api/health";
import { createQueryClient } from "@/lib/query-client";

import Home from "../../../../app/index";
import { serverStatusKeys } from "../api/server-status-keys";
import { SERVER_STATUS_POLICY } from "../api/use-server-status";

jest.mock("@/lib/api/health", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/health")>("@/lib/api/health");
  return { ...actual, checkReady: jest.fn() };
});

const mockCheckReady = jest.mocked(checkReady);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

let queryClient: QueryClient;

async function renderHome() {
  await render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Home />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

/**
 * Advances fake time, then flushes 1 ms more: TanStack Query notifies observers through a
 * timer, so state set at the very end of the window needs one extra tick to render.
 */
const advance = async (ms: number) => {
  await act(() => jest.advanceTimersByTimeAsync(ms));
  await act(() => jest.advanceTimersByTimeAsync(1));
};

const CHECKING = "Checking the server…";
const WAKING = "Waking up the server…";
const CONNECTED = "Connected";
const UNREACHABLE = "Can't reach the server";

const notReady = () => new HealthCheckError("not-ready", "503");
const neverSettles = () => new Promise<void>(() => {});

/** Enough time for the retry loop to give up: the window plus one more (capped) delay. */
const PAST_WINDOW = SERVER_STATUS_POLICY.wakeWindowMs + 10_000 + 1;

/**
 * Asserts the screen is still waking just before the window ends, then advances only the
 * remainder (last retry delay included) and asserts it gave up. A longer window would fail.
 * Call right after the cycle started (time 0 of the window).
 */
async function expectGivesUpOnlyAfterWindow() {
  await advance(SERVER_STATUS_POLICY.wakeWindowMs - 2);
  expect(screen.queryByText(UNREACHABLE)).toBeNull();
  expect(screen.getByText(WAKING)).toBeTruthy();

  await advance(10_000 + 2);
  expect(screen.getByText(UNREACHABLE)).toBeTruthy();
}

beforeEach(() => {
  jest.useFakeTimers();
  queryClient = createQueryClient();
  mockCheckReady.mockReset();
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

describe("server status screen", () => {
  it("shows checking with no Retry button while the first call is pending", async () => {
    mockCheckReady.mockImplementation(neverSettles);

    await renderHome();

    expect(screen.getByText(CHECKING)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows connected when the call resolves", async () => {
    mockCheckReady.mockResolvedValue(undefined);

    await renderHome();
    await advance(0);

    expect(screen.getByText(CONNECTED)).toBeTruthy();
    expect(screen.getByText("FlowPilot API is ready.")).toBeTruthy();
    expect(screen.queryByText(CHECKING)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("shows waking up after the first failure while the next call is pending", async () => {
    mockCheckReady.mockRejectedValueOnce(notReady()).mockImplementation(neverSettles);

    await renderHome();
    await advance(0);
    expect(screen.getByText(WAKING)).toBeTruthy();

    await advance(SERVER_STATUS_POLICY.retryDelay(0));
    expect(mockCheckReady).toHaveBeenCalledTimes(2);
    expect(screen.getByText(WAKING)).toBeTruthy();
    expect(screen.getByText(/can take up to a minute/)).toBeTruthy();
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
  });

  it("recovers from a cold start without ever showing unreachable", async () => {
    mockCheckReady
      .mockRejectedValueOnce(new HealthCheckError("timeout", "t"))
      .mockRejectedValueOnce(notReady())
      .mockResolvedValue(undefined);

    await renderHome();
    await advance(0);
    expect(screen.getByText(WAKING)).toBeTruthy();

    await advance(SERVER_STATUS_POLICY.retryDelay(0));
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
    expect(screen.getByText(WAKING)).toBeTruthy();

    await advance(SERVER_STATUS_POLICY.retryDelay(1));
    expect(screen.getByText(CONNECTED)).toBeTruthy();
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
    expect(mockCheckReady).toHaveBeenCalledTimes(3);
  });

  it("uses the 1 s, 2 s, 4 s, 8 s, then 10 s backoff schedule", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(SERVER_STATUS_POLICY.retryDelay)).toEqual([
      1_000, 2_000, 4_000, 8_000, 10_000, 10_000, 10_000,
    ]);
  });

  it("passes the per-attempt timeout to checkReady", async () => {
    mockCheckReady.mockImplementation(neverSettles);

    await renderHome();

    expect(mockCheckReady).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: SERVER_STATUS_POLICY.requestTimeoutMs }),
    );
  });

  it("moves from waking to unreachable once the wake window runs out", async () => {
    mockCheckReady.mockRejectedValue(notReady());

    await renderHome();
    await advance(0);
    expect(screen.getByText(WAKING)).toBeTruthy();

    await expectGivesUpOnlyAfterWindow();
    expect(screen.getByText("Check your connection and try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(WAKING)).toBeNull();
  });

  it("stops calling the server once unreachable", async () => {
    mockCheckReady.mockRejectedValue(notReady());

    await renderHome();
    await advance(PAST_WINDOW);
    const calls = mockCheckReady.mock.calls.length;

    await advance(60_000);

    expect(mockCheckReady).toHaveBeenCalledTimes(calls);
  });

  it("Retry restarts the check and connects when the server is back", async () => {
    mockCheckReady.mockRejectedValue(notReady());
    await renderHome();
    await advance(PAST_WINDOW);
    expect(screen.getByText(UNREACHABLE)).toBeTruthy();

    mockCheckReady.mockReset();
    let resolveCheck: () => void = () => {};
    mockCheckReady.mockImplementation(
      () => new Promise<void>((resolve) => (resolveCheck = resolve)),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await advance(0);
    expect(screen.getByText(CHECKING)).toBeTruthy();

    resolveCheck();
    await advance(0);
    expect(screen.getByText(CONNECTED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("Retry starts a fresh full wake window", async () => {
    mockCheckReady.mockRejectedValue(notReady());
    await renderHome();
    await advance(PAST_WINDOW);
    expect(screen.getByText(UNREACHABLE)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await advance(0);
    expect(screen.getByText(WAKING)).toBeTruthy();

    // A stale cycle start would give up almost immediately instead of waiting a full window.
    await expectGivesUpOnlyAfterWindow();
  });

  it("starts a fresh wake window for a new cycle that is not triggered by Retry", async () => {
    mockCheckReady.mockRejectedValue(notReady());
    await renderHome();
    await advance(PAST_WINDOW);
    expect(screen.getByText(UNREACHABLE)).toBeTruthy();

    // Not awaited: the returned promise settles only after the whole retry cycle.
    await act(async () => {
      void queryClient.invalidateQueries({ queryKey: serverStatusKeys.all });
    });
    await advance(0);
    expect(screen.queryByText(UNREACHABLE)).toBeNull();
    expect(screen.getByText(WAKING)).toBeTruthy();

    await expectGivesUpOnlyAfterWindow();
  });

  it("hides Retry while the retried check is in flight", async () => {
    mockCheckReady.mockRejectedValue(notReady());
    await renderHome();
    await advance(PAST_WINDOW);

    mockCheckReady.mockReset();
    mockCheckReady.mockImplementation(neverSettles);
    await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
    await advance(0);

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByText(CHECKING)).toBeTruthy();
    expect(mockCheckReady).toHaveBeenCalledTimes(1);
  });

  it("exposes the status title as a header for screen readers", async () => {
    mockCheckReady.mockResolvedValue(undefined);

    await renderHome();
    await advance(0);

    expect(screen.getByRole("header", { name: CONNECTED })).toBeTruthy();
  });

  describe("screen reader announcements", () => {
    let announce: jest.SpyInstance;

    beforeEach(() => {
      announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation();
      // jest-expo already mocks this function, so calls from earlier tests would leak in.
      announce.mockClear();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("announces status changes on iOS, but not the initial status", async () => {
      jest.replaceProperty(Platform, "OS", "ios");
      mockCheckReady.mockResolvedValue(undefined);

      await renderHome();
      expect(announce).not.toHaveBeenCalled();

      await advance(0);
      expect(announce).toHaveBeenCalledTimes(1);
      expect(announce).toHaveBeenCalledWith(CONNECTED);
    });

    it("leaves announcements to aria-live on other platforms", async () => {
      jest.replaceProperty(Platform, "OS", "android");
      mockCheckReady.mockResolvedValue(undefined);

      await renderHome();
      await advance(0);

      expect(screen.getByText(CONNECTED)).toBeTruthy();
      expect(announce).not.toHaveBeenCalled();
    });
  });
});
