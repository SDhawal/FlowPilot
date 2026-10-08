import { QueryClient } from "@tanstack/react-query";

/** Factory (not a singleton) so each test and each app root gets a fresh cache. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        // TODO: focus/online refetching only works on web until focusManager and onlineManager
        // are wired to AppState and NetInfo (later feature).
        refetchOnWindowFocus: true,
      },
    },
  });
}
