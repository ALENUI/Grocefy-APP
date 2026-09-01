# Grocefy

Grocefy is a collaborative grocery and shopping management app for individuals, households, offices, and teams. Create organized shopping lists, set budgets, record what was actually paid, and understand spending in one place.

## Features

- **Shopping lists:** create lists and categorize them as Food, Kitchen, Bathroom, Cleaning, Household, Personal Care, Office Supplies, or custom.
- **Shopping groups:** organize lists by a shared purpose, such as House Shopping or Office Shopping.
- **Budget and purchase tracking:** set a budget per item, confirm actual purchase prices, and see savings or overruns.
- **Price history:** purchased entries preserve item name, amount, ISO 4217 currency code, and purchase date.
- **Currency preferences:** choose a default currency for new lists and override it per list. Existing lists and purchases retain their original currency.
- **Finance reports:** see budget and actual totals separated by currency; Grocefy never combines currencies without conversion.

Collaboration roles (Viewer, Editor, Partner, and Owner), sharing, secure authentication, and a server-backed database are planned expansion points; they are not yet implemented in this local MVP.

## Technology

Grocefy is built with React, React Native, Expo, TypeScript, Expo Router, and AsyncStorage for local MVP persistence.

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
