# Picui — repository instructions for Codex

## Purpose and source of truth

Picui is a Spanish-language, responsive application for bakery orders, warehouse registration, and administration. The backend is Supabase; the frontend is SvelteKit deployed on Vercel. Preserve existing behavior and data before pursuing refactors.

- At the start of each task, check the current branch, working tree, and recent commits; read `README.md`, relevant code/tests, and any feature documentation on that branch. Do not assume a prior Codex conversation's state is present.
- `main` is the production branch. Treat unmerged feature-branch code, migrations, and documentation as development work, not evidence that a feature is deployed. Do not silently merge branches or deploy.
- `README.md`, `supabase/migrations/`, `.github/workflows/ci.yml`, and code/tests are the source of truth; if they disagree, inspect the implementation and report the discrepancy rather than guessing.
- `.agents/skills/` contains task-specific skills, not a substitute for this file. Invoke a skill only when applicable; check that any files or tools it references actually exist.

## Stack and layout

- Node.js **24.x**, npm with `package-lock.json`; TypeScript, SvelteKit, **Svelte 5 runes**, Vite, and `@sveltejs/adapter-vercel`. Prefer existing dependencies and patterns; do not change package managers casually.
- `src/routes/+page.svelte` coordinates session, screens, orders, and data loading; `src/lib/*.svelte` implements views; `src/lib/*.ts` holds domain models, validation, repositories, and access helpers. Keep business rules testable and avoid unnecessary expansion of the main page.
- `src/lib/access.ts`: canonical application roles/screens. `production.ts`, `order-history.ts`, `warehouse.ts`, `catalog.ts`, `user-management.ts`: core order, audit, catalog, and user behavior. `src/lib/supabase.ts` constructs the public client.
- `supabase/migrations/`: versioned PostgreSQL schema, RLS, and RPCs. `supabase/functions/admin-users/`: Deno Edge Function for privileged user administration; its handler imports shared validation from `src/lib/`.
- `tests/*.test.mjs`: Node tests, including PGlite database/permission checks. `tests/*.spec.mjs` and `tests/auth-password.browser.mjs`: Playwright browser checks. `scripts/check-production-env.mjs`: deployment guard.
- If working on a branch containing formulation code, read `FORMULACIONES.md`, `REGISTRO_RAPIDO_UI.md` (when present), and the relevant `recipes`, `formulation-*`, `*-repository`, component, test, and migration files before changing it. Flowbite Svelte/Tailwind are branch-specific unless present in the checked-out branch.

## Clean code conventions

- Optimize for the next reader: choose descriptive, searchable names and consistent domain vocabulary. Use `camelCase` for TypeScript variables/functions, `PascalCase` for Svelte components/types, and preserve existing SQL naming conventions. Prefer action verbs for functions and nouns for values; avoid one-letter names except obvious local indices.
- Make intent visible: replace unexplained magic numbers/strings with well-named constants when they represent a business rule or reused concept. Keep validation rules and units explicit; do not duplicate them across UI and backend.
- Follow the surrounding file's indentation, spacing, and semicolon conventions. Break complex expressions and long lines into readable pieces (roughly 80–100 characters when practical); avoid unrelated mass reformatting.
- Keep functions and components focused on one clear responsibility. Prefer straightforward control flow and small, meaningful extractions over clever abstractions, speculative utilities, or refactors unrelated to the task.
- Write comments to explain **why** a decision, security invariant, workaround, or non-obvious rule exists—not to narrate what readable code already does. Use Git history for change history; delete obsolete code instead of leaving commented-out versions.
- Apply these principles incrementally. Readability and consistency matter more than rigid style rules; preserve behavior and add tests when refactoring.

## UI and domain conventions

- Use Svelte 5 `$state`, `$derived`, `$props`, and current event syntax, consistent with nearby code; keep TypeScript types explicit where useful. Do not introduce Svelte 4 patterns or a new state framework.
- Keep user-facing text in **Spanish (Argentina)**, with existing terminology: *Panadería*, *Depósito*, *Administración*, *pedido*, *elaboración*, *amasada*. Preserve date/number formatting and the `America/Argentina/Buenos_Aires` business-date convention.
- Support desktop and mobile, keyboard access, focus behavior, semantic controls, and clear validation/loading/error states. Preserve the full mobile sidebar/dialog behavior. Test at the existing 390px and 1440px Playwright viewports.
- Orders are **regular** or **extra**; item snapshots retain product name, code, unit, and category (`materia_prima`/`insumos`). Do not rewrite historical snapshots when a catalog product changes. Deactivating products or cancelling orders must preserve history and audit records.
- Treat `revision` and `registered_revision` as concurrency/business invariants. A warehouse registration is final: once `registered_revision === revision`, an order cannot be edited, cancelled, or unregistered, including by an admin; enforce this server-side, not only by disabling buttons.
- If formulation features are present: keep recipes versioned (draft vs approved/current), alternatives mutually exclusive, optional ingredients explicit, and quantities in the documented units/decimal precision. Batch starts/quick completion must use idempotent request IDs, immutable recipe/ingredient snapshots, and atomic persistence. Track real vs suggested weights, lot/expiry, incorporation and audit; a completed batch stays closed even when differences exist. Only authorized admin corrections can change incorporated records, without erasing original events.

