import type { Metadata } from "next";
import SupplierCatalogPreview from "@/components/SupplierCatalogPreview";
import { fetchVidaxlCatalog } from "@/lib/suppliers";

export const metadata: Metadata = {
  title: "Supplier Catalog Preview",
  description: "Internal preview of the dropship supplier ingestion pipeline.",
};

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const catalog = await fetchVidaxlCatalog();
  return <SupplierCatalogPreview catalog={catalog} />;
}
