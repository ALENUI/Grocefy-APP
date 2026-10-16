# Grocefy

Grocefy helps a household keep track of the groceries and everyday items it keeps at home, and what needs buying. When something is running low or finished, anyone in the home marks it, and it goes straight onto the shared To-buy list with the price paid last time. At the market, you tick items off and enter what you actually paid; that price is saved and suggested the next time the item runs out. Everyone who lives in the home sees the same inventory and list, so nobody has to say out loud what is missing.

## How it works

1. **Set up your home** and add the things you buy regularly (rice, oil, soap, toothpaste…), with how many you usually buy at a time.
2. **Mark items** as *Full*, *Running low*, or *Finished* as you use them. Low and finished items go onto the To-buy list automatically, priced at what you paid last time, and Grocefy asks whether to keep the quantity bought last time or change it. The people you live with get a notification. Home items are grouped by category; anything added without one goes under *General*, and you can create a new category while adding an item.
3. **At the market**, open the To-buy list, tick each item as you buy it, and enter the amount you paid (or confirm the expected price).
4. The price is **remembered** against the item and it goes back *In stock*. Next time it runs low, the new price is suggested.

## Features

- **Home inventory:** everything the household keeps, grouped into *Needs buying* and *In stock*, with the last price paid for each item.
- **To-buy lists:** a shared list created with the home, plus any other lists you want (e.g. a weekly market trip). Each item shows its expected price, whether it is bought per item or in bulk packs, and the list shows the expected total. Anything added to a To-buy list also appears in the home as *Finished*. Buying it puts it back in the home as *Full*, with the quantity bought as its full quantity, which is what goes on the list the next time it runs out. Home shows the first two lists that still have items to buy.
- **Buying and price memory:** tick an item as bought, pay the expected price or enter the actual one; the price is saved and reused. Purchases are recorded once even if the connection drops.
- **Sharing with the people you live with:** invite them by username or email. **Members** can add items, mark what is running out, and buy; **View-only** people (for example children) can see everything without changing it. The person who created the home manages who is in it.
- **Live updates and push notifications:** changes appear on everyone's phone without refreshing, and housemates are notified when something runs low or finishes, or is bought.
- **Works offline:** your home and lists are saved on the phone, and changes made without signal sync when the connection returns.
- **Spent this month and purchase history:** a monthly total on the Home screen and a dated list of past purchases.
- **Accounts:** sign up with a username, sign in, and reset a forgotten password by email.

All amounts use the home's currency (chosen when the home is created), and stored prices always keep their currency.

### Hidden for now (feature flags)

Grocefy was built with room to grow. These features are implemented and tested but hidden in [src/features.ts](src/features.ts) to keep the app simple; switching a flag on brings the feature back without database changes:

| Flag | Feature |
|---|---|
| `multipleHomes` | Belonging to several homes; the Groups screens |
| `financeReports` | Monthly budget-vs-actual statements and the Reports tab |
| `csvExports` | CSV export of statements and purchases |
| `priceInsights` | Price book, per-product price history and charts, six-month spending chart |
| `activityFeed` | "Recent activity" feeds |
| `emailNotifications` | Email notification setting (server-side email delivery is set up separately) |
| `customCategories` | Item categories and custom category management |
| `listCurrency` | A different currency per list |
| `duplicateLists` | Duplicating a list |
| `editorRole` | A separate Editor role |
| `listSharing` | Sharing a single list with someone outside the home |

Store or shop comparison is not part of Grocefy.

## Technology