## Authorization and secret handling

- Roles are `bakery`, `warehouse`, `admin`. Bakery can create orders and access/edit its own pending orders; warehouse can view active orders and register them; admin can access all screens, manage products/users/recipients, and inspect audits. Follow the actual SQL policies and RPC checks for every operation.
- **Never rely on client-side role checks alone.** Authenticated identity and current DB role must be verified by RLS/RPCs or by the privileged Edge Function. Do not authorize from user-editable metadata or a stale role claim.
- Only the backend may assign/revoke roles. Do not let an admin edit/delete their own account in Users or remove the last admin. When deleting an account, revoke its role first and soft-delete in Supabase Auth so historical foreign keys/orders remain valid. Preserve the deletion-trigger defense.
- Actual passwords go only to Supabase Auth; never put them in app tables, user metadata, API responses, logs, committed fixtures, or commits. Use dummy values in isolated Auth tests. An omitted/empty replacement password means leave it unchanged. Notification recipients are not app user accounts; an address list does **not** imply automatic mail sending.
- Browser code may use only `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/legacy anon key). **Never** expose service-role, `SUPABASE_SECRET_KEYS`, or other privileged credentials via `PUBLIC_`, client bundles, logs, or checked-in files. Edge secrets belong only in the Edge runtime. Do not commit `.env` or real tokens.

## Database changes — safe by default

- Database state is shared and potentially live. Do **not** run remote SQL, `db push`, `db reset`, migrations, seed imports, Edge Function deploys, or Auth/user operations against any remote project without explicit task-specific permission and a reviewed target. A Git branch or Vercel preview is **not** automatically a separate Supabase database.
- Do not modify or replay previously applied migrations. For schema changes, create a new reviewed migration; inspect ordering/history and dependencies, and test on an isolated local/throwaway database first. Never assume `supabase/seed.sql` is production data or load it into production.
- Preserve RLS, least-privilege grants, and authenticated role/ownership checks. Existing privileged order/catalog/recipe write RPCs intentionally use `SECURITY DEFINER`, `SET search_path = ''`, explicit `auth.uid()`/role validation, restricted `EXECUTE`, revision checks and row locking where needed; other RPCs may intentionally be `SECURITY INVOKER`. Do not alter execution security without a full permissions review and negative tests.
- Keep client mutations on approved RPCs rather than granting direct table writes. Preserve audit/event snapshots, atomicity, idempotency, concurrency protection, and soft-delete semantics. Test denial paths for anon, wrong roles, non-owners, revoked roles, stale revisions, and already registered/closed records.
- Treat Supabase changes to tables, RPC signatures, Edge handlers, permissions, and frontend calls as coordinated work. State which parts are **proposed**, **tested locally**, or **actually deployed**; do not imply a remote migration is applied based on repository files.

## Commands and verification

```sh
npm ci
npm run dev
npm test
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npx playwright test --config playwright.auth.config.ts
```

- `npm test` runs Node tests and PGlite checks without requiring access to the production database. Playwright's normal config starts its own dev server with isolated preview accounts; the Auth config uses mocked Auth responses. For an installed system Chromium, `CHROMIUM_PATH=/usr/bin/chromium` is supported.
- `PUBLIC_PREVIEW_MODE=true` is **local development only**, not a production setting. Keep demo accounts and localStorage preview data separate from actual Supabase records. Do not connect automated tests to a real production project.
- Run relevant focused tests during changes, then `npm test`, `npm run check`, `npm run build`, and applicable Playwright suites before presenting a change as validated. If dependencies/browser binaries are unavailable, say which checks were not run. Do not invent a lint script: no `npm run lint` is defined.
- `npm run build:production` additionally requires valid public Supabase configuration and rejects preview mode. Do not bypass `scripts/check-production-env.mjs` to make a deployment pass. CI (`.github/workflows/ci.yml`) executes the checks and both Chromium suites on PRs and pushes to `main`.

## Deployment and work boundaries

- `main` deploys the existing Picui production Vercel project; `vercel.json` runs `npm run check && npm run build:production`. Do not change deployment settings, connect a new backend, trigger production deployment, merge to `main`, or deploy the `admin-users` function without explicit approval.
- For branch work, prefer a pull request/preview and explain any Supabase schema dependency. Do not promise feature isolation if the preview shares a live database. Never use production credentials for a convenient smoke test.
- Make the smallest scoped change; preserve unrelated behavior. Add or adjust tests when changing domain rules, RLS/RPCs, the Edge Function, or interactions. Before finishing, summarize changed files, validation performed, remaining risks, and any manual deployment/migration steps that have **not** been executed.

## Code review rules

Flag any change that exposes privileged credentials, weakens role/ownership checks, permits registered-order mutation, bypasses revision/idempotency safeguards, overwrites audit/history, writes directly to protected tables, deploys test accounts, assumes a feature-branch migration is live, or creates an unapproved production side effect. Prefer a safe alternative and a regression test.
