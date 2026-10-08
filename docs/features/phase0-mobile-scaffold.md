# Phase 0 · Step 3 — Expo app scaffold (iOS, Android, Web)

- **Status:** Approved (2026-10-07)
- **Owner:** Dhawal · **Implementer:** `rn-frontend` agent · **Tests:** `test-engineer` agent
- **Related:** [ADR-0001](../adr/0001-technology-stack.md) (stack), [ADR-0002](../adr/0002-mobile-ui-and-client-libraries.md) (UI and client libraries), [phase0-backend-scaffold](phase0-backend-scaffold.md)

## 1. Problem & acceptance criteria

`mobile/` holds only `CLAUDE.md`. We need a production-shaped Expo app that later features plug into. It must prove the **backend → OpenAPI → typed client → screen** loop on all three platforms. A single home screen calls the API's readiness probe and shows the server's state.

- **Given** Postgres and the API running locally (`docker compose -f backend/docker-compose.yml up -d db`, `dotnet run --project backend/src/FlowPilot.Api`), **when** I run `npm --prefix mobile run web`, **then** the home screen first shows **Checking the server…** and then **Connected**.
- **Given** the API is stopped, **when** the home screen loads and the wake-up window (~90 s) runs out, **then** it shows **Can't reach the server** with a **Retry** button. **When** I start the API and press Retry, **then** it shows **Checking the server…** and then **Connected**.
- **Given** a slow or cold API (simulated in tests: the first calls fail or time out, a later one succeeds), **when** the home screen loads, **then** it shows **Waking up the server…** while it retries, and **Connected** once a call succeeds inside the window.
- **Given** a slow or cold API that never becomes ready (simulated in tests), **when** ~90 s pass, **then** the screen moves from **Waking up the server…** to **Can't reach the server** with Retry.
- **Given** the repo after this step, **when** I run `npm --prefix mobile run typecheck`, `npm --prefix mobile run lint` (`--max-warnings 0`) and `npm --prefix mobile test`, **then** all three pass with zero warnings.
- **Given** `backend/openapi/flowpilot.json`, **when** I run `npm --prefix mobile run gen:api`, **then** it regenerates `mobile/src/lib/api/schema.d.ts` without errors, and re-running it leaves no git diff.
- **Given** an Android emulator (or Expo Go on an Android phone), **when** I run `npm --prefix mobile run android` (or scan the QR code), **then** the app starts and shows a server status. **Given** Expo Go on a physical iPhone, **then** the app starts and shows a server status.
- **Given** `EXPO_PUBLIC_API_URL` is set, **then** every platform uses it as the API base URL. **Given** it is unset, **then** web and iOS use `http://localhost:5165` and Android uses `http://10.0.2.2:5165`.

## 2. Out of scope

- Auth (login, register, token storage, `(auth)`/`(app)` route groups). The groups in `mobile/CLAUDE.md` arrive with the auth feature.
- Any real feature screens (projects, tasks, AI plans), Zustand, React Hook Form, zod.
- **Backend changes of any kind.** Health checks stay out of OpenAPI. CORS is already configured for `http://localhost:8081`.
- CI for mobile (GitHub Actions). This is a later Phase 0 step.
- EAS builds, store publishing, app icons/splash branding, bundle identifiers / Android package name.
- Deployment to Cloudflare Pages.
- Offline support, push notifications, i18n, analytics, error reporting (Sentry etc.).

## 3. Solution layout

