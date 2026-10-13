import type { Metadata } from "next";
import Looks from "@/components/Looks";
import { listFinishedRooms } from "@/lib/finishedRooms";

export const metadata: Metadata = {
  title: "Complete Rooms",
  description: "Curated, finished room designs — real photos, real products, shop the whole look in one click.",
};

// Must query the DB per-request — a build-time static render would freeze
// the list at whatever finished rooms existed (or didn't) at build time.
export const dynamic = "force-dynamic";

export default async function LooksPage() {
  const rooms = await listFinishedRooms();
  return <Looks rooms={rooms} />;
}
