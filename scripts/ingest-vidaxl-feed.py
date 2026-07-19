#!/usr/bin/env python3
"""
Streams VidaXL's Main Feed CSV (1GB+, the full multi-category wholesale
catalog) row by row -- never loads the whole file into memory -- joins each
row against the smaller Stock & Price feed by SKU, filters to in-stock
products in home/furniture-relevant categories, and writes a small trimmed
JSON dataset plus a category frequency report.

This is a two-pass workflow by design:
  1. Run this once with the starter CATEGORY_ALLOWLIST below. It'll match
     *something*, and category_report.txt will show every top-level
     category actually present in the catalog with counts.
  2. Look at category_report.txt, tighten/widen CATEGORY_ALLOWLIST to
     match the real German category names, and re-run for the real
     dataset.

Usage:
    python3 ingest-vidaxl-feed.py /path/to/vidaXL_ch_de_dropshipping.csv /path/to/vidaXL_ch_de_dropshipping_offer.csv

Writes (into the current directory):
    vidaxl_catalog.json    -- trimmed, matched, in-stock products
    category_report.txt    -- every top-level category seen, with counts
"""

import csv
import json
import re
import sys
from collections import Counter

# Confirmed against a real category_report.txt run: "Möbel" (furniture,
# 242,502 products) and "Heim & Garten" (home & garden, 53,296) are the two
# dominant, clearly relevant top-level categories. Everything else in the
# catalog (Heimwerkerbedarf/DIY tools, Sportartikel, Tier- & Haustierbedarf/
# pet supplies, Spielzeuge/toys, Bekleidung/clothing, etc.) is irrelevant to
# an interior design catalog and deliberately excluded.
CATEGORY_ALLOWLIST = [
    "Möbel",
    "Heim & Garten",
]

# The first real run (top-level allowlist only) surfaced a lot of garden
# furniture, bathroom furniture sets, bath towels, and Christmas ornaments
# -- all technically under "Möbel"/"Heim & Garten" but not living-room/
# bedroom-relevant. Exclude those specific subcategories (matched anywhere
# in the full category path), confirmed present from that run's output.
SUBCATEGORY_DENYLIST = [
    "Gartenmöbel",           # garden furniture
    "Rasen & Garten",        # lawn & garden
    "Gartenbauten",          # garden structures (pavilions, etc.)
    "Haushaltswäsche",       # household linens -- towels, bedsheets
    "Möbelgarnituren",       # was entirely bathroom furniture sets in practice
    "Festtags-Dekoartikel",  # seasonal/holiday decor (Christmas ornaments)
]

# Möbel alone matched 242k+ products before stock/price filtering. The
# original 200-item cap proved the workflow end to end but turned out too
# small in practice: scanning the CSV in file order, it exhausted the cap
# on early subcategories (storage, decor) before ever reaching rows for
# lighting, rugs, art or plants later in the file -- a real "complete
# room" bundle needs those categories, so raise the cap enough that a full
# scan actually reaches a representative spread of the whole catalog.
MAX_MATCHES = 3000

# The first real run's SKU-ordered scan exhausted the whole 200-item cap on
# towels alone before reaching any other subcategory -- cap how many
# products can come from any single second-level category so the sample
# actually covers a spread of furniture types instead of one product line.
MAX_PER_SUBCATEGORY = 15


def load_offer_feed(path):
    by_sku = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            by_sku[row["SKU"]] = row
    return by_sku


def matches_allowlist(category_text):
    top_level = category_text.split(">")[0].strip()
    if not any(top_level.lower() == term.lower() for term in CATEGORY_ALLOWLIST):
        return False
    return not any(term.lower() in category_text.lower() for term in SUBCATEGORY_DENYLIST)


def subcategory_of(category_text):
    parts = category_text.split(">")
    return parts[1].strip() if len(parts) > 1 else "(none)"


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_dimensions_cm(size_text):
    """Parses VidaXL's free-text Size column ("112 x 33,5 x 70 cm",
    "220 x 250 cm") into {l, w, h} in cm. German feed uses a decimal comma
    (33,5 = 33.5), not a thousands separator -- normalize before matching.
    Two numbers (common for flat items like rugs/throws) leaves h at 0.
    Returns None if fewer than two numbers are found -- no real dimension
    data to work with, better to omit the field than guess."""
    if not size_text:
        return None
    normalized = re.sub(r"(\d),(\d)", r"\1.\2", size_text)
    numbers = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", normalized)]
    if len(numbers) < 2:
        return None
    l, w = numbers[0], numbers[1]
    h = numbers[2] if len(numbers) >= 3 else 0
    return {"l": l, "w": w, "h": h}


