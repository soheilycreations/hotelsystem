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

  // Daily Summary (screen + PDF export)
  "Room Sales": "කාමර විකුණුම්",
  "No checkouts recorded for this date.": "මේ දිනට කාමර නික්මීම් නැත.",
  "Guest": "අමුත්තා",
  "Room": "කාමරය",
  "Plan": "පැකේජය",
  "Paid by": "ගෙවූ ආකාරය",
  "Amount": "මුදල",
  "Bank Transfer": "බැංකු මාරුව",
  "Card": "කාඩ්පත",
  "Complimentary": "නොමිලේ",
  "Cash": "කෑෂ්",
  "Room revenue total": "කාමර ආදායම එකතුව",
  "Restaurant / POS Item Sales": "රෙස්ටුරන්ට් අයිතම විකුණුම්",
  "No completed orders for this date.": "මේ දිනට සම්පූර්ණ කළ ඇණවුම් නැත.",
  "Item": "අයිතමය",
  "Qty": "ගණන",
  "Revenue": "ආදායම",
  "POS subtotal": "උප එකතුව",
  "Service charge": "සේවා ගාස්තුව",
  "POS total": "මුළු එකතුව",
  "No expenses logged for this date.": "මේ දිනට වියදම් කිසිවක් නැත.",
  "Category": "වර්ගය",
  "Description": "විස්තරය",
  "owner bank transfer": "අයිතිකරුගේ බැංකු මාරුව",
  "Expenses total (all)": "සියලු වියදම් එකතුව",
  "Room vs Restaurant": "කාමර සහ රෙස්ටුරන්ට්",
  "Owner bank transfers excluded from both balances": "මෙම එකතුවලට අයිතිකරුගේ බැංකු මාරු ඇතුළත් නැත",
  "Balance": "ඉතිරිය",
  "Room & Restaurant Ledger (cash)": "කාමර සහ රෙස්ටුරන්ට් මුදල් පොත",
  "Inhand (yesterday)": "ඊයේ ඉතිරිය",
  "+ Today's cash in": "+ අද ආ මුදල්",
  "- Today's cash out": "- අද ගිය මුදල්",
  "Balance (carries to tomorrow)": "ඉතිරිය (හෙට දක්වා යයි)",
  "Cash movements today": "අද මුදල් හුවමාරු",
  "Credit accounts — still owing": "ණය ගිණුම් — තවම ගෙවීමට ඇති",
  "Account": "ගිණුම",
  "Total outstanding": "ගෙවීමට ඇති මුළු මුදල",
  "Credit — added today": "ණය — අද එකතු කළ",
  "Source": "විස්තරය",
  "Total on credit today": "අද ණයට දුන් මුළු මුදල",

  // Daily Summary screen-only strings (dynamic sentences handled inline
  // in the component; these are the fixed labels/sentences)
  "Export PDF": "PDF ලෙස ගන්න",
  "Float top-ups, bank deposits, owner withdrawals — folded into the Restaurant ledger's cash in/out above, listed individually here.":
    "මුදල් එකතු කිරීම්, බැංකු තැන්පතු, අයිතිකරු ගත් මුදල් — උඩ රෙස්ටුරන්ට් මුදල් පොතේ එකතු වෙලා තියෙනවා, මෙතන එකින් එක පෙන්නනවා.",
  "Room revenue": "කාමර ආදායම",
  "POS revenue": "රෙස්ටුරන්ට් ආදායම",
  "Room balance": "කාමර ඉතිරිය",
  "Restaurant balance": "රෙස්ටුරන්ට් ඉතිරිය",
  "Room sales — checkouts today": "කාමර විකුණුම් — අද නික්මුණු අය",
  "Item sales — restaurant / POS": "අයිතම විකුණුම් — රෙස්ටුරන්ට්",
  "Owner-funded — excluded below": "අයිතිකරු ගෙවූ එක — පහළ ගණන් වලට ඇතුළත් නැත",
  "Balance as of this date — stays here every day until fully repaid, not just the day a bill was added.":
    "මේ දිනට ඇති ඉතිරිය — සම්පූර්ණයෙන් ගෙවනකම් හැම දිනකම මෙතන පෙන්නනවා, බිල දාපු දිනට විතරක් නෙවෙයි.",
  "Added today": "අද එකතු කළ",
  "cash ledger": "මුදල් පොත",
  "Inhand (yesterday's closing)": "ඊයේ ඉතුරු වුනු මුදල",
  "− Today's cash out": "− අද ගිය මුදල්",
};
