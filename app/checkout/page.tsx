import type { Metadata } from "next";
import Checkout from "@/components/Checkout";

export const metadata: Metadata = {
  title: "Checkout",
  description:
    "Your shopping list, delivery window and installation options — the last step between you and your new room.",
};

export default function CheckoutPage() {
  return <Checkout />;
}
