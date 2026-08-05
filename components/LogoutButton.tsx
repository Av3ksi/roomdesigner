"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Hard nav — see LoginForm.tsx's comment: Nav's AccountWidget/CreditBadge
    // only fetch once on mount, so a soft navigation leaves them stale.
    window.location.href = "/";
  }

  return (
    <button onClick={logout} className="btn-ghost">
      Sign out
    </button>
  );
}
