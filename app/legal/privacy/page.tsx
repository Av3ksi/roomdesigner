import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="Draft">
      <p>
        This describes what Maison collects and why, written to match what this app actually does technically —
        replace bracketed fields with your real details, and have a lawyer confirm it satisfies GDPR/Swiss FADP
        obligations for your actual customer base before launch.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>An anonymous session identifier (a cookie) so your room and cart survive a page refresh.</li>
        <li>If you create an account: your email address, used only to send you a one-time login link and order updates.</li>
        <li>Room photos you upload, and the products you select, to generate a design.</li>
        <li>At checkout: your email, shipping address, and order contents. Payment card details are handled entirely by our payment processor (Stripe) — we never see or store your card number.</li>
      </ul>

      <h2>Your room photos and AI processing</h2>
      <p>
        When you upload a room photo, it is sent to third-party AI providers to analyze the room and generate
        designs: Anthropic (Claude) for room analysis and product placement, and OpenAI (image generation) for
        compositing products into your photo. These providers process the image to return a result to us; we do
        not control their independent retention practices, and you should review their own privacy policies.
        [State here how long you retain uploaded photos and generated renders, and whether/how a user can
        request deletion.]
      </p>

      <h2>Third parties we share data with</h2>
      <ul>
        <li>Stripe — payment processing.</li>
        <li>Resend — transactional email (login links, order confirmations).</li>
        <li>Anthropic and OpenAI — AI room analysis and image generation, as described above.</li>
        <li>Our dropship supplier(s) (e.g. VidaXL) — your name and shipping address, to fulfill an order you place.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        [Describe the specific rights you're offering — access, correction, deletion, export — and how a user
        exercises them (e.g. an email address), consistent with GDPR/Swiss FADP as applicable to your customers.]
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: [privacy@yourdomain.tld]</p>
    </LegalPage>
  );
}
