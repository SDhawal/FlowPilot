# FlowPilot AI

[![CI](https://github.com/SDhawal/FlowPilot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/SDhawal/FlowPilot/actions/workflows/ci.yml)

AI-powered task & project manager that turns messy goals into clear, actionable plans.
iOS · Android · Web — Expo React Native + ASP.NET Core + PostgreSQL + Gemini.

> 🚧 Work in progress. Architecture decisions live in [`docs/adr`](docs/adr), feature specs in [`docs/features`](docs/features).

**Live:** [web app](https://flowpilot.pages.dev) · [API version](https://flowpilot-api-9e2u.onrender.com/health/version) (free tier: the first request after 15 min idle takes ~1 min while the server wakes up)

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

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every PR to `main`, every push to `main`, and on demand. Three jobs run in parallel on a fresh Ubuntu VM, and a branch-protection ruleset on `main` is configured to require all three to pass before merging. Spec: [`docs/features/phase0-ci.md`](docs/features/phase0-ci.md).

| Job       | Checks                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `backend` | build (0 warnings) · OpenAPI drift · unit + architecture tests · integration tests (Testcontainers Postgres)       |
| `mobile`  | `npm ci` · client drift · typecheck · lint · format · tests · web build (`expo export`) · repo-wide Prettier check |
| `docker`  | API image builds (never pushed)                                                                                    |
| `deploy`  | `main` only, after the three above: see [Deployment](#deployment)                                                  |

Reproduce any failing step locally with the same command, from the repo root:

```bash
dotnet build backend/FlowPilot.sln && git status --porcelain backend/openapi/   # OpenAPI drift: must print nothing
npm --prefix mobile run gen:api && git status --porcelain mobile/src/lib/api/   # client drift: must print nothing
npm --prefix mobile run typecheck && npm --prefix mobile run lint && npm --prefix mobile run format:check
npm --prefix mobile test -- --ci
EXPO_PUBLIC_API_URL=https://api.example.invalid npm --prefix mobile run export:web   # web build check
node mobile/node_modules/prettier/bin/prettier.cjs --check --ignore-path .gitignore --ignore-path .prettierignore "**/*.{md,json,yml,yaml,css,mjs}" "!mobile/**"
docker build -f backend/Dockerfile -t flowpilot-api:ci backend
```

**A drift check failed?** A generated file is out of date: run the command shown in the step's error and commit the result. **Dependabot** ([`.github/dependabot.yml`](.github/dependabot.yml)) opens weekly grouped update PRs for GitHub Actions, npm and NuGet. They run the same CI and are merged by a human. Expo-managed packages are upgraded only together, during an Expo SDK upgrade.

## Deployment

Every merge to `main` ships itself (continuous deployment), all on free tiers with no card on file. Decision: [ADR-0003](docs/adr/0003-deployment-and-delivery.md) · design: [`docs/features/phase0-deploy.md`](docs/features/phase0-deploy.md) · setup, rotation and rollback: [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).

```
merge → CI (backend · mobile · docker) → migrate (EF bundle → Neon) → deploy (Render hook, exact SHA) → verify (/health/version = SHA, /health/ready = 200)
```

| Piece    | Host             | How it ships                                                                    |
| -------- | ---------------- | ------------------------------------------------------------------------------- |
| API      | Render (Docker)  | the `deploy` job calls Render's deploy hook after migrating; auto-deploy is off |
| Database | Neon (Postgres)  | the `deploy` job applies an EF Core migration bundle; never at app startup      |
| Web      | Cloudflare Pages | Pages builds `main` itself (`npm run export:web`); every PR gets a preview URL  |

The `deploy` job only gets its secrets from the GitHub `production` environment, which only `main` can use, so PR runs never see them. A deploy counts as done only when the API reports the merged commit, not just when it's up.
