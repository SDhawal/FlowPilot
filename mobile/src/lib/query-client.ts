import { QueryClient } from "@tanstack/react-query";

/** Factory (not a singleton) so each test and each app root gets a fresh cache. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}
