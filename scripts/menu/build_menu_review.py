#!/usr/bin/env python3
"""
MENU REBUILD — step 2: build the review grid (old item -> new item).

Reads
  new menu CSV   category, category_order, item_order, name, size, price_lkr,
                 active, description, note
  export CSV     output of scripts/menu/02-menu-export.sql (current menu)
Writes
  <out>.csv      the review grid (open in Excel) — one row per decision
  <out>.json     the same plan, machine-readable, for the apply script

Nothing touches the database. Usage:
  python3 scripts/menu/build_menu_review.py data/rawana_new_menu_2026.csv \
      data/current_menu_export.csv data/menu_review
Optional: data/menu_overrides.csv (columns new_key, old_item_id) forces a
match ("-" as old_item_id forces NEW) when the automatic one is wrong.

Rules (decided with the owner):
  * internal categories (Function Items, Staff Menu, Boss Site, Buffet, Party,
    Other) and their items are left untouched;
  * a new item takes over the best-matching old item (same id, so past sales
    and recipe links stay); when several old items match, keep the one with
    recipe links, then the most sales, and hide the others;
  * "- Takeaway" items are never kept separately — takeaway uses the same
    prices — they are hidden (or take over only if nothing else matches);
  * "no (price TBD)" rows go in hidden;
  * every other old item not in the new menu is hidden, never deleted.
"""
import csv
import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

INTERNAL_CATEGORIES = {"function items", "staff menu", "boss site", "buffet", "party", "other"}

# multi-word fixes applied to the lower-cased text before splitting
PHRASE_MAP = [
    (r"\bsea\s+food\b", "seafood"),
    (r"\bchop\s+suey\b", "chopsy"),
    (r"\bcoca[\s-]*cola\b", "cola"),
    (r"\bhot\s*but+er\b", "hot butter"),
    (r"\bnasi\s*goreng\b|\bnasigoreng\b|\bnazi\s+gurang\b", "nasi goreng"),
]

# canonical spellings / synonyms (after lower-casing)
WORD_MAP = {
    "chopcy": "chopsy", "vegitable": "vegetable", "vegitables": "vegetable",
    "mongoliyan": "mongolian", "noodls": "noodle", "noodle": "noodle",
    "devield": "devilled", "cuttelfish": "cuttlefish", "chillie": "chilli", "chilly": "chilli",
    "cryspy": "crispy", "garlik": "garlic", "coffe": "coffee", "youghut": "yoghurt",
    "mix": "mixed", "omlet": "omelette", "omelate": "omelette",
    "chiken": "chicken", "chickn": "chicken", "chicke": "chicken",
    "batterd": "battered", "baterd": "battered",
    "deviled": "devilled", "devil": "devilled",
    "boil": "boiled",
    "cube": "cube", "cubes": "cube",
    "chopsuey": "chopsy", "chopsey": "chopsy",
    "frid": "fried", "fride": "fried",
    "musroom": "mushroom", "mushrom": "mushroom",
    "vegitable": "vegetable", "vegetables": "vegetable", "veg": "vegetable",
    "kottu": "kottu", "koththu": "kottu",
    "plate": "plate", "platter": "plate",
    "&": "and",
}
SIZE_WORDS = {
    "small": "s", "sml": "s", "s": "s",
    "medium": "m", "med": "m", "m": "m",
    "large": "l", "lrg": "l", "l": "l",
    "regular": "m", "reguler": "m", "reg": "m",   # kottu "Reguler" = medium
    "full": "l",                                  # kottu/rice "( Full )" = large "half": "half", "quarter": "quarter",
    "single": "single", "double": "double",
}
TAKEAWAY_RE = re.compile(r"[-–(\s]*take\s*-?\s*away\s*\)?\s*$", re.I)


def clean(s):
    s = unicodedata.normalize("NFKC", s or "").strip()
    return re.sub(r"\s+", " ", s)


def display_name(name, size):
    name, size = clean(name), clean(size)
    if not size or name.lower().endswith(f"({size.lower()})"):
        return name  # the CSV name may already carry the size
    return f"{name} ({size})"


