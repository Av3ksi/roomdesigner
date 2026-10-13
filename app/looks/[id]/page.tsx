import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LookDetail from "@/components/LookDetail";
import { getFinishedRoom } from "@/lib/finishedRooms";

// Must query the DB per-request — a build-time static render would 404
// every id that didn't exist yet at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const room = await getFinishedRoom(id);
  return { title: room?.title ?? "Complete Room" };
}

export default async function LookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = await getFinishedRoom(id);
  if (!room) notFound();
  return <LookDetail room={room} />;
}
