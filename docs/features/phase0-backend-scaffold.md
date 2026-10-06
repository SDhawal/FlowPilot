# Phase 0 · Step 2 — Backend scaffold

- **Status:** Approved (2026-10-03)
- **Owner:** Dhawal · **Implementer:** `dotnet-backend` agent · **Tests:** `test-engineer` agent

## 1. Problem & acceptance criteria
We need a production-shaped, empty backend that every later feature plugs into.

- **Given** a fresh clone with Docker running, **when** I run `docker compose up -d db` and `dotnet run --project backend/src/FlowPilot.Api`, **then** `GET /health/live` returns 200 and `GET /health/ready` returns 200 (DB reachable).
- **Given** Postgres is stopped, **when** I call `GET /health/ready`, **then** it returns 503 while `/health/live` still returns 200.
- **Given** `dotnet build backend/FlowPilot.sln`, **then** it succeeds with **zero warnings** and writes `backend/openapi/flowpilot.json`.
- **Given** `dotnet test backend/FlowPilot.sln`, **then** unit, architecture and integration tests pass (integration uses Testcontainers).
- **Given** an unhandled exception, **then** the API returns an RFC 7807 ProblemDetails body without a stack trace outside Development.
- **Given** `docker build -f backend/Dockerfile backend`, **then** an image builds and runs as a non-root user on port 8080.

## 2. Out of scope
Auth/Identity, any domain entities, migrations, Gemini, rate limiting policies, CI, deployment. (Later steps/phases.)

## 3. Solution layout
```
global.json                      # repo root: pin .NET 10 (LTS) SDK 10.0.x, rollForward: latestFeature (dotnet looks for it from the CWD, and all commands run from the root)
backend/
├─ FlowPilot.sln                 # classic .sln (create with: dotnet new sln --format sln)
├─ Directory.Build.props         # Nullable, ImplicitUsings, TreatWarningsAsErrors, LangVersion latest, deterministic builds
├─ Directory.Packages.props      # Central Package Management — all versions live here
├─ .editorconfig                 # C# style; file-scoped namespaces; sealed suggestions
├─ docker-compose.yml            # postgres:17 for local dev (dev-only creds, port 5432)
├─ Dockerfile                    # multi-stage, non-root, ASPNETCORE_HTTP_PORTS=8080
├─ .dockerignore
├─ openapi/flowpilot.json        # generated at build, committed
├─ src/
│  ├─ FlowPilot.Domain/          # empty except a marker + README line
│  ├─ FlowPilot.Application/     # DependencyInjection.cs (AddApplication)
│  ├─ FlowPilot.Infrastructure/  # AppDbContext (no entities yet), DependencyInjection.cs (AddInfrastructure), design-time DbContext factory
│  └─ FlowPilot.Api/             # Program.cs, Endpoints/HealthEndpoints.cs, appsettings.json
└─ tests/
   ├─ FlowPilot.UnitTests/
   ├─ FlowPilot.ArchitectureTests/   # NetArchTest.Rules — enforces layer dependencies
   └─ FlowPilot.IntegrationTests/    # WebApplicationFactory + Testcontainers.PostgreSql
```
Project references (inward only): Api → Application, Infrastructure · Infrastructure → Application · Application → Domain · Domain → nothing.

## 4. Key technical decisions
- **Time:** use the built-in `TimeProvider` (register `TimeProvider.System`); tests use `FakeTimeProvider` (Microsoft.Extensions.TimeProvider.Testing). No custom `IClock`.
- **OpenAPI:** built-in `Microsoft.AspNetCore.OpenApi` (`AddOpenApi` / `MapOpenApi` in Development). Build-time generation via `Microsoft.Extensions.ApiDescription.Server` with
  `OpenApiDocumentsDirectory=../../openapi` and `OpenApiGenerateDocumentsOptions=--file-name flowpilot`.
- **Errors:** `AddProblemDetails()`, `UseExceptionHandler()`, `UseStatusCodePages()`.
- **Health:** `/health/live` (no checks; predicate excludes all) and `/health/ready` (DbContext check, tag "ready") via `AddHealthChecks().AddDbContextCheck<AppDbContext>(tags: ["ready"])`.
- **DB:** EF Core + Npgsql provider. Connection string `ConnectionStrings:Default` from user-secrets locally / env var in prod. `appsettings.Development.json` may point at the docker-compose DB with dev-only creds.
  Startup must **not** require a reachable DB or a real connection string: build-time OpenAPI generation runs `Program.cs` during `dotnet build` (including CI with no secrets). Fail on a missing connection string only when the DB is first used, not in `AddInfrastructure`.
