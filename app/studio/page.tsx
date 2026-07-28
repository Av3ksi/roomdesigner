import { redirect } from "next/navigation";

/**
 * Retired — the procedural style-preview flow this used to serve is now
 * folded into /designer, which edits your actual room photo instead of
 * drawing a stylized stand-in. Old links/bookmarks land on the real thing.
 */
export default function StudioPage() {
  redirect("/designer");
}
