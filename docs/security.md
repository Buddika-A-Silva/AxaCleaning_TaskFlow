# Security operations

## Threat model and controls

- **IDOR / cross-tenant reads:** PostgreSQL RLS predicates bind every user to the active profile organisation. Task RPCs authorize the actual assignee/reviewer and validate scope. Test direct requests as another seeded end user.
- **Privilege escalation:** roles and invitations are written only in `admin-user-upsert` using a server-side service role, after bearer-token and actor checks. The browser has no service-role credential and direct table grants are limited.
- **Password/account exposure:** Supabase Auth owns password material. The app never reads passwords. The username login function maps username to identity, uses generic failures, rejects inactive accounts, and applies atomic 10-attempt/15-minute throttles to salted network and network+identifier digests. Also configure GoTrue throttling and gateway-level abuse protection.
- **Proof disclosure:** `task-proofs` is private. Upload paths are tenant/task scoped and MIME/size checked. Signed URLs last 120 seconds and are never persisted. Do not include proof contents, URLs, reset links, tokens or passwords in audit/log output.
- **Money tampering:** PostgreSQL `numeric` columns and generated line totals are authoritative. Expense writes are constrained by an RPC and task status. Client Decimal.js values are display/preflight only.
- **Concurrent edits:** status transitions compare the expected task version while locking the row.
- **Inactive users:** helper functions require an active, non-deleted profile. Deactivation blocks access at database policies even if an Auth session still exists.

## Required operational settings

- Separate Supabase projects and credentials for development, test and production.
- Turn off public signup; set strong password policy, email confirmations, redirect allow-list, session policy, auth rate limits and MFA for administrative accounts.
- Restrict `APP_ORIGIN` to the deployed Pages origin (and local origins only in development). Set function CORS explicitly; do not use wildcard production origins.
- Use custom SMTP and verify invitation/password-reset redirects. Supabase Auth is the sole password system.
- Store `SUPABASE_SERVICE_ROLE_KEY` only in Supabase Edge Function secrets. Rotate it after suspected exposure. Never set it in `VITE_*`, GitHub Pages, Git or Actions artifacts.
- Keep the bucket private; review allowed MIME/size configuration and use malware scanning/retention controls before accepting external production files.
- GitHub Pages provides static hosting and cannot set arbitrary response headers. Add CSP, HSTS, frame, content-type and referrer headers through an approved CDN/custom domain proxy if required by policy. Do not rely on meta tags for HSTS.
- Configure private-repository secret scanning, Dependabot, branch protection and Actions least privilege.

## Data handling

Do not commit `.env`, service secrets, user exports, production database dumps, uploaded proof files or production records. Do not put production data in browser local storage/session storage, GitHub Issues, test artifacts or test fixtures. CI artifacts are not used for application state. Session tokens are the only tab-scoped browser state.

Audit metadata should contain identifiers and minimal before/after values only. Never log request authorization headers, auth tokens, passwords, email reset URLs, raw proof content or signed object URLs.

## Incident response

1. Disable the affected Auth profile and revoke its sessions in Supabase.
2. Rotate affected Edge Function secrets; redeploy functions.
3. Preserve restricted provider audit logs and relevant `audit_events`, excluding secrets/proofs.
4. Review access logs, RLS changes, invite events, role changes, proof access and exported datasets.
5. Restore database/Storage from verified backups if integrity or deletion is involved; record the incident and notify impacted parties as required by law.
6. Re-run RLS and proof-access tests before restoring service.

## Production gate

Before onboarding real users, apply and review the migration on the target Supabase version, run `supabase test db`, test unauthorized direct API reads/writes and storage access with at least two distinct end users, check Edge Function CORS/rate limits and disabled-account paths, and have an independent security reviewer assess the full policies/functions. This repository's frontend test results are not a security certification.
