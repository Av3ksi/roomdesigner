"use client";

import Script from "next/script";
import { useConsentStore } from "@/lib/consentStore";

/**
 * Loads the Meta Pixel and Google Ads tag — and ONLY these, nothing else —
 * once the visitor has explicitly granted tracking consent. Before that,
 * this renders nothing and no script reaches the browser at all; there is
 * no "load but don't fire" middle state, because a script that's present
 * but merely dormant can still be inspected as evidence the site is
 * tracking without consent.
 *
 * Each platform is independently optional: set only the env var(s) for
 * the platform(s) you actually run ads on. See .env.example.
 */
export default function TrackingScripts() {
  const consent = useConsentStore((s) => s.trackingConsent);
  if (consent !== "granted") return null;

  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

  return (
    <>
      {pixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');`}
        </Script>
      )}
      {googleAdsId && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`} strategy="afterInteractive" />
          <Script id="google-ads-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${googleAdsId}');`}
          </Script>
        </>
      )}
    </>
  );
}
