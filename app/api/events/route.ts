import { NextRequest, NextResponse } from "next/server";
import { EVENT_NAMES, trackEvent, type EventName } from "@/lib/events";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * The client-side half of lib/events.ts — for events that only exist in
 * the browser (page_view, and later try_look_clicked/product_clicked).
 * Anything trackable from a server route (look_generated, look_submitted,
 * ...) should call trackEvent() directly there instead of round-tripping
 * through this endpoint — "server-side where possible" per the spec this
 * was built against.
 *
 * user_id and anonymous_id are deliberately NEVER trusted from the request
 * body — they're read from this request's own session cookies, same as
 * every other route in this app, so a caller can't attribute an event to
 * someone else's account.
 */
function isKnownEvent(value: unknown): value is EventName {
  return typeof value === "string" && (EVENT_NAMES as readonly string[]).includes(value);
}

export async function POST(req: NextRequest) {
  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "events",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 200,
    ipLimit: 600,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!isKnownEvent(body?.eventName)) {
    return NextResponse.json({ error: "Unknown eventName" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const lookId = typeof body?.lookId === "string" ? body.lookId : null;
  const productId = typeof body?.productId === "string" ? body.productId : null;
  const properties = body?.properties && typeof body.properties === "object" ? body.properties : {};

  await trackEvent({
    eventName: body.eventName,
    userId,
    anonymousId: sessionId,
    lookId,
    productId,
    properties,
  });

  return NextResponse.json({ ok: true });
}
