"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
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
      <button type="submit" disabled={sending} className="btn-primary w-full justify-center disabled:opacity-40">
        {sending ? "Sending…" : "Send sign-in link"}
      </button>
      {error && <p className="text-center text-xs text-rose-300">{error}</p>}
    </form>
  );
}
