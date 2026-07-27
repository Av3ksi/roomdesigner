import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-14">
      <div className="w-full max-w-sm">
        <div className="eyebrow mb-3 text-center">Sign in</div>
        <h1 className="text-center font-display text-3xl leading-tight">Welcome back.</h1>
        <p className="mt-3 text-center text-sm text-cream-dim">
          No password — we&apos;ll email you a one-time link.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
