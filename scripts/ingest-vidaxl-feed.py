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

Writes:
    scripts/data/vidaxl-full.json          -- the FULL matched catalog
                                              (gitignored; seed into Postgres
                                              via scripts/seed-products.ts)
    lib/suppliers/data/vidaxl-sample.json  -- a small category-balanced sample
                                              (committed; bundled fallback for
                                              when Postgres isn't seeded)
    category_report.txt                    -- every top-level category seen,
                                              with counts (current directory)
"""

import csv
import json
import os
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
    "Möbelgarnituren",       # was entirely bathroom furniture sets in practice
    "Festtags-Dekoartikel",  # seasonal/holiday decor (Christmas ornaments)
]
# "Haushaltswäsche" (household linens) was originally denylisted because a
# towel flood ate the whole sample cap. It's ALSO where cushions/decorative
# pillows live -- products the finished-room bundles actively want to sell.
# MAX_PER_SUBCATEGORY now prevents the flood on its own, so linens are
# allowed back in, capped like everything else.

# Overall ceiling across the whole run. High enough that MAX_PER_SUBCATEGORY
# (not this) is the binding constraint -- we want depth per category, and the
# full catalog lives in Postgres now, not a bundled JSON, so size isn't a
# concern here.
MAX_MATCHES = 60000

# How many products to keep per second-level category for the FULL catalog
# (seeded into Postgres). This was 25 -- the binding cap that pinned the
# whole dataset at ~800 products, with nearly every subcategory stuck at
# exactly 25. Raising it to 400 is the core "make the catalog bigger" lever:
# it pulls 10-30x more real VidaXL inventory per category. The bigger the
# catalog, the more room items the AI matches to OUR products (margin) rather
# than web-sourcing them (no margin) -- see the finished-rooms detection flow.
MAX_PER_SUBCATEGORY = 400

# The BUNDLED sample (lib/suppliers/data/vidaxl-sample.json) is only a
# fallback for when Postgres isn't seeded -- it ships in the repo and the
# Next build, so it must stay small. Keep just a few per subcategory: enough
# to demo every category end to end, small enough not to bloat git or the
# bundle. The real breadth is in the DB, seeded from the full file below.
MAX_SAMPLE_PER_SUBCATEGORY = 3


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
    sample_subcategory_counts = Counter()
    matched = []
    sample = []  # small, category-balanced subset for the bundled fallback
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
            product = {
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
            }
            matched.append(product)

            # Keep the first few of each subcategory for the bundled fallback sample.
            if sample_subcategory_counts[subcategory] < MAX_SAMPLE_PER_SUBCATEGORY:
                sample_subcategory_counts[subcategory] += 1
                sample.append(product)

            if len(matched) >= MAX_MATCHES:
                stopped_early = True
                break

    if stopped_early:
        print(f"\nHit the {MAX_MATCHES}-product cap after scanning {total_seen:,} rows -- stopped early.")
    else:
        print(f"\nScanned the whole file: {total_seen:,} rows, {len(matched):,} matched.")

    script_dir = os.path.dirname(os.path.abspath(__file__))

    # FULL catalog -> scripts/data/vidaxl-full.json. This is what
    # scripts/seed-products.ts loads into Postgres. It's gitignored and never
    # bundled into the Next build, so it can be tens of thousands of products
    # without bloating the repo. This is the real catalog.
    full_dir = os.path.join(script_dir, "data")
    os.makedirs(full_dir, exist_ok=True)
    full_path = os.path.join(full_dir, "vidaxl-full.json")
    with open(full_path, "w", encoding="utf-8") as f:
        json.dump(matched, f, ensure_ascii=False, indent=2)
    print(f"Wrote {os.path.normpath(full_path)} ({len(matched):,} products) -- seed it with: npx tsx scripts/seed-products.ts")

    # SMALL, category-balanced sample -> lib/suppliers/data/vidaxl-sample.json.
    # This ships in the repo and the build as a fallback for when Postgres
    # isn't seeded, so it's kept deliberately small.
    sample_path = os.path.join(script_dir, "..", "lib", "suppliers", "data", "vidaxl-sample.json")
    with open(sample_path, "w", encoding="utf-8") as f:
        json.dump(sample, f, ensure_ascii=False, indent=2)
    print(f"Wrote {os.path.normpath(sample_path)} ({len(sample):,} products, bundled fallback)")

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
