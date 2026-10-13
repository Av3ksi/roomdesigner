import type { Metadata } from "next";
import MatchingPreview from "@/components/MatchingPreview";
import { fetchVidaxlCatalog } from "@/lib/suppliers";
import { SAMPLE_ROOMS } from "@/lib/rooms";

export const metadata: Metadata = {
  title: "Matching Preview",
  description: "Internal preview of the room-to-product matching step.",
};

export const dynamic = "force-dynamic";

export default async function MatchingPreviewPage() {
  const catalog = await fetchVidaxlCatalog();
  return <MatchingPreview catalog={catalog} rooms={SAMPLE_ROOMS} />;
}
