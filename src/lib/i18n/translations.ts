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
  "owner funded": "අයිතිකරු ගෙවූ",
  "Expenses total (all)": "සියලු වියදම් එකතුව",
  "Room vs Restaurant": "කාමර සහ රෙස්ටුරන්ට්",
  "Owner-funded expenses excluded from both balances": "මෙම එකතුවලට අයිතිකරු ගෙවූ වියදම් ඇතුළත් නැත",
  "Balance": "ඉතිරිය",
  "Room & Restaurant Ledger (cash)": "කාමර සහ රෙස්ටුරන්ට් මුදල් පොත",
  "Inhand (yesterday)": "ඊයේ ඉතිරිය",
  "+ Today's cash in": "+ අද ආ මුදල්",
  "- Today's cash out": "- අද ගිය මුදල්",
  "Balance (carries to tomorrow)": "ඉතිරිය (හෙට දක්වා යයි)",
  "Cash movements today": "අද මුදල් හුවමාරු",
  "Show full details": "සම්පූර්ණ විස්තර පෙන්වන්න",
  "Hide full details": "සම්පූර්ණ විස්තර සඟවන්න",
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
  "Revenue by payment method": "ගෙවීම් ආකාරය අනුව ආදායම",
  "No revenue recorded for this date.": "මේ දිනට ආදායමක් වාර්තා වී නැත.",
  "Item sales — restaurant / POS": "අයිතම විකුණුම් — රෙස්ටුරන්ට්",
  "Owner-funded — excluded below": "අයිතිකරු ගෙවූ එක — පහළ ගණන් වලට ඇතුළත් නැත",
  "Balance as of this date — stays here every day until fully repaid, not just the day a bill was added.":
    "මේ දිනට ඇති ඉතිරිය — සම්පූර්ණයෙන් ගෙවනකම් හැම දිනකම මෙතන පෙන්නනවා, බිල දාපු දිනට විතරක් නෙවෙයි.",
  "Added today": "අද එකතු කළ",
  "cash ledger": "මුදල් පොත",
  "Inhand (yesterday's closing)": "ඊයේ ඉතුරු වුනු මුදල",
  "− Today's cash out": "− අද ගිය මුදල්",

  // Sidebar (owner-console layout)
  "Menu": "මෙනුව",
  "Management": "කළමනාකරණය",
  "Owner console": "අයිතිකරු පුවරුව",
  "Rooms": "කාමර",
  "Reservations": "වෙන්කිරීම්",
  "Restaurant / POS": "රෙස්ටුරන්ට් / ඇණවුම්",
  "Reports": "වාර්තා",
  "Credit accounts": "ණය ගිණුම්",
  "Stock list": "බඩු ලැයිස්තුව",
  "Store": "ස්ටෝරුව",
  "Simple Report": "සරල වාර්තාව",
  "active kitchen orders": "කුස්සියේ ක්‍රියාත්මක ඇණවුම්",
  "Expand": "විහිදන්න",
  "Collapse": "හකුළන්න",
  "Open menu": "මෙනුව විවෘත කරන්න",
  "Close menu": "මෙනුව වසන්න",
  "Toggle theme": "පෙනුම මාරු කරන්න",

  // Overview — top bar
  "Good morning, welcome back": "සුබ උදෑසනක්, නැවත සාදරයෙන් පිළිගනිමු",
  "Good afternoon, welcome back": "සුබ දහවලක්, නැවත සාදරයෙන් පිළිගනිමු",
  "Good evening, welcome back": "සුබ සන්ධ්‍යාවක්, නැවත සාදරයෙන් පිළිගනිමු",
  "Property, restaurant and finance at a glance": "හෝටලය, රෙස්ටුරන්ට් සහ මුදල් එක බැල්මකින්",
  "Search": "සොයන්න",
  "Search guests, bills, rooms": "අමුත්තන්, බිල්, කාමර සොයන්න",
  "Last 14 days": "පසුගිය දින 14",
  "Notifications": "දැනුම්දීම්",
  "item(s) low on stock": "අයිතම තොගය අඩුයි",
  "No alerts": "අනතුරු ඇඟවීම් නැත",
  "New booking": "නව වෙන්කිරීමක්",

  // Overview — hero + KPI cards
  "Today": "අද",
  "Today's sales so far": "අද මේ වනතුරු විකුණුම්",
  "below yesterday": "ඊයේට වඩා අඩුයි",
  "above yesterday": "ඊයේට වඩා වැඩියි",
  "Same as yesterday": "ඊයේ හා සමානයි",
  "View daily summary": "දවසේ එකතුව බලන්න",
  "Total revenue": "මුළු ආදායම",
  "POS": "රෙස්ටුරන්ට්",
  "Net profit": "ශුද්ධ ලාභය",
  "Revenue minus logged expenses": "ආදායමෙන් වියදම් අඩු කළ පසු",
  "Open guest folios": "නොගෙවූ අමුත්තන්ගේ බිල්",
  "14 days": "දින 14",

  // Overview — today at the hotel
  "Today at the hotel": "අද හෝටලයේ",
  "Details": "විස්තර",
  "Check-ins": "පැමිණීම්",
  "Guests checked in today": "අද පැමිණි අමුත්තන්",
  "Check-outs": "පිටවීම්",
  "Guests checked out today": "අද පිටව ගිය අමුත්තන්",
  "In-house": "හෝටලයේ සිටින",
  "Rooms occupied tonight": "අද රාත්‍රියට පිරී ඇති කාමර",
  "Kitchen orders": "කුස්සියේ ඇණවුම්",
  "Currently cooking": "දැනට පිසිමින්",
  "bill(s) — KOT pending": "බිල් — KOT තවම නැත",
  "Not yet settled": "තවම ගෙවා නැත",
  "Today's sales": "අද විකුණුම්",
  "None yet": "තවම නැත",
  "Arrived": "පැමිණියා",
  "Departed": "පිටව ගියා",
  "No rooms": "කාමර නැත",
  "Active": "ක්‍රියාත්මකයි",
  "Clear": "කිසිවක් නැත",
  "Pending": "ඉතිරියි",
  "None": "නැත",
  "Up": "වැඩියි",
  "Down": "අඩුයි",
  "Flat": "සමානයි",

  // Overview — quick actions
  "Quick actions": "ඉක්මන් ක්‍රියා",
  "New bill": "නව බිලක්",
  "Check in guest": "අමුත්තෙක් ඇතුළත් කරන්න",
  "Log expense": "වියදමක් ලියන්න",
  "Cash ledger": "මුදල් පොත",

  // Overview — charts
  "Revenue vs expenses": "ආදායම සහ වියදම්",
  "Room checkouts + settled POS bills, per day": "කාමර නික්මීම් + ගෙවූ රෙස්ටුරන්ට් බිල්, දිනපතා",
  "No revenue or expenses recorded in the last 14 days yet.": "පසුගිය දින 14 තුළ ආදායමක් හෝ වියදමක් තවම නැත.",
  "Revenue by source": "මූලාශ්‍රය අනුව ආදායම",
  "No settled revenue in this period yet.": "මේ කාලයේ ගෙවූ ආදායමක් තවම නැත.",
  "settled bills in this period": "මේ කාලයේ ගෙවූ බිල්",
  "Historical entries": "පරණ ඇතුළත් කිරීම්",
  "Dine in": "ඇතුළත කෑම",
  "Room service": "කාමර සේවය",
  "Takeaway": "රැගෙන යාම",
  "Delivery": "බෙදාහැරීම",
  "Banquet": "උත්සව",

  // Overview — occupancy
  "Room occupancy": "කාමර පිරීම",
  "Tonight": "අද රාත්‍රිය",
  "{occupied} of {total} rooms": "කාමර {total} න් {occupied}",
  "Occupied": "පිරී ඇති",
  "Available": "හිස්",
  "No rooms set up yet.": "තවම කාමර සකසා නැත.",

  // Overview — activity feed
  "Activity": "ක්‍රියාකාරකම්",
  "Nothing yet — activity appears here as guests and bills move.":
    "තවම කිසිවක් නැත — අමුත්තන් සහ බිල් එන විට මෙතන පෙන්වයි.",
  "Bill": "බිල",
  "settled": "ගෙවා ඇත",
  "checked in": "පැමිණියා",
  "checked out": "පිටව ගියා",
  "Uncategorised": "වර්ගයක් නැත",
  "BILL": "බිල",
  "CHECK-IN": "පැමිණීම",
  "CHECK-OUT": "පිටවීම",
  "EXPENSE": "වියදම",
  "HOUSEKEEPING": "පිරිසිදු කිරීම",
  "LOW STOCK": "තොගය අඩුයි",
  "SYSTEM": "පද්ධතිය",

  // Shared report components (date range bar, charts)
  "From": "සිට",
  "To": "දක්වා",
  "Loading": "පූරණය වෙමින්",
  "This month": "මේ මාසය",
  "Last 30 days": "පසුගිය දින 30",
  "Tap a series to show or hide it": "පෙන්වීමට හෝ සැඟවීමට ඔබන්න",

  // P&L Report
  "P&L Report": "ලාභ අලාභ වාර්තාව",
  "Overall": "සමස්ත",
  "Margin": "ලාභ අනුපාතය",
  "Profit": "ලාභය",
  "Loss": "අලාභය",
  "owner-funded, excluded": "අයිතිකරු ගෙවූ, ඇතුළත් නැත",
  "Room sales": "කාමර විකුණුම්",
  "Food / POS sales": "ආහාර / රෙස්ටුරන්ට් විකුණුම්",
  "Room, food & expenses — daily": "කාමර, ආහාර සහ වියදම් — දිනපතා",
  "No sales or expenses in this period yet.": "මේ කාලයේ විකුණුම් හෝ වියදම් තවම නැත.",
  "Revenue by channel": "ඇණවුම් ආකාරය අනුව ආදායම",
  "No completed orders in this period.": "මේ කාලයේ සම්පූර්ණ කළ ඇණවුම් නැත.",
  "Expenses by category": "වර්ගය අනුව වියදම්",
  "No expenses logged in this period.": "මේ කාලයේ වියදම් ලියා නැත.",

  // Phase 1 — Overview
  "Revenue − logged expenses": "ආදායම − ලියූ වියදම්",
  "Not true profit: food cost, salaries not yet logged and stock bought for later are not deducted. The real P&L is coming.":
    "මෙය සැබෑ ලාභය නොවේ: ආහාර පිරිවැය, තවම ලියා නැති වැටුප් සහ පසුවට ගත් තොග අඩු කර නැත. සැබෑ ලාභ අලාභ වාර්තාව ඉදිරියේදී.",
  "Before food cost & salary accruals": "ආහාර පිරිවැය සහ වැටුප් අඩු කිරීමට පෙර",
  "below yesterday at this time": "ඊයේ මේ වෙලාවට වඩා අඩුයි",
  "above yesterday at this time": "ඊයේ මේ වෙලාවට වඩා වැඩියි",
  "Same as yesterday at this time": "ඊයේ මේ වෙලාවට සමානයි",
  "Open bills": "විවෘත බිල්",
  "items waiting for KOT": "අයිතම KOT සඳහා බලා සිටී",
  "sent to kitchen": "කුස්සියට යවා ඇත",
  "KOT pending": "KOT තවම නැත",
  "Open": "විවෘතයි",
  "Vacant": "හිස්",
  "Dirty": "පිරිසිදු කළ යුතු",
  "Maintenance": "අලුත්වැඩියාව",

  // Phase 1 — P&L
  "Surplus": "අතිරික්තය",
  "Deficit": "හිඟය",

  // Phase 1 — Reservations / room service
  "This guest has an unsettled room-service bill. Settle or cancel the room-service bill first, then check out.":
    "මෙම අමුත්තාගේ ගෙවා නැති room-service බිලක් තිබේ. පළමුව එම බිල ගෙවන්න හෝ අවලංගු කරන්න, පසුව check out කරන්න.",
  "Posted folio": "බිලට එකතු කළ මුදල",
  "pending room service": "ගෙවා නැති room service",
  "Total due": "ගෙවිය යුතු මුළු මුදල",
  "room-service bill(s) not settled — settle or cancel before checkout.":
    "room-service බිල් තවම ගෙවා නැත — check out කිරීමට පෙර ගෙවන්න හෝ අවලංගු කරන්න.",
  "Settle room service": "Room service බිල ගෙවන්න",
  "Ask the cashier to settle it on the Billing screen.": "Billing තිරයෙන් එය ගෙවීමට කැෂියර්ට කියන්න.",
  "After check-out the room is marked dirty for housekeeping automatically. Time-block countdowns start at the actual check-in time.":
    "Check out කළ පසු කාමරය පිරිසිදු කිරීමට ස්වයංක්‍රීයව සලකුණු වේ. පැය ගණනේ කාලය ආරම්භ වන්නේ සැබෑ check-in වෙලාවෙනි.",

  // Phase 1 — Billing / recipes / branding
  "Settling closes the bill. Recipe stock is deducted automatically, and room-service bills are added to the guest's room bill.":
    "ගෙවූ පසු බිල වැසේ. වට්ටෝරු තොග ස්වයංක්‍රීයව අඩු වන අතර room-service බිල් අමුත්තාගේ කාමර බිලට එකතු වේ.",
  "No menu items yet": "තවම මෙනු අයිතම නැත",
  "Add dishes under Restaurant → Menu Items first, then set their recipes here.":
    "පළමුව රෙස්ටුරන්ට් → මෙනු අයිතම යටතේ කෑම එකතු කරන්න, පසුව මෙතන වට්ටෝරු සකසන්න.",
  "Powered by": "බලගැන්වීම",
};
