import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const user = await getUserById(userId);
  if (!user) redirect("/login");

  return (
    <div className="container-page py-14">
      <div className="max-w-md">
        <div className="eyebrow mb-3">Account</div>
        <h1 className="font-display text-4xl leading-tight">Your account.</h1>
        <div className="mt-8 rounded-xl border border-ink-line bg-ink-panel p-5">
          <div className="text-xs text-cream-faint">Signed in as</div>
          <div className="mt-1 text-sm text-cream">{user.email}</div>
        </div>
        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
