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

# Starter allowlist -- matched case-insensitively against the start of each
# product's German category path (e.g. "Heim & Garten > ..."). This is a
# first pass, not a final scope decision -- see category_report.txt.
CATEGORY_ALLOWLIST = [
    "Möbel",
    "Beleuchtung",
    "Wohnaccessoires",
    "Deko",
    "Teppich",
    "Heimtextilien",
]


def load_offer_feed(path):
    by_sku = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            by_sku[row["SKU"]] = row
    return by_sku


def matches_allowlist(category_text):
    return any(term.lower() in category_text.lower() for term in CATEGORY_ALLOWLIST)


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main():
    if len(sys.argv) != 3:
        print("Usage: python3 ingest-vidaxl-feed.py <main_feed.csv> <offer_feed.csv>")
        sys.exit(1)

    main_feed_path, offer_feed_path = sys.argv[1], sys.argv[2]

    print("Loading stock/price feed...")
    offers = load_offer_feed(offer_feed_path)
    print(f"  {len(offers):,} SKUs loaded")

    top_level_counts = Counter()
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

        for row in reader:
            total_seen += 1
            if total_seen % 50000 == 0:
                print(f"  ...{total_seen:,} rows scanned, {len(matched):,} matched so far")

            category = row.get("Category", "") or ""
            top_level = category.split(">")[0].strip() if category else "(none)"
            top_level_counts[top_level] += 1

            if not matches_allowlist(category):
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

            matched.append({
                "sku": sku,
                "title": row.get("Title", ""),
                "category": category,
                "description": (row.get("Description", "") or "")[:500],
                "color": row.get("Color", ""),
                "weightKg": to_float(row.get("Weight")),
                "brand": row.get("Brand", "") or "vidaXL",
                "costPrice": b2b_price,
                "webshopPrice": to_float(offer.get("Webshop price")) if offer else None,
                "stock": stock,
                "images": images,
                "ean": row.get("EAN", ""),
                "packaging": row.get("Parcel_or_pallet", ""),
            })

    print(f"\nDone. {total_seen:,} rows scanned, {len(matched):,} matched the allowlist and are in stock.")

    with open("vidaxl_catalog.json", "w", encoding="utf-8") as f:
        json.dump(matched, f, ensure_ascii=False, indent=2)
    print("Wrote vidaxl_catalog.json")

    with open("category_report.txt", "w", encoding="utf-8") as f:
        for cat, count in top_level_counts.most_common():
            f.write(f"{count:>8,}  {cat}\n")
    print("Wrote category_report.txt -- review this to refine CATEGORY_ALLOWLIST")


if __name__ == "__main__":
    main()
