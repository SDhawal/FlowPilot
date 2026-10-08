# Phase 0 · Step 4 — CI on GitHub Actions

- **Status:** Approved (2026-10-08) · Issue: #4
- **Owner:** Dhawal · **Implementer:** main session (Claude) · **Review:** `code-reviewer` agent
- **Related:** [ADR-0001](../adr/0001-technology-stack.md) (chose GitHub Actions for CI), [ADR-0002](../adr/0002-mobile-ui-and-client-libraries.md) (Expo upgrades are deliberate tasks), [phase0-backend-scaffold](phase0-backend-scaffold.md), [phase0-mobile-scaffold](phase0-mobile-scaffold.md)
- **ADR:** none. ADR-0001 already chose GitHub Actions. Dependabot is a GitHub-hosted service configured by one file, not a code dependency, and removing that file reverses it.

## 1. Problem & acceptance criteria

`main` now holds the backend scaffold (PR #1) and the mobile scaffold (PR #3). Every check (build, tests, lint, format, contract regeneration) runs **only on the developer's machine**, through `.claude/hooks` and manual commands. Nothing stops a PR that breaks the build, a test, or the OpenAPI → TypeScript contract from being merged. We need a pipeline that re-runs those checks **on a fresh Linux machine** for every PR and every push to `main`. Then branch protection can make a green run a merge requirement.

The repo is **public** (`SDhawal/FlowPilot`), so GitHub-hosted runners are free with unlimited minutes. Nothing in this step costs money.

- **Given** a PR targeting `main` with no problems, **when** it is opened or updated, **then** one workflow named **CI** runs three jobs in parallel (`backend`, `mobile`, `docker`) and all three finish green.
- **Given** branch protection is enabled (§6) with required checks `backend`, `mobile` and `docker`, **when** a PR contains a failing unit or integration test, **then** the `backend` check is red and the merge button stays blocked ("Required statuses must pass"). It also stays blocked while checks are still pending.
- **Given** a backend change that alters the API contract, **when** the developer forgot to commit the regenerated `backend/openapi/flowpilot.json`, **then** the `backend` job fails at the **OpenAPI drift** step, and the log shows the diff.
- **Given** an up-to-date `flowpilot.json` but a stale `mobile/src/lib/api/schema.d.ts` (`gen:api` wasn't re-run), **when** CI runs, **then** the `mobile` job fails at the **client drift** step and shows the diff.
- **Given** a type error, an ESLint warning, a mobile file that isn't Prettier-formatted, a failing Jest test, or code that breaks the web bundle, **when** CI runs, **then** the `mobile` job fails at the matching step (`typecheck`, `lint`, `format:check`, `test`, `expo export`).
- **Given** a Markdown/JSON/YAML/CSS/MJS file **outside `mobile/`** that isn't formatted with the root `.prettierrc.json`, **when** CI runs, **then** the `mobile` job fails at the **repo-wide format** step. Files in the root `.prettierignore` (e.g. `backend/openapi/`, lockfiles, migrations) are never checked.
- **Given** a change that breaks `backend/Dockerfile`, **when** CI runs, **then** the `docker` job fails. No image is ever pushed, and no registry credentials exist.
- **Given** a push to `main` (e.g. after a merge), **then** CI runs on `main`, and the README badge shows the result of the latest `main` run.
- **Given** two pushes to the same PR in quick succession, **then** the older run is cancelled and only the newer one completes.
- **Given** the workflow file, **then** the token has only `contents: read`, every job has `timeout-minutes`, and every `uses:` line is an official `actions/*` action pinned to a full 40-character commit SHA with a `# vX.Y.Z` comment.
- **Given** `.github/dependabot.yml` is on `main`, **when** the weekly schedule runs (or someone clicks "Check for updates", §7.3), **then** Dependabot opens at most one grouped minor+patch PR per ecosystem (`github-actions`, `npm`, `nuget`), separate PRs for major bumps, and no PRs for the ignored Expo-managed packages. **And** each Dependabot PR runs the full CI.
- **Given** a fresh clone, **when** a developer runs the commands in the README "CI" section, **then** each CI step can be reproduced locally with the same command the workflow uses.

## 2. Out of scope

- **Deploy workflows:** Render (API), Cloudflare Pages (web), Neon migrations. These come in the deployment phase.
- **Coverage** collection, reports or thresholds.
- **`npm audit` / vulnerability gating** in CI. Dependabot security alerts can be turned on in repo settings separately; that's not part of this spec.
- **Self-hosted runners**, larger runners, and Windows/macOS matrix builds.
- **Release automation:** tags, changelogs, versioning, GitHub Releases, publishing the Docker image to a registry.
- Native builds (EAS), test-result artifacts/annotations, Docker layer caching, CodeQL, Dependabot auto-merge, Dependabot for the `docker` ecosystem (Dockerfile base images). See §11.

## 3. Solution layout

```
.nvmrc                          # NEW  "24", Node version for CI (setup-node) and local nvm/fnm
.github/
├─ workflows/
│  └─ ci.yml                    # NEW  one workflow "CI": jobs backend, mobile, docker
└─ dependabot.yml               # NEW  weekly updates: github-actions (/), npm (/mobile), nuget (/backend)
README.md                       # EDIT CI badge + "CI" section (what runs, how to reproduce locally)
CLAUDE.md                       # EDIT "How we work": PRs need green backend, mobile, docker before merge
docs/features/phase0-ci.md      # this spec (implementation notes appended at the end)
```

No application code, no data model, no API contract, no AI, no screens. `global.json`, `backend/**`, `mobile/**` and `.claude/**` aren't changed. The one exception is a possible `style:` commit if the first repo-wide Prettier run flags files that are already unformatted (§10, commit 5).

## 4. Key technical decisions (and why)

The human is also using this step to prepare for interviews, so each decision gives its reason and the trade-off.

- **One workflow, three parallel jobs.** `backend`, `mobile` and `docker` don't depend on each other, so running them in parallel means total time ≈ the slowest job, not the sum. Each job gets a fresh VM, so one can't pollute another. One workflow also means one badge and one place to read. _Trade-off:_ each job repeats checkout and setup (seconds).

- **Triggers: `pull_request` → `main`, `push` → `main`, `workflow_dispatch`.**
  - `pull_request` is the gate. For PRs, GitHub checks out a **merge commit** (`refs/pull/N/merge`), so CI tests what `main` _would_ look like after merging, not just the branch on its own.
  - `push` to `main` confirms `main` itself stays green (e.g. if two PRs that pass separately conflict once both are merged). It also drives the badge and warms the caches (see caching).
  - `workflow_dispatch` adds a "Run workflow" button for manual re-runs.
  - We use `pull_request`, **never `pull_request_target`**. `pull_request_target` runs with a write token and secrets in the context of the base repo, and combining it with checking out PR code is a well-known way repos get compromised.

- **No path filters (`paths:`), on purpose.**
  - Path filters would skip, say, `mobile` on a backend-only PR. But a **required** check that is skipped by a workflow-level path filter never reports a status, so the PR sits forever on "Expected — Waiting for status to be reported" and can't be merged.
  - The workarounds (a dummy always-passing job, or a "changes" job plus per-job `if:`) add complexity.
  - The repo is small and minutes are free, so running everything is simpler and always safe. It also catches cross-cutting breaks. For example, a backend contract change breaks the mobile client drift check, which a backend-only filter would miss.
  - Revisit this only if runs become slow.

- **Least privilege: `permissions: contents: read` at the workflow level.**
  - Every run gets a `GITHUB_TOKEN`. Depending on repo settings, its default scopes can include write access to contents, PRs, packages and more.
  - CI only needs to read code, so we declare exactly that. Any scope not listed becomes `none`.
  - If a step or action were ever compromised, the token couldn't push code, create releases or edit PRs.
  - _Small addition to the plan:_ `actions/checkout` runs with `persist-credentials: false`. By default checkout writes the token into `.git/config` so later `git push` commands work. We never push, so we don't leave it lying around for later steps.

- **Only official `actions/*` actions, pinned to full commit SHAs.**
  - Only `actions/checkout`, `actions/setup-dotnet`, `actions/setup-node` and `actions/cache`. No third-party marketplace actions, so there are fewer parties we have to trust.
  - A tag like `@v5` is a **movable pointer**: whoever controls the action repo (or an attacker who takes it over, as in the 2025 `tj-actions/changed-files` incident) can point it at new code, and every workflow using the tag runs it on its next run. A full SHA is **immutable**: it always means exactly the code that was reviewed.
  - The `# vX.Y.Z` comment keeps the file readable, and Dependabot understands it: it bumps both the SHA and the comment.
  - _Trade-off:_ SHAs are unreadable and don't pick up fixes automatically. Dependabot solves both, which is why the two were decided together.
  - **Actual SHAs and versions are looked up from each action's GitHub releases page at implementation time.** This spec doesn't name them.

- **Concurrency: `group: ci-${{ github.ref }}`, `cancel-in-progress: true`.**
  - A PR's ref is `refs/pull/N/merge`, so pushing again to the same PR cancels the stale run. This saves time and avoids confusing results from an old commit.
  - PR runs and `main` runs have different refs, so they never cancel each other.
  - _Trade-off:_ two merges to `main` in quick succession cancel the first `main` run, so that commit gets no `main` status. The latest commit is what matters for the badge and for PR merge commits. Accepted for a solo repo (§11).

- **Per-job `timeout-minutes`** (backend 20, mobile 20, docker 15; expected runs are a few minutes each, measured on the first run). The default is **360 minutes**. A hung test, a stuck container pull or an interactive prompt would otherwise hold a runner for 6 hours. A timeout turns a hang into a quick, visible failure.

- **Pinned toolchains, so CI uses the same versions as local.**
  - **.NET:** `setup-dotnet` with `global-json-file: global.json`, which is the same file `dotnet` reads locally (SDK 10.0.100, `rollForward: latestFeature`). The runner image already has some SDKs installed, but which ones changes over time, so we don't rely on it.
  - **Node:** a new `.nvmrc` containing `24`, read by `setup-node` (`node-version-file: .nvmrc`) and by nvm/fnm locally. That gives one source of truth. It meets `engines.node` (`>=24.3.0`) and matches local Node 24.21.

- **Caching: package downloads, not build outputs.**
  - **npm:** `setup-node` with `cache: npm` and `cache-dependency-path: mobile/package-lock.json`. This caches npm's download cache (`~/.npm`), keyed on the lockfile hash. We deliberately do **not** cache `node_modules`: `npm ci` deletes it anyway, and a cached `node_modules` can hide a broken lockfile.
  - **NuGet:** `actions/cache` on `~/.nuget/packages`, key `nuget-${{ runner.os }}-${{ hashFiles('backend/**/*.csproj', 'backend/Directory.Packages.props') }}`, with restore key `nuget-${{ runner.os }}-`. `setup-dotnet` also has a built-in cache, but it needs `packages.lock.json` files, which we don't use. The `.csproj` files plus the central `Directory.Packages.props` determine the package set exactly, so their hash is a correct key.
  - The restore key means a changed package set still starts from the closest old cache instead of an empty one.
  - _Cache scoping (teaching point):_ a PR run can read caches created on its own branch **or on `main`**, but not caches from other PRs. That's another reason `push` → `main` matters: it fills the cache that every new PR starts from.
  - Caches are saved only when the job succeeds. GitHub evicts caches not used for 7 days, with a 10 GB total per repo, which is plenty here.

- **`npm ci`, not `npm install`.**
  - `npm ci` installs **exactly** what `package-lock.json` says.
  - It **fails** if `package.json` and the lockfile disagree (`npm install` would quietly "fix" the lockfile).
  - It always starts from an empty `node_modules`, and it never writes the lockfile.
  - That makes CI reproducible, and it catches "I changed `package.json` but didn't commit the lockfile". The README already tells developers to use `npm ci` locally.

- **Restore, then build `--no-restore`, then test `--no-build`.**
  - Separate steps give separate log sections and timings, and the cache step sits right before restore.
  - `dotnet build` fails on any warning because `Directory.Build.props` sets `TreatWarningsAsErrors`, so "zero warnings" from the Definition of done is enforced without extra flags.
  - The build uses the default Debug configuration, the same as the local command that generates and commits `flowpilot.json`.
  - _Small addition to the plan:_ the test steps use `--no-build` to reuse the build output instead of building twice.

- **Contract drift checks: "regenerate, then demand no diff".** Generated files are committed (backend `CLAUDE.md`, mobile spec §4), so a stale one is a real bug: the app would compile against a contract the API no longer has. CI regenerates them and fails if git sees a change:
  - **backend:** `dotnet build` already rewrites `backend/openapi/flowpilot.json` (build-time OpenAPI generation). Then `git diff --exit-code backend/openapi/` exits 1 and prints the diff if the committed file differs.
  - **mobile:** `npm run gen:api` regenerates `src/lib/api/schema.d.ts` from the **committed** `flowpilot.json`. Then `git diff --exit-code src/lib/api/schema.d.ts`.
  - Both are deterministic: no timestamps, as the mobile spec requires. `.gitattributes` (`* text=auto eol=lf`) makes git compare normalized line endings, so a CRLF/LF difference between Windows and Linux can't cause a false failure.
  - The two checks chain together. Backend drift catches "the API changed but the document wasn't committed". Mobile drift catches "the document changed but the client wasn't regenerated".

- **Integration tests run in CI, for real.**
  - The runner is a full Ubuntu VM with Docker Engine preinstalled. Testcontainers finds the Docker socket on its own, starts a throwaway `postgres:17` container (`PostgresFixture`), and removes it afterwards.
  - No service containers, mocks or secrets are needed. It's the same code path as running locally with Docker Desktop.
  - Unit + architecture tests (`Category!=Integration`) run as their own step before integration tests, so a fast logic failure shows up first and the log separates "my code is wrong" from "the DB test failed".
  - The integration tests' "unreachable DB" case uses a short `Timeout=2`, so it doesn't slow CI down.

- **`expo export --platform web` as a build check.**
  - This produces the static bundle Cloudflare Pages will host later. `app.json` sets `web.output: "static"`, so Expo also **renders each route to HTML in Node** at build time.
  - That catches errors `tsc` and Jest miss: Metro resolution, Babel/NativeWind config, and code that touches `window` at import time.
  - The output goes to `mobile/dist/`, which is git-, ESLint- and Prettier-ignored, and is thrown away with the VM.
  - `EXPO_PUBLIC_API_URL` is unset in CI, so the bundle uses the localhost default. That's fine for a build check; production builds are the deployment phase's job.

- **Repo-wide Prettier check outside `mobile/` mirrors `.claude/hooks/format.mjs`.**
  - The hook formats `md/json/yaml/yml/css/mjs` files with the root `.prettierrc.json` and `--ignore-path .prettierignore`. CI applies the **same rule**, so files edited by hand or outside Claude can't drift.
  - Prettier is installed only in `mobile/node_modules`, so the step runs from the repo root using that binary. The `!mobile/**` exclusion avoids checking mobile files twice, since `format:check` already covers them with mobile's own config.
  - This also validates the syntax of `.github/workflows/ci.yml` and `.github/dependabot.yml`: Prettier fails to parse broken YAML.

- **Docker: build only, never push.**
  - `docker build -f backend/Dockerfile backend` proves the image Render will build still builds: restore layer, `publish` with `-p:OpenApiGenerateDocuments=false`, non-root final stage.
  - There's no registry login, so the workflow needs no secrets.
  - It's a separate job so it runs in parallel and shows up as its own required check.

- **Dependabot ignores the Expo-managed packages.**
  - Each Expo SDK pins exact compatible versions of `react`, `react-dom`, `react-native`, `react-native-*` and `expo-*` (that's why `package.json` has `~57.x` ranges and exact RN/React versions).
  - These must move **together**, through `npx expo install --fix` during a deliberate SDK upgrade (ADR-0002). A lone Dependabot bump of `react-native` would create a mismatch that may pass Jest but crash at runtime.
  - So Dependabot ignores those families, plus `jest-expo` and `eslint-config-expo`, which are versioned with the SDK.
  - Everything else (TanStack Query, openapi-fetch, Prettier, ESLint, NuGet packages, actions) gets routine, CI-tested bumps.

- **Commit type `ci:`.** `ci:` is a standard Conventional Commits type for CI configuration. `CLAUDE.md` lists the common types, and history already uses `style:`. If the human prefers, use `chore(ci):` instead (§11).

## 5. Workflow spec — `.github/workflows/ci.yml`

### 5.1 Workflow-level settings

| Setting       | Value                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `name`        | `CI`                                                                                                 |
| `on`          | `pull_request: branches: [main]` · `push: branches: [main]` · `workflow_dispatch:`                   |
| `permissions` | `contents: read`                                                                                     |
| `concurrency` | `group: ci-${{ github.ref }}` · `cancel-in-progress: true`                                           |
| `env`         | `DOTNET_NOLOGO: true` · `DOTNET_CLI_TELEMETRY_OPTOUT: true`                                          |
| Jobs          | `backend`, `mobile`, `docker`, all `runs-on: ubuntu-latest`, no `needs:` (parallel)                  |
| Job names     | job ids only, with **no** `name:` override, so check names are exactly `backend`, `mobile`, `docker` |

### 5.2 Job `backend` (`timeout-minutes: 20`)

| #   | Step name            | Uses / run                                                                          | Fails when                                                 |
| --- | -------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Checkout             | `actions/checkout@<sha> # vX.Y.Z` with `persist-credentials: false`                 | —                                                          |
| 2   | Set up .NET          | `actions/setup-dotnet@<sha> # vX.Y.Z` with `global-json-file: global.json`          | SDK in `global.json` can't be resolved                     |
| 3   | Cache NuGet packages | `actions/cache@<sha> # vX.Y.Z`, path `~/.nuget/packages`, key/restore-keys as in §4 | — (a miss just means a slower restore)                     |
| 4   | Restore              | `dotnet restore backend/FlowPilot.sln`                                              | package missing / version conflict                         |
| 5   | Build                | `dotnet build backend/FlowPilot.sln --no-restore`                                   | compile error **or any warning** (`TreatWarningsAsErrors`) |
| 6   | OpenAPI drift check  | `git diff --exit-code backend/openapi/`                                             | committed `flowpilot.json` ≠ regenerated                   |
| 7   | Unit + architecture  | `dotnet test backend/FlowPilot.sln --no-build --filter "Category!=Integration"`     | failing unit / layer-rule test                             |
| 8   | Integration tests    | `dotnet test backend/FlowPilot.sln --no-build --filter "Category=Integration"`      | failing endpoint test; Testcontainers can't start Postgres |

Give step 6 a self-explanatory name, e.g. "OpenAPI drift check (commit backend/openapi/flowpilot.json if this fails)", so a red step tells the reader how to fix it.

### 5.3 Job `mobile` (`timeout-minutes: 20`, `defaults.run.working-directory: mobile`)

`defaults.run` affects only `run:` steps. Paths in action `with:` inputs (`.nvmrc`, `mobile/package-lock.json`) stay relative to the repo root.

| #   | Step name                   | Uses / run                                                                                                                                                         | Fails when                                                                        |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Checkout                    | `actions/checkout@<sha> # vX.Y.Z` with `persist-credentials: false`                                                                                                | —                                                                                 |
| 2   | Set up Node                 | `actions/setup-node@<sha> # vX.Y.Z` with `node-version-file: .nvmrc`, `cache: npm`, `cache-dependency-path: mobile/package-lock.json`                              | —                                                                                 |
| 3   | Install                     | `npm ci`                                                                                                                                                           | lockfile out of sync with `package.json`; install error                           |
| 4   | Client drift check          | `npm run gen:api` then `git diff --exit-code src/lib/api/schema.d.ts`                                                                                              | committed `schema.d.ts` ≠ regenerated from committed `flowpilot.json`             |
| 5   | Typecheck                   | `npm run typecheck`                                                                                                                                                | TS error                                                                          |
| 6   | Lint                        | `npm run lint`                                                                                                                                                     | any ESLint error or warning (`--max-warnings 0`)                                  |
| 7   | Format check (mobile)       | `npm run format:check`                                                                                                                                             | a mobile file isn't formatted with `mobile/.prettierrc`                           |
| 8   | Unit tests                  | `npm test -- --ci`                                                                                                                                                 | failing Jest test. `--ci` also fails on missing snapshots instead of writing them |
| 9   | Web build check             | `npx expo export --platform web`                                                                                                                                   | Metro/Babel/static-render error                                                   |
| 10  | Format check (rest of repo) | `working-directory: .` → `node mobile/node_modules/prettier/bin/prettier.cjs --check --ignore-path .prettierignore "**/*.{md,json,yml,yaml,css,mjs}" "!mobile/**"` | an unignored md/json/yaml/css/mjs file outside `mobile/` isn't formatted          |

Notes:

- GitHub Actions sets `CI=true`, which makes Jest and the Expo CLI non-interactive. _Small addition to the plan:_ set `EXPO_NO_TELEMETRY: 1` on the mobile job.
- Step 10 calls Prettier through `node …/prettier.cjs` so the exact same command works in PowerShell on Windows and in bash on the runner, with no `.cmd` shim. The bin path is confirmed against the installed Prettier 3 at implementation.
- The extension list matches `format.mjs` exactly. If the hook's rule changes, this step must change with it (a comment in `ci.yml` says so).

### 5.4 Job `docker` (`timeout-minutes: 15`)

| #   | Step name   | Uses / run                                                          | Fails when                 |
| --- | ----------- | ------------------------------------------------------------------- | -------------------------- |
| 1   | Checkout    | `actions/checkout@<sha> # vX.Y.Z` with `persist-credentials: false` | —                          |
| 2   | Build image | `docker build -f backend/Dockerfile -t flowpilot-api:ci backend`    | any Dockerfile stage fails |

There's no `docker login` and no push. BuildKit is the runner's default builder. The `# syntax=docker/dockerfile:1` line pulls the Dockerfile frontend from Docker Hub.

### 5.5 Illustrative skeleton (shape only; real SHAs/versions resolved at implementation)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
env:
  DOTNET_NOLOGO: true
  DOTNET_CLI_TELEMETRY_OPTOUT: true
jobs:
  backend:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-sha> # vX.Y.Z
        with:
          persist-credentials: false
      # … steps 2–8 from §5.2
  mobile:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: mobile
    # … steps from §5.3
  docker:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    # … steps from §5.4
```

## 6. Branch protection (done by the human in GitHub settings)

Branch protection isn't a file; it's a repo setting. It's enabled **after the first CI run on the PR**, because GitHub only offers a check name in the picker once that check has reported on the repo (within the last 7 days).

### 6.1 Why each rule

- **Require status checks** (`backend`, `mobile`, `docker`): this is the actual gate. Red or pending checks block the merge button.
- **Require a pull request before merging:** enforces the "never commit to `main` directly" rule from `CLAUDE.md` for everyone, the owner included. Required approvals = **0**, because a solo developer can't approve their own PR.
- **Block force pushes** and **restrict deletions:** protect `main`'s history.

### 6.2 Check names must match job ids

A required check is matched **by name**. The names are the job ids `backend`, `mobile`, `docker`. The PR UI shows them as "CI / backend (pull_request)", but the required context is just `backend`. If a job is ever renamed (or gets a `name:`), the ruleset still waits for the old name, and every PR hangs on "Expected — Waiting for status to be reported". **Renaming a job means updating the ruleset in the same change.**

### 6.3 Click-steps: repository ruleset (recommended)

1. Open `https://github.com/SDhawal/FlowPilot` → **Settings** (top tab) → left sidebar **Rules** → **Rulesets**.
2. **New ruleset** → **New branch ruleset**.
3. **Ruleset name:** `main`. **Enforcement status:** **Active**.
4. **Bypass list:** leave **empty**. In an emergency the ruleset can be set to Disabled temporarily, which is visible and deliberate.
5. **Target branches** → **Add target** → **Include default branch**.
6. **Branch rules**, tick:
   - **Restrict deletions** (on by default)
   - **Block force pushes** (on by default)
   - **Require a pull request before merging** → Required approvals **0**. Leave the other sub-options at their defaults.
   - **Require status checks to pass** → **Add checks** → type and select `backend`, then `mobile`, then `docker` (source: GitHub Actions). Leave **Require branches to be up to date before merging** unticked for now (§11).
7. **Create**.
8. Confirm: on an open PR, the merge box lists the three required checks.

### 6.4 Fallback: classic branch protection

Use this only if rulesets aren't available. **Settings** → **Branches** → **Add classic branch protection rule** → Branch name pattern `main` → tick **Require a pull request before merging** (uncheck **Require approvals**) → tick **Require status checks to pass before merging** → search and add `backend`, `mobile`, `docker` → tick **Do not allow bypassing the above settings** → **Create**. Force pushes and deletions are blocked by default in classic rules.

## 7. Dependabot spec — `.github/dependabot.yml`

### 7.1 Ecosystems

| Ecosystem        | `directory` | What it updates                                                 |
| ---------------- | ----------- | --------------------------------------------------------------- |
| `github-actions` | `/`         | SHAs + `# vX.Y.Z` comments in `.github/workflows/*.yml`         |
| `npm`            | `/mobile`   | `mobile/package.json` + `mobile/package-lock.json`              |
| `nuget`          | `/backend`  | `backend/Directory.Packages.props` (Central Package Management) |

Shared settings for every ecosystem:

- `schedule: interval: weekly` (Monday).
- `open-pull-requests-limit: 5`. A grouped PR counts as one.
- `commit-message: prefix: chore, include: scope`, which gives `chore(deps): …` / `chore(deps-dev): …` (Conventional Commits).
- `groups:` one group per ecosystem with `update-types: [minor, patch]`. Major bumps aren't in a group, so each gets its own PR for focused review.

### 7.2 npm ignore list (Expo-managed; moved only by `npx expo install --fix` during SDK upgrades)

`ignore:` entries (all update types): `expo`, `expo-*`, `react`, `react-dom`, `react-native`, `react-native-*`, `jest-expo`, `eslint-config-expo`.

Dependabot supports `*` wildcards in `dependency-name`. `react-native-*` covers `react-native-web`, `-reanimated`, `-worklets`, `-screens` and `-safe-area-context`. Candidates that may also need ignoring are listed in §11. They're not added without the human's say-so.

### 7.3 Behaviour notes

- Dependabot reads the config **from the default branch only**, so it starts after this PR merges.
- To trigger it right away: **Insights** → **Dependency graph** → **Dependabot** tab → **Check for updates** next to each manifest.
- Dependabot PRs trigger `pull_request` like any other PR, so the full CI runs on them, and branch protection applies. That's what makes routine bumps safe to merge: green CI on `main` + the bump.
- Workflows triggered by Dependabot get a read-only token and no Actions secrets. We use none, so nothing breaks.
- Dependabot rebases its own open PRs when `main` moves, unless there's a conflict.

### 7.4 Illustrative shape

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /mobile
    schedule: { interval: weekly, day: monday }
    open-pull-requests-limit: 5
    commit-message: { prefix: chore, include: scope }
    groups:
      npm-minor-patch:
        update-types: [minor, patch]
    ignore:
      - dependency-name: "expo"
      - dependency-name: "expo-*"
      # … rest of §7.2
  # github-actions (/) and nuget (/backend) blocks: same shape, no ignore list
```

## 8. Security

- **Token:** `permissions: contents: read` workflow-wide. Checkout uses `persist-credentials: false`. There's no job-level permission escalation.
- **No secrets:** the workflow reads no secrets. Integration tests use ephemeral Testcontainers credentials that exist only inside the VM. The Docker job has no registry login. Nothing can leak into logs.
- **Untrusted PR code:** only `pull_request` is used (never `pull_request_target`). Fork PRs get a read-only token and no secrets by GitHub's design.
- **Supply chain:**
  - Only official `actions/*` actions, pinned to immutable SHAs.
  - `npm ci` installs exactly the reviewed lockfile, and NuGet versions are central and exact.
  - Dependabot bumps arrive as PRs that a human reviews and that pass CI first. There's no auto-merge.
  - _Accepted risk:_ `npm ci` runs package install scripts. This is the same as on the developer's machine, and the blast radius is a throwaway VM with a read-only token.
- **Artifacts:** none are uploaded. The Docker image and `mobile/dist` are discarded with the VM.
- **Cost:** $0. The repo is public, so standard GitHub-hosted runners are free and unlimited. _If the repo ever becomes private_, the Free plan includes 2,000 minutes/month. At roughly 5–10 runner-minutes per run (three jobs) that's still a few hundred runs a month, but it would be worth watching.

## 9. Testing / verification plan

CI config can't be unit-tested in a meaningful way. It's verified by running every command locally, proving the failure paths fail, and then a real run.

### 9.1 Local reproduction (before any push, exact workflow commands, from the repo root unless noted)

| Check                                | Command                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| backend restore / build              | `dotnet restore backend/FlowPilot.sln` · `dotnet build backend/FlowPilot.sln --no-restore`                                                         |
| OpenAPI drift                        | `git diff --exit-code backend/openapi/` (exit code 0 expected)                                                                                     |
| unit + architecture                  | `dotnet test backend/FlowPilot.sln --no-build --filter "Category!=Integration"`                                                                    |
| integration (Docker Desktop running) | `dotnet test backend/FlowPilot.sln --no-build --filter "Category=Integration"`                                                                     |
| mobile install                       | `npm --prefix mobile ci`                                                                                                                           |
| client drift                         | `npm --prefix mobile run gen:api` · `git diff --exit-code mobile/src/lib/api/schema.d.ts`                                                          |
| typecheck / lint / format / test     | `npm --prefix mobile run typecheck` · `npm --prefix mobile run lint` · `npm --prefix mobile run format:check` · `npm --prefix mobile test -- --ci` |
| web build                            | `cd mobile; npx expo export --platform web` (then delete `mobile/dist`, which is git-ignored anyway)                                               |
| repo-wide format                     | `node mobile/node_modules/prettier/bin/prettier.cjs --check --ignore-path .prettierignore "**/*.{md,json,yml,yaml,css,mjs}" "!mobile/**"`          |
| docker                               | `docker build -f backend/Dockerfile -t flowpilot-api:ci backend`                                                                                   |

In PowerShell, check `$LASTEXITCODE` after each `git diff --exit-code` (0 = clean, 1 = drift).

### 9.2 Prove the failure paths fail (locally, then revert)

- **OpenAPI drift:** on a scratch local branch, hand-edit `backend/openapi/flowpilot.json` (e.g. change `"version"`) and **commit** it. That simulates "the committed document is stale". Run `dotnet build`. The build rewrites the file from code, so `git diff --exit-code backend/openapi/` exits **1** and shows the change. Switch back and delete the scratch branch.
  - Just editing the file without committing doesn't work as a test, because the build overwrites the edit and leaves no diff.
  - The control case: on a clean tree the build regenerates an identical file → exit 0.
- **Client drift:** the hook blocks agents from editing `schema.d.ts`, so the human appends a blank comment line to it locally and commits it on a scratch branch. Then `gen:api` + `git diff --exit-code` exits **1**. Delete the scratch branch.
- **Repo-wide format reach:** temporarily misindent a line in `.github/workflows/ci.yml` and in one `docs/` file. The step must report both, which proves dot-directories like `.github/` and `.claude/` are included in the glob. Then confirm `backend/openapi/flowpilot.json` (not Prettier-formatted, in the root ignore) is **not** reported. Revert the edits.
- **YAML validity:** Prettier parses `ci.yml` and `dependabot.yml` without errors (covered by the step above).

### 9.3 First real run (the PR for `feat/ci`)

- All three jobs green on the PR's **Checks** tab. Read each step's log together on the public Actions page. Record the job durations.
- Confirm `setup-dotnet` resolved an SDK from `global.json` and `setup-node` resolved Node 24.x (both printed in the logs).
- Confirm the integration tests actually ran (test count > 0 in the step 8 output) and didn't skip.
- **Re-run all jobs** (or push a trivial commit). The NuGet cache step reports a cache hit, and `setup-node` reports an npm cache hit.
- After merge: the `push` run on `main` is green, and the README badge shows "passing".

### 9.4 After protection is enabled (optional demo)

- Open a throwaway PR (`demo/failing-test`) that changes one assertion in `FlowPilot.UnitTests` to fail. Expected: `backend` red at "Unit + architecture", merge button blocked, `mobile` and `docker` green. Close the PR without merging and delete the branch.
- Optional drift demo: a throwaway PR that commits a hand-edited `flowpilot.json` (as in §9.2). Expected: `backend` red at the drift step, merge blocked. Close it without merging.

### 9.5 Dependabot

After merge, click **Check for updates** (§7.3) and confirm:

- PRs are grouped as configured.
- No PR touches the ignored Expo packages.
- Each PR shows the three CI checks.

Don't merge them as part of this step unless the human wants to.

## 10. Task breakdown (branch `feat/ci`, one commit each, Conventional Commits, no Claude signature)

1. [repo] `.nvmrc` containing `24` → `chore: pin node version in .nvmrc`
2. [ci] `ci.yml` skeleton (triggers, permissions, concurrency, env) + `backend` job (§5.2), action SHAs resolved from each action's GitHub releases → `ci: add workflow with backend job`
3. [ci] `mobile` job (§5.3), including the client drift, web build and repo-wide format steps → `ci: add mobile job`
4. [ci] `docker` job (§5.4) → `ci: add docker image build job`
5. [repo] _Only if needed:_ format the files outside `mobile/` that the new repo-wide check flags (no content changes) → `style: format files flagged by repo-wide prettier check`
6. [ci] `.github/dependabot.yml` (§7) → `ci: add dependabot config`
7. [docs] README: CI badge (`https://github.com/SDhawal/FlowPilot/actions/workflows/ci.yml/badge.svg?branch=main`, linked to the workflow page) + "CI" section (jobs, what each step checks, local reproduction table from §9.1). `CLAUDE.md` "How we work": PRs need green `backend`, `mobile`, `docker` before merge. Append "Implementation notes" to this spec (action versions used, durations, deviations) → `docs: ci badge, local reproduction and merge rule`

Then: local verification (§9.1–9.2) → `code-reviewer` → fixes → teaching walkthrough → the human says "push it" → the human pushes and opens the PR (no `gh` CLI) → first run (§9.3) → the human enables protection (§6) → optional demo (§9.4).

## 11. Open questions / risks

### Resolved by the human (2026-10-07)

These override anything below and in §4, §5 and §7:

- **Dependabot majors:** ignore **semver-major** updates for `xunit.v3`, `Microsoft.*` and `Npgsql.EntityFrameworkCore.PostgreSQL` (to stay on the .NET LTS line), `jest`, `@types/jest`, `@types/react`, `typescript`, `nativewind`, `tailwindcss`, `@testing-library/react-native` and `test-renderer`. Minor and patch updates still flow. Major upgrades of these are deliberate tasks.
- **Branch protection:** "Require branches to be up to date before merging" is **off**.
- **OpenAPI drift check:** hardened to `git status --porcelain backend/openapi/`, which fails on any output. It also catches new untracked generated files. The mobile client drift check uses the same form.
- **Concurrency:** `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Only PR runs are cancelled, so every `main` commit gets a status.
- **Commit type:** `ci:`.
- **Dependabot `docker` ecosystem:** deferred to the deployment phase.

### Remaining risks

- **Required-check names must match job ids.** Renaming `backend`/`mobile`/`docker`, or adding `name:`, silently breaks merging (PRs wait forever). Mitigation: §6.2, plus a comment at the top of `ci.yml`.
- **Runner image updates.** `ubuntu-latest` moves to new Ubuntu releases and refreshes preinstalled tools (Docker, git, default Node/.NET) on GitHub's schedule. .NET and Node are pinned by `global.json` / `.nvmrc`. Docker and git aren't, and an image change could break a run with no code change. Mitigation: read the runner-image changelog when that happens; pin `ubuntu-24.04` if it becomes a problem.
- **Testcontainers / Docker Hub pulls.** `postgres:17` (and `docker/dockerfile:1` in the docker job) are pulled anonymously from Docker Hub on every run. This adds tens of seconds, and Docker Hub anonymous rate limits could cause a rare failure. A re-run fixes it. We don't add Docker Hub login for now, because that would need a secret.
- **Dependabot + Central Package Management.** Dependabot's NuGet updater supports `Directory.Packages.props`. This needs confirming on the first run. Two majors will appear that we probably **don't** want:
  - `xunit.v3` 4.x, which drops VSTest on .NET 10 (backend spec §4). CI would catch it (red PR), but it will keep coming back. **Should the config ignore `xunit.v3` semver-major?**
  - The `Microsoft.*` / `Npgsql.EntityFrameworkCore.PostgreSQL` 11.x packages once .NET 11 (STS) ships. They target a newer runtime than our LTS. **Should we ignore semver-major for runtime-tied packages, to stay on the .NET LTS line?**
- **More Expo-coupled npm packages?** The plan's ignore list covers the Expo/React/RN families plus `jest-expo` and `eslint-config-expo`. These are also effectively tied to the SDK or ADR-0002, and majors may need ignoring (human decision): `jest` / `@types/jest` (jest-expo targets a specific Jest major), `@types/react`, `typescript`, `nativewind` / `tailwindcss` (ADR-0002: a NativeWind major is a deliberate task), `@testing-library/react-native` / `test-renderer`. Proposed default: ignore **semver-major only** for these, and let minor/patch flow.
- **`expo export` time and memory.** Static web export renders every route in Node. It's quick for one route, but it grows with the app. Public-repo standard runners currently have 4 vCPU / 16 GB, which is plenty. Watch the step duration; a 20-minute job timeout is the backstop.
- **Drift check misses untracked files.** `git diff --exit-code backend/openapi/` ignores **new untracked** files, e.g. if a second OpenAPI document were ever generated. That's fine with today's single file. A stricter `test -z "$(git status --porcelain backend/openapi/)"` would catch it. **Keep the plan's `git diff`, or harden now?**
- **`cancel-in-progress` on `main`.** Fast back-to-back merges cancel the earlier `main` run (§4). An alternative is `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Kept as approved; flagged for awareness.
- **"Require branches to be up to date before merging".** Off by default (§6.3). Turning it on guarantees each PR was tested against the latest `main`, but it forces a rebase or re-run whenever `main` moves, which happens with every Dependabot merge. Solo-repo default: off. Human decision.
- **First repo-wide Prettier run may flag existing files.** Commit `a662394` formatted docs and config, but backend JSON (e.g. `appsettings*.json`, `launchSettings.json`) or `.claude/` files may still differ. If so, handle it with commit 5 (formatting only). If a file shouldn't be formatted at all, adding it to `.prettierignore` is a human decision.
- **`setup-dotnet` and `rollForward: latestFeature`.** We need to confirm on the first run which SDK the action installs from `global.json` (10.0.100 vs the latest 10.0.x feature band) and that it matches local closely enough for the OpenAPI output to be identical. A generator difference between SDK patch levels would show up as backend drift.
- **Linux is case-sensitive.** Windows isn't. An import with the wrong letter case passes locally and fails in CI (Metro / `tsc` / `docker build`). This is a feature of CI, not a bug, but expect it to be the most likely "works on my machine" failure.
- **Commit type `ci:`** vs `chore(ci):`. `CLAUDE.md` lists the common types. `ci:` is standard Conventional Commits. Human preference?
- **Dependabot for the `docker` ecosystem** (`mcr.microsoft.com/dotnet/sdk:10.0` / `aspnet:10.0`, and `postgres:17` in compose). These are floating major tags that already pick up patches on rebuild, so they're left out for now. Add them with the deployment phase if digest pinning is wanted.
