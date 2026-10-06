# FlowPilot AI

AI-powered task & project manager that turns messy goals into clear, actionable plans.
iOS · Android · Web — Expo React Native + ASP.NET Core + PostgreSQL + Gemini.

> 🚧 Work in progress. Architecture decisions live in [`docs/adr`](docs/adr), feature specs in [`docs/features`](docs/features).

## Repo layout
- `mobile/` — Expo app (iOS, Android, Web)
- `backend/` — ASP.NET Core Web API
- `docs/` — ADRs and feature specs
- `.claude/` — Claude Code agents, skills and hooks used to develop this project

## Run locally (backend)
Prerequisites: .NET SDK 10 and Docker.

```bash
docker compose -f backend/docker-compose.yml up -d db   # Postgres 17 on 127.0.0.1:5432 (dev-only credentials)
dotnet run --project backend/src/FlowPilot.Api          # Development env uses the compose database
curl http://localhost:5165/health/live                  # 200 when the process is up
curl http://localhost:5165/health/ready                 # 200 when the database is reachable, else 503
```

Build and test:

```bash
dotnet build backend/FlowPilot.sln                                  # also writes backend/openapi/flowpilot.json
dotnet test backend/FlowPilot.sln --filter "Category!=Integration"  # unit + architecture tests
dotnet test backend/FlowPilot.sln                                   # + integration tests (needs Docker)
```
