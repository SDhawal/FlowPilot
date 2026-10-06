# Backend — ASP.NET Core

## Projects (Clean Architecture; dependencies point inward)
```
src/FlowPilot.Domain          Entities, enums, domain rules. No dependencies.
src/FlowPilot.Application     Use cases (feature folders), DTOs, validators, interfaces (IAiProvider, ICurrentUser).
src/FlowPilot.Infrastructure  EF Core DbContext + migrations, Gemini adapter, Identity, external services.
src/FlowPilot.Api             Minimal API endpoint groups, auth, rate limiting, ProblemDetails, OpenAPI.
tests/FlowPilot.UnitTests         xUnit, no I/O.
tests/FlowPilot.ArchitectureTests NetArchTest.Rules; enforces layer dependencies (Domain -> nothing, Application -> Domain only and no ASP.NET Core, Infrastructure !-> Api).
tests/FlowPilot.IntegrationTests  xUnit + WebApplicationFactory + Testcontainers (Postgres). [Trait("Category","Integration")]
```
Domain must not reference EF Core. Api must not contain business logic.

## Conventions
- Nullable enabled, `TreatWarningsAsErrors` on. File-scoped namespaces. `sealed` by default.
- Feature folders: `Application/Tasks/CreateTask/{CreateTaskCommand,CreateTaskHandler,CreateTaskValidator}.cs`.
  Plain handler classes registered in DI — no MediatR.
- DTOs are `record`s. Never return EF entities from endpoints.
- Validation with FluentValidation (Apache-2.0). Errors returned as RFC 7807 ProblemDetails.
- Async everywhere, pass `CancellationToken` through.
- IDs: `Guid.CreateVersion7()`. Time from the built-in `TimeProvider` (never `DateTime.Now`); tests use `FakeTimeProvider`.
- User scoping: EF global query filter on `UserId` + `ICurrentUser`. Never call `IgnoreQueryFilters()` in request paths.
- Queries: `AsNoTracking()` for reads, project to DTOs with `Select`, index every FK and filter column.
- Endpoints grouped per feature: `app.MapGroup("/api/tasks").RequireAuthorization()`.

## AI
- All AI calls go through `IAiProvider` (Application). `GeminiAiProvider` lives in Infrastructure.
- Prompts live in `Infrastructure/Ai/Prompts/*.md` (versioned files), not inline strings.
- Use Gemini structured output (response schema). Deserialize into typed records, validate, then return.
- On malformed AI output: retry once, then return 502 ProblemDetails with a friendly message.
- Rate limiter policy `"ai"`: per-user fixed window + daily cap. Cap input length.
- Treat user text as data in prompts (delimit it); never let it change instructions.

## Config & secrets
- Local: `dotnet user-secrets` for `Gemini:ApiKey`, `ConnectionStrings:Default`, `Jwt:SigningKey`.
- Production: environment variables on Render. Nothing secret in `appsettings*.json`.

## OpenAPI
- Build emits `backend/openapi/flowpilot.json`; commit it. The mobile client is generated from it.
