# FlowPilot AI

AI-powered task & project manager that turns messy goals into actionable plans.
Portfolio project built to senior-engineer standards. Runs on **free tiers only**.

## Stack (see docs/adr/0001-technology-stack.md)
- **mobile/** — Expo + React Native + TypeScript, Expo Router. One codebase for iOS, Android, Web.
- **backend/** — ASP.NET Core Web API (.NET LTS), EF Core, PostgreSQL (Neon), JWT auth (ASP.NET Core Identity).
- **AI** — Google Gemini, called ONLY from the backend through `IAiProvider`. The app never calls Gemini.
- **Hosting** — API on Render (Docker), web on Cloudflare Pages, DB on Neon. CI on GitHub Actions.

## Repo map
```
backend/    .NET solution (Api, Application, Domain, Infrastructure, Tests) — has its own CLAUDE.md
mobile/     Expo app — has its own CLAUDE.md
docs/adr/   Architecture Decision Records (numbered, immutable once Accepted)
docs/features/  One spec per feature, written by the architect agent before coding
.claude/    agents, skills, hooks, settings
```

## Commands
| Task | Command |
|---|---|
| Backend build | `dotnet build backend/FlowPilot.sln` |
| Backend unit tests | `dotnet test backend/FlowPilot.sln --filter "Category!=Integration"` |
| Backend all tests (needs Docker) | `dotnet test backend/FlowPilot.sln` |
| Run API | `dotnet run --project backend/src/FlowPilot.Api` |
| Add migration | `dotnet ef migrations add <Name> -p backend/src/FlowPilot.Infrastructure -s backend/src/FlowPilot.Api` |
| App dev server | `npm --prefix mobile run start` |
| App checks | `npm --prefix mobile run typecheck` · `npm --prefix mobile run lint` · `npm --prefix mobile test` |
| Regenerate API client | `npm --prefix mobile run gen:api` (reads `backend/openapi/flowpilot.json`) |

## How we work
1. Every feature starts as a GitHub issue with acceptance criteria.
2. Use **plan mode** + the `architect` agent → `docs/features/<feature>.md`. A human approves it before code.
3. Branch `feat/<short-name>`. Small commits, Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
4. Backend first → `/gen-client` → frontend.
5. `test-engineer` adds tests; `code-reviewer` reviews the diff; fix BLOCKERs before opening a PR.
6. Never push or merge without the human. Never commit to `main` directly.
7. Formatting is automatic: `.claude/hooks/format.mjs` formats every file an agent edits — backend `*.cs` via `dotnet format whitespace`, `mobile/` via its Prettier config + ESLint, and other Markdown/JSON/YAML via the root `.prettierrc.json`. Generated files (`backend/openapi/`, `package-lock.json`, `schema.d.ts`, EF migrations) are listed in `.prettierignore` and never reformatted.

## Definition of done
- Builds with zero warnings; lint + typecheck pass.
- New behavior has tests (unit for logic, integration for endpoints).
- API contract changed → client regenerated and committed in the same PR.
- No secrets in code, logs, or commits. New config documented in `.env.example` / `appsettings.json` with placeholder values.
- Feature spec updated if implementation diverged from it.

## Non-negotiable rules
- Every data query is scoped to the current user. No endpoint may return another user's data.
- AI output is a **suggestion**: stored as `AiSuggestion`, applied only when the user accepts.
- AI responses use a JSON schema (structured output) and are validated server-side before returning.
- All AI endpoints are rate-limited per user, and inputs are length-capped.
- Timestamps are UTC (`DateTimeOffset` / ISO-8601). Due dates are date-only. "Today" uses the user's IANA timezone.
- Prefer free / OSS libraries. Do NOT add packages with commercial licenses (e.g. FluentAssertions v8+, MediatR v13+, AutoMapper v15+). Ask before adding any new dependency.
- Do not edit existing EF migrations, `.env*` files, or production config.
- Do not add claude's signature in commits.
