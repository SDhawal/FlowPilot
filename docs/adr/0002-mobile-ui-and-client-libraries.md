# ADR-0002: Mobile styling and API client libraries

- **Status:** Accepted (2026-10-07)
- **Date:** 2026-10-05
- **Deciders:** Dhawal Sharma

## Context

ADR-0001 fixed the client stack: Expo + React Native + TypeScript, Expo Router, TanStack Query, and an OpenAPI-generated TypeScript client (openapi-typescript). It left two choices open, and the mobile scaffold ([phase0-mobile-scaffold](../features/phase0-mobile-scaffold.md)) has to make both now, because every later screen depends on them:

1. **How we style components** across iOS, Android and web from one codebase, with theme tokens and light/dark mode.
2. **How generated OpenAPI types turn into HTTP calls**, and how those calls are exposed to TanStack Query.

Constraints:

- One developer.
- Free/OSS only (no commercial licenses).
- Must work on web as well as native.
- `mobile/CLAUDE.md` requires query keys from a per-feature factory, API calls only through `src/lib/api`, and the network mocked at that boundary in tests.
- The backend emits OpenAPI 3.1 at build (`backend/openapi/flowpilot.json`).

## Options considered

### Styling

| Option                              | Pros                                                                                                                                                                     | Cons                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **StyleSheet + hand-rolled tokens** | Zero dependencies; built into RN; no build-tool coupling; fully typed style objects                                                                                      | Verbose; we'd build our own theming, dark mode and responsive helpers; slower UI work for a solo dev; drift between screens without discipline                                                                                                                                                             |
| **NativeWind (Tailwind for RN)**    | Tailwind utility classes on iOS/Android/web; tokens in one Tailwind config; built-in dark-mode and platform variants; fast iteration; large Tailwind knowledge base; MIT | Adds Babel/Metro config coupling and, depending on version, a Reanimated peer; major versions are tied to specific Tailwind/Expo versions (v4 ↔ Tailwind 3, v5 ↔ Tailwind 4), so upgrades need care; class names are strings (typos aren't type errors; the Prettier plugin and conventions mitigate this) |
| **Tamagui**                         | Typed design system with tokens and themes; optimizing compiler; ready-made components                                                                                   | Larger surface and steeper learning curve; compiler and config complexity; heavier lock-in to its component model; more than a scaffold-stage app needs                                                                                                                                                    |

### API client

| Option                                                      | Pros                                                                                                                                                                                                                                                                                                                                             | Cons                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **openapi-typescript + openapi-fetch**                      | Types-only generation (one `.d.ts`, no runtime codegen); tiny runtime fetch wrapper typed against `paths` (URL, params, body and response all checked); the same authors publish both; supports OpenAPI 3.1; we write TanStack Query hooks ourselves, so they follow our key-factory convention; easy to mock at the `src/lib/api` boundary; MIT | We hand-write one small hook per endpoint; no generated mocks                                                                                                                                                                                   |
| **Hand-written fetch wrapper + generated types**            | Full control; no runtime dependency                                                                                                                                                                                                                                                                                                              | We'd re-implement typed path/param/body plumbing that openapi-fetch already does; easy to get typing subtly wrong; more code to review and test                                                                                                 |
| **Generated hooks (orval-style, or `openapi-react-query`)** | Least hand-written code; hooks and keys generated per operation; orval can also generate mocks                                                                                                                                                                                                                                                   | Generated query keys don't follow our `xKeys` factory convention, which makes invalidation patterns less explicit; a bigger generated surface to review in each PR; more codegen config; ties generated code to a specific TanStack Query major |

## Decision

- **Styling: NativeWind (Tailwind).** Theme tokens (colors incl. dark, spacing, typography, radii) live in the Tailwind config and are named in `src/ui/tokens.ts`. Shared primitives (`Screen`, `Text`, `Button`) live in `src/ui`. No third-party component library. We use the NativeWind/Tailwind version pair the NativeWind docs mark stable for the Expo SDK chosen at implementation. _Recorded at implementation:_ Expo SDK **57** (React Native 0.86, React 19.2), NativeWind **4.2.7** (npm `latest`; v5 was still a release candidate), Tailwind **3.4**, Reanimated required: **yes** (`react-native-css-interop` peer; Reanimated 4.5 + `react-native-worklets`). Config shape is v4: `babel.config.js` (`jsxImportSource: "nativewind"` + `nativewind/babel`), `metro.config.js` (`withNativeWind`), `tailwind.config.js` (tokens, `darkMode: "media"`), `global.css`. Note: NativeWind v4 merges `className` styles _under_ the `style` prop, so a `style` value for the same property wins.
- **API client: openapi-typescript + openapi-fetch.** `npm run gen:api` generates `src/lib/api/schema.d.ts` (committed, never hand-edited). `src/lib/api/client.ts` exports one `createClient<paths>()` instance using the configured base URL.
- **Server state: TanStack Query** (reaffirming ADR-0001). Each feature writes its own hooks under `src/features/<f>/api/` on top of `apiClient`, with a query-key factory.
- **One documented exception:** health-check endpoints aren't part of OpenAPI, so `src/lib/api/health.ts` makes the only hand-written HTTP call. It lives inside `src/lib/api`, never in components.

## Consequences

- \+ Fast, consistent styling across iOS, Android and web from one token source; dark mode with no custom theming code.
- \+ End-to-end typed API calls with a minimal runtime. Contract breaks show up as `typecheck` errors after `/gen-client`.
- \+ Hooks and query keys stay explicit and reviewable, and tests mock one boundary (`src/lib/api`).
- − NativeWind couples us to the Babel/Metro config and to a specific Tailwind major. Expo SDK upgrades must check NativeWind compatibility first. A NativeWind major upgrade is a deliberate task, not a routine bump.
- − Class-name strings aren't type-checked. We rely on `prettier-plugin-tailwindcss` for ordering and on the `src/ui` primitives to keep usage narrow.
- − A small hook has to be written by hand for every new endpoint (accepted cost; it's where loading/empty/error/cold-start handling belongs anyway).
- − `mobile/CLAUDE.md` must mention the `health.ts` exception so reviewers don't flag it.
- Reversibility: moving off NativeWind means rewriting `className` usage, so we keep it inside `src/ui` and feature components. Switching from openapi-fetch to generated hooks later is local to `src/lib/api` and the feature `api/` folders.
- All chosen packages are MIT. No cost.
