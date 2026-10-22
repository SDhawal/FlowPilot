# Phase 0 · Step 5 — Deploy the walking skeleton (continuous delivery)

- **Status:** Approved (2026-10-21) · Issue: _TBD (drafted by the main session, created by the human)_
- **Owner:** Dhawal · **Implementer:** main session (Claude) + `test-engineer` agent for tests · **Review:** `code-reviewer` agent
- **Related:** [ADR-0001](../adr/0001-technology-stack.md) (Render + Neon + Cloudflare Pages + GitHub Actions), [ADR-0002](../adr/0002-mobile-ui-and-client-libraries.md) (health-check exception to the generated client), [phase0-backend-scaffold](phase0-backend-scaffold.md), [phase0-mobile-scaffold](phase0-mobile-scaffold.md), [phase0-ci](phase0-ci.md)
- **ADR:** [ADR-0003 — Deployment and delivery](../adr/0003-deployment-and-delivery.md) (Accepted). Migration strategy, deploy trigger and web delivery path are hard to reverse once auth and real data exist, so they get an ADR.
- **Approved plan:** `there-is-no-roadmap-dreamy-sloth.md` (human-approved). This spec turns it into a reviewable design. Anything marked _small addition to the plan_ is a detail the plan didn't spell out; anything marked _unverified_ says how it gets verified.

## 1. Problem & acceptance criteria