def tokens(text):
    """-> (word tokens, size tokens, is_takeaway)"""
    t = clean(text).lower()
    takeaway = bool(TAKEAWAY_RE.search(t))
    t = TAKEAWAY_RE.sub("", t)
    # quantities: "1 kg" -> "1kg", "500 gm" -> "500g", "1 ltr" -> "1l"
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(kg|kgs|kilo)\b", r"\1kg ", t)
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(g|gm|gms|gram|grams)\b", r"\1g ", t)
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(l|ltr|litre|liter|lt)\b", r"\1l ", t)
    t = re.sub(r"(\d+(?:\.\d+)?)\s*(ml)\b", r"\1ml ", t)
    t = t.replace("&", " and ")
    for pat, rep_ in PHRASE_MAP:
        t = re.sub(pat, rep_, t)
    raw = re.findall(r"[a-z0-9.]+", t)
    words, sizes = [], []
    for w in raw:
        w = WORD_MAP.get(w, w)
        if w in SIZE_WORDS:
            sizes.append(SIZE_WORDS[w])
        elif re.fullmatch(r"\d+(\.\d+)?(kg|g|l|ml)", w):
            sizes.append(w)
        elif w in {"and", "with", "the", "of"}:
            continue
        else:
            if len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
                w = w[:-1]  # eggs -> egg, noodles -> noodle
            words.append(w)
    return words, sorted(set(sizes)), takeaway


def word_sim(a, b):
    return 1.0 if a == b else SequenceMatcher(None, a, b).ratio()


