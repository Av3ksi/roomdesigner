import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Crown } from "lucide-react";
import { getUserById } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";
import LogoutButton from "@/components/LogoutButton";
import UpgradeToPremiumButton from "@/components/UpgradeToPremiumButton";
import AccountBuyCreditsButton from "@/components/AccountBuyCreditsButton";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const user = await getUserById(userId);
  if (!user) redirect("/login");

  const credits = user.isPremium ? null : await getCreditBalance(await getOrCreateSessionId());
  const { upgraded } = await searchParams;

  return (
    <div className="container-page py-14">
      <div className="max-w-md">
        <div className="eyebrow mb-3">Account</div>
        <h1 className="font-display text-4xl leading-tight">Your account.</h1>

        {upgraded && !user.isPremium && (
          <p className="mt-4 text-xs text-cream-faint">
            Payment received — this can take a few seconds to confirm. Refresh if it doesn&apos;t update shortly.
          </p>
        )}

        <div className="mt-8 rounded-xl border border-ink-line bg-ink-panel p-5">
          <div className="text-xs text-cream-faint">Signed in as</div>
          <div className="mt-1 text-sm text-cream">{user.email}</div>
        </div>

        <div className="mt-6 rounded-xl border border-ink-line bg-ink-panel p-5">
          {user.isPremium ? (
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brass/15 text-brass">
                <Crown size={16} />
              </div>
              <div>
                <div className="text-sm font-semibold text-cream">Premium</div>
                <div className="text-xs text-cream-faint">Unlimited AI room generations.</div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm text-cream-dim">
                {credits === 0
                  ? "You're out of credits."
                  : `You have ${credits} credit${credits === 1 ? "" : "s"} left.`}
              </div>
              <p className="mt-1 text-xs text-cream-faint">
                Each AI room render — add, remove, or move — spends one credit.
              </p>
              <div className="mt-4 space-y-2">
                <AccountBuyCreditsButton />
                <UpgradeToPremiumButton />
              </div>
            </>
          )}
        </div>

        <div className="mt-6">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}
