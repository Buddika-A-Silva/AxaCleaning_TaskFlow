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
4. Add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, a cryptographically random `LOGIN_RATE_LIMIT_SALT` of at least 32 characters, and a tightly configured `APP_ORIGIN` as Supabase Function secrets. Never add the service-role key or rate-limit salt to GitHub variables or `VITE_*` values.
5. Deploy `username-login` and `admin-user-upsert`; configure email invitation redirects. Configure Auth rate-limiting and monitor denied requests.
6. Bootstrap the first Super Admin through a reviewed, one-time server-side process using Supabase dashboard/SQL with restricted operator access. Create the organisation and matching profile; do not expose this bootstrap secret or script to the browser. Verify there is at least one active Super Admin before handoff.
7. Configure storage retention/backup and test proof restore and private signed-link access.

## GitHub repository and Pages deployment

Keep the repository private, enable branch protection and require CI checks. Enable **Settings → Pages → Build and deployment → GitHub Actions**. Add these repository/environment variables (all are public client configuration, not secrets):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BASE_PATH`

For an organization/user site (`https://OWNER.github.io/`), set `VITE_BASE_PATH=/`. For a project site (`https://OWNER.github.io/REPOSITORY/`), set `VITE_BASE_PATH=/REPOSITORY/` including both slashes. Push to `main` or run the workflow manually. GitHub Pages publishes only `dist/`; `404.html` supports direct SPA-route loads. Keep Pages visibility appropriate for your GitHub plan and remember that the client bundle is public even when its source repository is private.

Migrations are intentionally **not** auto-applied by Pages CI. Review and apply database changes to the intended Supabase environment as a separate controlled operation.

## Routes

`/login`, `/forgot-password`, `/reset-password`, `/app`, `/app/tasks`, `/app/tasks/new`, `/app/tasks/:taskId`, `/app/reviews`, `/app/people`, `/app/reports`, `/app/audit` (Super Admin only), and `/app/settings`. UI route guards are convenience only; RLS and database RPC authorization remain authoritative.

## Known release gates

Before production, complete a real Supabase environment verification, Romanian language review by a fluent speaker, live invitation/email configuration, MFA policy decision, independent accessibility audit, backup restore drill, malware scanning policy for proofs, full audit of SQL/RLS against the target Supabase version, and browser E2E flows with provisioned test identities. No claim of production security certification is made by a passing frontend build alone.
