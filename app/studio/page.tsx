import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "Design Studio",
  description:
    "Upload a photo of your room and let Maison's AI analyze the space and design it back to you.",
};

export default function StudioPage() {
  return <Studio />;
}