def name_score(new_text, old_text):
    nw, ns, _ = tokens(new_text)
    ow, osz, _ = tokens(old_text)
    if not nw or not ow:
        return 0.0
    # greedy fuzzy token alignment (order-insensitive, typo-tolerant)
    used, total = set(), 0.0
    for a in nw:
        best, bi = 0.0, None
        for i, b in enumerate(ow):
            if i in used:
                continue
            s = word_sim(a, b)
            if s > best:
                best, bi = s, i
        if bi is not None and best >= 0.75:
            used.add(bi)
            total += best
    score = 2 * total / (len(nw) + len(ow))
    if ns and osz and ns != osz:
        score *= 0.3            # different size: almost never the same item
    elif bool(ns) != bool(osz):
        score *= 0.92           # size on one side only ("Sprite (Small)" vs "Sprite")
    return round(score, 3)


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return [{k.strip().lower(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def to_int(v, default=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def to_money(v):
    v = (v or "").replace(",", "").replace("Rs", "").replace("LKR", "").strip()
    try:
        return round(float(v), 2)
    except ValueError:
        return None


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    new_rows = read_csv(sys.argv[1])
    old_rows = read_csv(sys.argv[2])
    out = Path(sys.argv[3])
    overrides = {}
    ov_path = Path(sys.argv[1]).with_name("menu_overrides.csv")
    if ov_path.exists():
        overrides = {r["new_key"]: r["old_item_id"] for r in read_csv(ov_path)}

    # ---- new menu
    new_items = []
    for r in new_rows:
        if not r.get("name"):
            continue
        active = r.get("active", "").lower()
        visible = active in ("yes", "y", "true", "1", "")
        price = to_money(r.get("price_lkr"))
        key = f"{clean(r['category'])} / {display_name(r['name'], r.get('size', ''))}"
        new_items.append({
            "key": key,
            "category": clean(r["category"]),
            "category_order": to_int(r.get("category_order")),
            "item_order": to_int(r.get("item_order")),
            "name": display_name(r["name"], r.get("size", "")),
            "price": price,
            "visible": visible and price is not None,
            "active_raw": r.get("active", ""),
            "description": clean(r.get("description", "")) or None,
            "note": clean(r.get("note", "")),
        })
    dupe_keys = {k for k in [n["key"] for n in new_items] if [n["key"] for n in new_items].count(k) > 1}
    if dupe_keys:
        sys.exit(f"New menu has duplicate category/name rows: {sorted(dupe_keys)}")

    # ---- current menu
    olds, internal = [], []
    for r in old_rows:
        item = {
            "id": r["item_id"], "name": r["item_name"], "category": r["category"],
            "category_id": r["category_id"], "price": to_money(r["price"]),
            "available": r["is_available"].lower() in ("true", "t", "yes"),
            "recipe_lines": to_int(r["recipe_lines"]), "sold_qty": to_int(r["sold_qty"]),
            "takeaway": tokens(r["item_name"])[2],
        }
        (internal if r["category"].strip().lower() in INTERNAL_CATEGORIES else olds).append(item)
    old_by_id = {o["id"]: o for o in olds}

    # ---- categories: rename an old one when the name is (nearly) the same
    new_cats = {}
    for n in new_items:
        new_cats.setdefault(n["category"], n["category_order"])
    old_cats = {}
    for r in old_rows:
        old_cats.setdefault(r["category"], r["category_id"])
    cat_plan, used_old_cats = [], set()
    for cname, corder in sorted(new_cats.items(), key=lambda x: x[1]):
        best, best_id, best_name = 0.0, None, None
        for oname, oid in old_cats.items():
            if oname.lower() in INTERNAL_CATEGORIES or oid in used_old_cats:
                continue
            s = name_score(cname, oname) if clean(cname).lower() != clean(oname).lower() else 1.0
            if s > best:
                best, best_id, best_name = s, oid, oname
        if best >= 0.85:
            used_old_cats.add(best_id)
            cat_plan.append({"name": cname, "sort_order": corder, "old_id": best_id, "old_name": best_name,
                             "action": "KEEP" if best_name == cname else "RENAME"})
        else:
            cat_plan.append({"name": cname, "sort_order": corder, "old_id": None, "old_name": None, "action": "CREATE"})

    # ---- score every (new, old) pair
    pairs = []
    for ni, n in enumerate(new_items):
        for o in olds:
            s = name_score(n["name"], o["name"])
            if clean(n["category"]).lower() == clean(o["category"]).lower():
                s = min(1.0, s + 0.03)
            if o["takeaway"]:
                s = round(s * 0.97, 3)
            if s >= 0.6:
                gap = abs((n["price"] or 0) - (o["price"] or 0)) if n["price"] and o["price"] else 1e9
                pairs.append((s, -gap, ni, o["id"]))
    # best score first; equal scores (e.g. an unsized old item vs the M and L
    # versions) go to the new item with the closest price
    pairs.sort(reverse=True)
    pairs = [(s, ni, oid) for s, _gap, ni, oid in pairs]

    # each old item belongs to the new item it matches best
    owner = {}
    for s, ni, oid in pairs:
        if oid not in owner:
            owner[oid] = (ni, s)
    # overrides win
    forced = {}
    for n_i, n in enumerate(new_items):
        if n["key"] in overrides:
            forced[n_i] = overrides[n["key"]]
    for ni, oid in forced.items():
        if oid and oid != "-" and oid in old_by_id:
            owner[oid] = (ni, 1.0)

    groups = {}
    for oid, (ni, s) in owner.items():
        groups.setdefault(ni, []).append((oid, s))

    review, plan_items, kept = [], [], set()
    for ni, n in sorted(enumerate(new_items), key=lambda x: (x[1]["category_order"], x[1]["item_order"])):
        cands = groups.get(ni, [])
        if forced.get(ni) == "-":
            cands = []
        # keeper: recipe links, then sales, then not-takeaway, then match score
        def closeness(oid):
            op = old_by_id[oid]["price"]
            return -abs((n["price"] or 0) - (op or 0)) if n["price"] is not None and op is not None else -1e9
        # only near-best name matches compete for keeper; among those: recipe
        # links, then sales, then not-takeaway, then score, then price
        if cands:
            best = max(c[1] for c in cands)
            top = [c for c in cands if c[1] >= best - 0.1]
            rest = [c for c in cands if c[1] < best - 0.1]
            top.sort(key=lambda c: (old_by_id[c[0]]["recipe_lines"] > 0, old_by_id[c[0]]["sold_qty"],
                                    not old_by_id[c[0]]["takeaway"], c[1], closeness(c[0])), reverse=True)
            cands = top + sorted(rest, key=lambda c: c[1], reverse=True)
            if forced.get(ni) in old_by_id:  # a manual match always keeps the item
                cands.sort(key=lambda c: c[0] != forced[ni])
        base = {"new_category": n["category"], "new_name": n["name"],
                "new_price": "" if n["price"] is None else f"{n['price']:.2f}",
                "new_visible": "yes" if n["visible"] else "HIDDEN (price TBD)" if "tbd" in n["active_raw"].lower() else "HIDDEN",
                "new_key": n["key"]}
        if not cands:
            review.append({**base, "action": "NEW", "confidence": "MANUAL" if forced.get(ni) == "-" else "",
                           "score": "", "note": "set to NEW by hand (menu_overrides.csv)" if forced.get(ni) == "-" else ""})
            plan_items.append({**n, "action": "NEW", "old_id": None})
            continue
        keep_id, keep_s = cands[0]
        o = old_by_id[keep_id]
        kept.add(keep_id)
        conf = "high" if keep_s >= 0.85 else "CHECK" if keep_s >= 0.7 else "LOW — CHECK"
        if bool(tokens(n["name"])[1]) != bool(tokens(o["name"])[1]) and conf == "high":
            conf = "CHECK (size)"
        if forced.get(ni) == keep_id:
            conf = "MANUAL"
        price_change = ""
        if n["price"] is not None and o["price"] is not None and n["price"] != o["price"]:
            price_change = f"{n['price'] - o['price']:+.2f}"
        note = "price TBD — keeps old price, hidden" if n["price"] is None else ""
        review.append({**base, "action": "MATCH", "confidence": conf, "score": keep_s,
                       "old_item_id": keep_id, "old_category": o["category"], "old_name": o["name"],
                       "old_price": o["price"], "price_change": price_change,
                       "recipe_lines": o["recipe_lines"], "sold_qty": o["sold_qty"], "note": note})
        plan_items.append({**n, "action": "MATCH", "old_id": keep_id})
        for dup_id, dup_s in cands[1:]:
            d = old_by_id[dup_id]
            if dup_s < 0.85 or tokens(d["name"])[1] != tokens(n["name"])[1]:
                continue  # not really the same item — reported below as "not in new menu"
            review.append({"action": "HIDE (duplicate)", "confidence": "high" if dup_s >= 0.85 else "CHECK",
                           "score": dup_s, "new_category": n["category"], "new_name": f"↳ duplicate of {n['name']}",
                           "new_key": n["key"], "old_item_id": dup_id, "old_category": d["category"],
                           "old_name": d["name"], "old_price": d["price"], "recipe_lines": d["recipe_lines"],
                           "sold_qty": d["sold_qty"],
                           "note": "takeaway duplicate" if d["takeaway"] else
                                   ("HAS RECIPE LINES — recipe not moved" if d["recipe_lines"] else "")})
            plan_items.append({"action": "HIDE", "old_id": dup_id, "reason": f"duplicate of {n['name']}"})
            kept.add(dup_id)

    for o in sorted(olds, key=lambda x: (x["category"], x["name"])):
        if o["id"] in kept:
            continue
        review.append({"action": "HIDE (not in new menu)",
                       "confidence": f"SOLD {o['sold_qty']} — check" if o["sold_qty"] >= 5 else "",
                       "old_item_id": o["id"], "old_category": o["category"],
                       "old_name": o["name"], "old_price": o["price"], "recipe_lines": o["recipe_lines"],
                       "sold_qty": o["sold_qty"],
                       "note": "takeaway duplicate" if o["takeaway"] else
                               ("HAS RECIPE LINES" if o["recipe_lines"] else "")})
        plan_items.append({"action": "HIDE", "old_id": o["id"], "reason": "not in new menu"})

    cols = ["action", "confidence", "score", "new_category", "new_name", "new_price", "new_visible",
            "old_category", "old_name", "old_price", "price_change", "recipe_lines", "sold_qty", "note",
            "old_item_id", "new_key"]
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out.with_suffix(".csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for c in cat_plan:
            w.writerow({"action": f"CATEGORY {c['action']}", "new_category": c["name"],
                        "new_name": f"sort {c['sort_order']}", "old_category": c["old_name"] or ""})
        w.writerows(review)
        w.writerow({"action": "UNTOUCHED (internal)", "note": f"{len(internal)} items in internal categories"})

    plan = {"categories": cat_plan, "items": plan_items,
            "internal_untouched": [i["id"] for i in internal]}
    out.with_suffix(".json").write_text(json.dumps(plan, indent=1, ensure_ascii=False))

    acts = [r["action"] for r in review]
    print(f"new menu rows: {len(new_items)} | current items: {len(olds)} (+{len(internal)} internal, untouched)")
    print(f"categories: " + ", ".join(f"{a} {sum(1 for c in cat_plan if c['action'] == a)}"
                                     for a in ("KEEP", "RENAME", "CREATE")))
    for a in ("MATCH", "NEW", "HIDE (duplicate)", "HIDE (not in new menu)"):
        print(f"{a}: {acts.count(a)}")
    print(f"needs a look (CHECK / LOW): {sum(1 for r in review if 'CHECK' in str(r.get('confidence', '')))}")
    print(f"wrote {out.with_suffix('.csv')} and {out.with_suffix('.json')}")


if __name__ == "__main__":
    main()
