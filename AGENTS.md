# AGENTS.md

## Mission

Build and maintain a small gym management web app for a personal training gym.

This product is intentionally small:
- around 100 total clients
- only one gym location
- only two staff roles: `admin` and `trainer`
- no customer portal
- no multi-tenant support
- no realtime features unless explicitly requested later
- no microservices

Optimize for simplicity, correctness, maintainability and fast delivery.

## Phase 2 override

Phase 1 guidance remains in force unless this section overrides it.

- Replace the earlier `no customer portal` assumption with a separate client portal under `/cliente/*`
- Staff roles stay exactly the same: `admin` and `trainer`
- `client` is not a staff role and must never be treated as a replacement for `admin` or `trainer`
- Keep the existing staff app stable; the client portal must not break, refactor away, or weaken the current staff flows
- All sensitive portal writes must go through InsForge Functions
- Use InsForge as both backend and publishing platform for the portal as well as the staff app
- AGENTS.md should stay concise and practical; prefer short actionable rules over long narrative text

---

## Product constraints

- Locale: `es-ES`
- Timezone: `Europe/Madrid`
- Currency: `EUR`
- UI language: Spanish
- Volume and traffic are tiny, so do not over-engineer for scale
- The owner should be able to operate the app without technical knowledge

---

## Mandatory stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- InsForge Auth
- InsForge Database
- InsForge Functions
- InsForge Storage
- InsForge Deployments when available and stable enough in this workspace
- `@insforge/sdk`

---

## Forbidden stack and patterns

Do not introduce any of the following unless explicitly requested:

- Supabase
- Firebase
- Clerk
- Prisma
- Drizzle
- Hasura
- NextAuth
- separate Express/Nest/Fastify backend
- microservices
- Redis
- message brokers
- websocket infrastructure
- generic repository/service boilerplate
- PostgreSQL enums

Use `text` columns plus `CHECK` constraints instead of database enums.

Never use:
- `max(...) + 1` for invoice numbering
- client-side stock calculations
- client-side session balance calculations
- client-side expiry calculations
- client-side permission enforcement as the only protection

---

## Operating model for Codex

1. Read this file first.
2. Work from the project root.
3. If there is no `.git` directory, assume the current working directory is the project root.
4. Before making major changes, summarize:
   - the goal
   - the files to change
   - the acceptance criteria
5. Prefer small, reviewable changes over giant rewrites.
6. Build locally before proposing deployment.
7. Keep `README.md`, `.env.example`, and this file updated when commands, environment variables, architecture, or workflows change.
8. When blocked, choose the simpler implementation and leave a short note explaining the limitation.

---

## Definition of done

A task is only done when all of the following are true:

- TypeScript passes
- lint passes
- build passes
- affected screens render correctly
- server-side validation exists
- role permissions are enforced
- sensitive mutations write to `audit_logs`
- any new environment variables are documented here and in `.env.example`

---

## Business scope

Required modules:

- dashboard
- clients
- passes
- products
- sales
- expenses
- agenda
- notifications
- reports
- settings
- client portal auth
- client dashboard
- client agenda
- client activity history
- nutrition assistant
- weekly nutrition plans
- advanced client settings

Only two application roles exist:

- `admin`
- `trainer`

`client` may exist as a portal user type, but it is not a staff role.

---

## Core business rules

- Pass types may be session-based or monthly
- Session-based pass types must allow 1 to 30 sessions
- Monthly passes expire at the end of the contracted natural month
- Session-based passes expire 30 days after purchase date
- Unused sessions are lost on expiry
- Session consumption is manual
- A pass can be paused only once per month
- A pause can last at most 7 days
- Shared passes may include up to 5 different clients
- Stock can never go negative
- Payment methods are:
  - `cash`
  - `card`
  - `transfer`
  - `bizum`
- Renewal is manual
- Creating a pass must also register its sale for accounting
- Pass creation must capture payment method and the agreed gross price for that client
- Renewal creates an internal in-app notification that simulates a WhatsApp confirmation
- Expiry reminders must be generated for:
  - D-7
  - D-0
- Only `admin` can:
  - edit prices
  - add stock
  - void sales
  - manage settings
  - create or promote another admin
- `trainer` handles normal operational tasks without sensitive admin actions

---

## Architecture rules

- This is a single Next.js app
- InsForge is the only backend
- All sensitive writes must go through InsForge Functions
- All sensitive client portal writes must also go through InsForge Functions
- Keep read-heavy screens in server components or server helpers when that makes the app simpler
- Keep functions small and single-purpose
- Prefer explicit SQL and clear logic over generic abstractions
- All writes that affect money, stock, or session balances must be transactional
- Storage bucket for ticket PDFs must be named `tickets`
- Internal notifications are the MVP replacement for WhatsApp
- Treat email and deployments conservatively and keep a fallback path if a platform feature is unavailable
- The client portal must be added alongside the staff app without breaking existing staff routes or permissions

