import { NextRequest, NextResponse } from "next/server";
import { getOrderByStripeSession } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Backs the /checkout/success page. Reads the order we already created at
 * checkout-session time and report whatever status the webhook has since
 * set it to — 'pending' still means "Stripe hasn't told us it's paid yet,"
 * which is normal for the first second or two after redirect back, not an
 * error state.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "Missing session_id." }, { status: 400 });

  const order = await getOrderByStripeSession(sessionId);
  if (!order) return NextResponse.json({ order: null });

  return NextResponse.json({
    order: {
      id: order.id,
      email: order.email,
      totalPrice: order.totalPrice,
      currency: order.currency,
      status: order.status,
      productIds: order.productIds,
    },
  });
}
