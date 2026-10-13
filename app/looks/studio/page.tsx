import type { Metadata } from "next";
import LooksStudio from "@/components/LooksStudio";
import { loadProductCatalog } from "@/lib/productSearchDb";

export const metadata: Metadata = {
  title: "Looks Studio",
  description: "Internal tool for curating Complete Rooms bundles.",
};

// Always load the current catalog — a stale build-time snapshot would
// hide products added since the last deploy.
export const dynamic = "force-dynamic";

export default async function LooksStudioPage() {
  const catalog = await loadProductCatalog();
  return <LooksStudio catalog={catalog} />;
}