### Nutrition assistant rules

- Scope is strictly limited to nutrition and healthy eating habits
- Reject off-topic prompts
- Reject medical diagnosis, eating disorders, and complex pathology questions
- Model target for production behavior is `google/gemini-2.5-flash-lite`
- Before implementing production behavior, Codex must verify model availability via `GET /api/ai/models` or `get-backend-metadata` MCP
- Bound assistant context to permanent memory plus rolling summary plus the last 20 messages or 14 days, whichever is tighter
- Enforce quotas of 20 messages per day and 300 messages per month
- Floating assistant entrypoint must stay visible across all authenticated `/cliente/*` pages as a fixed bottom-right launcher
- The floating nutrition launcher must open a full-screen responsive modal and remain usable regardless of scroll position or viewport size

---

## Data model conventions

Database naming:
- tables: plural `snake_case`
- columns: `snake_case`
- primary key: `id uuid`
- timestamps: `created_at`, `updated_at`
- business dates: `*_on`
- event timestamps: `*_at`

TypeScript naming:
- filenames: `kebab-case`
- exports and functions: `camelCase`
- React components: `PascalCase`
- types and interfaces: `PascalCase`

Never rely on implicit row shapes. Map database rows to app DTOs explicitly when needed.

---

## Required core tables

The database must contain at least:

- `profiles`
- `clients`
- `pass_types`
- `passes`
- `pass_pauses`
- `session_consumptions`
- `products`
- `sales`
- `sale_items`
- `expenses`
- `calendar_sessions`
- `notification_log`
- `audit_logs`
- `job_runs`

Preferred database behavior:
- use `CHECK` constraints instead of enums
- use `UNIQUE` constraints where appropriate
- index expiry, sales date, calendar by trainer/date, notification date, session history
- use an atomic counter or sequence for invoice numbering

---

## Required functions

Create and maintain these InsForge Functions:

- `bootstrap_admin`
- `upsert_client`
- `delete_client`
- `upsert_pass_type`
- `create_pass`
- `update_pass`
- `delete_pass`
- `consume_session`
- `pause_pass`
- `renew_pass`
- `upsert_product`
- `add_stock`
- `create_sale`
- `void_sale`
- `create_expense`
- `upsert_calendar_session`
- `delete_calendar_session`
- `update_profile_calendar_color`
- `run_daily_expiry_scan`
- `send_expiry_email`
- `create_internal_notification`
- `generate_ticket_pdf`
- `save_push_subscription`
- `remove_push_subscription`
- `update_push_preferences`
- `send_push_notification`
- `send_push_to_client`
- `send_pass_expiry_d7_pushes`
- `send_calendar_session_24h_reminders`

Function rules:
- validate auth first
- validate app role first
- validate inputs server-side
- return structured errors
- keep each function focused on a single business action
- write `audit_logs` for sensitive actions
- make jobs idempotent
- do not allow the same daily expiry job to run twice for the same date

---

## Required routes

Create these routes:

- `/login`
- `/dashboard`
- `/clients`
- `/clients/[id]`
- `/passes`
- `/products`
- `/sales`
- `/expenses`
- `/agenda`
- `/reports`
- `/notifications`
- `/settings`
- `/cliente/login`
- `/cliente/dashboard`
- `/cliente/actividad`
- `/cliente/agenda`
- `/cliente/nutricion`
- `/cliente/ajustes`

---

## UI rules

- All UI copy must be in Spanish
- Use shadcn/ui components when they help consistency and speed
- Tables must support search and have clear empty states
- Use toasts for success and error feedback
- Never show admin-only actions to trainers
- UI disabling is only a convenience layer
- Real permission enforcement must stay server-side
- Page headers in staff and client portal must be compact and non-sticky; target roughly 60-80px high so content keeps most of the viewport on mobile, tablet and desktop

---

## Permissions matrix

### Admin
Can:
- read and write everything
- manage prices
- manage stock
- void sales
- manage settings
- create or promote admin users
- deploy the app

### Trainer
Can:
- log in
- view dashboard
- create and edit clients
- create passes
- renew passes
- consume sessions
- create standard sales
- create expenses if the feature is enabled
- manage agenda
- view notifications
- view reports

Cannot:
- manage prices
- add stock
- void sales
- manage settings
- create another admin

---

## Auth rules

