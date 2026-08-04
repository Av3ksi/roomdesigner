"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Magic link is the default for everyone — password is an opt-in reveal,
  // not a second prominent choice, since only one account (an owner/admin
  // set up via scripts/set-user-password.ts) actually has one. See
  // lib/auth.ts's module doc comment for why this exception exists at all.
  const [usePassword, setUsePassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      if (usePassword) {
        if (!password) {
          setError("Enter your password.");
          return;
        }
        const res = await fetch("/api/auth/login-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
        router.push("/account");
        router.refresh();
        return;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-xl border border-brass/30 bg-brass/5 p-5 text-center text-sm text-cream-dim">
        <Mail size={20} className="mx-auto mb-2 text-brass-bright" />
        Check <span className="text-cream">{email}</span> for a sign-in link. It expires in 15 minutes.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full rounded-lg border border-ink-line bg-ink-panel px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50"
      />
      {usePassword && (
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-ink-line bg-ink-panel px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50"
        />
      )}
      <button type="submit" disabled={sending} className="btn-primary w-full justify-center disabled:opacity-40">
        {sending ? "Signing in…" : usePassword ? "Sign in" : "Send sign-in link"}
      </button>
      {error && <p className="text-center text-xs text-rose-300">{error}</p>}
      <button
        type="button"
        onClick={() => {
          setUsePassword((v) => !v);
          setError(null);
        }}
        className="w-full text-center text-[11px] text-cream-faint underline-offset-2 hover:text-cream-dim hover:underline"
      >
        {usePassword ? "Use an email link instead" : "Have a password instead?"}
      </button>
    </form>
  );
}