Grocefy is built with React 19, React Native 0.86, Expo SDK 57, TypeScript, Expo Router, and a Supabase backend (PostgreSQL, Supabase Auth, Row Level Security). AsyncStorage persists the signed-in session on the device.

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
- **Offline purchases are safe to retry.** Each purchase carries a client reference, so a retry after a dropped connection returns the original purchase instead of recording a second one. An offline purchase keeps the time it happened (up to 72 hours back) unless that time falls in a monthly report that has already been finalized. In that case the sync time is used, so issued statements never change.
- **Purchases** can only be created by the `purchase_list_item` function. It runs as one transaction that checks permissions, records the purchase and price history, and marks the item purchased. The purchaser, currency, and budget snapshot come from the database, never from the client.
- **History is immutable.** Purchases and price history cannot be updated or deleted by any role, purchased items are frozen, and lists, groups, products, and categories are archived rather than deleted.
- **Currency:** every list, purchase, price-history entry, and report stores an ISO 4217 code. A list's currency is locked once it has items. Price suggestions (`get_price_suggestion`) only use prices recorded in the list's currency, and totals are always grouped per currency.
- **Realtime:** the collaborative tables are published to Supabase Realtime, which checks each subscriber's RLS policies before delivering a change. Screens subscribe only while they are focused and treat each event as a signal to refetch through `src/services`, so the database stays the single source of truth.
- **Monthly finance reports** compare budgeted and purchased amounts by category, with variance = purchased − budgeted (negative means under budget). `generate_monthly_report` builds personal, group, or list reports; group and list reports are available only to owners and partners. There is one report per currency, because amounts in different currencies are never added together. Month boundaries follow the report owner's timezone setting (UTC by default). Once a month has ended, its report is final: generating it again returns the issued report unchanged, even if a category is later renamed.
- **Scheduled reports:** where `pg_cron` is available (Supabase), the migration schedules `private.generate_previous_month_reports()` at 14:00 UTC on the 1st of each month. By then the previous month has ended in every timezone. The job finalizes group and personal reports and notifies owners and partners once; re-running it is safe.

- **Email** is delivered through an outbox. New invitations and finalized monthly reports queue a row in `email_outbox`, and the database never calls an email provider directly. The `send-emails` Edge Function claims due rows (locked, so concurrent runs never double-send), renders each email from current data, and sends it through a provider interface (Resend, or a log provider for development). Invitations that were answered, cancelled, or have expired in the meantime are skipped. Failed sends retry with backoff (1, 4, 16, 64 minutes) up to 5 attempts. Invitation emails contain only the resource name, role, and inviter, and every amount in a report email carries its currency code. Users can turn email off in Settings; in-app notifications are unaffected.

- **Push delivery** mirrors email. Database events queue rows in `push_outbox` (only for users with push on and a registered phone, and never for the person who made the purchase). The `send-push` Edge Function delivers them through Expo's push service with the same locking, retries, and backoff as email, and deletes tokens Expo reports as unregistered. Devices register only through `register_push_token`; a token signed in by someone else on the same phone moves to them.

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

The sending domain must be verified in Resend.

6. Push notifications (optional). Link the app to an Expo project so it can obtain push tokens (`npx eas init` writes `extra.eas.projectId` to `app.json`), then deploy the worker. It uses the same worker secret and Vault entries as email:

```bash
supabase functions deploy send-push
# Only if "enhanced push security" is enabled for the Expo project:
supabase secrets set EXPO_ACCESS_TOKEN=<token>
```

Push needs a physical phone and a development or production build (`eas build`). Without a project ID, Settings explains that push is not set up for that build. For local development, copy `supabase/functions/.env.example` to `supabase/functions/.env` (log providers: no emails or pushes leave the machine).

7. In-app updates (Android APK). Each APK built on `main` is recorded in `app_releases`, and installed apps check it at launch and when reopened. When a newer build exists they show an "Update available" prompt whose **Update now** button opens the download, and Settings shows the installed version with a **Check for updates** button. To turn it on, deploy the function and set the same secret in Supabase and in the EAS `preview` environment:

```bash
supabase functions deploy publish-release
supabase secrets set RELEASE_PUBLISH_SECRET=<long random string>
eas env:create --environment preview --name RELEASE_PUBLISH_SECRET --value <same string> --visibility secret
```

To have the app download and install updates itself (instead of opening the Expo page in the browser), also give the workflow an Expo access token, so it can look up each build's direct `.apk` link. Create a robot token at expo.dev (Account settings → Access tokens, with read access to the project), then:

```bash
eas env:create --environment preview --name EXPO_RELEASE_TOKEN --value <token> --visibility secret
```

Android still shows its own Install screen (no app can replace itself silently), and the first time it asks to allow Grocefy to install updates. Only builds made after this is set up are offered. The prompt only appears in installed APKs, not in Expo Go or development builds.

