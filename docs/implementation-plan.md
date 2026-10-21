# TaskFlow SME — implementation plan and architecture decision record

## Proposed repository tree

```text
taskflow-sme/
├── .github/workflows/       # quality checks, secret/dependency checks, Pages deployment
├── docs/                    # architecture, security, deployment, rollback, plan
├── e2e/                     # Playwright critical-path browser checks
├── public/                  # manifest, icon, Pages SPA fallback inputs
├── scripts/                 # translation parity and Pages fallback build helpers
├── src/
│   ├── app/                 # browser entry, router, query providers
│   ├── components/          # accessible design primitives
│   ├── features/            # task, expense, review and user workflows
│   ├── i18n/                # en.json and ro.json resources
│   ├── lib/                 # Supabase, Decimal money, CSV, workflow rules
│   └── test/                # Vitest setup
├── supabase/
│   ├── functions/           # username login and privileged account management
│   ├── migrations/          # schema, functions, RLS and Storage policies
│   ├── tests/               # local RLS authorization tests
│   └── seed.sql             # synthetic local-only sample accounts/tasks
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Schema summary

Tenant root: `organisations`. Auth-linked identity/roles: `profiles` and scoped `permissions`. Workflow: `tasks`, append-only `task_status_history`, `task_comments`, and `task_reviews`. Accounting: `expense_lines` with PostgreSQL `numeric` and generated totals, plus private `expense_proofs` metadata. Supporting entities: `notifications`, append-only `audit_events`, and a compatibility-only `user_invitations` table. Tenant tables use UUID keys, foreign keys, constraints, timestamps/actors, soft deletion where applicable, indexes and task optimistic versioning.

## RLS policy matrix

| Resource | End User | Assigner | Super Admin |
|---|---|---|---|
| Profile | Own | Own + permitted end users | Own organisation |
| Tasks/history/comments | Own assigned tasks | Tasks created in own permitted scope | Own organisation |
| Expense lines/proofs | Own task; editable only in permitted task states | Scoped task read | Own organisation |
| Storage objects | Own task paths only | Authorized task proofs | Own organisation |
| Audit/invitations | Denied | Denied | Own organisation |
| Account roles | Denied | End-user administration only if explicitly granted | Server-side organisation administration |

No anonymous business data. Authenticated table grants are minimized; task status/creation, expense writes, proof metadata and admin changes use authorization-checked functions. UI restrictions do not replace these policies.

## Route map

`/login`, `/forgot-password`, `/reset-password`, `/app`, `/app/tasks`, `/app/tasks/new`, `/app/tasks/:taskId`, `/app/reviews`, `/app/people`, `/app/reports`, `/app/audit` (Super Admin), `/app/settings`. Vite base path, React Router basename and generated Pages `404.html` support organization and project sites.

## State transitions

- Pending → In Progress / On Hold / Skipped; On Hold and Skipped require a 10+ character reason.
- In Progress → On Hold / Skipped / Submitted.
- On Hold and Skipped → In Progress or Submitted.
- Returned → correction workflow and resubmission.
- Submitted → Verified or Returned; return needs a comment.
- Verified is immutable except a reasoned, audited Super Admin reopen.
- Pending cancellation requires an authorized assigner/admin and a reason.
- Database RPCs lock rows and compare `version`; prohibited direct table updates stay ungranted.

## Phased build plan

1. Foundation: strict Vite/React shell, translations, private-source/Pages CI and project configuration.
2. Security foundation: tenant schema, constraints, RLS, private Storage, RPCs, audit and local-only seed.
3. Identity: login/recovery, username mapping, administrator-provisioned accounts, disabled accounts and forced first-login password reset.
4. Tasks: dashboards, creation, scoped lists, filters, transitions, comments/history and review queue.
5. Expenses: decimal invoice lines, private proof upload/signed access, budget warnings and submission lock.
6. Admin/reporting: people, filters, CSV, settings, audit display and notifications.
7. Hardening: unit/translation/E2E/RLS tests, accessibility, dependency/secret scans, docs and restore/deployment gates.

## ADR-001 — Supabase backend with public static hosting

**Decision:** Store source code/migrations/tests/docs in a private GitHub repository, deploy only compiled static client assets to GitHub Pages, and use Supabase Auth/PostgreSQL RLS/private Storage/Edge Functions for all production identity and data.

**Rationale:** Static hosting cannot protect embedded server secrets or own mutable business data. Database RLS/functions enforce IDOR and tenant scope on direct calls; service-role credentials remain server-side. Decimal.js plus PostgreSQL `numeric` prevents floating point money errors. App-shell offline caching never caches authentication, REST or proof requests.

**Tradeoffs:** The client bundle is publicly downloadable, so only anon configuration is shipped. Pages SPA routing needs the `404.html` fallback. Database migrations and Pages front-end releases are separate controlled operations.
