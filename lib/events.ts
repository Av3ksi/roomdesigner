import { dbEnabled, ensureSchema, sql } from "./db";

/**
 * First-party product analytics — the event log the creator/community
 * gallery funnel and /admin/stats are built on (see lib/db.ts's `events`
 * table). Separate from lib/analytics.ts, which only fires consent-gated
 * Meta Pixel/Google Ads conversion events client-side and keeps no record
 * of its own; this is functional/operational analytics ("is this feature
 * working"), not advertising, so it is not gated behind the ad-tracking
 * consent banner — same footing as the session cookie itself.
 *
 * Degrades like every other integration here: no DATABASE_URL means
 * trackEvent silently no-ops rather than throwing, so instrumenting a route
 * can never be the reason that route breaks. A failed insert (DB reachable
 * but the write itself errors) is caught and logged for the same reason —
 * analytics must never take down the feature it's attached to.
 */

export const EVENT_NAMES = [
  "page_view",
  "signup",
  "upload_started",
  "look_generated",
  "look_submitted",
  "look_approved",
  "look_rejected",
  "try_look_clicked",
  "product_clicked",
  "checkout_started",
  "purchase_completed",
  "vote_cast",
  "discount_code_used",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface TrackEventInput {
  eventName: EventName;
  userId?: string | null;
  anonymousId?: string | null;
  lookId?: string | null;
  productId?: string | null;
  refCode?: string | null;
  /** Never put personal data in here — this is the one field that ends up in /admin/stats CSV exports verbatim. */
  properties?: Record<string, unknown>;
}

export async function trackEvent(input: TrackEventInput): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await ensureSchema();
    const db = sql();
    await db`
      INSERT INTO events (event_name, user_id, anonymous_id, look_id, product_id, ref_code, properties)
      VALUES (
        ${input.eventName},
        ${input.userId ?? null},
        ${input.anonymousId ?? null},
        ${input.lookId ?? null},
        ${input.productId ?? null},
        ${input.refCode ?? null},
        ${JSON.stringify(input.properties ?? {})}
      )
    `;
  } catch (err) {
    console.error("[vistroom] trackEvent failed:", err);
  }
}
