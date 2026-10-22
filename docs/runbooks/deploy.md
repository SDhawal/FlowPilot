# Runbook — production deployment

How FlowPilot reaches production, how to set it up from scratch, and what to do when something goes wrong.
Design and reasoning: [phase0-deploy](../features/phase0-deploy.md) · [ADR-0003](../adr/0003-deployment-and-delivery.md).

```
merge to main ─► CI (backend, mobile, docker) ─► deploy job: migrate Neon ─► Render deploy hook ─► verify /health/version + /health/ready
             └─► Cloudflare Pages builds the web app on its own (Git integration)
```

| Piece    | Where                                    | Free limit that matters                                              |
| -------- | ---------------------------------------- | -------------------------------------------------------------------- |
| API      | Render web service `flowpilot-api`       | 750 instance-hours/month · **5 GB outbound/month** · sleeps 15 min   |
| Database | Neon project `flowpilot`                 | 0.5 GB storage · **100 CU-hours/month** · scales to zero after 5 min |
| Web      | Cloudflare Pages project `flowpilot`     | static requests unmetered · monthly build quota                      |
| Pipeline | GitHub Actions, environment `production` | free on a public repo                                                |

> **Never add a payment method** to Render, Neon or Cloudflare. Without a card, hitting a free limit
> suspends the service. With a card, it bills you. A suspended demo is fine; a surprise bill isn't.

## 1. First-time setup

Do these in order. Each step needs something from the one before it. You (the human) create every account and paste every secret.

### 1.1 Neon (database)

