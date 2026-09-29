# Grocefy

Grocefy is a collaborative grocery and shopping management app for individuals, households, offices, and teams. Create organized shopping lists, set budgets, record what was actually paid, and understand spending in one place.

## Features

- **Shopping lists:** create lists and categorize them as Food, Kitchen, Bathroom, Cleaning, Household, Personal Care, Office Supplies, or custom.
- **Shopping groups:** organize lists by a shared purpose, such as House Shopping or Office Shopping.
- **Accounts:** sign up with a username and default currency, sign in, and reset a forgotten password by email.
- **Collaboration:** invite people to a list or group by username or email as Viewer, Editor, or Partner; they accept or decline from their inbox.
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

- **Sharing** works only through invitations. An owner invites by username, user ID, or email with `create_invitation`. The invitee accepts or declines with `respond_to_invitation`, and the owner or inviter can withdraw a pending invite with `cancel_invitation`. Invitations expire after 7 days, and both sides get in-app notifications. Email invitations never reveal whether an address has an account, and they can only be accepted from a confirmed email address. Owners change roles or remove members, and members can leave. Delivering invitation emails (an Edge Function with a transactional email provider) is not implemented yet.
- **Purchases** can only be created by the `purchase_list_item` function. It runs as one transaction that checks permissions, records the purchase and price history, and marks the item purchased. The purchaser, currency, and budget snapshot come from the database, never from the client.
- **History is immutable.** Purchases and price history cannot be updated or deleted by any role, purchased items are frozen, and lists, groups, products, and categories are archived rather than deleted.
- **Currency:** every list, purchase, price-history entry, and report stores an ISO 4217 code. A list's currency is locked once it has items. Price suggestions (`get_price_suggestion`) only use prices recorded in the list's currency, and totals are always grouped per currency.
- **Monthly finance reports** compare budgeted and purchased amounts by category, with variance = purchased − budgeted (negative means under budget). `generate_monthly_report` builds personal, group, or list reports; group and list reports are available only to owners and partners. There is one report per currency, because amounts in different currencies are never added together. Month boundaries follow the report owner's timezone setting (UTC by default). Once a month has ended, its report is final: generating it again returns the issued report unchanged, even if a category is later renamed.
- **Scheduled reports:** where `pg_cron` is available (Supabase), the migration schedules `private.generate_previous_month_reports()` at 14:00 UTC on the 1st of each month. By then the previous month has ended in every timezone. The job finalizes group and personal reports and notifies owners and partners once; re-running it is safe.

### Configure Supabase

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable/anon** key. Never use a service-role key in Expo.
3. Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli), link the project, then apply the migrations:

```bash
supabase link --project-ref bsffllulzwidnpdhzroq
supabase db push
```

4. In the Supabase dashboard under **Authentication → URL Configuration**, add `grocefy://**` to the redirect URLs (and your Expo Go URL, e.g. `exp://**`, during development). Email confirmation and password-reset links return to the app through these deep links, and must be opened on the device that requested them.

The migrations also create the reference data (currency registry and default categories); `supabase/seed/seed.sql` is reserved for demo-only records. After a schema change, regenerate the client types with `npm run db:types`.

### Database tests

`npm run test:db` starts a disposable PostgreSQL 15 container (Docker required), applies every migration on top of a minimal Supabase auth stub, and runs the suites in `supabase/tests/`. They cover the role matrix, non-member and anonymous access, invitations (including email and expiry rules), the atomic purchase transaction (including a forced mid-transaction failure), duplicate-purchase prevention, financial immutability, price suggestions across currencies, currency validation, monthly reports (category variance, currency separation, idempotency, finality, timezones, and access), and purchasers keeping their history after leaving a list.

### Service end-to-end tests

`npm run test:services` runs the app's real `src/services` modules under Node against a **local** Supabase stack (`supabase start`), with React Native modules stubbed. It walks through the complete flow: sign up, create a group and list, add items, invite and accept, purchase, duplicate-purchase rejection, purchase history paging, role enforcement, price suggestions across currencies, monthly reports, and leaving a list. It refuses to run against a non-local API.

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

`main` is reserved for reviewed/released code. Work on descriptive feature branches and open pull requests targeting `Development`; do not merge directly into `main`. The project owner reviews `Development` before merging it into `main`.

## Project Status

Grocefy is under active development. Accounts, shared lists and groups, purchasing, price memory, purchased history, and monthly finance reports run end to end on Supabase. Features are delivered incrementally through feature branches and pull requests targeting `Development`.

## Roadmap

- Invitation and monthly report emails (Edge Functions with a transactional email provider)
- Realtime list updates while shopping together
- Offline shopping and push notifications
- Recurring lists, receipt scanning, AI suggestions, price trends, and store comparison
- Inventory management, multiple workspaces, advanced analytics, currency conversion, and PDF/CSV/Excel exports
- Subscription and family/business plans

The architecture preserves currency information on lists and purchase history so conversion and server synchronization can be added without changing historical financial meaning.
