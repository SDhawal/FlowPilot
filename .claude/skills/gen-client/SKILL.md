---
name: gen-client
description: Regenerate the typed TypeScript API client in mobile/ from the backend OpenAPI document and check for breaking changes. Use after any backend API change.
---
# Regenerate API client

1. `dotnet build backend/FlowPilot.sln` (emits `backend/openapi/flowpilot.json`).
2. `git diff --stat backend/openapi/flowpilot.json` — summarize what changed in the contract (added/removed/changed operations and schemas).
3. `npm --prefix mobile run gen:api` (openapi-typescript → `mobile/src/lib/api/schema.d.ts`).
4. `npm --prefix mobile run typecheck`. Any type errors here are **contract breaks**: list each call site affected.
5. Report: contract changes, regenerated files, breaking call sites. Do not hand-edit generated files.
