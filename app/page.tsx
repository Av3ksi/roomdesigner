import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Intelligence from "@/components/landing/Intelligence";
import ConversationTeaser from "@/components/landing/ConversationTeaser";
import BeyondTheRender from "@/components/landing/BeyondTheRender";
import StyleShowcase from "@/components/landing/StyleShowcase";
import Principles from "@/components/landing/Principles";
import PricingSection from "@/components/landing/PricingSection";
import CTA from "@/components/landing/CTA";

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Intelligence />
      <ConversationTeaser />
      <StyleShowcase />
      <BeyondTheRender />
      <Principles />
      <PricingSection />
      <CTA />
    </>
  );
}
