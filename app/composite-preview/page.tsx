import type { Metadata } from "next";
import CompositePreview from "@/components/CompositePreview";
import { fetchVidaxlCatalog } from "@/lib/suppliers";

export const metadata: Metadata = {
  title: "Compositing Preview",
  description: "Internal preview of the GPT-Image compositing step.",
};

export const dynamic = "force-dynamic";

export default async function CompositePreviewPage() {
  const catalog = await fetchVidaxlCatalog();
  return <CompositePreview catalog={catalog} />;
}
