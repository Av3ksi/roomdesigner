import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import PendingDetail from "@/components/PendingDetail";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = { title: "Creator Program Terms" };

/**
 * Placeholder, same posture as every other /legal/* page (see
 * components/LegalPage's own notice) — drafted to unblock the Creator
 * Program's consent checkbox (app/api/publish, Phase 2), not reviewed by a
 * lawyer. The two things that actually matter functionally, and must stay
 * true to what the code does regardless of wording changes here:
 *
 *  1. A submission is reviewed before it is public (clause 2) — this is
 *     what justifies finished_rooms.moderation_status defaulting a
 *     community row to 'pending' rather than publishing on submit.
 *  2. The image-rights grant (clause 3) is what makes displaying a
 *     customer's own room photo publicly, and in marketing, lawful — do
 *     not weaken this clause without checking every place a community
 *     look's photo is actually used.
 */
export default function TermsContestPage() {
  const e = VISTROOM_ENTITY;

  return (
    <LegalPage title="Creator Program Terms" lastUpdated="16 October 2026">
      <p>
        These terms apply only if you submit a room to the Vistroom Creator Program — the "Submit look"
        option when publishing your room. Publishing a room without submitting it to the Creator Program is
        governed by our general <a href="/legal/terms">Terms of Service</a> alone; nothing here changes that.
      </p>

      <h2>1. What submitting means</h2>
      <p>
        By submitting a look, you confirm the photo and the room shown are genuinely yours, and that you
        have the right to share them. You are not transferring ownership of your photo — you are granting{" "}
        {e.legalName ?? <PendingDetail label="the registered operator" />} the rights described in clause 3
        below.
      </p>

      <h2>2. Review before publication</h2>
      <p>
        A submitted look is not published automatically. We review every submission before it appears
        publicly or becomes eligible for any reward or the monthly contest. We may reject a submission —
        including for image quality, content that doesn't meet clause 4 below, or any other reasonable
        reason — without that reflecting on you personally. A rejected look is never made public.
      </p>

      <h2>3. The rights you grant</h2>
      <p>
        For any look we approve, you grant us a non-exclusive, worldwide, royalty-free licence to display
        it on Vistroom (including the Creator Gallery and any monthly contest), and in our own marketing of
        the service, for as long as it remains published. You may request removal at any time; see clause 6.
      </p>

      <h2>4. What your photo must not contain</h2>
      <p>
        Do not submit a photo showing any person, a face, an ID or passport, a document containing personal
        or financial information, or anything revealing your home address (a visible street sign, house
        number, or piece of mail). A submission containing any of these will be rejected.
      </p>

      <h2>5. Rewards</h2>
      <p>
        An approved look may earn credits, a discount code, or a badge, and may be entered into that
        month's contest. Exact values and limits are configured in-app and may change; they are shown to you
        at the time you submit, not fixed by this document.
      </p>

      <h2>6. Removal</h2>
      <p>
        You may ask us to remove a published look at any time by contacting{" "}
        <a href={`mailto:${e.email}`}>{e.email}</a>. Any reward already granted for it is not reversed by a
        later removal request.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms. A look you already submitted remains governed by the version you
        accepted at submission time; a future submission is governed by whatever version is current then.
      </p>
    </LegalPage>
  );
}
