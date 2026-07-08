import type { Metadata } from "next";
import Marketplace from "@/components/Marketplace";

export const metadata: Metadata = {
  title: "Marketplace",
  description:
    "Every piece Maison places in a render is a real product. Browse the curated catalog by style and category.",
};

export default function MarketplacePage() {
  return <Marketplace />;
}