```
mobile/
├─ CLAUDE.md                     # kept; updated in commit 7 if anything diverged
├─ app.json                      # name "FlowPilot", slug "flowpilot", scheme "flowpilot", userInterfaceStyle "automatic", experiments.typedRoutes true
├─ package.json                  # scripts in §4; npm (package-lock.json committed)
├─ tsconfig.json                 # extends expo/tsconfig.base, strict: true, paths { "@/*": ["./src/*"] }
├─ babel.config.js               # only if the chosen NativeWind version needs it (v4: jsxImportSource + nativewind/babel)
├─ metro.config.js               # withNativeWind(config, { input: "./global.css" })
├─ tailwind.config.js            # theme tokens (colors incl. dark, spacing, font sizes); content: app/**, src/**
├─ global.css                    # Tailwind directives (imported once in app/_layout.tsx)
├─ nativewind-env.d.ts           # NativeWind className types
├─ eslint.config.js              # flat config: eslint-config-expo; ignores src/lib/api/schema.d.ts
├─ .prettierrc / .prettierignore # prettier-plugin-tailwindcss; ignores schema.d.ts
├─ jest.config.js                # preset jest-expo; transformIgnorePatterns as the preset docs require
├─ .env.example                  # EXPO_PUBLIC_API_URL=  (placeholder + comments, no secrets)
├─ .gitignore                    # template's, plus .env, .env*.local
├─ app/
│  ├─ _layout.tsx                # imports global.css; QueryClientProvider; SafeAreaProvider; StatusBar; Stack
│  └─ index.tsx                  # home: renders <ServerStatusCard /> inside <Screen>
└─ src/
   ├─ features/server-status/
   │  ├─ api/
   │  │  ├─ server-status-keys.ts     # serverStatusKeys factory
   │  │  └─ use-server-status.ts      # TanStack Query hook + status derivation + retry policy
   │  ├─ components/
   │  │  └─ server-status-card.tsx    # pure presentation of the 4 states + Retry
   │  └─ __tests__/                   # screen/hook behaviour tests
   ├─ lib/
   │  ├─ api/
   │  │  ├─ schema.d.ts               # GENERATED by gen:api; never hand-edited (protect-files hook blocks it)
   │  │  ├─ base-url.ts               # resolveApiBaseUrl() (pure) + apiBaseUrl
   │  │  ├─ client.ts                 # openapi-fetch createClient<paths>({ baseUrl })
   │  │  ├─ health.ts                 # checkReady(): the one sanctioned non-generated call
   │  │  └─ __tests__/
   │  └─ query-client.ts              # createQueryClient() with app-wide defaults
   └─ ui/
      ├─ tokens.ts                    # token names shared with tailwind.config (min touch target = 44)
      ├─ screen.tsx                   # safe-area + background + padding
      ├─ text.tsx                     # variants: title, body, caption; supports dynamic type (allowFontScaling on)
      └─ button.tsx                   # primary/secondary; min 44pt height; accessibilityRole="button"; disabled + busy states
```

The NativeWind config files above are the v4 shape. If the chosen Expo SDK requires NativeWind v5 / Tailwind 4, the config files change (for example a PostCSS config instead of `tailwind.config.js` theming). The actual set is recorded in ADR-0002 at implementation (see §10).

The Expo template's example code is removed: tabs, `explore` screen, `components/`, `hooks/`, `constants/`, sample assets that aren't referenced, and the `reset-project` script. Template packages that end up unused after the strip are uninstalled.

## 4. Key technical decisions

- **Expo:** latest stable SDK at implementation time, TypeScript `strict`, **Expo Router** with typed routes, **npm**. `create-expo-app` won't scaffold into a non-empty folder. So generate in a temp folder (the scratchpad), then move the files into `mobile/`, keeping `mobile/CLAUDE.md`. Record the SDK version in the PR description and in ADR-0002.
- **Node prerequisite (gate):** implementation doesn't start until `node -v` reports an LTS that meets the chosen SDK's minimum. Current SDKs need ≥ 20.19, and local is v20.10.0. Add `"engines": { "node": ">=<sdk minimum>" }` to `package.json` so the requirement is visible.
- **Path alias:** `@/*` → `./src/*`. This is resolved natively by Expo's Metro and by Jest (`moduleNameMapper` if jest-expo doesn't pick up tsconfig paths).
- **npm scripts** (names fixed by root `CLAUDE.md` and `.claude/hooks`):
  | Script                              | Command (shape)                                                                                                           |
  | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | `start` / `web` / `android` / `ios` | `expo start`, `expo start --web`, `expo start --android`, `expo start --ios`                                              |
  | `typecheck`                         | `tsc --noEmit`                                                                                                            |
  | `lint`                              | `expo lint` / `eslint .` with `--max-warnings 0`                                                                          |
  | `format` / `format:check`           | `prettier --write .` / `prettier --check .`                                                                               |
  | `test`                              | `jest`. **Not** `--watch`/`--watchAll`: `verify-on-stop.mjs` runs `npm --prefix mobile test -- --ci` and would hang.      |
  | `gen:api`                           | `openapi-typescript ../backend/openapi/flowpilot.json -o src/lib/api/schema.d.ts` (npm runs scripts with cwd = `mobile/`) |
