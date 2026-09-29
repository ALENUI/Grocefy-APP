# Grocefy

Grocefy is a collaborative grocery and shopping management app for individuals, households, offices, and teams. Create organized shopping lists, set budgets, record what was actually paid, and understand spending in one place.

## Features

- **Shopping lists:** create lists and categorize them as Food, Kitchen, Bathroom, Cleaning, Household, Personal Care, Office Supplies, or custom.
- **Shopping groups:** organize lists by a shared purpose, such as House Shopping or Office Shopping.
- **Local collaboration prototype:** assign local group members the Viewer, Editor, Partner, or Owner role; secure account-backed sharing is the next backend phase.
- **Budget and purchase tracking:** set a budget per item, confirm actual purchase prices, and see savings or overruns.
- **Price history:** purchased entries preserve item name, amount, ISO 4217 currency code, and purchase date.
- **Currency preferences:** choose a default currency for new lists and override it per list. Existing lists and purchases retain their original currency.
- **Finance reports:** see budget and actual totals separated by currency; Grocefy never combines currencies without conversion.

Secure account-backed sharing, authentication, and a server-backed database are planned expansion points; they are not yet implemented in this local MVP.

## Technology

Grocefy is built with React, React Native, Expo, TypeScript, Expo Router, AsyncStorage for local MVP persistence, and a Supabase/PostgreSQL backend foundation.

## Backend

The backend is designed for Supabase Auth, PostgreSQL, Row Level Security (RLS), and a secure database function for purchase finalization. Its schema, policies, indexes, currency registry, financial constraints, and seed data are version-controlled in `supabase/`.

The Expo app accesses Supabase only through `src/services/` (auth, settings, lists, purchases); UI components do not contain raw database queries. Database types in `src/services/database.types.ts` are generated from the schema. The screens still run on the local AsyncStorage store; connecting them to these services is the next phase.

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

### Configure Supabase

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable/anon** key. Never use a service-role key in Expo.
3. Install and authenticate the [Supabase CLI](https://supabase.com/docs/guides/cli), link the project, then apply the migrations:

```bash
supabase link --project-ref bsffllulzwidnpdhzroq
supabase db push
```

The migrations also create the reference data (currency registry and default categories); `supabase/seed/seed.sql` is reserved for demo-only records. After a schema change, regenerate the client types with `npm run db:types`.

### Database tests

`npm run test:db` starts a disposable PostgreSQL 15 container (Docker required), applies every migration on top of a minimal Supabase auth stub, and runs the suites in `supabase/tests/`. They cover the role matrix, non-member and anonymous access, invitations (including email and expiry rules), the atomic purchase transaction (including a forced mid-transaction failure), duplicate-purchase prevention, financial immutability, price suggestions across currencies, and currency validation.

## Getting Started

### Prerequisites

- Node.js LTS (20.11 or newer)
- npm
- Expo Go, Android Studio, or an iOS development environment
- Docker (only for `npm run test:db`) and the Supabase CLI (for migrations)

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

Use `npm run android`, `npm run ios`, or `npm run web` for a platform-specific start.

## Development Workflow

`main` is reserved for reviewed/released code. Work on descriptive feature branches and open pull requests targeting `Development`; do not merge directly into `main`. The project owner reviews `Development` before merging it into `main`.

## Project Status

Grocefy is under active development. This repository currently provides the mobile MVP foundation and local data flow; backend authentication and collaboration will be added incrementally.

## Roadmap

- Authentication, shared lists, and Viewer/Editor/Partner/Owner permissions
- Server-backed groups, purchases, and monthly reports
- Offline shopping and push notifications
- Recurring lists, receipt scanning, AI suggestions, price trends, and store comparison
- Inventory management, multiple workspaces, advanced analytics, currency conversion, and PDF/CSV/Excel exports
- Subscription and family/business plans

The architecture preserves currency information on lists and purchase history so conversion and server synchronization can be added without changing historical financial meaning.
