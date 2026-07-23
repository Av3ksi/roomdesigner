import type { Metadata } from "next";
import Designer from "@/components/Designer";

export const metadata: Metadata = {
  title: "Designer",
  description: "Talk to your room — the conversational AI interior designer.",
};

export default function DesignerPage() {
  return <Designer />;
}
