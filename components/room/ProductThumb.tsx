import ProductGlyph from "@/components/room/ProductGlyph";
import type { Product } from "@/lib/types";

/**
 * Product thumbnail: a real photo when the product has one (every catalog
 * product does — VidaXL, or any future supplier), falling back to the
 * procedural ProductGlyph only for the handful of demo products that were
 * never photographed. Every place that used to render ProductGlyph
 * unconditionally (Marketplace, cart, wishlist, boards) was silently
 * hiding real supplier photos behind a generic colored silhouette.
 */
export default function ProductThumb({ product, className }: { product: Product; className?: string }) {
  if (product.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={product.imageUrl} alt={product.name} className={`object-cover ${className ?? ""}`} />
    );
  }
  return <ProductGlyph product={product} className={className} />;
}
