# Deployment, rollback and recovery

## Environment preparation

Use distinct Supabase development, test and production projects. Apply reviewed SQL migrations with the Supabase CLI in a controlled operator session; the Pages workflow does not migrate databases. Keep `APP_ORIGIN`, Auth redirect allow-list and CORS origins consistent for each environment.

Before the first workflow deployment, open repository **Settings → Pages → Build and deployment** and select **GitHub Actions** as the source. A branch-based Pages build can serve the raw `src/main.tsx` entry point rather than the compiled application. The deployment workflow intentionally does not carry a repository-admin token to change Pages settings.

Set GitHub Pages variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_BASE_PATH` in the selected environment. They are included in the public static bundle; the URL and anon key are publishable identifiers, not server secrets. Never configure the service-role key in GitHub.

### Site base paths

- Organization/user site `OWNER.github.io`: `/`
- Project site `OWNER.github.io/REPOSITORY/`: `/REPOSITORY/`

Set Pages to GitHub Actions, push to `main`, and check the deployment and direct nested-route loads. `dist/404.html` is a Pages fallback. `VITE_BASE_PATH` is a build-time setting.

## Controlled release

1. Review migration diff, RLS policies and function changes.
2. Run translation parity, typecheck, lint, unit tests, Playwright tests, secret scanning and dependency review.
3. Deploy migrations to a disposable test project; run database RLS tests and manual negative authorization checks.
4. Apply migrations to production in a reviewed maintenance window. Back up and verify the restore point first.
5. Deploy the Pages bundle; run login, invitation, task, proof, review, export and direct-route smoke tests.
6. Confirm the deploy does not contain seed users, proof assets, `.env` files or service secrets.

## Rollback

- **Frontend:** use GitHub Actions to redeploy the last known-good commit. The Pages artifact is only the static app shell; no user data is stored there.
- **Database:** prefer a forward fix for additive/compatible changes. Destructive migrations require a separately tested restore plan and approval. Do not blindly run down migrations after live writes.
- **Storage:** restore only from encrypted, access-restricted Supabase backups. Validate bucket privacy and signed access after restore.
- **Credentials:** revoke sessions and rotate compromised secrets before restarting functions.

## Backup and restore drill

Enable Supabase database backups and determine PITR/retention based on the subscription and legal requirements. Define a separate private Storage backup policy for `task-proofs`. At least quarterly, restore into an isolated project, verify row counts/tenant constraints/RLS, verify proof metadata-to-object integrity and test unauthorized access. Do not copy production data to developer machines.
