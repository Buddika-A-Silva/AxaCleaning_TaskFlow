# TaskFlow SME

Bilingual (English/Romanian) task, budget and expense tracking for small and medium teams. The browser runs only the compiled Vite application; Supabase owns identity, authorization, PostgreSQL data, private proof storage and privileged operations.

## Security boundary

- Keep the source repository **private**. GitHub Pages is public hosting: anyone who has the site URL can download the compiled JavaScript. Never deploy production records, credentials, proof files, private configuration or the Supabase service-role key.
- Production data is stored only in Supabase Auth, PostgreSQL and the private `task-proofs` Storage bucket. Browser session tokens use `sessionStorage` (tab-scoped) and no business data is persisted in browser storage.
- The public anon key is intentionally used by the app. It is not a secret; RLS is the authorization boundary. Service-role credentials are used only inside Supabase Edge Functions.
- Do not use the local synthetic seed outside an isolated development Supabase project.

## Stack and features

React 19, TypeScript strict mode, Vite, React Router, Tailwind CSS, TanStack Query, React Hook Form, Zod, i18next, Supabase JS, Decimal.js, Vitest, Testing Library and Playwright. The app includes bilingual login/recovery/password reset, role-aware dashboards, task creation, comments/status history, validation, task expenses, private proofs with short-lived signed URLs, review actions, user invitations/deactivation, scoped filters, CSV export, audit and a static-shell PWA service worker.

## Local development

1. Install Node.js 22+ and Docker Desktop, then run `npm ci`.
2. Install the Supabase CLI using its official Windows instructions.
3. Run `supabase start`, then `supabase db reset` to apply migrations and the **local-only synthetic** seed.
4. Copy `.env.example` to `.env.local`; set the local Supabase URL and public anon key reported by `supabase status`. Use `VITE_BASE_PATH=/` locally.
5. Run `npm run dev`.

Synthetic local credentials (only in the local seeded Supabase instance):

- Super Admin: `admin@taskflow.local` / `TaskFlowLocal2026!`
- Assigner: `assigner@taskflow.local` / `TaskFlowLocal2026!`
- End User: `alex@taskflow.local` / `TaskFlowLocal2026!`
- Romanian End User: `sam@taskflow.local` / `TaskFlowLocal2026!`

**Never deploy these users, passwords, or seeded tasks to production.** The seed script is not called by CI or Pages deployment.

## Quality checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run check:i18n`
- `npm run build`
- `npm run test:e2e` (install a browser with `npx playwright install chromium` first)
- `npm run test:db` for database RLS tests in the local project (requires the Supabase CLI and a local Supabase stack)

## Supabase production setup

1. Create separate Supabase development, test and production projects. Do not import the local seed into production.
2. Configure Auth email/password, password policy (12+ characters), email delivery, redirect allow-list, session duration, abuse protection and MFA requirements for privileged roles. Disable public sign-up.
3. Link the CLI to the intended project and apply reviewed migrations. Verify all tables have RLS enabled, the anonymous role has no business grants, and `task-proofs` is private with the 10 MiB MIME allow-list.
4. Add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, a cryptographically random `LOGIN_RATE_LIMIT_SALT` of at least 32 characters, and `APP_ORIGIN=https://buddika-a-silva.github.io` as Supabase Function secrets. `APP_ORIGIN` is the site origin only—no repository path or trailing slash. The function has the same production-origin fallback, but explicitly setting the secret is recommended. Never add the service-role key or rate-limit salt to GitHub variables or `VITE_*` values.
5. Deploy `username-login` and `admin-user-upsert`; configure email invitation redirects. Configure Auth rate-limiting and monitor denied requests.
6. Bootstrap the first Super Admin through a reviewed, one-time server-side process using Supabase dashboard/SQL with restricted operator access. Create the organisation and matching profile; do not expose this bootstrap secret or script to the browser. Verify there is at least one active Super Admin before handoff.
7. Configure storage retention/backup and test proof restore and private signed-link access.

After changing Edge Function code, redeploy both functions to the same project (for example with `supabase functions deploy username-login --project-ref YOUR_PROJECT_REF` and `supabase functions deploy admin-user-upsert --project-ref YOUR_PROJECT_REF`). CLI deployment requires an authenticated Supabase CLI session; never paste an access token into chat. Check the browser Network tab for a successful OPTIONS preflight and a generic login response before conducting account tests.

## GitHub repository and Pages deployment

Keep the repository private, enable branch protection and require CI checks. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source (not “Deploy from a branch”). This one-time setting is required; the workflow does not request an administrator PAT to change repository settings. A branch-based Pages build can serve the raw TypeScript entry point instead of the compiled Vite application. Add these repository-level Actions variables (or secrets; variables are recommended) — build jobs do not read environment-scoped values unless assigned to an environment:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE_PATH` (the workflow derives the repository/user-site value if omitted)

The Pages workflow validates that the URL and anon key are present and fails rather than publishing an app with no backend configuration. These two client values are included in the public bundle; the anon key is not a secret.

For an organization/user site (`https://OWNER.github.io/`), set `VITE_BASE_PATH=/`. For a project site (`https://OWNER.github.io/REPOSITORY/`), set `VITE_BASE_PATH=/REPOSITORY/` including both slashes. Push to `main` or run the workflow manually. GitHub Pages publishes only `dist/`; `404.html` supports direct SPA-route loads. Keep Pages visibility appropriate for your GitHub plan and remember that the client bundle is public even when its source repository is private.

Migrations are intentionally **not** auto-applied by Pages CI. Review and apply database changes to the intended Supabase environment as a separate controlled operation.

## Routes

`/login`, `/forgot-password`, `/reset-password`, `/app`, `/app/tasks`, `/app/tasks/new`, `/app/tasks/:taskId`, `/app/reviews`, `/app/people`, `/app/reports`, `/app/audit` (Super Admin only), and `/app/settings`. UI route guards are convenience only; RLS and database RPC authorization remain authoritative.

## Known release gates

Before production, complete a real Supabase environment verification, Romanian language review by a fluent speaker, live invitation/email configuration, MFA policy decision, independent accessibility audit, backup restore drill, malware scanning policy for proofs, full audit of SQL/RLS against the target Supabase version, and browser E2E flows with provisioned test identities. No claim of production security certification is made by a passing frontend build alone.
