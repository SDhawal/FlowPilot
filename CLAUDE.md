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
docs/runbooks/  Operational how-tos (deploy setup, secret rotation, rollback)
render.yaml     Render Blueprint for the production API
.claude/    agents, skills, hooks, settings
```

## Commands

| Task                             | Command                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend build                    | `dotnet build backend/FlowPilot.sln`                                                                                                                                                         |
| Backend unit tests               | `dotnet test backend/FlowPilot.sln --filter "Category!=Integration"`                                                                                                                         |
| Backend all tests (needs Docker) | `dotnet test backend/FlowPilot.sln`                                                                                                                                                          |
| Run API                          | `dotnet run --project backend/src/FlowPilot.Api`                                                                                                                                             |
| Restore tools (dotnet-ef)        | `dotnet tool restore` (version pinned in `.config/dotnet-tools.json`)                                                                                                                        |
| Add migration                    | `dotnet ef migrations add <Name> -p backend/src/FlowPilot.Infrastructure -s backend/src/FlowPilot.Infrastructure`                                                                            |
| Build migration bundle           | `dotnet ef migrations bundle -p backend/src/FlowPilot.Infrastructure -s backend/src/FlowPilot.Infrastructure -o efbundle --self-contained -r linux-x64` (CI does this; `-r win-x64` locally) |
| Web production build             | `npm --prefix mobile run export:web` (needs `EXPO_PUBLIC_API_URL`)                                                                                                                           |
| App dev server                   | `npm --prefix mobile run start`                                                                                                                                                              |
| App checks                       | `npm --prefix mobile run typecheck` · `npm --prefix mobile run lint` · `npm --prefix mobile test`                                                                                            |
| Regenerate API client            | `npm --prefix mobile run gen:api` (reads `backend/openapi/flowpilot.json`)                                                                                                                   |

## How we work

1. Every feature starts as a GitHub issue with acceptance criteria (`/issue-draft`; forms in `.github/ISSUE_TEMPLATE`).
2. Use **plan mode** + the `architect` agent → `docs/features/<feature>.md`. A human approves it before code.
3. Branch `feat/<short-name>`. Small commits, Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `style:`, `ci:`).
4. Backend first → `/gen-client` → frontend.
5. `test-engineer` adds tests; `code-reviewer` reviews the diff; fix BLOCKERs before opening a PR.
6. PR title and body come from `/pr-draft` (same headings as `.github/PULL_REQUEST_TEMPLATE.md`). Never push or merge without the human. Never commit to `main` directly. A PR merges only when CI (`.github/workflows/ci.yml`) is green: required checks `backend`, `mobile`, `docker`.
7. Formatting is automatic: `.claude/hooks/format.mjs` formats every file an agent edits — backend `*.cs` via `dotnet format whitespace`, `mobile/` via its Prettier config + ESLint, and other Markdown/JSON/YAML via the root `.prettierrc.json`. Generated files (`backend/openapi/`, `package-lock.json`, `schema.d.ts`, EF migrations) are listed in `.prettierignore` and never reformatted.
8. **Hands-on rule: the human runs the operational commands.** The main session gives each command with what it does, why, and what success and failure look like. The human runs it and shares the output, and the session interprets it. This covers Docker, `psql`/SQL, `dotnet ef` (migrations, bundles), `git` beyond read-only (branch, commit, push, merge), CI/CD triggers, dashboard changes (Render, Neon, Cloudflare, GitHub settings) and any install.
   - The main session may run builds and tests (`dotnet build`, `dotnet test`, `npm` checks) and read-only inspection (`git status`/`log`/`diff`, reading files). It names each command it ran and what it was for.
   - Subagents (`test-engineer`, `code-reviewer`, …) stay autonomous.
9. **Debrief after every completed task:** what we built, why this way (and the alternative rejected), what broke and how we found it, interview angle (likely questions with one-line answers), concepts to revise. Give it in chat, and append it to the human's private learning log (`notes/learning-log.md`, excluded from git via `.git/info/exclude`) when that file exists.

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
