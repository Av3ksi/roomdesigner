/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // VidaXL's own product photo CDNs, used by the supplier feed sample
      // (lib/suppliers/data/vidaxl-sample.json) and the live REST adapter.
      // Wildcarded because VidaXL serves images from multiple subdomains
      // (vdxl.im, acc.vdxl.im, and others we haven't seen yet).
      { protocol: "https", hostname: "*.vdxl.im" },
      { protocol: "https", hostname: "vdxl.im" },
      { protocol: "https", hostname: "images.salsify.com" },
    ],
  },
};

export default nextConfig;
