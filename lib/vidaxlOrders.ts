import { vidaxlAuthHeader, vidaxlBaseUrl, vidaxlEnabled } from "./suppliers/vidaxl";
import type { Product } from "./types";
import type { OrderRecord } from "./orders";

export { vidaxlEnabled };

export interface VidaxlOrderResult {
  vidaxlOrderId: string;
}

/**
 * Places the order with VidaXL via POST /api_customer/orders so nobody has
 * to manually re-key a paid Vistroom order into their dashboard.
 *
 * IMPORTANT: unlike lib/suppliers/vidaxl.ts's product-catalog fetch (which
 * is wired against VidaXL's real, confirmed API docs), this request body
 * shape is NOT verified against real docs or a sandbox response — VidaXL's
 * order-creation endpoint docs weren't available while building this.
 * It's a best-effort, conventional "line items + ship-to address" shape.
 * Test it against the sandbox (VIDAXL_API_URL=https://sandbox.b2b.dropxl.com)
 * and adjust field names to match the real response before trusting this
 * with production orders.
 *
 * Also: VidaXL's own API still requires a human to pay the resulting
 * invoice in their dashboard under "Unsubmitted orders" — this automates
 * order *creation* only, not supplier payment.
 */
export async function createVidaxlOrder(order: OrderRecord, products: Product[]): Promise<VidaxlOrderResult> {
  if (!vidaxlEnabled()) {
    throw new Error("VidaXL API not configured (needs VIDAXL_API_URL, VIDAXL_ACCOUNT_EMAIL, VIDAXL_API_KEY).");
  }
  if (!order.shippingAddress || !order.shippingName) {
    throw new Error("Order has no shipping address to fulfil.");
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const items = order.lineItems
    .map((li) => {
      const product = productById.get(li.productId);
      if (!product?.supplier) return null;
      return { sku: product.supplier.sku, quantity: li.qty };
    })
    .filter((i): i is { sku: string; quantity: number } => i !== null);

  if (items.length === 0) {
    throw new Error("None of this order's items have a VidaXL SKU to fulfil.");
  }

  const address = order.shippingAddress;
  const res = await fetch(`${vidaxlBaseUrl()}/api_customer/orders`, {
    method: "POST",
    headers: { Authorization: vidaxlAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      reference: order.id,
      items,
      shipping_address: {
        name: order.shippingName,
        address1: address.line1,
        address2: address.line2 ?? undefined,
        city: address.city ?? undefined,
        zip: address.postal_code ?? undefined,
        country: address.country,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`VidaXL order API error: ${res.status} ${text.slice(0, 300)}`);
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string | number; order_id?: string | number };
  const id = data.id ?? data.order_id;
  if (id == null) throw new Error("VidaXL order API returned no order id.");
  return { vidaxlOrderId: String(id) };
}
