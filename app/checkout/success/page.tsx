import type { Metadata } from "next";
import { Suspense } from "react";
import CheckoutSuccess from "@/components/CheckoutSuccess";

export const metadata: Metadata = { title: "Order confirmed" };

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="container-page py-20 text-center text-cream-dim">Confirming your order…</div>}>
      <CheckoutSuccess />
    </Suspense>
  );
}
