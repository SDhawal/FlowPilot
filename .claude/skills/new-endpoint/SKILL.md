---
name: new-endpoint
description: Scaffold a new backend API endpoint (command/query, handler, validator, endpoint mapping, tests) following FlowPilot conventions. Use when adding or changing an API endpoint.
---

# New endpoint: $ARGUMENTS

1. Find the endpoint in the approved spec under `docs/features/`. If it is not specified there, stop and ask — do not invent a contract.
2. Delegate implementation to the `dotnet-backend` agent with this checklist:
   - `Application/<Feature>/<UseCase>/` → request record, response record, handler, FluentValidation validator.
   - Register the handler in DI.
   - Map in `Api/Endpoints/<Feature>Endpoints.cs` inside the feature's `MapGroup`, with `RequireAuthorization()`,
     `.WithName()`, `.Produces<T>()`, `.ProducesValidationProblem()`, and `.RequireRateLimiting("ai")` for AI endpoints.
   - User-scoped data access only.
   - Rebuild so `backend/openapi/flowpilot.json` updates.
3. Delegate tests to the `test-engineer` agent: happy path, 400 validation, 401 unauthenticated, 404 cross-user.
4. Run `dotnet test backend/FlowPilot.sln --filter "Category!=Integration"` and report.
5. Remind: run `/gen-client` before frontend work.