- Use InsForge Auth with email/password
- Application role lives in `profiles.role`
- Do not auto-grant access to any authenticated user without a matching `profiles` row
- If a user exists in auth but not in `profiles`, show a blocked state
- Provide exactly one bootstrap path for the initial admin
- After bootstrap, only admins can create or promote staff users
- Keep sign-in, sign-out and session handling simple
- Staff auth and client portal auth must remain clearly separated in UX and authorization logic
- A portal client account must never grant staff permissions

---

## Agenda rules

- Timezone is always `Europe/Madrid`
- A scheduled agenda block belongs to one trainer and one whole-hour time range
- Multiple clients can share the same agenda block through their selected passes
- Shared passes must automatically associate all pass holders
- Creating an agenda block does not consume sessions; consumption stays manual
- Completed agenda blocks are read-only and cannot be edited or deleted
- Agenda session status values must be:
  - `scheduled`
  - `completed`
  - `cancelled`
  - `no_show`
- Trainers can manage their own non-completed agenda blocks; admins can manage any trainer agenda

---

## Reporting requirements

Provide at least:

- sales by date range
- sales by product
- sales by pass type
- expenses by category
- payment method split
- estimated margin
- low stock report
- passes expiring soon
- passes with no sessions left

---

## File organization

Preferred structure:

- `app/`
- `components/`
- `features/`
- `features/clients/`
- `features/passes/`
- `features/products/`
- `features/sales/`
- `features/expenses/`
- `features/calendar/`
- `features/reports/`
- `features/notifications/`
- `lib/`
- `lib/insforge/`
- `lib/permissions/`
- `types/`
- `scripts/`
- `public/`

Guidelines:
- keep feature-specific UI close to the feature
- shared utilities go into `lib/`
- do not dump all logic into `app/`
- do not bury critical business rules inside React components

---

## Commands

Use the package manager already present in the workspace.

If there is no lockfile yet, default to `npm`.

Expected commands:
- install: `npm install`
- dev: `npm run dev`
- build: `npm run build` (usa Webpack de forma explicita con Next.js 16)
- lint: `npm run lint`
- typecheck: `npm run typecheck` if available
- test: `npm run test` if available
- generate PWA icons: `npm run generate:pwa-icons`
- deploy: `npm run deploy`

Before deployment always run:
1. install
2. lint
3. build
4. manual smoke test of critical flows

---

## Environment variables

Keep `.env.example` updated.

Expected variables:

- `NEXT_PUBLIC_INSFORGE_URL`
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`
- `APP_TIMEZONE=Europe/Madrid`
- `BUSINESS_NAME`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

MCP assumptions:
- InsForge project link may exist in `.insforge/project.json`
- InsForge SDK is used directly from the Next.js app
- If Schedules are not available in the workspace, the daily expiry scan must remain executable via a protected manual path

Only add more when needed. Document every new variable in both `AGENTS.md` and `.env.example`.

---

## Critical smoke tests

If automated tests are missing, run these manual checks:

1. login as admin
2. create client
3. edit client
4. create pass
4.1. edit pass
4.2. delete a clean pass
4.3. create or edit a pass type with 1-30 sessions or monthly mode
5. consume one session
6. pause pass within rules
7. renew pass and verify internal notification
8. create product
9. add stock as admin
10. create product sale and verify stock decrement
11. create expense
12. create agenda session
13. verify shared-pass holders are all associated automatically
14. run daily expiry scan once and verify idempotency
15. generate ticket PDF
16. verify report screens load
17. verify `audit_logs` entries exist for create, update, delete, renew, consume, void sale and notification attempts
18. verify trainer cannot access admin-only actions such as stock increases, sale voiding, settings changes or protected admin functions

---

## Deployment policy

- deploy only after local build passes
- prefer InsForge Deployments for the final published app
- if deployment or email features are unavailable in the current workspace, keep the app buildable and document a fallback path
- never hardcode environment-specific URLs
- document deployment steps in `README.md`

---

## Coding style

- prioritize clarity over abstraction
- use strict TypeScript
- keep components small
- keep SQL readable
- keep error messages actionable
- avoid dead code
- avoid commented-out code unless it documents a temporary platform limitation
- prefer explicitness over cleverness

---

## Change discipline

Whenever you make a structural change:
- update `README.md`
- update `AGENTS.md` if commands, env vars, architecture or rules changed
- update `.env.example` when env vars change
- explain briefly why the change was made in the final summary

---

## If unsure

Choose the smallest correct solution that:
- preserves data integrity
- respects permissions
- stays understandable for future agents
- stays operable by a small gym owner
- avoids unnecessary complexity
