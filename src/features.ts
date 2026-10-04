/**
 * Product scope switches. Grocefy ships as a simple shared home inventory and shopping list; the larger features below
 * are built and tested but hidden until the product expands. Turning one back on only changes what the app shows:
 * the database and services behind every feature stay in place.
 */
export const features = {
  /** Belong to and switch between several homes, and the Groups screen. */
  multipleHomes: false,
  /** Monthly finance statements and the Reports tab. */
  financeReports: false,
  /** CSV export of statements and purchases. */
  csvExports: false,
  /** Price book, per-product price history and charts, six-month spending chart. */
  priceInsights: false,
  /** "Recent activity" feeds on lists and homes. */
  activityFeed: false,
  /** Email notification toggle in Settings (server-side email delivery is configured separately). */
  emailNotifications: false,
  /** Item categories, custom category management, and grouping items by category. */
  customCategories: false,
  /** Choosing a currency per list; otherwise every list uses its home's currency. */
  listCurrency: false,
  /** Duplicating a list. */
  duplicateLists: false,
  /** The Editor role; otherwise members are either Members (add, mark, buy) or View-only. */
  editorRole: false,
  /** Sharing a single list with someone outside the home; otherwise sharing is per home. */
  listSharing: false,
  /** Push notifications when housemates mark things low or finished, buy items, or invite you. */
  pushNotifications: true,
  /** "Spent this month" total on the Home screen. */
  monthlySpending: true,
  /** The History tab of past purchases. */
  purchaseHistory: true
} as const;

export type Feature = keyof typeof features;
export const isEnabled = (feature: Feature) => features[feature];
