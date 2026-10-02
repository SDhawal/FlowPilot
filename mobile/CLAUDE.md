# Mobile — Expo (iOS, Android, Web)

## Structure
```
app/                     Expo Router routes only (thin: compose feature components)
  (auth)/                login, register
  (app)/                 authenticated tabs: dashboard, projects, tasks, settings
src/features/<feature>/  api/ (query + mutation hooks), components/, hooks/, schemas/ (zod)
src/lib/api/             generated OpenAPI types + typed fetch client (do NOT hand-edit generated files)
src/lib/                 auth, storage, query client, date/time helpers
src/ui/                  shared design-system components + theme tokens
```

## Conventions
- TypeScript `strict`. No `any`; use `unknown` + narrowing.
- **Server state = TanStack Query.** Query keys from a factory per feature (`taskKeys.list(filters)`).
  Mutations invalidate or optimistically update the relevant keys.
- **Client/UI state = Zustand**, small stores, no server data inside them.
- Forms: React Hook Form + zod resolver; zod schemas live in `features/<f>/schemas`.
- API calls only through the generated client in `src/lib/api`. Never `fetch` the API directly in components.
- Every screen handles loading, empty, error, and "server waking up" (cold start) states.
- Must work on iOS, Android **and web**. Avoid native-only APIs without a web fallback (`Platform.OS` guard).
- Accessibility: `accessibilityLabel` on icon buttons, min 44pt touch targets, support dynamic type.
- Dates: display in the device timezone; send the IANA timezone with "today"-based requests.
- Secrets: none in the app. `EXPO_PUBLIC_*` env vars are public by definition.

## Testing
- Jest + React Native Testing Library. Test behavior (what the user sees), not implementation.
- Mock the network at the API-client boundary.
