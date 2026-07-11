import type { Metadata } from "next";
import Boards from "@/components/Boards";

export const metadata: Metadata = {
  title: "Inspiration Boards",
  description: "Collect products across styles and rooms into named moodboards.",
};

export default function BoardsPage() {
  return <Boards />;
}
