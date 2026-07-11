import type { Metadata } from "next";
import ConsultationBooking from "@/components/ConsultationBooking";

export const metadata: Metadata = {
  title: "Book a Design Consultation",
  description: "Bring in a Maison designer for a virtual walkthrough, style advice call, or in-home visit.",
};

export default function ConsultationPage() {
  return <ConsultationBooking />;
}