1. Sign up at neon.tech with GitHub. **Skip any billing prompt.**
2. Create a project `flowpilot`, Postgres 17, region **AWS US East (N. Virginia) `aws-us-east-1`** (must match Render's `virginia`). Database name `flowpilot`.
3. Open the **SQL Editor**, database `flowpilot`, **as the owner role**, and create the two roles. Use SQL, not the dashboard's **Roles** page: Neon makes dashboard-created roles members of `neon_superuser`, which would give the app role DDL rights.

   ```sql
   -- Creates and owns all tables. Used only by the CI deploy job to run migrations.
   CREATE ROLE flowpilot_migrator LOGIN PASSWORD '<generate-a-long-random-password>';
   -- Used by the running API. Can read and write rows, but can't change the schema.
   CREATE ROLE flowpilot_app LOGIN PASSWORD '<a-different-long-random-password>';

   GRANT CONNECT ON DATABASE flowpilot TO flowpilot_migrator, flowpilot_app;
   GRANT USAGE, CREATE ON SCHEMA public TO flowpilot_migrator;
   GRANT USAGE ON SCHEMA public TO flowpilot_app;
   ```

4. Still as the owner, run this block in one go. The defaults have to be set _as_ the migrator: since Postgres 16 the owner role can't change another role's default privileges, and it can't `SET ROLE` to a role it created until it grants itself that right. `INHERIT FALSE` keeps the owner from silently gaining the migrator's rights.

   ```sql
   GRANT flowpilot_migrator TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

   SET ROLE flowpilot_migrator;
   -- Every table/sequence the migrator creates from now on is usable by the app (DML only).
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowpilot_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO flowpilot_app;
   RESET ROLE;
   ```

   Neon names the owner role after the database (not `neondb_owner`), which is why the grant uses `CURRENT_USER`.

5. Check it worked (any role):

   ```sql
   -- Expect two rows owned by flowpilot_migrator: r = {flowpilot_app=arwd/...} (tables), S = {flowpilot_app=rU/...}
   -- (sequences). Two more rows owned by cloud_admin are Neon's own defaults; ignore them.
   SELECT pg_get_userbyid(defaclrole) AS owner, defaclobjtype, defaclacl FROM pg_default_acl;
   -- Expect no rows: neither role may be a member of neon_superuser.
   SELECT r.rolname FROM pg_auth_members m
     JOIN pg_roles r ON r.oid = m.member JOIN pg_roles g ON g.oid = m.roleid
    WHERE g.rolname = 'neon_superuser' AND r.rolname IN ('flowpilot_migrator', 'flowpilot_app');
   ```

   If the second query returns a role, run `REVOKE neon_superuser FROM <role>;` as the owner.

6. Get the **direct** host: **Connect** → turn **Connection pooling off** → copy the host (it does **not** contain `-pooler`). Both connection strings use the direct endpoint.
7. Turn the dashboard's URL into Npgsql's **key=value** format. Npgsql can't parse the `postgresql://…` URL:

   ```
   Host=<direct-host>;Database=flowpilot;Username=flowpilot_migrator;Password=<migrator-password>;SSL Mode=Require
   Host=<direct-host>;Database=flowpilot;Username=flowpilot_app;Password=<app-password>;SSL Mode=Require
   ```

   Keep both somewhere safe (a password manager) until steps 1.3 and 1.4.

### 1.2 Cloudflare Pages (web)

1. Sign up at cloudflare.com. **Skip any billing prompt.**
2. **Workers & Pages → Create → Pages → Connect to Git** → repo `SDhawal/FlowPilot`.
3. Settings:

   | Setting                | Value                                              |
   | ---------------------- | -------------------------------------------------- |
   | Project name           | `flowpilot` (if taken, note the name you got)      |
   | Production branch      | `main`                                             |
   | Framework preset       | None                                               |
   | Root directory         | `mobile`                                           |
   | Build command          | `npm run export:web`                               |
   | Build output directory | `dist`                                             |
   | Env var                | `NODE_VERSION` = `24` (production **and** preview) |

4. Save. The first build **fails**, on purpose: `EXPO_PUBLIC_API_URL` isn't set yet, and the build refuses to ship a site pointing at localhost. You'll set it in step 1.4.
5. **Settings → Builds → Preview deployments:** check whether builds run for pull requests from **forks**. If they do, restrict previews to branches of this repo before auth ships (spec §11).
6. Note the project's **`*.pages.dev` subdomain** from the first deployment URL. Cloudflare may add a suffix even when the name is free (ours: `flowpilot-64c.pages.dev`). Put that domain in both `Cors__AllowedOrigins__*` values in `render.yaml` (`https://<subdomain>.pages.dev` and `https://*.<subdomain>.pages.dev`). Otherwise the browser blocks every API call.

### 1.3 Render (API)

1. Sign up at render.com with GitHub. **Don't add a card.**
2. **New → Blueprint** → repo `SDhawal/FlowPilot`. Render reads `render.yaml`.
3. When it asks for `ConnectionStrings__Default`, paste the **flowpilot_app** string from 1.1.
4. Apply. If Render rejects `runtime: docker` on `plan: free`, **stop** and decide what to do next (spec §11). Don't pick a paid plan.
5. Render may do one initial deploy right away. That's harmless: no migrations exist yet.
6. In the service: **Settings**
   - check **Auto-Deploy** shows **Off** and **Health Check Path** is `/health/live`;
   - check the branch is `main` (switch it if the Blueprint was created from a feature branch). After the merge, also point the **Blueprint's** sync branch at `main` (Blueprints → your Blueprint → Settings), or later `render.yaml` changes won't sync;
   - copy the **Deploy Hook** URL (it's a secret: anyone with it can trigger deploys).
7. Note the service URL. Render usually adds a suffix, e.g. `https://flowpilot-api-9e2u.onrender.com` (ours).
8. Check the API before going further: `/health/version` should return a commit SHA, `/health/ready` should return `Healthy`. If readiness is `503`, Render's logs show the exact cause (e.g. `28P01: password authentication failed`). Test the password independently with `docker run --rm -it postgres:17 psql "host=<host> dbname=flowpilot user=flowpilot_app sslmode=require"`, which prompts for it, then re-paste the **whole** value into Render.

### 1.4 Wire them together

1. **Cloudflare Pages → Settings → Variables:** add `EXPO_PUBLIC_API_URL` = the Render URL (production **and** preview). Retry the latest deployment; it should now build.
2. **GitHub → Settings → Environments → New environment `production`:**
   - **Deployment branches and tags:** _Selected branches and tags_ → add `main`.
   - **Required reviewers:** none (otherwise every deploy waits for a click).
   - **Environment secrets:**
     - `NEON_MIGRATIONS_CONNECTION_STRING` = the **flowpilot_migrator** string from 1.1
     - `RENDER_DEPLOY_HOOK_URL` = the deploy hook from 1.3
   - **Environment variables:** `API_BASE_URL` = the Render URL (no trailing slash).
3. Merge the PR. Watch the `main` run: the `deploy` job migrates, triggers the hook, then waits until `/health/version` reports the merge commit. A first deploy without a merge: **Actions → CI → Run workflow** on `main`.

### 1.5 Verify

- `curl https://<api>.onrender.com/health/version` → `{"commit":"<merge sha>"}` (not `"dev"`).
- `curl -i https://<api>.onrender.com/health/ready` → `200`.
- `https://flowpilot.pages.dev` → **Connected** (or **Waking up the server…** first).
- GitHub **Environments → production** lists the deployment. Neon's **Tables** shows `__EFMigrationsHistory`.

## 2. Day-to-day

- **Ship:** merge to `main`. That's it.
- **Redeploy without a code change** (e.g. after rotating a secret): **Actions → CI → Run workflow** on `main`.
- **Migrations:** added in a PR (`dotnet ef migrations add …`), applied by the pipeline **before** the new code goes live. So every migration must work with the version that's currently running (**expand/contract**): add columns/tables first, switch the code over, and drop the old ones in a later release. Never rename or drop in one step.

## 3. When something goes wrong

| Symptom                                                  | Likely cause → fix                                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Check deploy configuration` fails                       | a secret/variable is missing in the `production` environment → add it (§1.4)                                                         |
| `Apply migrations` fails                                 | wrong/rotated migrator password, pooled host, or URL format → fix `NEON_MIGRATIONS_CONNECTION_STRING`; a failed migration rolls back |
| `Trigger Render deploy` fails with 4xx                   | deploy hook regenerated → update `RENDER_DEPLOY_HOOK_URL`                                                                            |
| `Verify deployed version` times out, last seen = old SHA | Render build or start failed → Render **Events/Logs**. Render keeps serving the previous version                                     |
| `Verify deployed version` times out, last seen = `dev`   | `RENDER_GIT_COMMIT` isn't set at runtime → stop and decide (spec §11)                                                                |
| `Verify readiness` fails                                 | API can't reach Neon → check `ConnectionStrings__Default` on Render (app role, direct host, key=value)                               |
| Pages build fails at `require-env`                       | `EXPO_PUBLIC_API_URL` missing in that Pages environment (production or preview)                                                      |
| Browser console shows a CORS error                       | the page's origin isn't in `Cors__AllowedOrigins__*` (Pages project name changed?) → fix `render.yaml`                               |
| Render service **suspended**                             | a free limit was hit (usually 5 GB bandwidth) → wait for the next month. Don't add a card                                            |
| Neon "compute time quota exceeded"                       | 100 CU-hours used → wait for the next month. Look for something keeping the DB awake                                                 |

### Roll back

- **App:** Render → service → **Events** → pick the last good deploy → **Rollback**. That's safe because migrations only ever expand the schema. Then revert the bad commit on `main` with a PR, or the next merge redeploys the bad code.
- **Schema:** never rolled back automatically. Write a new migration that fixes forward.

## 4. Rotating secrets

| Secret                        | Rotate                                                                                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flowpilot_migrator` password | Neon: `ALTER ROLE flowpilot_migrator PASSWORD '…';` → update GitHub secret `NEON_MIGRATIONS_CONNECTION_STRING`                                                                                                    |
| `flowpilot_app` password      | Neon: `ALTER ROLE flowpilot_app PASSWORD '…';` → update Render `ConnectionStrings__Default` right away (Render restarts the service). The API can't reach the DB between the two steps, so do both in one sitting |
| Render deploy hook            | Render → Settings → Deploy Hook → **Regenerate** → update GitHub secret `RENDER_DEPLOY_HOOK_URL`                                                                                                                  |

After rotating, run **CI → Run workflow** on `main` to prove the pipeline still works. Never paste a secret into an issue, PR, commit or log.

## 5. Cold starts (expected, not a bug)

- Render's free service sleeps after **15 min** without traffic; the next request wakes it in **~1 min**. Neon's compute sleeps after 5 min and wakes in **~1 s**.
- The app shows **Waking up the server…** and retries for up to ~90 s, then **Connected**.
- **Why there's no keep-alive pinger:** pinging anything that touches the database keeps Neon awake. That's ~0.25 CU × 730 h ≈ 180 CU-hours/month, nearly twice the free 100, so the database would go dark mid-month. Pinging only `/health/live` would still burn ~730 of Render's 750 instance-hours and wouldn't save the Neon wake-up. Cold starts are the cheaper trade.