The migrations also create the reference data (currency registry and default categories). After a schema change, regenerate the client types with `npm run db:types`.

### Local development data

`supabase start` (and `supabase db reset`) loads `supabase/seed/seed.sql` into the local database. It contains two demo accounts, both with the password `grocefy-demo`:

- **demo@grocefy.test** owns the House Shopping home, whose inventory has items in stock, running low, and finished, with matching To-buy lists (plus Office Shopping, used only when the `multipleHomes` flag is on).
- **alex@grocefy.test** is a partner in House Shopping and has a pending invitation to Office Shopping.

The seed includes last month's purchases (so price suggestions and a finalized monthly report exist), this month's purchases, and items still to buy. Never run it against production.

### Database tests

`npm run test:db` starts a disposable PostgreSQL 15 container (Docker required), applies every migration on top of a minimal Supabase auth stub, and runs the suites in `supabase/tests/`. They cover the role matrix, non-member and anonymous access, invitations (including email and expiry rules), the atomic purchase transaction (including a forced mid-transaction failure), duplicate-purchase prevention, financial immutability, price suggestions across currencies, currency validation, monthly reports (category variance, currency separation, idempotency, finality, timezones, and access), purchasers keeping their history after leaving a list, the activity log and its visibility, list duplication, price summaries and spending trends, idempotent purchases and offline timestamps, push tokens and who gets which push, the email outbox (what gets queued, opt-outs, claiming, retries, and crash recovery), product search ranking and visibility, and custom categories on shared lists.

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request to `Development` or `main` and on pushes to `Development`:

| Job | Runs |
|---|---|
| Typecheck, lint, unit and email tests | `npm run typecheck`, `typecheck:functions`, `lint`, `test:unit`, `test:email` |
| Database tests | `npm run test:db` (disposable PostgreSQL 15 in Docker) |
| Bundle | `npx expo install --check` and an Android and iOS export |
| Service end-to-end | `supabase start`, then `npm run test:services`, including realtime and the `send-emails` function |

Run the same checks locally before opening a pull request. `npm run lint` uses Expo's ESLint flat config (`eslint.config.js`) and fails on any warning.

### Unit tests

`npm run test:unit` tests the app's pure modules under Node: amount parsing and formatting per currency, CSV escaping (including formula-injection protection), activity descriptions, and the offline queue (how queued changes appear, sync order, and refused changes).

### Email tests

`npm run test:email` unit-tests the Edge Function modules under Node: email templates (escaping, currency on every amount), the Resend and Expo push providers, provider selection, both workers' send/skip/failure handling (including pruning unregistered devices), and the worker secret check. `npm run typecheck:functions` type-checks the Deno code without the Deno toolchain.

### Service end-to-end tests

`npm run test:services` runs the app's real `src/services` modules under Node against a **local** Supabase stack (`supabase start`), with React Native modules stubbed. It walks through the complete flow: sign up, create a group and list, add items, invite and accept, purchase, duplicate-purchase rejection, purchase history paging, role enforcement, price suggestions across currencies, realtime delivery (to members only), the activity feed, list duplication, report and purchase exports, price book and spending trend, offline sync retries, product search, custom categories, list editing, monthly reports, and leaving a list. With `supabase/functions/.env` present, it also calls the running `send-emails` function to check its authentication and delivery, and does the same for `send-push`. It refuses to run against a non-local API.

## Getting Started

### Prerequisites

- Node.js 20.19.4 or newer (22 LTS recommended)
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

Grocefy is under active development and focused on its core: a shared home inventory, To-buy lists with remembered prices, and buying at the market, for families and people who live together. Larger features are hidden behind flags until the product expands. Work is delivered through feature branches and pull requests targeting `Development`.

## Roadmap

Possible later expansions, if the product grows beyond a single household app:

- Turning on the hidden features listed under *Hidden for now*
- Reminders for items that usually run out on a schedule
- Receipt scanning to fill in prices
- Currency conversion (never automatic for stored prices)

The architecture preserves currency information on lists and purchase history so conversion and server synchronization can be added without changing historical financial meaning.
