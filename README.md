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

## Run locally (mobile)

Prerequisites: Node.js LTS (≥ 20.19.4; 22 or 24 recommended) and the backend running (see above).

```bash
npm --prefix mobile ci                  # install exact versions from package-lock.json
npm --prefix mobile run web             # Expo web on http://localhost:8081 → should show "Connected"
```

The home screen checks `GET /health/ready` and shows **Checking → Connected**, **Waking up the server…** while it retries (up to ~90 s, for free-tier cold starts), or **Can't reach the server** with a Retry button.

**API URL.** By default web and iOS use `http://localhost:5165` and the Android emulator uses `http://10.0.2.2:5165` (the emulator's alias for your PC). To override, copy `mobile/.env.example` to `mobile/.env.local`, set `EXPO_PUBLIC_API_URL`, and restart Metro with `npx expo start --clear`.

| Target                            | How                                                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                               | `npm --prefix mobile run web`                                                                                                                                     |
| Android emulator                  | Start an emulator in Android Studio, then `npm --prefix mobile run android`                                                                                       |
| Physical phone (Android / iPhone) | Install **Expo Go**, run `npm --prefix mobile run start`, scan the QR code. Needs the LAN setup below. iOS can only be tested this way on Windows (no simulator). |

**Physical devices** can't reach `localhost`. Set `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:5165`, start the API listening on all interfaces, and allow inbound TCP 5165 in Windows Firewall:

```bash
dotnet run --project backend/src/FlowPilot.Api --urls http://0.0.0.0:5165
```

**Troubleshooting.** Expo web must run on port **8081**: the backend's dev CORS policy only allows `http://localhost:8081`. If Metro picks another port because 8081 is busy, the screen ends on "Can't reach the server". Free the port and restart.

Checks:

```bash
npm --prefix mobile run typecheck
npm --prefix mobile run lint            # zero warnings allowed
npm --prefix mobile test
npm --prefix mobile run gen:api         # regenerate the typed client from backend/openapi/flowpilot.json
```
