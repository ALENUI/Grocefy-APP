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

The Expo app accesses Supabase only through `src/services/`; UI components do not contain raw database queries. The `purchase_list_item` database function is the authority for purchase creation, price history, and item finalization in one transaction.

### Configure Supabase

1. Copy `.env.example` to `.env`.
2. Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the project's **publishable/anon** key. Never use a service-role key in Expo.
3. Install and authenticate the Supabase CLI, link the project, then apply the schema and seed data:

```bash
supabase link --project-ref bsffllulzwidnpdhzroq
supabase db push
supabase db execute --file supabase/seed/seed.sql
```

RLS is enabled by the migration. Test policies and the purchase transaction against a non-production project before enabling the mobile data services.

## Getting Started

### Prerequisites

- Node.js LTS
- npm
- Expo Go, Android Studio, or an iOS development environment

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
