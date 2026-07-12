"use client";

import { AlertTriangle, CheckCircle2, Leaf, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { energyEfficiency, furnitureCompatibility, roomSustainability } from "@/lib/roomIntelligence";
import type { Product, RoomAnalysis } from "@/lib/types";

interface RoomIntelligencePanelProps {
  products: Product[];
  analysis: RoomAnalysis;
  styleId: string;
}

type Tab = "sustainability" | "energy" | "compatibility";

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0 -rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-ink-line" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
      <text x="28" y="28" textAnchor="middle" dominantBaseline="central" className="rotate-90" style={{ transformOrigin: "28px 28px" }}>
        <tspan fill="#F2ECDF" fontSize="14" fontWeight="700">{score}</tspan>
      </text>
    </svg>
  );
}

export default function RoomIntelligencePanel({ products, analysis, styleId }: RoomIntelligencePanelProps) {
  const [tab, setTab] = useState<Tab>("sustainability");
  const sustainability = useMemo(() => roomSustainability(products), [products]);
  const energy = useMemo(() => energyEfficiency(analysis, products), [analysis, products]);
  const compatibility = useMemo(() => furnitureCompatibility(products, styleId), [products, styleId]);

  const TABS: { id: Tab; label: string; icon: typeof Leaf }[] = [
    { id: "sustainability", label: "Sustainability", icon: Leaf },
    { id: "energy", label: "Energy", icon: Zap },
    { id: "compatibility", label: "Compatibility", icon: compatibility.ok ? CheckCircle2 : AlertTriangle },
  ];

  return (
    <div className="card mt-4 overflow-hidden">
      <div className="flex items-center border-b border-ink-line">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-xs font-semibold transition ${
              tab === id ? "border-b-2 border-brass bg-brass/5 text-brass-bright" : "text-cream-faint hover:text-cream"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "sustainability" && (
        <div className="flex items-start gap-4 p-4">
          <ScoreRing score={sustainability.score} color="#5A7058" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-cream">{sustainability.label}</div>
            <p className="mt-1 text-xs leading-relaxed text-cream-faint">{sustainability.tip}</p>
          </div>
        </div>
      )}

      {tab === "energy" && (
        <div className="flex items-start gap-4 p-4">
          <ScoreRing score={energy.score} color="#C8A96E" />
          <ul className="min-w-0 space-y-2">
            {energy.tips.map((tip) => (
              <li key={tip} className="text-xs leading-relaxed text-cream-faint">
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "compatibility" && (
        <div className="p-4">
          {compatibility.ok ? (
            <div className="flex items-center gap-3 text-sm text-cream-dim">
              <CheckCircle2 size={18} className="shrink-0 text-sage" />
              Everything in this room is scaled and styled to work together.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {compatibility.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2.5 text-xs leading-relaxed text-cream-dim">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-brass" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
