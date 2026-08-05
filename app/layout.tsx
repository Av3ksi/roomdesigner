import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CartDrawer from "@/components/CartDrawer";

export const metadata: Metadata = {
  title: {
    default: "Vistroom — Your AI Interior Designer",
    template: "%s · Vistroom",
  },
  description:
    "Upload a photo of your room. Vistroom's AI reads the space — dimensions, light, materials, furniture — and designs it back to you in eight signature styles, fully shoppable.",
  keywords: [
    "AI interior design",
    "room redesign",
    "virtual staging",
    "interior designer AI",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
        <CartDrawer />
      </body>
    </html>
  );
}
