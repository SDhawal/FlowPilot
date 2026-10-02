---
name: new-screen
description: Scaffold a new Expo Router screen with its feature folder, query hooks, form schema and tests following FlowPilot conventions. Use when adding a screen or major UI component.
---
# New screen: $ARGUMENTS

1. Find the screen in the approved spec under `docs/features/`. If it is not there, stop and ask.
2. Confirm the endpoints it needs exist in `mobile/src/lib/api` (generated). If not, stop: backend or `/gen-client` is pending.
3. Delegate to the `rn-frontend` agent with this checklist:
   - Route file in `mobile/app/...` that only composes feature components.
   - `src/features/<feature>/api/` → query-key factory + `useXxxQuery` / `useXxxMutation` hooks with correct invalidation.
   - `src/features/<feature>/components/` → presentational components using `src/ui` primitives.
   - `src/features/<feature>/schemas/` → zod schema for any form (React Hook Form + zodResolver).
   - States: loading, empty, error (with retry), cold-start message.
   - Works on web: no native-only API without a `Platform.OS` fallback.
4. Delegate tests to `test-engineer` (RNTL: states + form validation + main interaction).
5. Run `npm --prefix mobile run typecheck`, `lint`, `test` and report. List what to check manually on web, iOS and Android.
