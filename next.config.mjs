/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // VidaXL's own product photo CDNs, used by the supplier feed sample
      // (lib/suppliers/data/vidaxl-sample.json) and the live REST adapter.
      { protocol: "https", hostname: "vdxl.im" },
      { protocol: "https", hostname: "images.salsify.com" },
    ],
  },
};

export default nextConfig;
