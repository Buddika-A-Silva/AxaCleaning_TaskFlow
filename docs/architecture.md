# Architecture and decisions

**Product:** AXA Cleaning task, budget, and expense tracker. **Product by Arctic Technologies.**

## ADR-001 — Static client, managed identity/data

**Decision:** Build React/TypeScript with Vite and deploy only compiled static assets to GitHub Pages. Keep the source repository private. Supabase Auth, PostgreSQL, private Storage and Edge Functions are the only production runtime/data services.

**Why:** Pages cannot safely execute a stateful server backend. Browser code and public anon keys are inspectable, so the service-role key must remain within Edge Function secrets. PostgreSQL RLS enforces tenant and ownership boundaries even when requests bypass the UI.

**Consequences:** A deployed Pages bundle is public; do not treat the private Git repository as a way to hide compiled source/config. Use RLS, private objects and RPCs for authorization. Configure a Vite base path for both site shapes. Pages has no rewrite configuration, so the build publishes `404.html` for client-side routes.

## Data model

| Table | Purpose / security |
|---|---|
| `organisations` | Tenant boundary and locale/currency defaults. |
| `profiles` | Auth-linked identity, unique username, app access role, separate employee/manager position and reporting-manager link, language, active/reset flags; never stores passwords. |
| `permissions` | Assigner-to-end-user scope and explicit user-management permission records. |
| `tasks` | Assignment, priority, dates, optional `numeric` budget, currency, status and optimistic `version`. |
| `task_status_history` | Append-only chronological transitions and reasons. |
| `task_comments` | User-visible status/review comments. |
| `expense_lines` | Quantity, unit amount, generated fixed-precision line total. |
| `expense_proofs` | Private Storage object metadata; no signed URLs stored. |
| `task_reviews` | Verification, return and exceptional reopen decisions. |
| `notifications` | User-scoped in-app notices. |
| `audit_events` | Restricted append-only sensitive-action trail. |
| `user_invitations` | Retained schema for compatibility; current account provisioning creates Auth users directly and does not send invitations. |

Every table has RLS enabled. Tenant-owned rows carry `organisation_id`; business rows include actor/timestamp fields and soft-delete fields where relevant. The SQL migration creates indexes for tenant/task/role/date lookups and only grants task mutations through constrained RPC functions. `line_total` is generated from PostgreSQL numeric fields; client calculations use Decimal.js.

## Authorization policy summary

| Data | End User | Assigner | Super Admin |
|---|---|---|---|
| Profiles | Self only | Self + explicitly permitted end users | Same organisation |
| Tasks | Assigned-to-self | Created-by-self and permitted assignee scope | Same organisation |
| History/comments | Tasks accessible to self | Tasks accessible to scope | Same organisation |
| Expense/proof metadata | Own assigned tasks; write only while editable | Read permitted task scope | Same organisation |
| Storage objects | Own task proof paths | Authorized task proofs | Same organisation |
| Audit/invitations | None | None | Same organisation |
| Roles/user creation | None | None | Server-side management |

App access is controlled by the `app_role` (`end_user` shown as **User**, `assigner`, or `super_admin` shown as **Main admin**). `job_position` and `manager_id` only describe the reporting hierarchy; they never grant permissions. A manager may report to another manager, and database validation prevents cross-organisation links, self-reporting, cycles, or demoting a manager who still has direct reports.

All access is default-deny. Browser role checks are not authorization. Privileged functions resolve the bearer token, verify the active caller and tenant, validate role/scope, and audit through database triggers. Never add a service-role client to frontend code.

## Workflow

- `Pending` → `In Progress`, `On Hold`, `Skipped`; hold/skip require at least 10 characters.
- `In Progress` → hold, skip or `Submitted`.
- Hold/Skipped → `In Progress` or `Submitted`.
- `Returned` → correction states and resubmission.
- `Submitted` → `Verified` or `Returned`; return requires a comment.
- `Verified` is immutable to normal roles. Only a Super Admin can return/reopen it with a reason; the transition history, review row and audit trigger record it.
- An assigner can cancel a pending task with a reason; cancellation is terminal.

Transitions lock the task row and compare `expected_version`; ordinary `UPDATE` privileges are not granted to authenticated users.

## Route and state architecture

React Router exposes login/recovery and authenticated dashboard/task/review/people/report/audit/settings routes. TanStack Query caches server results only in memory. Auth tokens are tab-scoped through `sessionStorage`; no task or expense record is cached to persistent browser storage. The PWA worker caches only same-origin app shell/assets and explicitly bypasses auth, REST and Storage requests.
