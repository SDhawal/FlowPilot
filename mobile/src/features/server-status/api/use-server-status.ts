import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { checkReady } from "@/lib/api/health";

import { serverStatusKeys } from "./server-status-keys";

/** Cold-start policy. Render (~30-60 s) plus Neon wake-up must fit inside the wake window. */
export const SERVER_STATUS_POLICY = {
  /** A single attempt gives up after this long. */
  requestTimeoutMs: 10_000,
  /** Keep retrying while less than this has passed since the current check cycle started. */
  wakeWindowMs: 90_000,
  /** 1 s, 2 s, 4 s, 8 s, then every 10 s. */
  retryDelay: (attempt: number): number => Math.min(1_000 * 2 ** attempt, 10_000),
} as const;

export type ServerStatus = "checking" | "waking" | "connected" | "unreachable";

export type UseServerStatusResult = {
  status: ServerStatus;
  retry: () => void;
  isRetrying: boolean;
};

export function useServerStatus(): UseServerStatusResult {
  const cycleStartedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: serverStatusKeys.ready(),
    queryFn: async ({ signal }) => {
      // The first attempt of a cycle starts the wake window; retries keep it.
      cycleStartedAt.current ??= Date.now();
      await checkReady({ signal, timeoutMs: SERVER_STATUS_POLICY.requestTimeoutMs });
      // TanStack Query rejects an undefined result, and checkReady resolves with nothing.
      return true;
    },
    // All failure kinds retry: a 503 means the API is up but the DB is still waking.
    retry: () =>
      Date.now() - (cycleStartedAt.current ?? Date.now()) < SERVER_STATUS_POLICY.wakeWindowMs,
    retryDelay: SERVER_STATUS_POLICY.retryDelay,
    // Offline devices must reach "unreachable" instead of pausing forever in "checking".
    networkMode: "always",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const { refetch } = query;
  const retry = useCallback(() => {
    cycleStartedAt.current = Date.now();
    void refetch();
  }, [refetch]);

  let status: ServerStatus;
  if (query.isSuccess) status = "connected";
  else if (query.isFetching) status = query.failureCount === 0 ? "checking" : "waking";
  else status = query.isError ? "unreachable" : "checking";

  return { status, retry, isRetrying: query.isFetching };
}
