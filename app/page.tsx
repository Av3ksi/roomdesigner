import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import Intelligence from "@/components/landing/Intelligence";
import ImmersiveTeaser from "@/components/landing/ImmersiveTeaser";
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
      <ImmersiveTeaser />
      <StyleShowcase />
      <BeyondTheRender />
      <Principles />
      <PricingSection />
      <CTA />
    </>
  );
}