- **CORS:** policy `"web"` with origins from `Cors:AllowedOrigins` config array. Base `appsettings.json` is empty (`[]`); the Expo dev origin lives in `appsettings.Development.json`; production sets `Cors__AllowedOrigins__0=https://<pages-domain>`.
- **Logging:** built-in logging; JSON console formatter outside Development.
- **Test runner:** xUnit v3 with `xunit.runner.visualstudio` (VSTest mode) so `dotnet test --filter "Category!=Integration"` from CLAUDE.md keeps working. Do not opt into Microsoft Testing Platform mode.
  *Implementation note:* `xunit.v3` is pinned to **3.2.x**; 4.x drops VSTest support on .NET 10 ("Testing with VSTest target is no longer supported"). Revisit when moving to Microsoft Testing Platform.
- **Application DI:** Application references `Microsoft.Extensions.DependencyInjection.Abstractions` (not the ASP.NET Core shared framework) so `AddApplication()` can extend `IServiceCollection` without pulling the web stack into an inner layer.
- **Docker:** the image build publishes with `-p:OpenApiGenerateDocuments=false`; `flowpilot.json` is generated by the normal `dotnet build` and committed.
- **Packages (all free/OSS):** Npgsql.EntityFrameworkCore.PostgreSQL, Microsoft.EntityFrameworkCore.Design, Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore, Microsoft.Extensions.DependencyInjection.Abstractions, Microsoft.AspNetCore.OpenApi, Microsoft.Extensions.ApiDescription.Server, xunit.v3, xunit.runner.visualstudio, Microsoft.NET.Test.Sdk, Microsoft.AspNetCore.Mvc.Testing, Testcontainers.PostgreSql, NetArchTest.Rules, Shouldly, Microsoft.Extensions.TimeProvider.Testing. **No** FluentAssertions / MediatR / AutoMapper. FluentValidation is deferred to the first feature that validates input.

## 5. API contract
| Method | Route | Auth | Response |
|---|---|---|---|
| GET | `/health/live` | none | 200 `Healthy` |
| GET | `/health/ready` | none | 200 `Healthy` / 503 `Unhealthy` |
| GET | `/openapi/v1.json` | none (Development only) | OpenAPI document |

## 6. Security
- No secrets in any committed file. `docker-compose.yml` uses obvious dev-only credentials and binds to localhost.
- Container runs as non-root (`USER app` from the official aspnet image).
- No exception details in any response, in any environment: `UseExceptionHandler()` + ProblemDetails returns a generic 500; details go to logs only.
- `appsettings.Development.json` and `.env*` are excluded from the Docker image via `.dockerignore`.

## 7. Testing plan
- **Architecture tests:** Domain depends on nothing (no other FlowPilot assembly, no EF Core, no ASP.NET Core); Application does not depend on Infrastructure, Api or ASP.NET Core; Infrastructure does not depend on Api.
- **Integration tests** (`[Trait("Category","Integration")]`): live → 200; ready → 200 with Testcontainers Postgres; ready → 503 with an unreachable connection string (short `Timeout=2` so the test doesn't hang); unknown route → 404 ProblemDetails.
- **Unit tests:** one placeholder test proving the project runs (real unit tests arrive with features).

## 8. Task breakdown (one commit each)
1. [backend] `global.json`, `Directory.Build.props`, `Directory.Packages.props`, `.editorconfig`, solution + 4 src projects + references → `chore(backend): solution skeleton`
2. [backend] Api `Program.cs`: ProblemDetails, CORS, TimeProvider, OpenAPI, health endpoints, DI extension methods → `feat(backend): api host with health checks`
3. [backend] Infrastructure `AppDbContext` + Npgsql + design-time factory; `docker-compose.yml` → `feat(backend): postgres wiring`
4. [backend] Build-time OpenAPI output to `backend/openapi/flowpilot.json` → `chore(backend): emit openapi document at build`
5. [backend] 3 test projects + tests from §7 → `test(backend): architecture and health integration tests`
6. [backend] `Dockerfile`, `.dockerignore` → `chore(backend): production dockerfile`
7. [docs] Update root README "Run locally" section; add `FlowPilot.ArchitectureTests` to `backend/CLAUDE.md`; fix ADR link in root `CLAUDE.md` → `docs: backend local setup`

## 9. Open questions / risks
- Testcontainers needs Docker Desktop running on Windows (WSL2 backend).
- Microsoft.AspNetCore.OpenApi on .NET 10 emits OpenAPI 3.1 by default; openapi-typescript supports 3.1.
- Exact package versions are chosen at implementation time (latest stable compatible with the pinned SDK) and recorded in `Directory.Packages.props`.
