# ADR-0003: Deployment and delivery

- **Status:** Accepted
- **Date:** 2026-10-15 (accepted 2026-10-21)
- **Deciders:** Dhawal Sharma

## Context

ADR-0001 chose the hosting split: API on **Render** (Docker), Postgres on **Neon**, web on **Cloudflare Pages**, CI on **GitHub Actions**, all on free tiers. It didn't decide **how code and schema changes reach production**. `main` is now CI-gated ([phase0-ci](../features/phase0-ci.md)) but nothing is deployed. Auth, the first EF migration and the first long-lived secret (JWT signing key) come next, so the delivery path has to exist first. Changing it under a real schema and real users is much harder. Design details are in [phase0-deploy](../features/phase0-deploy.md).

Forces and constraints (free-tier facts as researched for the approved plan, 2026):

- **Render Free:** $0, spins down after 15 min idle (~1 min to wake), 750 instance-hours/month, **5 GB outbound/month** in the Hobby workspace (overage billed only with a card on file; without one the service is suspended). **No pre-deploy command** (paid only), no shell, single instance. Offers auto-deploy on commit, auto-deploy "after CI checks pass", and per-service **deploy hooks** that accept `?ref=<sha>`. Docker on the Free plan isn't explicitly confirmed in Render's docs; it's verified at Blueprint creation.
- **Neon Free:** 0.5 GB storage, **100 CU-hours/month** per project, compute scales to zero after 5 min (can't be disabled). Pooled (PgBouncer, transaction mode) and direct endpoints.
- **Cloudflare Pages:** static asset requests unmetered; Git integration includes PR preview deploys.
- One developer, public repo, $0 budget, **never add a payment method** anywhere.
- Project rules: no secrets in git or logs; prefer free/OSS; ask before new dependencies.

Three decisions are needed: **where migrations run**, **what triggers an API deploy**, and **how the web is delivered**.

## Options considered

### 1. Where EF Core migrations run

| Option                                                         | Pros                                                                                                                                                                  | Cons                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **At app startup** (`Database.Migrate()`)                      | Zero pipeline work; works on any host                                                                                                                                 | Instances race once scaled out; the runtime DB user needs DDL rights; a slow/failing migration becomes a crash-looping container failing health checks; Microsoft advises against it for production; no clean point to stop a bad migration before new code |
| **In the GitHub Actions pipeline, via an EF migration bundle** | EF's recommended production mechanism; one self-contained executable, idempotent; runs **before** the deploy so ordering is explicit; failure stops the release; free | Needs `dotnet-ef` (local tool, MIT); the pipeline holds a DB secret; migrations must be backward compatible with the running app (expand/contract)                                                                                                          |
| **Render pre-deploy command**                                  | Platform-native: runs in the image, right before the new version starts; no DB secret in GitHub                                                                       | **Paid plans only.** Ruled out by the $0 constraint                                                                                                                                                                                                         |

### 2. What triggers the API deploy on Render

| Option                                                    | Pros                                                                                                                                                                            | Cons                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto-deploy on every commit**                           | Zero configuration                                                                                                                                                              | Deploys before CI finishes, even red commits; races the migration step (new code may start before its schema exists)                                  |
| **Auto-deploy "after CI checks pass"**                    | Waits for green CI; no hook secret                                                                                                                                              | Still doesn't know about **our** migration step, so new code can start before the migration has run; no in-pipeline verification of what got deployed |
| **Deploy hook called by the pipeline (`autoDeploy` off)** | The pipeline owns the order (CI → migrate → deploy → verify); `?ref=<sha>` deploys exactly the tested commit; the same job verifies the result and turns the run red on failure | The hook URL is a secret to store and rotate; more pipeline code; whether `ref` is honoured with auto-deploy off is verified on the first deploy      |

### 3. How the web is delivered

| Option                                       | Pros                                                                                                                                | Cons                                                                                                                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare Pages, Git integration**        | Matches ADR-0001; zero pipeline code; automatic **PR preview URLs**; no Cloudflare credentials in GitHub; static requests unmetered | Pages builds `main` on its own schedule, **not** after the API is verified, so the web can be live minutes before the new API; also deploys if the `main` CI run goes red; build settings live in the dashboard |
| Cloudflare Pages, direct upload from Actions | Web ships **after** API verification (atomic-ish release); build settings in `ci.yml`                                               | Needs a Cloudflare API token secret; previews must be wired by hand; more pipeline code                                                                                                                         |
| Cloudflare Workers static assets             | Cloudflare's newer path; equivalent result for a pure static export                                                                 | No functional gain for a static export; departs from ADR-0001's wording; different setup flow                                                                                                                   |
| Vercel                                       | Mature Git integration and previews                                                                                                 | Contradicts ADR-0001 for no gain for a static export; its free-plan terms and limits weren't re-researched for this decision                                                                                    |

## Decision

1. **Migrations run in the GitHub Actions pipeline** as an **EF Core migration bundle** (`dotnet ef migrations bundle --self-contained -r linux-x64`), applied to Neon's **direct** (non-pooled) endpoint with an explicit `--connection` (Npgsql key=value format, `SSL Mode=Require`). `dotnet-ef` is a local tool pinned in `.config/dotnet-tools.json` at the EF Core version. Never `Database.Migrate()` at startup.
2. **API deploys are triggered only by the pipeline** through Render's deploy hook with `ref=<commit SHA>`. Render auto-deploy is **off** (`render.yaml` Blueprint, `plan: free`, `runtime: docker`, `healthCheckPath: /health/live`).
3. **Pipeline shape:** a `deploy` job in `ci.yml` that `needs` all CI jobs, runs only on `push` or `workflow_dispatch` on `main`, uses GitHub Environment `production` (secrets scoped to it, branch policy `main` only), and has job concurrency `deploy-production` with `cancel-in-progress: false`. Order: **migrate → deploy → verify**. Verification polls `GET /health/version` until it reports the commit SHA (~15 min timeout), then requires `GET /health/ready` = 200. A timeout fails the run.
4. **Web is delivered by Cloudflare Pages Git integration** (root `mobile`, `npm run export:web`, which checks `EXPO_PUBLIC_API_URL` and then runs `expo export --platform web`, output `dist`, `NODE_VERSION=24`, `EXPO_PUBLIC_API_URL` set), with PR previews allowed by a `https://*.<project>.pages.dev` CORS entry. Workers static assets and Vercel aren't used.
5. **No keep-alive pinger.** Cold starts are accepted (ADR-0001) and shown in the UI.
6. **Region co-location:** Render and Neon in the same region (default US East: Render `virginia`, Neon `aws-us-east-1`; final choice at setup).
7. **No payment method** on any provider. Exceeding a free limit means suspension, never a bill.

## Consequences

- \+ Every merge to `main` reaches production automatically, and the pipeline **proves** which commit is live. A failed deploy is a red run and an email, while Render keeps serving the previous version.
- \+ Migrations have one well-defined place and order, before auth adds the first one. Production never relies on the design-time factory's local fallback.
- \+ Production secrets are reachable only by the `deploy` job on `main`. PR and fork runs can't see them, even if a PR edits the workflow.
- \+ $0 running cost, with no card on file anywhere.
- − **Expand/contract is now a rule.** Because migrations run before the new code is live (and stay applied if the deploy fails), every migration must be **backward compatible with the currently running version**: add first, switch code over, remove in a later release. No rename or drop in one step. Schema rollback is never automated; we forward-fix with a new migration. App rollback (Render "Rollback to previous deploy") stays safe because the schema only expanded.
- − **Web/API ordering trade-off.** Pages publishes `main` independently, so the web can be live minutes before the matching API, and even if the `main` CI run turns red. Mitigation: `main` only receives PRs that passed required checks, and **API changes stay backward compatible** (the same expand/contract rule: add endpoints/fields before the web uses them, remove them only after the web stops using them). **Revisit trigger:** if we ever need atomic web + API releases, move to Pages direct upload from the `deploy` job (needs a Cloudflare API token).
- − PR previews call the **production** API (no staging). Harmless while there's no auth or data; must be revisited before auth (fork-PR previews in particular).
- − The pipeline holds two secrets (Neon migration connection string, Render deploy hook URL); both need rotation procedures (runbook).
- − Cold starts: the first request after 15 min idle takes ~1 min (Render) plus ~1 s (Neon). Accepted, because a keep-alive would exhaust Neon's 100 CU-hours in about two weeks if it touched the database, and would use most of Render's 750 instance-hours either way.
- − Deploys are slower than auto-deploy (CI + bundle + Render build + verification), up to ~15 min of verification wait on the free tier.
- − New local tool dependency: `dotnet-ef` (MIT, Microsoft), kept at the same version as `Microsoft.EntityFrameworkCore.Design`.
- Must now do: `render.yaml`, the `deploy` job, `/health/version`, forwarded headers, CORS preview wildcard, fail-loud production web builds, `docs/runbooks/deploy.md` (setup, rotation, rollback, cold start), and a `backend/CLAUDE.md` note that migrations ship through the pipeline.
- **Unverified at the time of writing, with a stop-and-ask fallback:** Docker on Render Free; `ref` honoured by the deploy hook with auto-deploy off; `RENDER_GIT_COMMIT` available at runtime. If Docker on Free is refused, we stop and decide with the human; we don't move to a paid plan or silently switch hosts.
- Reversibility: moderate. Moving migrations to a pre-deploy command or another host's release phase changes only the `deploy` job. Switching web delivery to direct upload changes the `deploy` job and Pages settings, not app code. Everything stays containerized and env-configured (ADR-0001).