- **Generated file hygiene:** `schema.d.ts` is committed, excluded from ESLint and Prettier (so `lint`/`format:check` never fight the generator), and regenerating it must be deterministic (no timestamps). It's already protected from hand edits by `.claude/hooks/protect-files.mjs`.
- **Styling:** NativeWind (Tailwind), with the NativeWind/Tailwind version pair the NativeWind docs mark stable for the chosen SDK (rationale in ADR-0002). Theme tokens (colors with light/dark values, spacing, font sizes, radii) are defined once in `tailwind.config` and named in `src/ui/tokens.ts`. Components use `className`. Dark mode follows the system setting (`userInterfaceStyle: "automatic"`).
- **UI primitives (`src/ui`):** `Screen`, `Text`, `Button` only. No component library. `Button` enforces `minHeight: 44`, `accessibilityRole="button"`, `accessibilityState={{ disabled, busy }}`.
- **API base URL:** `resolveApiBaseUrl({ envUrl, platform })` is a pure function, so it's easy to test, and `apiBaseUrl` is computed once from it:
  1. If `process.env.EXPO_PUBLIC_API_URL` is set and not blank, use it with trailing `/` trimmed. It must be referenced literally as `process.env.EXPO_PUBLIC_API_URL`, because Expo inlines `EXPO_PUBLIC_*` at bundle time and destructuring breaks inlining.
  2. Else, if `Platform.OS === "android"`, use `http://10.0.2.2:5165` (the emulator's alias for the host machine).
  3. Else (web, iOS), use `http://localhost:5165`.

  Changing the env var needs a Metro restart (`expo start --clear` if cached). `mobile/.env.example` documents the variable and the per-platform values (web, emulator, LAN IP for physical devices). The human copies it to `mobile/.env.local`. Agents may not create `.env*` files (protect-files hook).

- **Typed client:** `openapi-typescript` generates `paths` from `flowpilot.json`, and `client.ts` exports `apiClient = createClient<paths>({ baseUrl: apiBaseUrl })` (openapi-fetch). `paths` is currently empty, so nothing calls `apiClient` yet. It exists so the first real endpoint plugs straight in, and it's covered by typecheck.
- **Health call (sanctioned exception):** `/health/live` and `/health/ready` are health-check endpoints, not route handlers, so they aren't in OpenAPI. `src/lib/api/health.ts` is therefore the **only** hand-written HTTP call in the app, and it lives inside `src/lib/api`, never in components or features. Contract:
  - `checkReady(options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<void>` calls `GET {apiBaseUrl}/health/ready` and resolves on any 2xx.
  - It throws a typed `HealthCheckError` with `kind: "not-ready" | "network" | "timeout"`: non-2xx (e.g. 503 when the DB is unreachable) → `not-ready`; fetch rejects → `network`; no response within `timeoutMs` (default **10 000 ms**, via `AbortController`) → `timeout`. An abort from the caller's `signal` (TanStack Query cancellation) is re-thrown as-is, not turned into `timeout`.
  - It reads only the status code. The body (`Healthy`/`Unhealthy`, text/plain) is ignored.
- **Query client (`src/lib/query-client.ts`):** `createQueryClient()` is a factory, so tests get a fresh client each time. App-wide defaults are modest: `retry: 1` for future queries and `refetchOnWindowFocus` left on. The server-status query overrides what it needs (below).
- **Server status hook:** `useServerStatus()` in `src/features/server-status/api/` returns `{ status: "checking" | "waking" | "connected" | "unreachable", retry(): void, isRetrying: boolean }`.
  - Query key: `serverStatusKeys.ready()` → `["server-status", "ready"]`. The factory is `serverStatusKeys = { all: ["server-status"] as const, ready: () => [...all, "ready"] as const }`.
  - `queryFn: ({ signal }) => checkReady({ signal })`.
  - **Cold-start policy** (constants in one exported `SERVER_STATUS_POLICY` object so tests import them):
    - `requestTimeoutMs = 10_000`: a single attempt gives up after 10 s.
    - `wakeWindowMs = 90_000`: keep retrying while less than 90 s have passed since the current check cycle started. This covers Render (~30–60 s) plus Neon wake-up (ADR-0001).
    - `retryDelay(attempt) = min(1_000 × 2^attempt, 10_000)` ms: 1 s, 2 s, 4 s, 8 s, then every 10 s.
    - `retry: () => now − cycleStartedAt < wakeWindowMs`. `cycleStartedAt` is set when a cycle starts (first mount, or Retry). Time is read via `Date.now()`, which Jest modern fake timers control.
    - All failure kinds (`not-ready`, `network`, `timeout`) are retried. 503 means the API is up but the DB isn't ready yet, which is exactly the Neon cold-start case.
    - `networkMode: "always"`, so an offline device fails and reaches **unreachable** instead of TanStack Query pausing forever in **checking**.
    - `staleTime: Infinity`, `refetchOnWindowFocus: false`, no polling: once connected, the screen doesn't re-check on its own in this step.
  - **Status derivation:**
    | Query state                                                                                                       | `status`      |
    | ----------------------------------------------------------------------------------------------------------------- | ------------- |
    | fetching, no success yet, `failureCount === 0` (first attempt in flight, including the first attempt after Retry) | `checking`    |
    | not settled, `failureCount ≥ 1` (between retries or retrying)                                                     | `waking`      |
    | success                                                                                                           | `connected`   |
    | error (retry policy returned false) and not fetching                                                              | `unreachable` |
  - `retry()` resets `cycleStartedAt` and calls `refetch()`. Retry only appears in the `unreachable` state, and the button is busy/disabled while a check is in flight.
  - Worst-case time to **unreachable** is about 90 s plus one in-flight attempt (≤ 10 s), so ≤ ~100 s.
- **CORS:** the backend dev config already allows `http://localhost:8081` (Expo web's default port). Expo web must run on 8081. If Metro picks another port because 8081 is busy, the browser blocks the call and the screen ends in **unreachable**. This is documented in the README troubleshooting note. No backend change.
- **Deferred:** Zustand, React Hook Form, zod (same pattern as FluentValidation in the backend spec). Each is added with the first feature that needs it.

### Dependencies (approval requested; all free/OSS; versions = latest stable compatible with the chosen Expo SDK, installed via `npx expo install` where applicable and recorded at implementation)

| Package                                                                             | Kind      | License    | Why                                                                    |
| ----------------------------------------------------------------------------------- | --------- | ---------- | ---------------------------------------------------------------------- |
| expo                                                                                | runtime   | MIT        | SDK                                                                    |
| expo-router                                                                         | runtime   | MIT        | file-based routing, typed routes                                       |
| react, react-dom                                                                    | runtime   | MIT        | React / web renderer                                                   |
| react-native                                                                        | runtime   | MIT        | native renderer                                                        |
| react-native-web                                                                    | runtime   | MIT        | web target                                                             |
| react-native-screens, react-native-safe-area-context                                | runtime   | MIT        | Expo Router peers, safe areas                                          |
| expo-linking, expo-constants, expo-status-bar                                       | runtime   | MIT        | Expo Router peers / status bar                                         |
| @tanstack/react-query                                                               | runtime   | MIT        | server state (ADR-0001)                                                |
| openapi-fetch                                                                       | runtime   | MIT        | typed fetch over generated `paths` (ADR-0002)                          |
| nativewind                                                                          | runtime   | MIT        | Tailwind for RN (ADR-0002)                                             |
| tailwindcss                                                                         | dev/build | MIT        | Tailwind compiler used by NativeWind                                   |
| react-native-reanimated (+ react-native-worklets if that Reanimated major needs it) | runtime   | MIT        | NativeWind peer, **only if** the chosen NativeWind version requires it |
| typescript                                                                          | dev       | Apache-2.0 | strict typing                                                          |
| openapi-typescript                                                                  | dev       | MIT        | generates `schema.d.ts` (ADR-0001)                                     |
| eslint, eslint-config-expo                                                          | dev       | MIT        | lint                                                                   |
| prettier, prettier-plugin-tailwindcss                                               | dev       | MIT        | formatting, class sorting                                              |
| jest, jest-expo, @types/jest                                                        | dev       | MIT        | test runner + Expo preset                                              |
| @testing-library/react-native                                                       | dev       | MIT        | behaviour tests                                                        |
| @types/react                                                                        | dev       | MIT        | React types                                                            |

Template packages beyond this list (e.g. fonts, icons, haptics, splash screen) are removed if unused after stripping the example code. If one has to stay, it's listed in the PR with its license. Peer dependencies that a chosen version strictly requires (e.g. `react-test-renderer` for some RNTL majors, or `eslint-config-prettier` if ESLint and Prettier rules clash) are MIT. They're allowed only if needed, and named in the PR. **No** commercial-license packages, and no paid services.

## 5. API usage

The app adds no endpoints and changes no contract. It calls:

| Method | Route           | Auth | Called from                                 | Interpretation                                                                                          |
| ------ | --------------- | ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET    | `/health/ready` | none | `src/lib/api/health.ts` → `useServerStatus` | 2xx → connected · 503 / other non-2xx / network error / timeout → retry within window, then unreachable |

`/health/live` isn't used: it says the process is up, but not whether the app can actually work (DB reachable), and that's what the user cares about. Rate limiting: none on health endpoints. The retry schedule caps the app at about 12 requests per 90 s cycle per device.

**OpenAPI / client regeneration:** `gen:api` runs against the current `flowpilot.json` (empty `paths`, OpenAPI 3.1.1). The generated `schema.d.ts` is committed. The `/gen-client` skill works unchanged from now on.

## 6. Frontend

- **Routes:** `app/_layout.tsx` (root Stack, providers, header hidden) and `app/index.tsx` (home / server status). No other routes. The `(auth)`/`(app)` groups come with auth.
- **Providers (`_layout`):** `QueryClientProvider` (client created once via `useState(() => createQueryClient())`), `SafeAreaProvider`, `StatusBar style="auto"`, and the `global.css` import.
- **Components:**
  - `ServerStatusCard` (feature component): takes `status`, `onRetry` and `isRetrying` from `useServerStatus` and renders one state. It's presentational, so it can be tested on its own if needed.
  - `Screen`, `Text`, `Button` (shared UI).
- **States and copy:**
  | Status                                                  | Title                  | Supporting text                                                   | Action             |
  | ------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------- | ------------------ |
  | `checking`                                              | Checking the server…   | —                                                                 | activity indicator |
  | `waking`                                                | Waking up the server…  | "The free server sleeps when idle. This can take up to a minute." | activity indicator |
  | `connected`                                             | Connected              | "FlowPilot API is ready."                                         | —                  |
  | `unreachable`                                           | Can't reach the server | "Check your connection and try again."                            | **Retry** button   |
  | Empty state: n/a, because this screen has no list data. |
- **Accessibility:** the status title is in a polite live region, so screen readers announce changes. Retry has `accessibilityRole="button"`, label "Retry", and a ≥ 44pt touch target. Indicators have `accessibilityLabel` ("Checking", "Waking up"). Text respects the system font scale. Colour is never the only status signal: the text always states it.
- **Dev aid:** when `__DEV__`, the card shows the resolved API base URL in caption text. This helps debug the physical-device / LAN setup. It isn't a secret, since `EXPO_PUBLIC_*` values are public by definition.
- **Query keys / mutations:** `serverStatusKeys.ready()` only. No mutations.
- **Web vs native:**
  |                  | Web                                              | Android                                                                                                                                                                                              | iOS                                                                                                           |
  | ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | Run              | `npm --prefix mobile run web` (localhost:8081)   | emulator via `run android`, or Expo Go                                                                                                                                                               | Expo Go on a physical iPhone only (no simulator on Windows)                                                   |
  | Default base URL | `http://localhost:5165`                          | `http://10.0.2.2:5165` (emulator)                                                                                                                                                                    | `http://localhost:5165`. This **only works on a simulator**, so a physical iPhone needs `EXPO_PUBLIC_API_URL` |
  | CORS             | applies (origin must be `http://localhost:8081`) | n/a                                                                                                                                                                                                  | n/a                                                                                                           |
  | Physical device  | —                                                | LAN URL, e.g. `http://192.168.x.y:5165`; API must listen on `0.0.0.0` (`dotnet run --project backend/src/FlowPilot.Api --urls http://0.0.0.0:5165`) and the Windows firewall must allow inbound 5165 | same as Android                                                                                               |
  | Cleartext HTTP   | allowed by browsers on localhost                 | allowed in Expo Go / debug builds                                                                                                                                                                    | allowed in Expo Go (verify at implementation; see §10). Production uses HTTPS (Render).                       |

## 7. Security

- No secrets in the app or repo. `EXPO_PUBLIC_API_URL` is public by design. `.env.example` has placeholders only. `.env` and `.env*.local` are git-ignored.
- No user data, no auth, no storage. The health call sends no credentials and no identifying headers.
- The health response body is ignored, so nothing from the server is rendered as content.
- Cleartext HTTP is used only for local development URLs. The app config does not globally enable cleartext traffic or ATS exceptions for production builds (EAS builds are out of scope; revisit then).
- The retry policy caps request volume, so a stuck client can't hammer the API (§5).

## 8. Testing plan

Jest (`jest-expo` preset) + React Native Testing Library. Tests assert what the user sees (text, roles, labels), not styles or implementation details. **The network is mocked at the `src/lib/api` boundary:** feature and screen tests `jest.mock("@/lib/api/health")` and control `checkReady`. Only `health.ts`'s own unit tests stub `global.fetch`. Each test gets a fresh `createQueryClient()`. Timing uses `jest.useFakeTimers()` (modern, so `Date.now()` is faked too) and `await act(() => jest.advanceTimersByTimeAsync(ms))`. No test waits on real time.

- **`base-url` unit tests (`resolveApiBaseUrl`):** env set → used as-is, trailing slash trimmed. Env blank or whitespace → falls back. Android → `http://10.0.2.2:5165`. Web → `http://localhost:5165`. iOS → `http://localhost:5165`. Env wins over platform.
- **`health` unit tests (`checkReady`, fetch stubbed):**
  - 200 → resolves; URL is exactly `{base}/health/ready` (no double slash).
  - 503 → `HealthCheckError` with `kind: "not-ready"`.
  - fetch rejects → `kind: "network"`.
  - fetch never settles → after 10 000 ms (fake timers) rejects with `kind: "timeout"` and the request was aborted.
  - Caller aborts via `signal` → rejects with an abort error, not `timeout`.
- **Server status screen tests (render `app/index.tsx` or `ServerStatusCard` + hook inside a test `QueryClientProvider`):**
  - **Checking:** `checkReady` pending → "Checking the server…" visible, no Retry button.
  - **Connected:** `checkReady` resolves → "Connected" visible.
  - **Waking up (cold start):** first call rejects (`timeout` or `not-ready`), second pending → "Waking up the server…" visible after the first failure.
  - **Cold start recovers:** reject, reject, then resolve; advance timers through the backoff (1 s, 2 s) → "Connected", never "Can't reach the server".
  - **Unreachable after window:** always rejects; advance past `SERVER_STATUS_POLICY.wakeWindowMs` plus the last delay → "Can't reach the server" and a button with role `button` and name "Retry". Also asserts that "Waking up…" was shown before.
  - **Retry:** from unreachable, make `checkReady` resolve, press Retry → "Checking the server…" then "Connected". The wake window restarts, which is checked by failing again and confirming it takes another full window to reach unreachable.
  - **Retry busy:** while the retried check is in flight, the button is absent or disabled (`accessibilityState.busy/disabled`).
- **Query key factory:** `serverStatusKeys.ready()` starts with `serverStatusKeys.all` (guards future invalidation).
- **Not tested here:** NativeWind styling output, real network, device runs. Device runs are manual checks (§9 commit 7, README).
- **Manual verification (recorded in the PR):** web Connected → stop API → Retry → unreachable. Android emulator shows a status. iPhone via Expo Go if available. `gen:api` produces no diff.

## 9. Task breakdown (branch `feat/mobile-scaffold`, one commit each, Conventional Commits, no Claude signature)

1. [mobile] Generate the latest stable Expo template in a temp folder, move it into `mobile/` (keep `CLAUDE.md`), strict TS, `@/*` alias, Expo Router + typed routes, name/slug/scheme, remove example code and unused packages, `engines.node` → `chore(mobile): expo app skeleton`
2. [mobile] ESLint flat config (`--max-warnings 0`), Prettier + tailwind plugin + ignore files, Jest (`jest-expo`) config, scripts `typecheck`/`lint`/`format`/`test`/`gen:api` (§4) → `chore(mobile): lint, format and typecheck scripts`
3. [mobile] NativeWind + Tailwind setup (config files per chosen version), theme tokens incl. dark mode, `Screen`/`Text`/`Button` primitives → `feat(mobile): nativewind and ui tokens`
4. [mobile] Run `gen:api` and commit `schema.d.ts`; `base-url.ts`, `client.ts` (openapi-fetch), `health.ts`, `.env.example` → `feat(mobile): typed api client`
5. [mobile] `createQueryClient`, providers in `_layout`, `serverStatusKeys`, `useServerStatus` with `SERVER_STATUS_POLICY`, `ServerStatusCard`, home screen with the 4 states and accessibility basics → `feat(mobile): query provider and server status screen`
6. [mobile] (`test-engineer`) tests from §8 → `test(mobile): server status and api client tests`
7. [docs] Root README "Run locally (mobile)": Node prerequisite, `.env.local`, web / Android emulator / Expo Go steps, LAN + `0.0.0.0` + firewall note, port-8081/CORS troubleshooting. Update `mobile/CLAUDE.md` (e.g. the `health.ts` exception to "API calls only through the generated client") and this spec / ADR-0002 (record SDK + NativeWind versions, set ADR status per human decision) where implementation diverged → `docs: mobile local setup`

## 10. Open questions / risks

- **Node version (blocking):** local Node is v20.10.0. Current Expo SDKs need ≥ 20.19. The human upgrades to the active LTS the chosen SDK lists (22 or 24) before commit 1, and `node -v` is re-checked before the branch is created.
- **NativeWind major version:** v4 (Tailwind 3) or v5 (Tailwind 4), depending on which the NativeWind docs mark stable for the chosen SDK. This changes the config files in §3 and whether Reanimated/worklets are needed. It's decided at implementation and recorded in ADR-0002.
- **iOS can't be verified on Windows:** there's no simulator, so the only check is Expo Go on a physical iPhone. If none is available, the iOS acceptance criterion is reported as "not verified", not claimed.
- **Physical devices:** `localhost` and `10.0.2.2` don't work from a phone. Phones need a LAN `EXPO_PUBLIC_API_URL`, the API bound to `0.0.0.0`, and a Windows firewall inbound rule for port 5165. These are manual steps, documented and not automated.
- **Cleartext HTTP on devices:** Expo Go is expected to allow `http://` to LAN/emulator hosts. This is to be confirmed during the manual device check. If it's blocked, we document it and fix it in a dev-only way; production stays HTTPS.
- **Port 8081 / CORS:** if Expo web starts on another port, CORS blocks the call and the screen shows unreachable after ~90 s. The mitigation is a README note. Should the backend dev CORS also allow a second port? That would be a backend change, so not in this step.
- **503 vs down:** a 503 (API up, DB down) is shown the same as "server down" once the window runs out. Is a distinct message ("Server is up but the database isn't ready") wanted later? It's not in the approved scope.
- **Typed routes and `tsc`:** typed-route declarations are generated by the Expo CLI into `.expo/types` (git-ignored). `typecheck` must pass on a fresh clone without running `expo start` first. If it doesn't, document a generation step. This matters for the later CI step.
- **Prettier hook reach:** once `mobile/node_modules` exists, `.claude/hooks/format.mjs` runs mobile's Prettier on **any** `.md`/`.json`/`.yaml` file an agent edits, including `docs/**` and `backend/**` JSON. Is that intended? It may reformat existing docs tables the next time they're edited, and `backend/openapi/flowpilot.json` is generated by the build, so it should stay untouched. A root `.prettierignore` entry or hook tweak may be wanted. That's a `.claude/` change, so the human decides.
- **Bundle identifiers / package name:** left unset (Expo Go doesn't need them). Decide with EAS builds.
- **Exact versions:** all package versions are latest stable compatible with the chosen Expo SDK at implementation time, recorded in `package-lock.json`, the PR description, and ADR-0002.

## 11. Implementation notes (2026-10-07)

Recorded per the Definition of done; these resolve §10 where possible.

- **Versions:** Expo SDK 57 (RN 0.86, React 19.2), TypeScript 6.0, NativeWind 4.2.7 + Tailwind 3.4, Reanimated 4.5 + react-native-worklets (required by NativeWind v4). Details in ADR-0002.
- **Node:** resolved, local Node is v24.21 LTS. `engines.node` mirrors React Native's range (`^20.19.4 || ^22.13.0 || >=24.3.0`).
- **TypeScript 6:** `openapi-typescript` 7.13 declares a `typescript ^5` peer, so `package.json` has an npm `overrides` entry pointing it at the project's TypeScript. Drop it when openapi-typescript supports TS 6. TS 6 no longer auto-includes `@types/*`, so test files start with `/// <reference types="jest" />`.
- **Packages beyond §4:** `test-renderer` (MIT, required peer of RNTL 14) and `expo-system-ui` (MIT, kept so `userInterfaceStyle: "automatic"` works on Android).
- **Typed routes / `tsc` on a fresh clone:** verified, `typecheck` passes without `.expo/types` or `expo-env.d.ts`.
- **Server status hook:** `queryFn` passes `timeoutMs` to `checkReady` and returns `true` (TanStack Query treats `undefined` data as an error). `cycleStartedAt` is a ref that is reset when a cycle succeeds or gives up, so every new cycle (mount, Retry, reconnect, invalidation) gets a full wake window. `isRetrying` was removed: Retry only renders when nothing is in flight.
- **Accessibility:** the status title uses `aria-live="polite"` (web + Android) and, on iOS, `AccessibilityInfo.announceForAccessibility` on status changes.
- **Web:** page title set via `expo-router/head` and `app/+html.tsx`. `Screen` adds the 20 px gutter to the safe-area insets in `style`, because NativeWind v4 applies `className` beneath `style`.
- **Verified manually (web, real API):** Connected → API stopped → Waking up → Can't reach the server → API restarted + Retry → Connected; CORS on 8081 works.
- **Not verified:** Android emulator / Expo Go, iOS (no device), cleartext HTTP in Expo Go, VoiceOver announcement on a real iPhone.
- **Follow-ups:** a wrapped status title looks left-aligned at narrow widths; production web builds should fail loudly if `EXPO_PUBLIC_API_URL` is unset (deployment step); wire `focusManager`/`onlineManager` to AppState/NetInfo with the first real feature; decide on limiting `.claude/hooks/format.mjs` to `mobile/` (it currently reformats root/docs Markdown).
