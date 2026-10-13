"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import BuyCreditsModal from "@/components/BuyCreditsModal";

/** Opens the same buy-credits flow as CreditBadge/PricingSection, from /account. */
export default function AccountBuyCreditsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && <BuyCreditsModal onClose={() => setOpen(false)} />}
      <button onClick={() => setOpen(true)} className="btn-ghost flex w-full items-center justify-center gap-1.5">
        <Coins size={14} />
        Buy credits
      </button>
    </>
  );
}