def main():
    if len(sys.argv) != 3:
        print("Usage: python3 ingest-vidaxl-feed.py <main_feed.csv> <offer_feed.csv>")
        sys.exit(1)

    main_feed_path, offer_feed_path = sys.argv[1], sys.argv[2]

    print("Loading stock/price feed...")
    offers = load_offer_feed(offer_feed_path)
    print(f"  {len(offers):,} SKUs loaded")

    top_level_counts = Counter()
    subcategory_counts = Counter()
    matched_subcategory_counts = Counter()
    matched = []
    total_seen = 0
    image_columns = None

    print("Streaming Main Feed (this can take a few minutes for 1.65 GB)...")
    with open(main_feed_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        image_columns = [
            name for name in reader.fieldnames
            if name and re.match(r"^image\s*\d+$", name.strip(), re.IGNORECASE)
        ]

        stopped_early = False
        for row in reader:
            total_seen += 1
            if total_seen % 50000 == 0:
                print(f"  ...{total_seen:,} rows scanned, {len(matched):,} matched so far")

            category = row.get("Category", "") or ""
            top_level = category.split(">")[0].strip() if category else "(none)"
            top_level_counts[top_level] += 1
            subcategory = subcategory_of(category)
            if top_level in CATEGORY_ALLOWLIST:
                subcategory_counts[subcategory] += 1

            if not matches_allowlist(category):
                continue

            if matched_subcategory_counts[subcategory] >= MAX_PER_SUBCATEGORY:
                continue

            sku = row.get("SKU", "")
            offer = offers.get(sku)
            stock = int(offer["Stock"]) if offer and (offer.get("Stock") or "").strip().isdigit() else 0
            if stock <= 0:
                continue

            b2b_price = to_float(offer.get("B2B price")) if offer else None
            if not b2b_price or b2b_price <= 0:
                continue

            images = [row[col].strip() for col in image_columns if row.get(col) and row[col].strip()]
            if not images:
                continue  # the whole point of this feed over the REST API is real photos

            matched_subcategory_counts[subcategory] += 1
            matched.append({
                "sku": sku,
                "title": row.get("Title", ""),
                "productUrl": row.get("Link", ""),
                "category": category,
                "description": (row.get("Description", "") or "")[:500],
                "color": row.get("Color", ""),
                "weightKg": to_float(row.get("Weight")),
                "dimensionsCm": parse_dimensions_cm(row.get("Size", "")),
                "brand": row.get("Brand", "") or "vidaXL",
                "costPrice": b2b_price,
                "webshopPrice": to_float(offer.get("Webshop price")) if offer else None,
                "stock": stock,
                "images": images,
                "ean": row.get("EAN", ""),
                "packaging": row.get("Parcel_or_pallet", ""),
            })

            if len(matched) >= MAX_MATCHES:
                stopped_early = True
                break

    if stopped_early:
        print(f"\nHit the {MAX_MATCHES}-product cap after scanning {total_seen:,} rows -- stopped early.")
    else:
        print(f"\nScanned the whole file: {total_seen:,} rows, {len(matched):,} matched.")

    with open("vidaxl_catalog.json", "w", encoding="utf-8") as f:
        json.dump(matched, f, ensure_ascii=False, indent=2)
    print("Wrote vidaxl_catalog.json")

    with open("category_report.txt", "w", encoding="utf-8") as f:
        if stopped_early:
            f.write(f"NOTE: stopped early after {MAX_MATCHES} matches -- counts below only cover the first {total_seen:,} rows, not the whole file.\n\n")
        f.write("Top-level categories seen:\n")
        for cat, count in top_level_counts.most_common():
            f.write(f"{count:>8,}  {cat}\n")
        f.write("\nSubcategories actually included in vidaxl_catalog.json:\n")
        for cat, count in matched_subcategory_counts.most_common():
            f.write(f"{count:>8,}  {cat}\n")
        f.write("\nSubcategories seen under Möbel/Heim & Garten (scanned rows, before the denylist):\n")
        for cat, count in subcategory_counts.most_common(60):
            f.write(f"{count:>8,}  {cat}\n")
    print("Wrote category_report.txt")


if __name__ == "__main__":
    main()
