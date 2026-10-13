import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/session";
import PublishForm from "@/components/PublishForm";

export const metadata: Metadata = {
  title: "Publish your room",
  description: "Share your finished room for inspiration — tag the products you used, and other customers can shop the whole look.",
};
export const dynamic = "force-dynamic";

export default async function PublishPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Publish</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Share your room.</h1>
        <p className="mt-4 text-cream-dim">
          Upload a photo of your finished room, tag the pieces you used, and it joins{" "}
          <span className="text-cream">Complete Rooms</span> for other customers to browse and shop.
        </p>
      </div>
      <PublishForm />
    </div>
  );
}
