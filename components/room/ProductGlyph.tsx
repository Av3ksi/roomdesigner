import { useId } from "react";
import type { Product } from "@/lib/types";

/**
 * Procedural product thumbnail: a stylized silhouette per category, tinted
 * with the product's dominant color. Keeps the marketplace fully
 * self-contained (no external imagery) while staying on-brand.
 */
export default function ProductGlyph({ product, className }: { product: Product; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const c = product.color;
  const wood = "#8A6B44";

  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label={product.name}>
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1B1B22" />
          <stop offset="100%" stopColor="#131318" />
        </linearGradient>
      </defs>
      <rect width="200" height="160" fill={`url(#${uid}-bg)`} />
      <ellipse cx="100" cy="132" rx="64" ry="8" fill="#000" opacity="0.35" />

      {product.category === "sofa" && (
        <g>
          <rect x="42" y="58" width="116" height="42" rx="10" fill={c} />
          <rect x="30" y="70" width="22" height="52" rx="9" fill={c} />
          <rect x="148" y="70" width="22" height="52" rx="9" fill={c} />
          <rect x="44" y="92" width="55" height="30" rx="7" fill={c} stroke="#00000030" />
          <rect x="101" y="92" width="55" height="30" rx="7" fill={c} stroke="#00000030" />
          <rect x="52" y="122" width="6" height="10" fill={wood} />
          <rect x="142" y="122" width="6" height="10" fill={wood} />
        </g>
      )}
      {product.category === "chair" && (
        <g>
          <path d="M 70 52 Q 100 40 130 52 L 126 96 L 74 96 Z" fill={c} />
          <rect x="66" y="92" width="68" height="18" rx="8" fill={c} />
          <line x1="76" y1="110" x2="68" y2="134" stroke={wood} strokeWidth="5" />
          <line x1="124" y1="110" x2="132" y2="134" stroke={wood} strokeWidth="5" />
          <line x1="94" y1="110" x2="92" y2="134" stroke={wood} strokeWidth="5" />
        </g>
      )}
      {product.category === "table" && (
        <g>
          <ellipse cx="100" cy="76" rx="62" ry="16" fill={c} />
          <ellipse cx="100" cy="72" rx="62" ry="16" fill={c} stroke="#00000025" />
          <line x1="62" y1="84" x2="56" y2="130" stroke={c} strokeWidth="6" />
          <line x1="138" y1="84" x2="144" y2="130" stroke={c} strokeWidth="6" />
          <line x1="100" y1="88" x2="100" y2="132" stroke={c} strokeWidth="6" />
        </g>
      )}
      {product.category === "lighting" && (
        <g>
          <path d="M 78 44 L 122 44 L 130 76 L 70 76 Z" fill={c} />
          <circle cx="100" cy="62" r="30" fill="#FFE3B0" opacity="0.18" />
          <line x1="100" y1="76" x2="100" y2="126" stroke={c} strokeWidth="4" />
          <ellipse cx="100" cy="128" rx="22" ry="5" fill={c} />
        </g>
      )}
      {product.category === "rug" && (
        <g>
          <ellipse cx="100" cy="92" rx="72" ry="34" fill={c} />
          <ellipse cx="100" cy="92" rx="58" ry="26" fill="none" stroke="#00000035" strokeWidth="4" />
          <ellipse cx="100" cy="92" rx="40" ry="17" fill="none" stroke="#FFFFFF30" strokeWidth="3" />
        </g>
      )}
      {product.category === "art" && (
        <g>
          <rect x="58" y="36" width="84" height="92" fill="#20202A" stroke={c} strokeWidth="5" />
          <circle cx="88" cy="86" r="18" fill={c} opacity="0.85" />
          <circle cx="112" cy="70" r="12" fill={c} opacity="0.5" />
        </g>
      )}
      {product.category === "plant" && (
        <g>
          <path d="M 100 96 C 96 68, 96 52, 100 38" stroke={c} strokeWidth="7" fill="none" strokeLinecap="round" />
          <path d="M 100 96 C 84 76, 76 64, 72 50" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 100 96 C 116 76, 124 64, 128 50" stroke={c} strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 78 96 L 122 96 L 115 132 L 85 132 Z" fill="#A65E3F" />
        </g>
      )}
      {product.category === "storage" && (
        <g>
          <rect x="48" y="58" width="104" height="60" rx="5" fill={c} />
          <line x1="100" y1="62" x2="100" y2="114" stroke="#00000035" strokeWidth="3" />
          <circle cx="92" cy="88" r="3" fill="#00000045" />
          <circle cx="108" cy="88" r="3" fill="#00000045" />
          <rect x="56" y="118" width="8" height="12" fill={c} />
          <rect x="136" y="118" width="8" height="12" fill={c} />
        </g>
      )}
      {product.category === "decor" && (
        <g>
          <path d="M 84 128 C 74 106, 76 84, 88 72 C 92 88, 92 108, 90 128 Z" fill={c} />
          <path d="M 104 128 C 100 100, 104 80, 116 64 C 122 84, 118 110, 112 128 Z" fill={c} opacity="0.75" />
          <ellipse cx="100" cy="129" rx="26" ry="4" fill="#00000040" />
        </g>
      )}
      {product.category === "textile" && (
        <g>
          <path d="M 56 56 L 144 56 L 138 124 L 62 124 Z" fill={c} />
          <path d="M 56 76 L 142 76" stroke="#00000030" strokeWidth="4" />
          <path d="M 58 96 L 140 96" stroke="#FFFFFF25" strokeWidth="4" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={64 + i * 10.5} y1={124} x2={64 + i * 10.5} y2={132} stroke={c} strokeWidth="3" />
          ))}
        </g>
      )}
    </svg>
  );
}