`main` is CI-gated (PR #5, [phase0-ci](phase0-ci.md)) but **nothing runs in production**. The ADR-0001 hosting split (API on Render, Postgres on Neon, web on Cloudflare Pages) exists only on paper. We deploy the skeleton **now, while it's tiny**, for two reasons:

- Production-only problems surface while there are just two health endpoints and one screen: Render's TLS-terminating proxy, Neon's SSL requirement, CORS for the real web domain, a real cold start, and a web build that doesn't know the API URL.
- The **migration and secrets strategy exists before auth** adds the first EF migration and the JWT signing key. Retrofitting delivery under a real schema is much riskier.

After this step, every merge to `main` ships automatically: CI → migrate → deploy → verify. Everything stays on free tiers; **no payment method is ever added** to any provider (§8.4).

Acceptance criteria:

- **Given** a PR merged to `main` with green `backend`, `mobile` and `docker` jobs, **when** the `push` run on `main` reaches the `deploy` job, **then** it builds an EF migration bundle, applies it to Neon, triggers the Render deploy hook for **exactly that commit SHA**, and finishes green **only after** `GET /health/version` on the production API returns `{"commit":"<that SHA>"}` and `GET /health/ready` returns 200.
- **Given** any PR run (same-repo branch, fork or Dependabot), **when** CI runs, **then** the `deploy` job is **skipped**, no production secret is exposed to the run, and nothing in Neon, Render or Pages production changes. **And** even if a PR edited `ci.yml` to remove the `if:` guard, the `production` environment's branch policy (only `main`) refuses to hand the job its secrets.
- **Given** one of `backend`, `mobile`, `docker` fails on the `main` push run, **then** `deploy` doesn't start (it `needs:` all three).
- **Given** the deploy hook was accepted but the new version never comes up (Render build fails, container crash-loops, health check fails, `RENDER_GIT_COMMIT` missing), **when** ~15 min pass without `/health/version` reporting the merge SHA, **then** the `deploy` job fails, the `main` run turns **red**, GitHub notifies the owner, and Render keeps serving the previous healthy deploy.
- **Given** `/health/version` reports the merge SHA but `/health/ready` doesn't return 200 (e.g. Neon unreachable or wrong connection string), **then** the `deploy` job fails red.
- **Given** two merges to `main` in quick succession, **then** their deploys **never overlap**: a running deploy always finishes, and if several are pending, only the newest one runs (latest commit wins).
- **Given** the Cloudflare Pages project has **no** `EXPO_PUBLIC_API_URL`, **when** Pages builds the site, **then** `expo export` **fails at build time** with a message naming the variable, and the previous Pages deployment stays live. The same applies to any production (`!__DEV__`) bundle.
- **Given** `EXPO_PUBLIC_API_URL` is unset in development (`__DEV__`), **then** the existing per-platform localhost defaults still apply (mobile scaffold behaviour unchanged).
- **Given** a PR is opened, **when** Pages builds its preview, **then** the preview URL (`https://<hash>.<project>.pages.dev` or the branch alias) loads, calls the production API, and shows **Connected**. The browser accepts the response because the preview origin matches the `https://*.<project>.pages.dev` CORS entry.
- **Given** an origin that isn't configured (e.g. `https://evil.example`, `https://evil-<project>.pages.dev`, `https://<project>.pages.dev.evil.example`, or `http://<project>.pages.dev`), **when** it sends a CORS preflight or a request with `Origin`, **then** the response carries **no** `Access-Control-Allow-Origin` header, so the browser blocks it.
- **Given** the API has been idle for > 15 min (Render spun down, Neon scaled to zero), **when** someone opens the production web URL, **then** the screen shows **Waking up the server…** and then **Connected** (Render wake ~1 min + Neon wake ~1 s), within the existing ~90 s wake window.
- **Given** a request that reaches the API through Render's proxy with `X-Forwarded-Proto: https` and `X-Forwarded-For: <client-ip>`, **when** the app runs outside Development, **then** `HttpContext.Request.Scheme` is `https` and `Connection.RemoteIpAddress` is the forwarded client IP. **Given** the Development environment, **then** forwarded headers are ignored.
- **Given** the API runs without `RENDER_GIT_COMMIT` (locally, in tests), **when** `GET /health/version` is called, **then** it returns 200 `{"commit":"dev"}`.
- **Given** the backend change adds `/health/version`, **when** CI runs, **then** the committed `backend/openapi/flowpilot.json` and `mobile/src/lib/api/schema.d.ts` contain it (both drift checks pass).
- **Given** a fresh clone, **when** a developer follows `docs/runbooks/deploy.md`, **then** they can create every account, secret and setting from scratch without a payment method, and know how to rotate secrets, roll back, and why cold starts happen.

## 2. Out of scope

- **Auth** (Identity, JWT signing key). The secrets inventory (§8.1) reserves the slot; the key itself arrives with the auth feature.
- **Custom domains** (we use `*.onrender.com` and `*.pages.dev`).
- **A staging environment.** PR previews call the **production** API (§8.3).
- **Neon branching per PR** (database-per-preview).
- **Observability / alerting** beyond GitHub's failed-run notification: no uptime monitor, log shipping, APM or error tracking.
- **Native app-store builds** (EAS, TestFlight, Play). ADR-0001 defers store publishing.
- **Rollback automation.** Rollback is a manual Render dashboard action; migrations are forward-fix only (runbook).
- **Keep-alive pinger** to avoid cold starts. Deliberately rejected (§4).
- **Atomic web + API releases** (Pages direct upload from Actions). Recorded as a revisit trigger in ADR-0003.
- Dependabot for the `docker` ecosystem (deferred by the CI spec to "the deployment phase"; the approved plan doesn't include it, see §11).

## 3. Solution layout

```
.config/
└─ dotnet-tools.json                       # NEW  local tool: dotnet-ef 10.0.x (MIT), same version as EF Core Design
.github/workflows/ci.yml                   # EDIT + job `deploy`; placeholder EXPO_PUBLIC_API_URL on the web build step
render.yaml                                # NEW  Render Blueprint: one free Docker web service, autoDeploy off
backend/src/FlowPilot.Api/
├─ Program.cs                              # EDIT forwarded headers (outside Development), CORS wildcard subdomains
└─ Endpoints/HealthEndpoints.cs            # EDIT + GET /health/version
backend/openapi/flowpilot.json             # REGENERATED (now contains /health/version)
backend/tests/FlowPilot.IntegrationTests/
├─ ApiFactory.cs                           # EDIT optional extra settings (CORS origins, RENDER_GIT_COMMIT, environment)
├─ VersionEndpointTests.cs                 # NEW
├─ CorsTests.cs                            # NEW
└─ ForwardedHeadersTests.cs                # NEW
mobile/src/lib/api/
├─ base-url.ts                             # EDIT throw in production builds when EXPO_PUBLIC_API_URL is unset
├─ __tests__/base-url.test.ts              # EDIT
└─ schema.d.ts                             # REGENERATED (gen:api)
docs/runbooks/deploy.md                    # NEW  account setup, connection string format, rotation, rollback, cold start
docs/adr/0003-deployment-and-delivery.md   # NEW  (Proposed)
docs/features/phase0-deploy.md             # this spec
README.md                                  # EDIT live links, delivery diagram, "Deployment" section
CLAUDE.md                                  # EDIT Commands: "Build migration bundle"
backend/CLAUDE.md                          # EDIT migrations ship through the pipeline, never at startup
```

Not changed: `backend/Dockerfile`, `DesignTimeDbContextFactory` (kept as is; the bundle always gets `--connection`, §4), `AppDbContext`, `appsettings*.json` (production values come from Render env vars), every existing EF migration (there are none yet), `.env*` files.

No domain or data-model change: **zero EF migrations exist**, so the first bundle run only creates `__EFMigrationsHistory`. No AI. No new screens; the existing server-status screen is the production smoke test.

## 4. Key technical decisions (and why)

The human is using this step to prepare for interviews, so each decision gives its reason, the trade-off, and the interview angle.

- **Continuous delivery, not just continuous integration.**
  - **CI** answers "is this commit good?": build, tests, contract drift, on every PR and push. **CD** answers "is this commit running in production?": every green commit on `main` is released automatically, with the release itself verified.
  - (Strictly, _continuous delivery_ means every commit is _releasable_ and a human may press the button; _continuous deployment_ means it is released automatically. We do the latter. Saying this distinction out loud is a common interview point.)
  - _Why now:_ the cheapest time to build a pipeline is when the app is trivial. Every later feature then ships through a path that's already proven.
  - _Trade-off:_ a bad merge reaches production in minutes. The guards are the required PR checks, migrate-then-verify ordering, and Render keeping the previous deploy when the new one fails.

- **A `deploy` job in the existing `ci.yml`, not a separate workflow.**
  - `needs: [backend, mobile, docker]` makes "deploy only what CI just proved green, in the same run" a one-liner. A separate workflow would need `workflow_run` chaining, which is harder to read and reason about (it also runs with the base repo's privileges, a classic footgun).
  - `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`. PR runs and manual `workflow_dispatch` runs skip it.
  - It's **not** a required check. Required checks are for PRs, and `deploy` never runs on PRs.

- **GitHub Environment `production` with a branch policy (defense in depth).**
  - Environment secrets are exposed **only** to jobs that declare `environment: production`, and the deployment branch policy allows **only `main`**.
  - Two independent locks: the `if:` keeps the job from running on PRs, and the branch policy keeps secrets away from any other ref even if someone edits the `if:` in a PR. A PR run's ref is `refs/pull/N/merge`, which the policy rejects. Fork PRs get no secrets at all by GitHub's design.
  - _Bonus:_ GitHub records each run as a **deployment** on the Environments page, so there's a free deployment history. _Small addition to the plan:_ set `environment.url` to `${{ vars.API_BASE_URL }}/health/version` so each deployment links to its proof.
  - _Interview angle:_ "How do you stop a malicious PR from reading prod secrets?" → `pull_request` (never `pull_request_target`), environment-scoped secrets, branch policy, least-privilege token.

- **Concurrency for deploys: `group: deploy-production`, `cancel-in-progress: false` (job level).**
  - Deploys must **never overlap**: two concurrent bundle runs racing on one database, or two hooks fighting over which commit is live, is exactly the kind of bug that's impossible to reproduce.
  - `cancel-in-progress: false` means a running deploy is never killed halfway (half-applied migration, hook fired but unverified).
  - GitHub keeps only **one pending** job per group and cancels older pending ones. For CI that was a problem (phase0-ci §11). For deploys it's what we want: the newest pending commit already contains everything older ones had, including all migrations, because the bundle contains **all** migrations and applies only the missing ones.
  - This is job-level, separate from the workflow-level `ci-…` group, so it doesn't change how CI runs are grouped.

- **Render deploy hook from the pipeline, `autoDeploy: false`.**
  - Render can auto-deploy on every commit, or "after CI checks pass". Both start a deploy **without running our migrations first**, and Render's own pre-deploy command is paid-only. So the pipeline owns the order: migrate, _then_ deploy.
  - `autoDeploy: false` is **critical**: if auto-deploy stayed on, Render would race the pipeline and could start new code before its migration ran.
  - The hook is called with `?ref=<sha>` (appended as `&ref=$GITHUB_SHA`, since the hook URL already carries its key as a query parameter), so Render builds **exactly** the commit CI tested, not "whatever `main` is now". _Unverified:_ that `ref` is honoured with auto-deploy off (§11).
  - _Trade-off:_ the hook URL is a bearer secret (anyone holding it can trigger deploys of refs in our repo). It lives only in the `production` environment and can be regenerated in Render (runbook).

- **Migrations: EF Core migration bundle, built and applied by the pipeline.**
  - `dotnet ef migrations bundle … --self-contained -r linux-x64` produces a single executable that applies pending migrations. It's EF's recommended production approach: no SDK or source code needed at apply time, idempotent (applies only what `__EFMigrationsHistory` lacks), and it takes the connection string as an argument.
  - Alternatives and why not:
    - **`Database.Migrate()` at app startup:** every instance races to migrate (a real problem once you scale out), the runtime DB user needs DDL rights, and a slow or failing migration turns into a crash-looping container failing health checks. Microsoft's docs advise against it for production.
    - **Render pre-deploy command:** the right shape, but paid-only.
    - **Generated idempotent SQL script (`migrations script --idempotent`) run with `psql`:** works, but needs `psql` and the script is less self-contained than the bundle. Fine as a fallback.
  - `--self-contained` means the bundle doesn't depend on whichever .NET runtime the runner image happens to have.
  - `--connection` is always passed explicitly, so the bundle never falls back to `DesignTimeDbContextFactory`'s local docker-compose default. That's why the factory stays unchanged (deferred follow-up).
  - `dotnet-ef` is a **local tool** pinned in `.config/dotnet-tools.json` at the same 10.0.x as `Microsoft.EntityFrameworkCore.Design` (currently 10.0.13), so local and CI use the identical version via `dotnet tool restore`. It's MIT and from Microsoft. **New dependency: needs explicit approval.**

- **Order: migrate → deploy → verify, and the expand/contract rule.**
  - Between "migration applied" and "new version live", the **old** app runs against the **new** schema for minutes. And if the deploy fails, the old app keeps running against the new schema indefinitely.
  - So every migration must be **backward compatible with the currently running version**. That is the **expand/contract** (parallel change) pattern: e.g. to rename a column, (1) _expand_: add the new column, deploy code that writes both and reads the new one, backfill; (2) _contract_: in a later release, once no running code reads the old column, drop it. Never rename or drop in one step.
  - Rollback consequence: rolling back the **app** in Render is safe because the schema only ever expanded. Rolling back the **schema** is never automated; we forward-fix with a new migration (runbook).
  - _Interview angle:_ "Migrations before or after the deploy?" Before, with expand/contract; after only works if new code tolerates the old schema, which is usually harder.

- **Deploy verification by version, not just "is it up".**
  - A green `/health/live` after a deploy proves _something_ is running, possibly the **old** version (Render keeps it when the new one fails). Only asking the API "which commit are you?" proves the new code is live.
  - `GET /health/version` returns `{"commit": "<RENDER_GIT_COMMIT or 'dev'>"}`. The pipeline polls until it equals `$GITHUB_SHA`, then checks `/health/ready` is 200 (new code + database reachable with the production connection string).
  - Timeout ~15 min: a free-tier Docker build plus cold start is slow, and every poll has its own `curl --max-time` so a single sleeping request can't hang the loop. On timeout the job fails red and GitHub emails the owner. That's our (only) alerting for deploys.
  - _Teaching point:_ `RENDER_GIT_COMMIT` is read through `IConfiguration` (environment variables are a configuration source), not `Environment.GetEnvironmentVariable`, so tests can set it with in-memory configuration. _Unverified:_ that Render sets it at **runtime** for Docker services (§11).
  - The commit SHA is public anyway (public repo), so exposing it unauthenticated leaks nothing.

- **Render's health check uses liveness (`/health/live`), not readiness.**
  - Render's health check does two things: it **gates deploys** (a new version only gets traffic once healthy) and it **restarts** instances that keep failing.
  - If it used `/health/ready`, a short Neon outage (or Neon's ~1 s wake-up) could make Render restart a perfectly healthy API, which can't fix a database problem and just adds downtime. Same liveness-vs-readiness lesson as the backend scaffold, now with real consequences.
  - Readiness is still checked, by the **pipeline** after each deploy, and by the app's status screen.

- **Forwarded headers: trust Render's proxy, outside Development only.**
  - Render terminates TLS at its proxy and forwards plain HTTP to the container on port 8080. Without `UseForwardedHeaders`, the app thinks every request is `http` from the proxy's IP. That breaks anything that builds absolute URLs or checks HTTPS, and it breaks per-client rate limiting later (every user would share one IP bucket).
  - `ForwardedHeaders = XForwardedFor | XForwardedProto`, registered **first** in the pipeline.
  - **Trust model:** by default ASP.NET Core only accepts forwarded headers from loopback. Render's proxy IPs aren't published or fixed, so we **clear** the known networks/proxies lists, which means "trust whoever is directly connected". That's safe **only because** the container isn't reachable except through Render's proxy. If the app were ever exposed directly, a client could forge `X-Forwarded-Proto`.
  - `ForwardLimit` stays at its default (1): only the **right-most** `X-Forwarded-For` entry (the one Render's proxy appended) is used. A client that sends its own fake `X-Forwarded-For: 1.2.3.4` only adds an entry to the **left**, which is ignored. Whether the right-most entry is the real client IP or an intermediate Render/edge hop is _unverified_ (§11) and matters only once rate limiting arrives.
  - Disabled in Development: locally nothing sits in front of Kestrel, and trusting forwarded headers there would let any local tool spoof them. "Outside Development" includes the `Testing` environment, which is what lets integration tests exercise it.
  - _Alternative considered:_ the `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` env var does the same in one setting with no code. We use code because it's explicit in `Program.cs`, reviewable, and covered by tests. An env var silently missing on a new host would be invisible.
  - _Implementation note:_ in .NET 10, `ForwardedHeadersOptions.KnownNetworks` may be marked obsolete in favour of `KnownIPNetworks`. With `TreatWarningsAsErrors`, use whichever the compiler accepts without a warning; check at implementation.

- **CORS: exact production origin + wildcard for preview subdomains.**
  - Origins come from config, as today: `Cors__AllowedOrigins__0=https://<project>.pages.dev`, `Cors__AllowedOrigins__1=https://*.<project>.pages.dev`. `SetIsOriginAllowedToAllowWildcardSubdomains()` makes the `*.` entry match any **subdomain** of our Pages project (preview hashes and branch aliases).
  - **Risks of wildcards, and why this one is acceptable:**
    - A wildcard is only as safe as **who controls the subdomains**. Only our Cloudflare Pages project can publish under `*.<project>.pages.dev`. A wildcard like `https://*.pages.dev` would be a serious bug: **anyone** can create a Pages project.
    - The match is on the suffix after a dot, so `evil-<project>.pages.dev` and `<project>.pages.dev.evil.example` don't match (integration-tested). The scheme must be `https`.
    - Previews run **unreviewed PR code** on an allowed origin. Today there's no auth, so a preview can only call public health endpoints. Once auth exists, a preview page could make authenticated calls with a user's token. Fork-PR previews are the concern (§11).
    - We don't use `AllowCredentials()` (no cookies). CORS is **not** an authorization mechanism; it only tells browsers which pages may read responses. Server-to-server callers ignore it entirely.
  - `AllowAnyHeader`/`AllowAnyMethod` stay as today; tightening them comes with auth.
  - _Implementation risk:_ `Program.cs` reads `Cors:AllowedOrigins` from `builder.Configuration` **before** `Build()`. Integration tests must confirm `WebApplicationFactory` configuration overrides are visible at that point; if not, move the policy setup into an options-based callback that reads configuration from DI.

- **Neon: direct endpoint for migrations, key=value connection string.**
  - Neon offers a **pooled** endpoint (host contains `-pooler`, PgBouncer in **transaction** mode) and a **direct** endpoint.
  - Migrations use **direct**: EF takes a session-level lock and runs multi-statement DDL in transactions. Transaction pooling hands consecutive statements to different server sessions, which breaks session state like locks and `SET`s.
  - The **runtime** connection string (Render `ConnectionStrings__Default`): the plan doesn't fix pooled vs direct. **Recommendation:** direct as well for now. We run one instance, and Npgsql already pools connections client-side, so PgBouncer adds caveats (prepared statements, session state) without a benefit. Revisit with multiple instances or serverless functions. **Human decision (§11).**
  - **Format gotcha:** Neon's dashboard shows a URL (`postgresql://user:pass@host/db?sslmode=require`). Npgsql wants **key=value**: `Host=<host>;Database=<db>;Username=<user>;Password=<password>;SSL Mode=Require`. Pasting the URL fails with a confusing parse error. Documented in the runbook with a template.
  - `SSL Mode=Require` encrypts the connection. Neon refuses non-TLS connections anyway.

- **No keep-alive pinger (the economics).**
  - Neon Free gives **100 CU-hours/month** and scales compute to zero after 5 min idle (can't be disabled). A compute running non-stop at Neon's smallest size (0.25 CU, if that's the free default; check in the dashboard) uses ~0.25 × 730 h ≈ 180 CU-hours/month, so the allowance is gone in **about two weeks**, then the database is unavailable until the next month.
  - A pinger that hit only `/health/live` wouldn't touch Neon, but it would burn ~730 of Render's 750 free instance-hours on one service and still leave the first real request paying Neon's wake-up. Pinging anything DB-backed (like `/health/ready`, which the status screen calls) would drain Neon as above.
  - Cold starts were accepted in ADR-0001 and the UI already handles them ("Waking up the server…"). That handling becomes a **feature we can demo** instead of a problem to hide.
  - _Interview angle:_ "Why not just ping it?" → understand what the free quota actually meters (Render: instance-hours and bandwidth; Neon: compute-hours) before "fixing" a symptom.

- **Never add a payment method.**
  - Render's Hobby workspace includes **5 GB outbound bandwidth/month**. With a card on file, overage is billed. Without one, the service is **suspended**. Suspension is an acceptable failure for a portfolio demo; a surprise bill isn't.
  - Same rule for Neon and Cloudflare. The runbook says it at each signup.

- **Region co-location.** The API and the database must be in the same region: every query pays the round trip. Default **US East**: Render `virginia` + Neon `aws-us-east-1`. The human picks at setup; whatever they pick, both match.

- **Cloudflare Pages via Git integration (not Vercel, not Workers).**
  - ADR-0001 already chose Pages. Static asset requests are **unmetered** on the free plan, and Git integration gives **PR preview URLs** for free with zero pipeline code.
  - **Workers static assets** is Cloudflare's newer path and is equivalent for a pure static export. Pages keeps ADR-0001 intact and has the simpler dashboard flow. Recorded in ADR-0003.
  - **Vercel** would work technically for a static export, but switching contradicts ADR-0001 for no gain. Its free-plan terms and limits weren't re-researched for this step, and they aren't needed to justify staying.
  - `NODE_VERSION=24` as a Pages env var: Pages builds from root directory `mobile`, so it doesn't see the repo-root `.nvmrc`, and `mobile/package.json` requires `>=24.3.0`.

- **Web/API ordering trade-off (accepted).**
  - Pages builds `main` the moment it's pushed, **independently** of our pipeline. So the new web can be live **minutes before** the new API (which waits for CI + migration + Render build), and Pages deploys even if the `main` CI run later goes red.
  - Why that's acceptable: `main` only receives PRs that already passed required checks, and **API changes stay backward compatible** (the same expand/contract rule as migrations: add fields/endpoints first, use them from the web in a later release, remove the old ones last).
  - Revisit trigger: if we ever need atomic web + API releases, switch to **Pages direct upload from Actions** (`wrangler pages deploy` in the `deploy` job after verification). That costs a Cloudflare API token secret and the loss of zero-config previews. Recorded in ADR-0003.

- **Fail loudly when a production web build has no API URL.**
  - Today `resolveApiBaseUrl` falls back to `http://localhost:5165` when `EXPO_PUBLIC_API_URL` is unset. In production that ships a site that silently calls the **visitor's** localhost, and shows "Can't reach the server" after 90 s. A config bug looks like an outage.
  - New rule: when **not** `__DEV__` and the variable is unset or blank, `resolveApiBaseUrl` **throws** (`EXPO_PUBLIC_API_URL must be set for production builds`).
  - Because `app.json` sets `web.output: "static"`, `expo export` renders routes in Node, which evaluates `base-url.ts`. A misconfigured Pages build therefore **fails at build time**, and Pages keeps the previous deployment. Fail fast, at the earliest and cheapest point.
  - `isDev` is passed into `resolveApiBaseUrl` as a parameter (defaulted from `__DEV__` at the call site), so unit tests cover both modes without global mocking.
  - CI's `Web build check` is a production export, so it gets `EXPO_PUBLIC_API_URL: https://api.example.invalid`. `.invalid` is a reserved TLD (RFC 2606) that can never resolve, which makes it an honest placeholder.
  - _Consequence:_ future native release builds (EAS) also need the variable. That's the intended behaviour.

- **`/health/version` enters OpenAPI (on purpose).**
  - `/health/live` and `/health/ready` are `MapHealthChecks` middleware endpoints, which is why they're not in OpenAPI (ADR-0002's `health.ts` exception). `/health/version` is a plain minimal-API `MapGet` with a typed response, so it **does** appear in `flowpilot.json` and in `schema.d.ts`.
  - That's useful: the first real contract change exercises both drift checks end to end. The mobile app doesn't call it yet; it's there for the pipeline and for humans.

## 5. API contract

### `GET /health/version`

| Item         | Value                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | none (public, like the other health endpoints)                                                                                                            |
| Rate limit   | none (no rate limiter exists yet; it reveals only the public commit SHA). Revisit with the global limiter.                                                |
| Request      | no parameters, no body                                                                                                                                    |
| 200 response | `application/json`: `{ "commit": "3f9c2a1…" }` (40-char SHA from `RENDER_GIT_COMMIT`), or `{ "commit": "dev" }` when the setting is absent or blank       |
| Other codes  | none expected. Unknown routes keep returning 404 ProblemDetails; unhandled errors 500 ProblemDetails (existing behaviour)                                 |
| OpenAPI      | operationId `GetVersion`, tag `Health`, response schema `VersionResponse { commit: string (required) }`                                                   |
| Location     | `HealthEndpoints.MapHealthEndpoints` (Api layer); `VersionResponse` is a `sealed record` in the Api project (it's transport-only, not an Application DTO) |

The value is read from `IConfiguration["RENDER_GIT_COMMIT"]`. No business logic, so no Application handler (backend `CLAUDE.md`: Api has no business logic; this is configuration echo).

**Client regeneration:** `dotnet build backend/FlowPilot.sln` rewrites `backend/openapi/flowpilot.json`, then `npm --prefix mobile run gen:api` rewrites `mobile/src/lib/api/schema.d.ts`. Both are committed in the same PR (Definition of done). No mobile hook is written for it.

## 6. Pipeline spec — `deploy` job in `.github/workflows/ci.yml`

### 6.1 Job settings

| Setting           | Value                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `needs`           | `[backend, mobile, docker]`                                                                                                   |
| `if`              | `github.event_name == 'push' && github.ref == 'refs/heads/main'`                                                              |
| `runs-on`         | `ubuntu-latest`                                                                                                               |
| `timeout-minutes` | 30 (bundle build a few minutes + ~15 min verification + margin)                                                               |
| `environment`     | `name: production`, `url: ${{ vars.API_BASE_URL }}/health/version` (_small addition_)                                         |
| `concurrency`     | `group: deploy-production`, `cancel-in-progress: false`                                                                       |
| `permissions`     | `contents: read` (inherits the workflow default; restated at job level so the intent is local)                                |
| Actions           | same SHA pins as the other jobs (`checkout` v7.0.1, `setup-dotnet` v6.0.0, `cache` v6.1.0); `persist-credentials: false`      |
| Secrets           | `NEON_MIGRATIONS_CONNECTION_STRING`, `RENDER_DEPLOY_HOOK_URL` (environment secrets), exposed as step `env:` only where needed |
| Variables         | `API_BASE_URL` (environment variable, not secret), e.g. `https://flowpilot-api.onrender.com`                                  |

### 6.2 Steps

| #   | Step name                  | Uses / run                                                                                                                                                           | Fails when                                                                   |
| --- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Checkout                   | `actions/checkout@<pin>` with `persist-credentials: false`                                                                                                           | —                                                                            |
| 2   | Set up .NET                | `actions/setup-dotnet@<pin>` with `global-json-file: global.json`                                                                                                    | SDK can't be resolved                                                        |
| 3   | Cache NuGet packages       | `actions/cache@<pin>`, same key as `backend` (_small addition_)                                                                                                      | —                                                                            |
| 4   | Check deploy configuration | `test -n` on both secrets and `API_BASE_URL`; `::error::` naming the missing one (_small addition_)                                                                  | environment not configured (clear message instead of a confusing curl error) |
| 5   | Restore tools              | `dotnet tool restore`                                                                                                                                                | `.config/dotnet-tools.json` missing / version unavailable                    |
| 6   | Build migration bundle     | `dotnet ef migrations bundle -p backend/src/FlowPilot.Infrastructure -s backend/src/FlowPilot.Api -o efbundle --self-contained -r linux-x64`                         | compile error; EF tooling/version mismatch                                   |
| 7   | Apply migrations (Neon)    | `./efbundle --connection "$NEON_MIGRATIONS_CONNECTION_STRING"`                                                                                                       | connection/auth/SSL failure; migration error (transaction rolled back)       |
| 8   | Trigger Render deploy      | `curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL&ref=$GITHUB_SHA"`                                                                                                        | hook rejected (bad/rotated URL → non-2xx)                                    |
| 9   | Verify deployed version    | loop until deadline (~15 min): `curl -fsS --max-time 90 "$API_BASE_URL/health/version"`, compare `.commit` to `$GITHUB_SHA` (via `jq`); sleep ~15 s between attempts | deadline passes without a match → `::error::` with last seen commit          |
| 10  | Verify readiness           | `curl -fsS --max-time 90 "$API_BASE_URL/health/ready"` with a few retries                                                                                            | not 200 (DB unreachable / wrong runtime connection string)                   |

Notes:

- **Secrets in logs.** GitHub masks secret values in logs. `curl -fsS` prints no URL on success and only `curl: (22) … error: 4xx` on failure, so the hook key isn't echoed. Never `set -x` in steps 4–8.
- **The bundle builds the Api project**, which also runs build-time OpenAPI generation. Harmless here: the file is discarded with the VM.
- **Zero migrations today:** step 7 only creates `__EFMigrationsHistory`, and re-running is a no-op. Proven locally against Docker Postgres first (§9.1). An empty migration set producing a working bundle is _unverified_ until then.
- `jq` is preinstalled on GitHub's Ubuntu images; confirm on the first run after the Ubuntu 26 switch (§11). If it's missing, compare with `grep -o` instead of adding an install step.
- Step 9's per-request `--max-time 90` covers a Render cold start (~1 min). The loop treats network errors and non-2xx as "not yet" rather than failing immediately, because the service is expected to be briefly unavailable or still on the old version.

### 6.3 Change to the `mobile` job

`Web build check` gets `env: EXPO_PUBLIC_API_URL: https://api.example.invalid` (with a comment: production exports now require the variable; the value is a reserved, never-resolving placeholder).

### 6.4 Illustrative shape (real pins reused from the existing jobs)

```yaml
deploy:
  needs: [backend, mobile, docker]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  timeout-minutes: 30
  environment:
    name: production
    url: ${{ vars.API_BASE_URL }}/health/version
  concurrency:
    group: deploy-production
    cancel-in-progress: false
  permissions:
    contents: read
  steps:
    # 1–3 checkout / setup-dotnet / cache (same pins as backend)
    - name: Restore tools
      run: dotnet tool restore
    - name: Build migration bundle
      run: dotnet ef migrations bundle -p backend/src/FlowPilot.Infrastructure -s backend/src/FlowPilot.Api -o efbundle --self-contained -r linux-x64
    - name: Apply migrations (Neon)
      env:
        NEON_MIGRATIONS_CONNECTION_STRING: ${{ secrets.NEON_MIGRATIONS_CONNECTION_STRING }}
      run: ./efbundle --connection "$NEON_MIGRATIONS_CONNECTION_STRING"
    - name: Trigger Render deploy
      env:
        RENDER_DEPLOY_HOOK_URL: ${{ secrets.RENDER_DEPLOY_HOOK_URL }}
      run: curl -fsS -X POST "$RENDER_DEPLOY_HOOK_URL&ref=$GITHUB_SHA"
    # 9–10 verify version, then readiness (§6.2)
```

Secrets are passed through `env:` and referenced as `"$VAR"`, never interpolated into the script with `${{ }}`. That avoids shell injection and keeps them out of the rendered script.

## 7. Platform configuration

### 7.1 `render.yaml` (Blueprint = infrastructure as code)

| Field                            | Value                                             | Why                                                                                   |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `services[0].type`               | `web`                                             | public HTTP service                                                                   |
| `name`                           | `flowpilot-api`                                   | becomes `flowpilot-api.onrender.com` if free; Render adds a suffix otherwise          |
| `runtime`                        | `docker`                                          | reuse the CI-tested `backend/Dockerfile` (ADR-0001)                                   |
| `plan`                           | `free`                                            | $0. _Unverified_ that Docker is allowed on Free (§11)                                 |
| `region`                         | `virginia` (or the human's choice, matching Neon) | co-location                                                                           |
| `dockerfilePath`                 | `./backend/Dockerfile`                            |                                                                                       |
| `dockerContext`                  | `./backend`                                       | matches `docker build -f backend/Dockerfile backend`                                  |
| `healthCheckPath`                | `/health/live`                                    | liveness gates deploys and restarts (§4)                                              |
| `autoDeploy`                     | `false`                                           | only the pipeline deploys, after migrations                                           |
| env `ASPNETCORE_ENVIRONMENT`     | `Production`                                      | JSON console logging, forwarded headers on, no OpenAPI UI                             |
| env `PORT`                       | `8080`                                            | tells Render which port to route to; matches the image's `ASPNETCORE_HTTP_PORTS=8080` |
| env `ConnectionStrings__Default` | `sync: false`                                     | secret, entered once in the Render dashboard at Blueprint creation; never in git      |
| env `Cors__AllowedOrigins__0`    | `https://<project>.pages.dev`                     | production web origin                                                                 |
| env `Cors__AllowedOrigins__1`    | `https://*.<project>.pages.dev`                   | PR previews and branch aliases                                                        |

- `<project>` is the Pages project name actually obtained (`flowpilot` if free). It's public, so committing it is fine.
- Render's Blueprint reference is checked at implementation. If the current spec expresses auto-deploy as a different field (e.g. a trigger setting with an "off" value) instead of `autoDeploy: false`, use the documented field with the same meaning, and confirm in the dashboard that auto-deploy shows **off**.
- No secret values in `render.yaml`. The Blueprint is the source of truth for non-secret settings; dashboard edits to Blueprint-managed fields get overwritten on the next Blueprint sync.

### 7.2 Cloudflare Pages (dashboard, documented in the runbook)

| Setting                         | Value                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Project name                    | `flowpilot` (or the first available name; it then goes into `render.yaml` CORS entries)                      |
| Source                          | Git integration, repo `SDhawal/FlowPilot`                                                                    |
| Production branch               | `main`                                                                                                       |
| Root directory                  | `mobile`                                                                                                     |
| Build command                   | `npx expo export --platform web`                                                                             |
| Output directory                | `dist`                                                                                                       |
| Env vars (production + preview) | `NODE_VERSION=24`, `EXPO_PUBLIC_API_URL=https://<api>.onrender.com` (no trailing slash needed; it's trimmed) |
| Preview deployments             | on for PR branches (automatic preview URL + branch alias)                                                    |

- `EXPO_PUBLIC_*` values are **public by definition** (they're inlined into the bundle), so nothing here is secret.
- Pages installs dependencies itself from `mobile/package-lock.json`; confirm in the first build log which install command it uses.
- The free plan has a monthly **build** quota (every push to a PR builds a preview). Check the current number at setup; a solo repo is far below it.

### 7.3 GitHub Environment `production` (Settings → Environments)

- **Deployment branches and tags:** "Selected branches and tags" → `main` only.
- **Secrets:** `NEON_MIGRATIONS_CONNECTION_STRING` (Neon **direct** endpoint, key=value format), `RENDER_DEPLOY_HOOK_URL`.
- **Variables:** `API_BASE_URL`.
- No required reviewers (solo developer; a reviewer gate would turn CD into manual delivery). Can be added later without code changes.

## 8. Security & privacy

### 8.1 Secrets inventory

| Secret                                         | Lives in                                                    | Used by             | Never in                 | Rotation (runbook)                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `flowpilot_migrator` password                  | GitHub env secret `NEON_MIGRATIONS_CONNECTION_STRING`       | `deploy` job step 7 | git, logs, Render, Pages | `ALTER ROLE` in Neon → update the GitHub secret                                         |
| `flowpilot_app` password                       | Render env var `ConnectionStrings__Default` (`sync: false`) | the API container   | git, logs, GitHub, Pages | `ALTER ROLE` in Neon → update Render's `ConnectionStrings__Default` in the same sitting |
| Render deploy hook URL (contains key)          | GitHub env secret `RENDER_DEPLOY_HOOK_URL`                  | `deploy` job step 8 | git, logs                | regenerate the hook in Render → update the GitHub secret                                |
| _(future)_ `Jwt__SigningKey`, `Gemini__ApiKey` | Render env vars (`sync: false`)                             | the API             | git, logs, GitHub        | arrives with auth / AI features                                                         |

Not secrets: `API_BASE_URL`, `EXPO_PUBLIC_API_URL`, the Pages project name, CORS origins, region, the commit SHA.

The human creates every account and pastes every secret; Claude never handles credentials.

### 8.2 What PRs and forks can access

- PR runs (any source): read-only `GITHUB_TOKEN`, **no** environment secrets (job skipped by `if:`, and refs other than `main` are refused by the branch policy). Fork and Dependabot PRs additionally get no repository secrets at all.
- PR previews on Pages: built from PR code, published on an allowed CORS origin, calling the production API (§8.3).

### 8.3 Least privilege and accepted risks

- Workflow token `contents: read` everywhere, `persist-credentials: false`, only official SHA-pinned actions, secrets via `env:` (no `${{ }}` interpolation in scripts).
- **Two Neon roles** (decided in §11): `flowpilot_migrator` creates and owns the tables (pipeline only); `flowpilot_app` has DML only (the API). A compromised API can't change or drop the schema.
- **Previews hit production.** Today the API has no data and no auth, so there's nothing to reach. With auth, a preview of a malicious fork PR on an allowed origin is a real risk; see §11 on fork previews.
- Forwarded-headers trust relies on the container being reachable **only** through Render's proxy (§4).
- No user data and no Gemini calls in this step. Logs are JSON console logs on Render (existing behaviour); no connection strings are logged (Npgsql doesn't log passwords; the existing config error message names the setting, not its value).

### 8.4 Cost guardrails (all $0)

| Provider         | Free limit that matters                                                   | What happens at the limit (no card)  |
| ---------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| Render           | 750 instance-hours/month; **5 GB outbound/month**; spin-down after 15 min | service suspended, never billed      |
| Neon             | 0.5 GB storage; **100 CU-hours/month**; scale-to-zero after 5 min         | compute unavailable until next month |
| Cloudflare Pages | static requests unmetered; monthly build quota                            | builds stop until the quota resets   |
| GitHub Actions   | public repo: free standard runners                                        | —                                    |

**Rule: never add a payment method** to Render, Neon or Cloudflare. Repeated in the runbook at every signup step.

## 9. Testing / verification plan

### 9.1 Local (before any push)

| Check                                        | How                                                                                                                                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend build + drift                        | `dotnet build backend/FlowPilot.sln` (0 warnings); `flowpilot.json` now contains `/health/version`; commit it                                                                                              |
| Backend tests                                | unit + architecture, then integration (Docker Desktop running)                                                                                                                                             |
| Client regeneration                          | `npm --prefix mobile run gen:api`; `schema.d.ts` contains `/health/version`; commit it                                                                                                                     |
| Mobile checks                                | typecheck, lint, format:check, `npm --prefix mobile test -- --ci`                                                                                                                                          |
| Fail-loud export                             | `cd mobile; npx expo export --platform web` **fails** with the variable unset; **succeeds** with `$env:EXPO_PUBLIC_API_URL="https://api.example.invalid"`                                                  |
| Tool restore                                 | `dotnet tool restore` installs `dotnet-ef` at the pinned version                                                                                                                                           |
| Migration bundle (zero migrations)           | build the bundle (local RID), start `docker compose -f backend/docker-compose.yml up -d db`, run `./efbundle --connection "<local key=value>"` → `__EFMigrationsHistory` exists; run again → no-op, exit 0 |
| Docker image                                 | `docker build -f backend/Dockerfile -t flowpilot-api:ci backend`                                                                                                                                           |
| Version endpoint in the container (optional) | `docker run -e RENDER_GIT_COMMIT=abc123 -p 8080:8080 flowpilot-api:ci` → `/health/version` returns `abc123`                                                                                                |
| Config validation                            | `render.yaml` checked against Render's Blueprint reference; `ci.yml` validated against the SchemaStore `github-workflow` schema; repo-wide Prettier                                                        |

### 9.2 Automated tests (`test-engineer`)

**Integration (`[Trait("Category","Integration")]`, `ApiFactory` gains optional settings + environment):**

- `VersionEndpointTests`
  - `RENDER_GIT_COMMIT` set → 200, `application/json`, `commit` equals the configured value.
  - not set → `commit` is `"dev"`; blank/whitespace → `"dev"`.
  - works with an unreachable database (it must not touch the DB).
- `CorsTests` (origins `https://flowpilot.pages.dev`, `https://*.flowpilot.pages.dev`)
  - production origin → `Access-Control-Allow-Origin` echoes it (simple GET and `OPTIONS` preflight).
  - preview `https://abc123.flowpilot.pages.dev` and branch alias `https://feat-deploy.flowpilot.pages.dev` → allowed.
  - rejected (no ACAO header): `https://evil.example`, `https://evil-flowpilot.pages.dev`, `https://flowpilot.pages.dev.evil.example`, `http://flowpilot.pages.dev`, `https://pages.dev`.
  - no origins configured (base `appsettings.json`) → nothing allowed (regression guard).
- `ForwardedHeadersTests` (test-only endpoint added through an `IStartupFilter`, the same pattern as `ErrorHandlingTests`, echoing `Request.Scheme` and `RemoteIpAddress`)
  - `Testing` environment, `X-Forwarded-Proto: https` → scheme `https`.
  - `X-Forwarded-For: 203.0.113.7` → remote IP `203.0.113.7`.
  - `X-Forwarded-For: 198.51.100.1, 203.0.113.7` → `203.0.113.7` (right-most wins; spoofed left entry ignored).
  - `Development` environment → scheme stays `http`, headers ignored.
- Existing health and error-handling tests stay green.

**Mobile unit (`base-url.test.ts`):**

- Existing cases keep passing with `isDev: true`.
- `isDev: false` + env URL → URL (trailing slashes trimmed).
- `isDev: false` + `undefined` / `""` / `"   "` → throws, and the message names `EXPO_PUBLIC_API_URL`.

### 9.3 PR run

- CI green: `backend`, `mobile` (with the placeholder URL), `docker`. **`deploy` shows as skipped** — by design.
- Pages posts a preview URL on the PR (once the Pages project exists). The preview loads and shows **Connected** against the production API (once Render exists). This is the live CORS-wildcard check.

### 9.4 After merge (together with the human)

- The `main` run: `deploy` goes migrate → hook → `/health/version` = merge SHA → `/health/ready` 200. Record the timings (bundle build, Render build, verification wait).
- GitHub **Environments → production** lists the deployment with its URL.
- Neon dashboard shows the `__EFMigrationsHistory` table.
- Render dashboard: auto-deploy **off**, health check `/health/live`, deploy shows the merge commit.
- Pages production URL shows **Connected**.
- README live links work.

### 9.5 Failure-path demo (optional, recommended for the interview story)

- Temporarily set `API_BASE_URL` to a wrong value in the environment and re-run the `deploy` job → step 9 times out red with a clear message. Restore the variable.
- Remove `EXPO_PUBLIC_API_URL` from the Pages **preview** environment and push to a PR → the preview build fails at `expo export`. Restore it.

### 9.6 Cold-start demo

Wait > 15 min with no traffic, reload the production web URL: **Waking up the server…** for up to ~1 min, then **Connected**. Optionally record it for the README.

## 10. Task breakdown

Branch `feat/deploy`, cut from `main` at `686d40e`. One commit each, Conventional Commits, **no Claude signature**. Backend before mobile; the regenerated client is in the same PR.

1. [backend] `.config/dotnet-tools.json` with `dotnet-ef` pinned to the EF Design version (**after the human approves the dependency**) → `chore(backend): add dotnet-ef local tool`
2. [backend] `GET /health/version` + `VersionResponse` + regenerated `backend/openapi/flowpilot.json`; `ApiFactory` optional settings; `VersionEndpointTests` → `feat(backend): add health version endpoint`
3. [mobile] `npm run gen:api` → regenerated `schema.d.ts` → `chore(mobile): regenerate api client`
4. [backend] Forwarded headers outside Development + `ForwardedHeadersTests` → `feat(backend): trust forwarded headers behind the hosting proxy`
5. [backend] CORS wildcard subdomains + `CorsTests` → `feat(backend): allow preview subdomains in cors`
6. [ci] Placeholder `EXPO_PUBLIC_API_URL` on the `Web build check` step (lands **before** commit 7 so every commit stays green) → `ci: set placeholder api url for web build check`
7. [mobile] `resolveApiBaseUrl` throws in production builds when unset + tests; mention in `mobile/.env.example` comments if that file documents the variable → `feat(mobile): fail production builds without api url`
8. [ci] `deploy` job (§6) → `ci: add production deploy job`
9. [infra] `render.yaml` (§7.1) → `chore(deploy): add render blueprint`
10. [docs] `docs/runbooks/deploy.md` → `docs: add deploy runbook`
11. [docs] README (live links, delivery diagram `merge → CI → migrate → deploy → verify`, "Deployment" section), `CLAUDE.md` Commands ("Build migration bundle"), `backend/CLAUDE.md` (migrations ship through the pipeline; never `Database.Migrate()` at startup; expand/contract rule), implementation notes in this spec → `docs: deployment docs and commands`

Then: local verification (§9.1) → `test-engineer` (§9.2, may adjust tests in commits 2/4/5/7 as `test:` commits) → `code-reviewer` → fixes → teaching walkthrough → the human says "push it" → the human pushes and opens the PR → **account setup with the human following the runbook** (§11 on ordering) → merge → first production deploy verified together (§9.4).

**Runbook contents** (`docs/runbooks/deploy.md`): account setup with exact clicks for Neon (project, region, direct vs pooled string, key=value template), Render (Blueprint, `sync: false` prompt, hook URL, confirm auto-deploy off), Cloudflare Pages (§7.2), GitHub Environment (§7.3); "never add a payment method" at each signup; rotating each secret (§8.1); rollback (Render "Rollback to previous deploy"; migrations are forward-fix only); cold start and why there's no keep-alive; free-tier limits table (§8.4).

## 11. Open questions / risks

### Resolved by the human (2026-10-15)

These override anything below and in earlier sections:

- **`dotnet-ef` local tool:** approved (MIT, pinned in `.config/dotnet-tools.json`, same 10.0.x as `Microsoft.EntityFrameworkCore.Design`).
- **Runtime connection:** Neon **direct** endpoint for both the API and migrations (one instance, modest pool; no PgBouncer caveats).
- **Separate Neon roles, set up now:**
  - `flowpilot_migrator` owns the schema and is used only by the pipeline (`NEON_MIGRATIONS_CONNECTION_STRING`).
  - `flowpilot_app` gets DML only (`SELECT, INSERT, UPDATE, DELETE` on tables, `USAGE, SELECT` on sequences) and is used by the API (`ConnectionStrings__Default` on Render).
  - Future tables are covered by `ALTER DEFAULT PRIVILEGES FOR ROLE flowpilot_migrator …`.
  - The SQL lives in the runbook. Integration tests keep using a single Testcontainers superuser; the role split is production-only.
- **`workflow_dispatch` on `main` deploys too** (`if:` allows `push` or `workflow_dispatch` on `refs/heads/main`). Uses: the first deploy after secrets are added, and redeploys after rotating a secret. It stays main-only through the Environment branch policy.
- **`/health/version` sends `Cache-Control: no-store`.**
- **Dependabot `docker` ecosystem:** still deferred.
- **Setup order:** as proposed below (Neon → Pages → real Pages name into `render.yaml` → Render Blueprint → secrets + GitHub Environment → merge).

### Needs a human decision before implementation (answered above)

- **Approve `dotnet-ef` as a local tool** (MIT, Microsoft, 10.0.x matching `Microsoft.EntityFrameworkCore.Design` 10.0.13). The only new dependency; no npm additions.
- **Runtime connection: direct or pooled Neon endpoint?** Recommendation: direct for now (§4). Either way migrations use direct.
- **Separate Neon roles** (DDL for migrations, DML-only for runtime): now, or before auth? Recommendation: before the auth feature stores real users.
- **Dependabot `docker` ecosystem:** the CI spec deferred it to "the deployment phase", but the approved plan doesn't include it. Add here, or defer again?
- **Manual redeploy:** `workflow_dispatch` on `main` currently does **not** deploy (the `if:` requires `push`). Keep it that way (Render's dashboard has "Manual deploy"), or allow `workflow_dispatch` on `main` as a "re-run deploy" button?
- **`Cache-Control: no-store` on `/health/version`:** not in the plan. Render isn't known to cache API responses, so it's probably unnecessary; add only if the first verification shows stale values.

### Unverified platform facts (each with how it gets verified)

- **Render Free + Docker is not explicitly confirmed** in Render's docs. Verified when the Blueprint is applied: if Render refuses `runtime: docker` with `plan: free`, **stop and decide with the human** (another free container host, or another adjustment). This is not decided silently, and no paid plan is chosen.
- **`?ref=<sha>` on the deploy hook with auto-deploy off.** The plan's research says hooks accept `ref`. Verified on the first deploy: the Render deploy must show the merge SHA and `/health/version` must match. If `ref` is ignored, Render deploys the branch head, which is the same commit in the normal case. The serial `deploy-production` group keeps that safe, but the step's comment and this spec must then be corrected.
- **`RENDER_GIT_COMMIT` at runtime for Docker services.** Verified on the first deploy (`/health/version` must not say `dev`). If it's absent, verification can never pass. Stop and decide (e.g. a Docker build arg if Render passes it at build time, or a different version source). Not guessed now.
- **Empty migration set → working bundle.** Verified locally first (§9.1).
- **Which `X-Forwarded-For` entry is the real client IP on Render** (one proxy hop or more). Doesn't matter until rate limiting; verify then by logging `RemoteIpAddress` from a known client. May need `ForwardLimit` adjusted.
- **`KnownNetworks` vs `KnownIPNetworks`** in .NET 10 (obsolete warning breaks the build). Checked at implementation.
- **`WebApplicationFactory` config visible before `Build()`** for the CORS origins read in `Program.cs`. Checked by the first CORS test; fix as described in §4 if not.
- **Fork-PR previews on Pages.** Whether Cloudflare builds previews for PRs from forks, and with which env vars, is unverified. Check in Pages' preview settings at setup. If forks get previews, restrict preview branches before auth ships (they'd be unreviewed code on an allowed CORS origin).
- **Render Blueprint field names** (`autoDeploy` vs a newer trigger field) — checked against the Blueprint reference (§7.1).

### Setup ordering (to resolve with the human, in the runbook)

- Chicken-and-egg: `render.yaml` needs the Pages project name (CORS), Pages needs the Render URL (`EXPO_PUBLIC_API_URL`), the Blueprint needs `render.yaml` on a branch, and the `deploy` job needs the environment configured **before** the merge, or the first `main` run goes red. Proposed order: (1) Neon project; (2) Pages project (reserves the name; its first build of current `main` is harmless); (3) put the real Pages name into `render.yaml` on `feat/deploy`; (4) create the Render Blueprint (from `feat/deploy` or `main`, whichever Render allows; confirm the service tracks `main` afterwards); (5) set Pages' `EXPO_PUBLIC_API_URL` and the GitHub `production` environment; (6) merge. Render may do one initial deploy at Blueprint creation, before any pipeline migration. That's harmless with zero migrations, but it should be noted.

### Risks

- **Build and wake times.** Render's free Docker build can take several minutes; verification allows ~15 min. The first request after idle waits ~1 min (Render) + ~1 s (Neon). Measured and recorded on the first run.
- **5 GB/month Render bandwidth.** Fine for a demo. Without a card, overage means suspension, never a bill.
- **`ubuntu-latest` moves to Ubuntu 26 on 2026-10-19** (per the CI notice), days after this spec. Watch the first runs of all four jobs (`jq`, Docker, runtime packs for the self-contained bundle). Pin `ubuntu-24.04` if something breaks.
- **Web ahead of API** (§4): accepted, mitigated by the backward-compatibility rule; revisit trigger in ADR-0003.
- **Previews call the production API** (no staging). Acceptable with no data and no auth; revisit with auth.
- **Free tiers change.** Everything is containerized and env-configured (ADR-0001), and the runbook documents every setting, so moving hosts stays a config exercise.

## 12. Implementation notes (2026-10-21)

Where the implementation diverged from the sections above, and why. These notes take precedence.

- **Web build fails via a pre-build check, not at static render.** `expo export` (SDK 57) **swallows** errors thrown while statically rendering routes: even a `throw` at the top of `app/index.tsx` exported with exit 0. So `base-url.ts` throwing can't stop a misconfigured build on its own. Added `mobile/scripts/require-env.mjs` (no dependencies) and the `export:web` npm script (`node scripts/require-env.mjs EXPO_PUBLIC_API_URL && expo export --platform web`). The Pages build command and CI's `Web build check` both use `npm run export:web`. The runtime throw in `resolveApiBaseUrl` stays as a second guard (native release builds, any other export path).
- **EF startup project is `FlowPilot.Infrastructure`, not `FlowPilot.Api`.** `Microsoft.EntityFrameworkCore.Design` is `PrivateAssets=all` in Infrastructure, so Api never gets it, and `dotnet ef … -s FlowPilot.Api` fails ("startup project doesn't reference Microsoft.EntityFrameworkCore.Design"). Infrastructure already has `DesignTimeDbContextFactory`, so it works as its own startup project with no package change. That also means the bundle no longer builds the Api (no build-time OpenAPI generation). The root `CLAUDE.md` "Add migration" command had the same bug and is fixed too.
- **Empty migration set → working bundle: verified.** Against docker-compose Postgres, run 1 created `__EFMigrationsHistory`, run 2 was a no-op; both exit 0. The bundle takes EF's exclusive migration lock, which confirms the direct-endpoint requirement.
- **CORS policy reads configuration from DI.** As predicted in §4, `WebApplicationFactory` configuration wasn't visible to `builder.Configuration` before `Build()` (even the exact origin was rejected in tests). The policy is now built in `AddOptions<CorsOptions>().Configure<IConfiguration>(…)`.
- **Deploy ordering guard (from code review).** `deploy-production` prevents overlap but doesn't order runs: CI for an older commit can finish after a newer one (each `main` push has its own CI group) and would roll production back while staying green. The job's first step compares `$GITHUB_SHA` with `main`'s current head (`git ls-remote`, public repo) and skips every other step if `main` has moved on. Trade-off: if the newer commit's CI fails, neither commit deploys until a fix is merged or the job is re-run.
- **Neon roles SQL:** `ALTER DEFAULT PRIVILEGES` runs _as_ `flowpilot_migrator` (no `FOR ROLE`). Since Postgres 16 the owner can't change another role's defaults. Roles are created in SQL, not the dashboard, because Neon makes dashboard roles members of `neon_superuser`. The runbook includes verification queries.
- **`KnownIPNetworks`** (not the obsolete `KnownNetworks`) builds without warnings on .NET 10.
- **Render Blueprint:** `autoDeploy` is deprecated; `render.yaml` uses `autoDeployTrigger: "off"` (quoted, because YAML 1.1 reads a bare `off` as `false`) and `branch: main`.
- **Resolved decisions applied:** `deploy` also runs on `workflow_dispatch` on `main`; `/health/version` sends `Cache-Control: no-store`; separate `flowpilot_migrator` / `flowpilot_app` Neon roles (SQL in the runbook).
- **Not done:** `mobile/.env.example` wasn't touched (project rule: don't edit `.env*` files). It still describes the variable for local overrides only, which remains correct.
- **Still unverified until real accounts exist:** Docker on Render Free, `ref` honoured by the hook, `RENDER_GIT_COMMIT` at runtime, the Pages project name (`flowpilot` is assumed in `render.yaml` and README links), and fork-PR previews.

### Verified during account setup (2026-10-22)

- **Docker on Render Free: works.** The Blueprint created `flowpilot-api` (Docker, Free, Virginia); URL `https://flowpilot-api-9e2u.onrender.com` (Render added a suffix).
- **`RENDER_GIT_COMMIT` is set at runtime** for Docker services: `/health/version` returned the deployed SHA.
- **`branch: main` in `render.yaml` applies at creation**, even when the Blueprint is created from `feat/deploy`. The first deploy built `main`.
- **Neon names the owner role after the database**; `GRANT flowpilot_migrator TO CURRENT_USER WITH INHERIT FALSE, SET TRUE` is required before `SET ROLE` (runbook updated).
- **The `libgssapi_krb5.so.2` log lines are harmless.** Npgsql falls back; the slim image works against local Postgres and Neon.
- **Readiness hid its failure cause.** EF's default `CanConnectAsync` check swallows exceptions (`message '(null)'`). The readiness check now opens the connection itself, so the exception (e.g. `28P01`) is logged; the public response stays `Unhealthy`. This found a password mismatch in Render's `ConnectionStrings__Default` in one deploy.
