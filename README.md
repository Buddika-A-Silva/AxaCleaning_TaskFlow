# AXA Cleaning

Bilingual (English/Romanian) task, budget and expense tracking for AXA Cleaning. **Product by Arctic Technologies.** The AXA Cleaning logo in `src/LOGO.jpeg` is used across the app, as the favicon, and as the installed PWA icon. The browser runs only the compiled Vite application; Supabase owns identity, authorization, PostgreSQL data, private proof storage and privileged operations.

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
- Test End User 1 (English): `tester.one@taskflow.local` / `TaskFlowLocal2026!`
- Test End User 2 (Romanian): `tester.two@taskflow.local` / `TaskFlowLocal2026!`

**Never deploy these users, passwords, or seeded tasks to production.** The seed script is not called by CI or Pages deployment.

## Production sign-in and user invitations

Signing in to GitHub or Supabase Dashboard does **not** create an AXA Cleaning app account. The production `profiles` table was verified empty, so the app correctly rejects sign-ins until the first app Super Admin is provisioned.

### One-time: bootstrap the first Super Admin

1. In Supabase Dashboard, select the **AxaCleaning_TaskFlow** project → **Authentication → Users** → **Add user / Invite user**. Invite the real person who will be the first Super Admin using their real email. Do not create a public/demo login or use synthetic `.taskflow.local` accounts in production.
2. Before they accept the email, open **SQL Editor → New query**. Open [docs/bootstrap-first-admin.sql](docs/bootstrap-first-admin.sql), replace the email, username, and full name placeholders with that same invitee's details, paste the SQL into the editor, and run it once. It creates/uses the AXA Cleaning organisation and links the invited Auth identity to a `super_admin` profile with first-login password reset required. It creates no password.
3. If the invitee opens the email before the SQL profile is inserted, have them wait a moment and retry the invite link after the SQL succeeds. They can then sign in with the invited email and their password, finish the required password reset, and reach the app.

The SQL is intentionally a manual owner-only bootstrap rather than an unauthenticated endpoint. Never publish a password, service key, or bootstrap credential. Do not rerun it once an active Super Admin exists; later accounts must use the invitation UI.

### After the first Super Admin can sign in

1. Open **People → Invite user**. Choose **Assigner** (Super Admin only) or **End User**, enter the name, unique lowercase username, and recovery/invitation email, then select the language and send the invitation.
2. The Edge Function creates the Supabase Auth invitation and matching organisation-scoped profile. The user follows the email link and chooses their own password. TaskFlow never receives, displays, or stores that password.
3. A Super Admin must configure each Assigner's end-user scope in **People → Manage Assigner scope** before that Assigner can create tasks. To let an Assigner invite/manage end users, grant `can_manage_users` on that Assigner profile through Super Admin account administration. End users see only tasks assigned to them.
4. Use **Deactivate** to disable an account; never remove/demote the final active Super Admin.

### Invitation link configuration

In Supabase **Authentication → URL Configuration**, set the Site URL to `https://buddika-a-silva.github.io/AxaCleaning_TaskFlow/` and allow `https://buddika-a-silva.github.io/AxaCleaning_TaskFlow/**` as a redirect URL. In Edge Function Secrets, set `INVITE_REDIRECT_URL=https://buddika-a-silva.github.io/AxaCleaning_TaskFlow/reset-password` (full project-site path). Keep `APP_ORIGIN=https://buddika-a-silva.github.io` as the origin only for CORS. Redeploy the `admin-user-upsert` function after changing its code or invitation redirect configuration.

The two `tester.*@taskflow.local` users above are synthetic local-development fixtures for testing access isolation. They are not created in production and must never be deployed there. For production acceptance testing, invite two real, controlled test mailboxes after the first Super Admin exists. Never put reusable sample credentials on the public Pages site.

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
