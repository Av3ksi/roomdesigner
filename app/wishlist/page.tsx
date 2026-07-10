import type { Metadata } from "next";
import Wishlist from "@/components/Wishlist";

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Products you've saved from the Studio, the immersive room and the Marketplace.",
};

export default function WishlistPage() {
  return <Wishlist />;
}
