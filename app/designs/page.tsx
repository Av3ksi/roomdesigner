import { redirect } from "next/navigation";

/**
 * Retired — the local-storage-only, procedural-Studio "My Designs" this
 * used to serve has no equivalent in the current photo-based Designer flow
 * (nothing writes to it anymore). My Collection replaces it: real saved
 * rooms, tied to your session/account, not just this browser's storage.
 */
export default function DesignsPage() {
  redirect("/my-rooms");
}
