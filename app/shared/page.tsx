import type { Metadata } from "next";
import { Suspense } from "react";
import SharedDesignView from "@/components/SharedDesignView";

export const metadata: Metadata = {
  title: "Shared design",
  description: "A Maison room design, shared by link.",
};

export default function SharedPage() {
  return (
    <Suspense fallback={<div className="container-page py-20 text-center text-cream-dim">Loading design…</div>}>
      <SharedDesignView />
    </Suspense>
  );
}
