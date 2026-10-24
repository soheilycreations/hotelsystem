# Menu rebuild 2026 — run order

All SQL runs in the Supabase SQL editor. Nothing here deletes a menu item.

| # | Where | What | Expect |
|---|---|---|---|
| ✅ | SQL editor | `01-menu-backup.sql` (done 24 Oct) | `menu_backup_20261024`: 13 categories, 227 items, 55 recipe lines |
| ✅ | SQL editor | `02-menu-export.sql` → `data/current_menu_export.csv` (done) | |
| 1 | — | **Don't edit the menu** (prices, items, recipes) until step 4 is done | otherwise step 3 refuses |
| 2 | SQL editor | `supabase/migration-045-menu-sort-archive.sql` from branch **menu-release** | "Success" (safe to re-run) |
| 3 | SQL editor | `03-menu-apply.sql` as is (dry run) | red **DRY RUN OK … NOTHING changed** with the POS tab list |
| 4 | SQL editor | same file with `v_commit := true` | grid of the new POS menu |
| 5 | Cloudflare | deploy branch **menu-release** | POS shows the new tabs; Menu admin has "Show archived" |

`v_internal_to_end := true` in step 3/4 moves the Function Items, Staff Menu,
Other, Boss Site and Party tabs after the menu tabs (otherwise they stay at
their current positions, between the new ones).

Between steps 4 and 5 the old app is still live: it shows the new names and
prices and hides archived items, but orders items by name and still shows
the emptied tabs (Mains, Drinks, Rice, Buffet) until the deploy.

**Undo:** `04-menu-restore.sql` — dry run, then `v_commit := true`. Puts the
menu back exactly as in `menu_backup_20261024`; new items that were already
sold are archived instead of deleted. Current menu is saved first in
`menu_pre_restore_<time>`.

Regenerate after changing the plan:
```
python3 scripts/menu/build_menu_review.py data/rawana_new_menu_2026.csv data/current_menu_export.csv data/menu_review
python3 scripts/menu/build_menu_apply.py data/menu_review.json data/current_menu_export.csv scripts/menu/03-menu-apply.sql
```
