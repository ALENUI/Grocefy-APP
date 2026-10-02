# Grocefy

Grocefy is a collaborative grocery and shopping management app for individuals, households, offices, and teams. Create organized shopping lists, set budgets, record what was actually paid, and understand spending in one place.

## Features

- **Shopping lists:** create lists with a purpose category (Food Stuffs, Kitchen, Bathroom, Cleaning, Home Appliances, Electronics, Office Supplies, Clothing, Personal Care, Household, Other, or your own). Items can have their own category and are grouped by it while shopping. Lists can be renamed and recategorized, and their currency can change until the first item is added.
- **Custom categories:** create, rename, and archive your own categories. Archived categories disappear from pickers but stay on history and reports.
- **Product search:** as you type an item, Grocefy suggests products you already know, from your lists and those shared with you. Exact and prefix matches come first, then similar names. Choosing a suggestion reuses the product and its price memory.
- **Shopping groups:** organize lists by a shared purpose, such as House Shopping or Office Shopping. Each group has its own screen with its lists and totals per currency.
- **Accounts:** sign up with a username and default currency, sign in, and reset a forgotten password by email.
- **Collaboration:** invite people to a list or group by username or email as Viewer, Editor, or Partner; they accept or decline from their inbox.
- **Live collaboration:** when someone adds, edits, or purchases an item, the list updates on everyone's screen without refreshing. Members, invitations, and the inbox badge (unread notifications plus invitations) also update live.
- **Activity log:** each list and group shows recent activity, such as who added, edited, removed, or purchased an item (with amounts and currency) and who joined or changed roles.
- **Duplicate lists:** copy last week's list for the next trip. Every item starts unpurchased, and budgets refresh to the latest price you paid in the list's currency (never converted from another currency).
- **CSV exports:** each monthly report can be exported as a category statement or as its individual purchases, one currency per file, and shared or saved from the device. Exports open correctly in Excel, and text from other users can never run as a spreadsheet formula.
- **Budget and purchase tracking:** set a budget per item, confirm actual purchase prices, and see savings or overruns.
- **Price history:** every purchase records the amount, ISO 4217 currency code, and date. When an item is added again, the last price paid in the list's currency is suggested.
- **Purchased history:** purchases grouped by day, newest first.
- **Currency preferences:** choose a default currency for new lists and override it per list. Existing lists and purchases retain their original currency.
- **Finance reports:** monthly budget-vs-actual statements by category, for your own purchases or a whole group, with one statement per currency. Grocefy never combines currencies without conversion.

## Technology

Grocefy is built with React, React Native, Expo, TypeScript, Expo Router, and a Supabase backend (PostgreSQL, Supabase Auth, Row Level Security). AsyncStorage persists the signed-in session on the device.

## Backend

The backend is designed for Supabase Auth, PostgreSQL, Row Level Security (RLS), and a secure database function for purchase finalization. Its schema, policies, indexes, currency registry, financial constraints, and seed data are version-controlled in `supabase/`.

The Expo app accesses Supabase only through `src/services/` (auth, settings, categories, groups, lists, purchases, sharing, finance); screens do not contain raw database queries. Database types in `src/services/database.types.ts` are generated from the schema. The UI shows or hides actions according to the user's role, but the database enforces every rule regardless.

### Security and financial model

- **The database is the authority.** RLS is enabled on every table, and every rule is enforced server-side, not just hidden in the UI.
- **Roles:** list and group owners are identified by `owner_id`; members hold `viewer`, `editor`, or `partner` roles. A list-level role overrides the role inherited from the list's group.

  | | Viewer | Editor | Partner | Owner |
  |---|:-:|:-:|:-:|:-:|
  | View lists, items, totals, purchases | ✓ | ✓ | ✓ | ✓ |
  | Add/edit items and budgets | | ✓ | ✓ | ✓ |
  | Purchase items | | | ✓ | ✓ |
  | Create lists in a group | | | ✓ | ✓ |
  | Change roles, remove members, move/archive a list, change its currency | | | | ✓ |

