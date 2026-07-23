import type { Metadata } from "next";
import Marketplace from "@/components/Marketplace";
import { loadMarketplacePage } from "@/lib/productSearchDb";
import type { ProductCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Every piece Maison places in a render is a real product. Browse the curated catalog by style and category.",
};

// Always query the current catalog — a stale build-time snapshot would hide
// products added since the last seed run.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 48;
const KNOWN_CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "textile", "decor",
];

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; style?: string; page?: string }>;
}) {
  const params = await searchParams;
  const category = KNOWN_CATEGORIES.includes(params.category as ProductCategory)
    ? (params.category as ProductCategory)
    : undefined;
  const styleId = params.style && params.style !== "all" ? params.style : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const { products, totalCount } = await loadMarketplacePage({ category, styleId, page, pageSize: PAGE_SIZE });

  return (
    <Marketplace
      products={products}
      totalCount={totalCount}
      page={page}
      pageSize={PAGE_SIZE}
      category={category ?? "all"}
      styleId={styleId ?? "all"}
    />
  );
}
