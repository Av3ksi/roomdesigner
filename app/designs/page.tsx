import type { Metadata } from "next";
import SavedDesigns from "@/components/SavedDesigns";

export const metadata: Metadata = {
  title: "My Designs",
  description: "Every room you've saved, re-opened, shared or compared side by side.",
};

export default function DesignsPage() {
  return <SavedDesigns />;
}