- **Sharing** works only through invitations. An owner invites by username, user ID, or email with `create_invitation`. The invitee accepts or declines with `respond_to_invitation`, and the owner or inviter can withdraw a pending invite with `cancel_invitation`. Invitations expire after 7 days, and both sides get in-app notifications. Email invitations never reveal whether an address has an account, and they can only be accepted from a confirmed email address. Owners change roles or remove members, and members can leave.
- **Purchases** can only be created by the `purchase_list_item` function. It runs as one transaction that checks permissions, records the purchase and price history, and marks the item purchased. The purchaser, currency, and budget snapshot come from the database, never from the client.
- **History is immutable.** Purchases and price history cannot be updated or deleted by any role, purchased items are frozen, and lists, groups, products, and categories are archived rather than deleted.
- **Currency:** every list, purchase, price-history entry, and report stores an ISO 4217 code. A list's currency is locked once it has items. Price suggestions (`get_price_suggestion`) only use prices recorded in the list's currency, and totals are always grouped per currency.
- **Realtime:** the collaborative tables are published to Supabase Realtime, which checks each subscriber's RLS policies before delivering a change. Screens subscribe only while they are focused and treat each event as a signal to refetch through `src/services`, so the database stays the single source of truth.
- **Monthly finance reports** compare budgeted and purchased amounts by category, with variance = purchased − budgeted (negative means under budget). `generate_monthly_report` builds personal, group, or list reports; group and list reports are available only to owners and partners. There is one report per currency, because amounts in different currencies are never added together. Month boundaries follow the report owner's timezone setting (UTC by default). Once a month has ended, its report is final: generating it again returns the issued report unchanged, even if a category is later renamed.
- **Scheduled reports:** where `pg_cron` is available (Supabase), the migration schedules `private.generate_previous_month_reports()` at 14:00 UTC on the 1st of each month. By then the previous month has ended in every timezone. The job finalizes group and personal reports and notifies owners and partners once; re-running it is safe.

- **Email** is delivered through an outbox. New invitations and finalized monthly reports queue a row in `email_outbox`, and the database never calls an email provider directly. The `send-emails` Edge Function claims due rows (locked, so concurrent runs never double-send), renders each email from current data, and sends it through a provider interface (Resend, or a log provider for development). Invitations that were answered, cancelled, or have expired in the meantime are skipped. Failed sends retry with backoff (1, 4, 16, 64 minutes) up to 5 attempts. Invitation emails contain only the resource name, role, and inviter, and every amount in a report email carries its currency code. Users can turn email off in Settings; in-app notifications are unaffected.

### Configure Supabase

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable/anon** key. Never use a service-role key in Expo.
3. Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli), link the project, then apply the migrations:

```bash
supabase link --project-ref bsffllulzwidnpdhzroq
supabase db push
```

4. In the Supabase dashboard under **Authentication → URL Configuration**, add `grocefy://**` to the redirect URLs (and your Expo Go URL, e.g. `exp://**`, during development). Email confirmation and password-reset links return to the app through these deep links, and must be opened on the device that requested them.

5. Email delivery (optional until you want emails sent). Deploy the worker, set its secrets, and give the scheduler its URL and secret in Vault:

```bash
supabase functions deploy send-emails
supabase secrets set EMAIL_WORKER_SECRET=<long random string> RESEND_API_KEY=<key> EMAIL_FROM="Grocefy <notifications@your-domain>" APP_URL=grocefy://
```

```sql
-- In the SQL editor. The pg_cron job created by the migration stays idle until both secrets exist.
select vault.create_secret('https://bsffllulzwidnpdhzroq.supabase.co', 'grocefy_project_url');
select vault.create_secret('<same EMAIL_WORKER_SECRET>', 'grocefy_email_worker_secret');
```

The sending domain must be verified in Resend. For local development, copy `supabase/functions/.env.example` to `supabase/functions/.env` (log provider, no emails leave the machine).

The migrations also create the reference data (currency registry and default categories). After a schema change, regenerate the client types with `npm run db:types`.

### Local development data

`supabase start` (and `supabase db reset`) loads `supabase/seed/seed.sql` into the local database. It contains two demo accounts, both with the password `grocefy-demo`:

