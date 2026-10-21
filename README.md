# AXA Cleaning

Bilingual (English/Romanian) task, budget and expense tracking for AXA Cleaning. **Product by Arctic Technologies.** The AXA Cleaning logo in `src/LOGO.jpeg` is used across the app, as the favicon, and as the installed PWA icon. The browser runs only the compiled Vite application; Supabase owns identity, authorization, PostgreSQL data, private proof storage and privileged operations.

## Security boundary

- Keep the source repository **private**. GitHub Pages is public hosting: anyone who has the site URL can download the compiled JavaScript. Never deploy production records, credentials, proof files, private configuration or the Supabase service-role key.
- Production data is stored only in Supabase Auth, PostgreSQL and the private `task-proofs` Storage bucket. Browser session tokens use `sessionStorage` (tab-scoped) and no business data is persisted in browser storage.
- The public anon key is intentionally used by the app. It is not a secret; RLS is the authorization boundary. Service-role credentials are used only inside Supabase Edge Functions.
- Do not use the local synthetic seed outside an isolated development Supabase project.

## Stack and features

React 19, TypeScript strict mode, Vite, React Router, Tailwind CSS, TanStack Query, React Hook Form, Zod, i18next, Supabase JS, Decimal.js, Vitest, Testing Library and Playwright. The app includes bilingual login/recovery/password reset, role-aware dashboards, task creation, comments/status history, validation, task expenses, private proofs with short-lived signed URLs, review actions, administrator-provisioned accounts with temporary passwords/deactivation, scoped filters, CSV export, audit and a static-shell PWA service worker.

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

## Production sign-in and account provisioning

Signing in to GitHub or Supabase Dashboard does **not** create an AXA Cleaning app account. The production `profiles` table was verified empty, so the app correctly rejects sign-ins until the first app Super Admin is provisioned.

### One-time: bootstrap the first Super Admin

1. In Supabase Dashboard, select the **AxaCleaning_TaskFlow** project → **Authentication → Users** → **Add user**. Create the first Super Admin with their real email and a temporary password; do not send an invitation. Do not create a public/demo login or use synthetic `.taskflow.local` accounts in production.
2. Open **SQL Editor → New query**. Open [docs/bootstrap-first-admin.sql](docs/bootstrap-first-admin.sql), replace the email, username, and full name values with that user's details, paste the SQL into the editor, and run it once. It creates/uses the AXA Cleaning organisation and links the Auth identity to a `super_admin` profile with first-login password reset required.
3. Give the user their temporary password through a secure channel. They can sign in with their email and temporary password, finish the required password reset, and reach the app.

The SQL is intentionally a manual owner-only bootstrap rather than an unauthenticated endpoint. Never publish a password, service key, or bootstrap credential. Do not rerun it once an active Super Admin exists; later accounts must be provisioned by an authorised administrator in the app.

### Add organisation users

1. Open **People → Add user**. Choose the app access **User** or **Assigner**, and separately choose the job position **Employee** or **Manager** and (optionally) the reporting manager. These are independent: a manager can be a User or Assigner, and the reporting line does not grant app permissions. Only a Main admin can add or manage accounts.
2. The Edge Function creates a confirmed Supabase Auth account without sending any email, creates the organisation-scoped profile, and returns a randomly generated temporary password. The password is displayed once in the admin's current app session. Share it with the user over a secure, separate channel; do not paste it into tickets, chat, email or logs. The user signs in using their username and temporary password and is forced to choose a new password immediately.
3. A Main admin can use **Edit user** to update details, change User/Assigner/Main admin app access, set the Employee/Manager position, or update the reporting manager. Promoting an account to Main admin grants full administrative access. At least one active Main admin must remain.
4. If no real email is supplied, the app uses an internal non-deliverable Auth identity. The user must sign in with their username; email-based password recovery is unavailable. A Main admin can use **Issue temporary password** on a People row to reset access. A real email is recommended for recovery.
5. A Main admin configures each Assigner's end-user scope in **People → Manage Assigner scope** before that Assigner can create tasks. Use **Deactivate** to disable an account.

No invitation or password email is sent during account creation; custom SMTP is not required for provisioning. Users with an email address can request password recovery through Supabase's configured email service. Auth URL redirect settings are required for that recovery flow.

The two `tester.*@taskflow.local` users above are synthetic local-development fixtures for testing access isolation. They are not created in production and must never be deployed there. Never put reusable sample credentials on the public Pages site.

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
5. Deploy `username-login` and `admin-user-upsert`. Configure Auth rate-limiting and monitor denied requests. User creation does not send mail; maintain a secure channel for sharing one-time passwords and configure a real recovery email when available.
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

Before production, complete a real Supabase environment verification, Romanian language review by a fluent speaker, MFA policy decision, independent accessibility audit, backup restore drill, malware scanning policy for proofs, full audit of SQL/RLS against the target Supabase version, and browser E2E flows with provisioned test identities. Configure transactional email if users will rely on email-based password recovery. No claim of production security certification is made by a passing frontend build alone.
