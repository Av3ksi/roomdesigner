import type { Metadata } from "next";
import MyRooms from "@/components/MyRooms";

export const metadata: Metadata = {
  title: "My Collection",
  description: "Every room you've saved from the Designer — private until you choose to publish it.",
};

export default function MyRoomsPage() {
  return <MyRooms />;
}
