/**
 * Sinhala translations, keyed by the English text as it appears in the UI.
 * `t(text)` looks a string up here when the language is "si" and falls back
 * to the English text itself if no entry exists yet — so pages that haven't
 * been translated yet just show English instead of breaking, and get
 * Sinhala automatically the moment an entry is added here.
 *
 * Kept deliberately simple/spoken Sinhala rather than formal literary
 * Sinhala — familiar job-title and business words (Cashier, Reception,
 * Admin) are kept as commonly-spoken loanwords rather than invented formal
 * equivalents nobody actually says out loud.
 */
export const SI_DICT: Record<string, string> = {
  // Sidebar navigation
  "Overview": "ප්‍රධාන පිටුව",
  "Room Grid": "කාමර",
  "Bookings": "වෙන්කිරීම්",
  "Calendar": "දින දර්ශනය",
  "POS Terminal": "ඇණවුම්",
  "Billing": "බිල් කිරීම",
  "Menu Items": "මෙනු අයිතම",
  "Inventory": "ගබඩාව",
  "Purchasing": "බඩු ගැනීම්",
  "Recipe Costing": "වට්ටෝරු වියදම",
  "Daily Summary": "දවසේ එකතුව",
  "Bills": "බිල් ලැයිස්තුව",
  "Cash Book": "මුදල් පොත",
  "Credit Accounts": "ණය ගිණුම්",
  "Expenses": "වියදම්",
  "P&L Reports": "ලාභ වාර්තා",
  "Hotel Profile": "හෝටල් තොරතුරු",
  "Staff Accounts": "සේවක ගිණුම්",
  "Settled Records": "සම්පූර්ණ කළ වාර්තා",
  "Backfill Data": "පරණ දත්ත",
  "Sign out": "ඉවත් වන්න",

  // Nav group headings
  "Analytics": "විස්තර",
  "Property": "හෝටලය",
  "Restaurant": "රෙස්ටුරන්ට්",
  "Kitchen": "කුස්සිය",
  "Finance": "මුදල්",
  "Settings": "සැකසුම්",

  // Role labels
  "Administrator": "ඇඩ්මින්",
  "Manager": "කළමනාකරු",
  "Receptionist": "රිසෙප්ෂන්",
  "Cashier": "කැෂියර්",
};