- **demo@grocefy.test** owns House Shopping (Food, Kitchen, Bathroom) and Office Shopping (Stationery, and Imports in USD).
- **alex@grocefy.test** is a partner in House Shopping and has a pending invitation to Office Shopping.

The seed includes last month's purchases (so price suggestions and a finalized monthly report exist), this month's purchases, and items still to buy. Never run it against production.

### Database tests

`npm run test:db` starts a disposable PostgreSQL 15 container (Docker required), applies every migration on top of a minimal Supabase auth stub, and runs the suites in `supabase/tests/`. They cover the role matrix, non-member and anonymous access, invitations (including email and expiry rules), the atomic purchase transaction (including a forced mid-transaction failure), duplicate-purchase prevention, financial immutability, price suggestions across currencies, currency validation, monthly reports (category variance, currency separation, idempotency, finality, timezones, and access), purchasers keeping their history after leaving a list, the activity log and its visibility, list duplication, the email outbox (what gets queued, opt-outs, claiming, retries, and crash recovery), product search ranking and visibility, and custom categories on shared lists.

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request to `Development` or `main` and on pushes to `Development`:

| Job | Runs |
|---|---|
| Typecheck, lint, unit and email tests | `npm run typecheck`, `typecheck:functions`, `lint`, `test:unit`, `test:email` |
| Database tests | `npm run test:db` (disposable PostgreSQL 15 in Docker) |
| Bundle | `npx expo install --check` and an Android and iOS export |
| Service end-to-end | `supabase start`, then `npm run test:services`, including realtime and the `send-emails` function |

Run the same checks locally before opening a pull request. `npm run lint` uses Expo's ESLint config and fails on any warning.

### Unit tests

`npm run test:unit` tests the app's pure modules under Node: amount parsing and formatting per currency, CSV escaping (including formula-injection protection), and activity descriptions.

### Email tests

`npm run test:email` unit-tests the Edge Function modules under Node: templates (escaping, currency on every amount), the Resend provider, provider selection, and the worker's send/skip/failure handling. `npm run typecheck:functions` type-checks the Deno code without the Deno toolchain.

### Service end-to-end tests

`npm run test:services` runs the app's real `src/services` modules under Node against a **local** Supabase stack (`supabase start`), with React Native modules stubbed. It walks through the complete flow: sign up, create a group and list, add items, invite and accept, purchase, duplicate-purchase rejection, purchase history paging, role enforcement, price suggestions across currencies, realtime delivery (to members only), the activity feed, list duplication, report and purchase exports, product search, custom categories, list editing, monthly reports, and leaving a list. With `supabase/functions/.env` present, it also calls the running `send-emails` function to check its authentication and delivery. It refuses to run against a non-local API.

## Getting Started

### Prerequisites

- Node.js LTS (20.11 or newer)
- npm
- Expo Go, Android Studio, or an iOS development environment
- Docker (for `npm run test:db` and a local Supabase stack) and the Supabase CLI (for migrations)

### Installation

```bash
git clone https://github.com/ALENUI/Grocefy-APP.git
cd Grocefy-APP
npm install
```

### Start the application

```bash
npx expo start
```

Use `npm run android` or `npm run ios` for a platform-specific start. The app requires the Supabase configuration above; without it, it shows a setup message.

## Development Workflow

`main` is reserved for reviewed/released code. Work on descriptive feature branches and open pull requests targeting `Development`; do not merge directly into `main`. Pull requests should pass CI before they are merged. The project owner reviews `Development` before merging it into `main`.

## Project Status

Grocefy is under active development. Accounts, shared lists and groups, purchasing, price memory, purchased history, and monthly finance reports run end to end on Supabase. Features are delivered incrementally through feature branches and pull requests targeting `Development`.

## Roadmap

- Realtime list updates while shopping together
- Offline shopping and push notifications
- Recurring lists, receipt scanning, AI suggestions, price trends, and store comparison
- Inventory management, multiple workspaces, advanced analytics, currency conversion, and PDF/CSV/Excel exports
- Subscription and family/business plans

The architecture preserves currency information on lists and purchase history so conversion and server synchronization can be added without changing historical financial meaning.
