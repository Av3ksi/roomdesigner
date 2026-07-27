import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Imprint" };

export default function ImprintPage() {
  return (
    <LegalPage title="Imprint" lastUpdated="Draft">
      <p>
        Legally required disclosure of who operates this site (an "Impressum" under Swiss/German/Austrian law).
        Replace every bracketed field below with your real registered details before launch.
      </p>

      <h2>Operator</h2>
      <ul>
        <li>[Your registered company name, or your full legal name if a sole proprietorship]</li>
        <li>[Street address]</li>
        <li>[Postal code, city, canton/country]</li>
        <li>[Commercial register number / UID, if registered]</li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>Email: [support@yourdomain.tld]</li>
        <li>Phone: [optional, but expected for a consumer store]</li>
      </ul>

      <h2>Responsible for content</h2>
      <p>[Name of the person responsible for the site's content, per Swiss/EU disclosure requirements.]</p>

      <h2>Dispute resolution</h2>
      <p>
        [State whether you participate in an online dispute resolution platform, and/or your position on
        consumer arbitration — required disclosure in several jurisdictions.]
      </p>
    </LegalPage>
  );
}
