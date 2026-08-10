# Sensitive Information and Git History Review

## Executive summary

The public GitHub `main` branch was checked against every reachable local
commit, and the remote branch currently points to the same commit. No MongoDB
Atlas URI, Atlas database password, private key, common cloud token, or real
`.env` file was found in pushed history. The local `server/.env` is correctly
ignored by Git.

One important exposure remains: a working demo account password is committed in
the public repository and is prefilled by the frontend. This is acceptable only
for an isolated local database. It must not remain usable against a shared or
deployed Atlas-backed environment.

## Scope and evidence

- Remote: `origin` (`Tousifrahmananto/SAAS_PROJECT`)
- Visibility: public
- Remote branches found: `main`
- Pushed commit reviewed: `af379fb2d776f16575da5ee1cdc59e7fec356dd7`
- Reachable Git history reviewed: all commits (currently one)
- Exact Atlas password and exact Atlas URI from the local credential source:
  not found in Git history
- Private-key markers and common AWS/GitHub/OpenAI token formats: not found
- `server/.env`: ignored by `.gitignore` at line 4 and never present in history

## High severity

### SEC-001 — Public, functional demo credentials

**Remediation status (10 Aug 2026): Fixed in the working tree.** Password
prefill/documentation were removed, the seed reads an ignored environment
variable, and production seeding is blocked. Already seeded Atlas users still
need their passwords rotated or their accounts removed.

- **Rule ID:** REACT-CONFIG-001 / credential hygiene
- **Severity:** High if the seeded account is available in a shared or deployed
  environment; Low if it is strictly local and disposable
- **Locations:**
  - `README.md:42`
  - `client/src/App.tsx:10`
  - `server/src/scripts/seed.ts:29`
  - `server/src/scripts/seed.ts:71`
- **Evidence:** The same hard-coded demo password is documented, prefilled in
  the browser, hashed by the seed script, and assigned to seeded users.
- **Impact:** Anyone who can view the public repository can authenticate as a
  seeded department user when those credentials exist in a reachable
  environment. This could expose synthetic or real billing data and permit
  department-scoped mutations.
- **Fix:** Remove password prefill and public password documentation. Read the
  development password from a non-committed environment variable, refuse to run
  the demo seed in production, and rotate or delete already seeded demo users
  from Atlas before deployment.
- **Mitigation:** Use a separate disposable development Atlas project and
  restrict its network access until the fix is complete.
- **False-positive note:** This is not an exposure if the account exists only in
  a local, disposable database that cannot be reached by other users.

## Medium severity

### SEC-002 — Predictable JWT signing fallback can reach production

**Remediation status (10 Aug 2026): Fixed in the working tree.** Production now
refuses to start unless both `MONGODB_URI` and `JWT_SECRET` are explicitly set.

- **Rule ID:** EXPRESS-SESS-002 / secret management
- **Severity:** Medium, becoming High if deployed without `JWT_SECRET`
- **Locations:**
  - `server/src/config/env.ts:9`
  - `server/.env.example:6`
- **Evidence:** The application supplies a known development JWT-secret fallback
  instead of requiring a deployment secret. The example file itself is safe,
  but the runtime fallback is active in every environment.
- **Impact:** If production is deployed without an explicit `JWT_SECRET`, anyone
  who knows the source can forge valid access tokens and choose privileged role
  claims.
- **Fix:** Require a strong `JWT_SECRET` whenever `NODE_ENV=production`; retain a
  clearly marked local-only value only for development/test environments.
- **Mitigation:** Configure a newly generated secret in Render before the first
  deployment and rotate it if any deployment used the fallback.
- **False-positive note:** There is no immediate exploit if every reachable API
  instance already has a strong, unique environment-provided secret.

## Informational

- `server/.env.example` is intentionally tracked and contains example values,
  not the exact Atlas credentials.
- `output/playwright/hospital-billing-dashboard.png` is tracked but the reviewed
  image shows only the demo username/role and no token, Atlas URI, or password.
- The Atlas credential file in the Downloads directory is outside the Git
  repository and was not pushed by this repository.

## Immediate recommendation

Rotate the Atlas password already pasted into chat, then address SEC-001 before
publishing a backend URL. Do not rewrite Git history for the Atlas secret: the
scan found that it was never committed. History rewriting would add risk without
removing anything relevant.
