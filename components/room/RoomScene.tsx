import { useId } from "react";
import type { RoomStyleSpec } from "@/lib/types";

interface RoomSceneProps {
  spec: RoomStyleSpec;
  /** Renders the "before" treatment: bare bulb, clutter, wall wear. */
  dated?: boolean;
  /** 0–2: remixes art count / decor so concepts read differently. */
  variant?: number;
  className?: string;
}

/* One-point-perspective geometry. Canvas 1200×800; back wall (330,180)–(870,560). */
const BW = { x1: 330, y1: 180, x2: 870, y2: 560 };

/** Point on the left wall: t (0 screen edge → 1 back wall), v (0 top → 1 floor). */
function lw(t: number, v: number): [number, number] {
  const x = t * BW.x1;
  const yTop = t * BW.y1;
  const yBot = 800 - t * (800 - BW.y2);
  return [x, yTop + v * (yBot - yTop)];
}

/** Point on the right wall (mirrored). */
function rw(t: number, v: number): [number, number] {
  const x = 1200 - t * (1200 - BW.x2);
  const yTop = t * BW.y1;
  const yBot = 800 - t * (800 - BW.y2);
  return [x, yTop + v * (yBot - yTop)];
}

const pts = (...p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(" ");

function shade(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const num = parseInt(full, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((num >> 16) & 255) * (1 + amount));
  const g = clamp(((num >> 8) & 255) * (1 + amount));
  const b = clamp((num & 255) * (1 + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function RoomScene({ spec, dated = false, variant = 0, className }: RoomSceneProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const g = (name: string) => `${uid}-${name}`;

  // Window quad on the left wall.
  const t1 = 0.24, t2 = 0.74, v1 = 0.14, v2 = 0.6;
  const wA = lw(t1, v1), wB = lw(t2, v1), wC = lw(t2, v2), wD = lw(t1, v2);
  const fA = lw(t1 - 0.03, v1 - 0.035), fB = lw(t2 + 0.03, v1 - 0.035);
  const fC = lw(t2 + 0.03, v2 + 0.035), fD = lw(t1 - 0.03, v2 + 0.035);
  const tm = (t1 + t2) / 2, vm = (v1 + v2) / 2;
  const mTop = lw(tm, v1), mBot = lw(tm, v2);
  const hL = lw(t1, vm), hR = lw(t2, vm);

  // Doorway quad on the right wall (depth cue).
  const dA = rw(0.3, 0.06), dB = rw(0.58, 0.06), dC = rw(0.58, 1), dD = rw(0.3, 1);

  // Floor plank seams converging toward the vanishing point.
  const planks = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map((f) => {
    const bx = BW.x1 + f * (BW.x2 - BW.x1);
    const fx = 600 + (bx - 600) * 2.35;
    return { bx, fx };
  });

  const artCount = spec.art === "none" ? 0 : variant === 1 ? 2 : variant === 2 ? 3 : 1;
  const cushions = spec.cushions.slice(0, 3);
  const showSideboard = dated || variant > 0;
  const wallDark = shade(spec.wall, -0.12);
  const wallDarker = shade(spec.wall, -0.2);
  const ceil = shade(spec.wall, -0.06);
  const floorFront = shade(spec.floor, -0.14);

  const frames: { x: number; y: number; w: number; h: number }[] =
    artCount === 1
      ? [{ x: 505, y: 235, w: 190, h: 105 }]
      : artCount === 2
        ? [
            { x: 470, y: 240, w: 120, h: 95 },
            { x: 612, y: 252, w: 118, h: 83 },
          ]
        : artCount === 3
          ? [
              { x: 452, y: 250, w: 88, h: 84 },
              { x: 556, y: 238, w: 88, h: 96 },
              { x: 660, y: 254, w: 88, h: 80 },
            ]
          : [];

  return (
    <svg
      viewBox="0 0 1200 800"
      className={className}
      role="img"
      aria-label={dated ? "Original room render" : "Redesigned room render"}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={g("sky")} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor={spec.windowLight} />
          <stop offset="100%" stopColor={shade(spec.windowLight, -0.1)} />
        </linearGradient>
        <linearGradient id={g("shaft")} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={g("glow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={spec.lampGlow} stopOpacity="0.75" />
          <stop offset="100%" stopColor={spec.lampGlow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("daylight")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("vignette")} cx="0.5" cy="0.46" r="0.72">
          <stop offset="62%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </radialGradient>
        <linearGradient id={g("warm")} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={spec.lampGlow} stopOpacity={0.3 * spec.warmth} />
          <stop offset="70%" stopColor={spec.lampGlow} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g("floorg")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={spec.floor} />
          <stop offset="100%" stopColor={floorFront} />
        </linearGradient>
      </defs>

      {/* Shell */}
      <polygon points={pts([0, 0], [1200, 0], [BW.x2, BW.y1], [BW.x1, BW.y1])} fill={ceil} />
      <polygon points={pts([0, 800], [1200, 800], [BW.x2, BW.y2], [BW.x1, BW.y2])} fill={`url(#${g("floorg")})`} />
      <polygon points={pts([0, 0], [BW.x1, BW.y1], [BW.x1, BW.y2], [0, 800])} fill={wallDark} />
      <polygon points={pts([1200, 0], [BW.x2, BW.y1], [BW.x2, BW.y2], [1200, 800])} fill={wallDarker} />
      <rect x={BW.x1} y={BW.y1} width={BW.x2 - BW.x1} height={BW.y2 - BW.y1} fill={spec.wall} />

      {/* Back-wall treatments */}
      {spec.panel === "arch" && (
        <path
          d="M 468 560 L 468 330 A 132 132 0 0 1 732 330 L 732 560 Z"
          fill={spec.wallAccent}
        />
      )}
      {spec.panel === "slats" &&
        Array.from({ length: 24 }, (_, i) => (
          <line
            key={i}
            x1={352 + i * 21.5}
            y1={190}
            x2={352 + i * 21.5}
            y2={556}
            stroke={shade(spec.wallAccent, -0.18)}
            strokeWidth={7}
            opacity={0.55}
          />
        ))}
      {spec.panel === "brick" && (
        <g opacity={0.9}>
          <rect x={BW.x1} y={BW.y1} width={BW.x2 - BW.x1} height={BW.y2 - BW.y1} fill={spec.wallAccent} />
          {Array.from({ length: 17 }, (_, r) => (
            <line
              key={`h${r}`}
              x1={BW.x1}
              y1={192 + r * 22}
              x2={BW.x2}
              y2={192 + r * 22}
              stroke={shade(spec.wallAccent, -0.3)}
              strokeWidth={2.4}
              opacity={0.6}
            />
          ))}
          {Array.from({ length: 60 }, (_, i) => {
            const row = Math.floor(i / 4);
            const col = i % 4;
            const off = row % 2 === 0 ? 0 : 33;
            const x = 360 + off + col * 132;
            if (x > 860) return null;
            return (
              <line
                key={`v${i}`}
                x1={x}
                y1={192 + row * 22 * 1.13}
                x2={x}
                y2={192 + row * 22 * 1.13 + 20}
                stroke={shade(spec.wallAccent, -0.3)}
                strokeWidth={2}
                opacity={0.45}
              />
            );
          })}
        </g>
      )}
      {spec.panel === "wainscot" && (
        <g>
          <rect x={BW.x1} y={430} width={BW.x2 - BW.x1} height={130} fill={spec.wallAccent} />
          <line x1={BW.x1} y1={430} x2={BW.x2} y2={430} stroke={shade(spec.wallAccent, -0.18)} strokeWidth={5} />
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1={366 + i * 68}
              y1={438}
              x2={366 + i * 68}
              y2={556}
              stroke={shade(spec.wallAccent, -0.14)}
              strokeWidth={4}
              opacity={0.8}
            />
          ))}
        </g>
      )}

      {/* Baseboards */}
      <line x1={BW.x1} y1={BW.y2} x2={BW.x2} y2={BW.y2} stroke={shade(spec.wall, -0.28)} strokeWidth={4} />
      <line x1={0} y1={800} x2={BW.x1} y2={BW.y2} stroke={shade(spec.wall, -0.3)} strokeWidth={3} />
      <line x1={BW.x2} y1={BW.y2} x2={1200} y2={800} stroke={shade(spec.wall, -0.32)} strokeWidth={3} />

      {/* Floor planks */}
      {planks.map((p, i) => (
        <line
          key={i}
          x1={p.bx}
          y1={BW.y2}
          x2={p.fx}
          y2={800}
          stroke={spec.floorSeam}
          strokeWidth={2.2}
          opacity={0.42}
        />
      ))}
      {[634, 706, 772].map((y) => {
        const spread = (y - BW.y2) / (800 - BW.y2);
        const xl = BW.x1 - spread * BW.x1;
        const xr = BW.x2 + spread * (1200 - BW.x2);
        return (
          <line key={y} x1={xl} y1={y} x2={xr} y2={y} stroke={spec.floorSeam} strokeWidth={1.4} opacity={0.16} />
        );
      })}

      {/* Doorway on right wall */}
      <polygon points={pts(dA, dB, dC, dD)} fill={shade(spec.wall, -0.34)} opacity={0.5} />
      <polygon points={pts(dA, dB, dC, dD)} fill="none" stroke={shade(spec.wall, -0.42)} strokeWidth={4} opacity={0.5} />

      {/* Window */}
      <polygon points={pts(fA, fB, fC, fD)} fill={dated ? "#8F887A" : spec.wood} />
      <polygon points={pts(wA, wB, wC, wD)} fill={`url(#${g("sky")})`} />
      <line x1={mTop[0]} y1={mTop[1]} x2={mBot[0]} y2={mBot[1]} stroke={dated ? "#8F887A" : spec.wood} strokeWidth={6} />
      <line x1={hL[0]} y1={hL[1]} x2={hR[0]} y2={hR[1]} stroke={dated ? "#8F887A" : spec.wood} strokeWidth={5} />
      {/* Light shaft */}
      <polygon
        points={pts(wD, wC, [840, 690], [260, 800])}
        fill={`url(#${g("shaft")})`}
        opacity={0.8}
      />

      {/* Art */}
      {frames.map((f, i) => {
        const c0 = spec.artColors[0] ?? spec.metal;
        const c1 = spec.artColors[1] ?? shade(c0, 0.3);
        return (
          <g key={i}>
            <rect x={f.x} y={f.y} width={f.w} height={f.h} fill={shade(spec.wall, 0.16)} stroke={spec.metal} strokeWidth={4} />
            {spec.art === "abstract" && (
              <>
                <circle cx={f.x + f.w * 0.4} cy={f.y + f.h * 0.55} r={Math.min(f.w, f.h) * 0.26} fill={c0} opacity={0.85} />
                <circle cx={f.x + f.w * 0.62} cy={f.y + f.h * 0.42} r={Math.min(f.w, f.h) * 0.2} fill={c1} opacity={0.75} />
              </>
            )}
            {spec.art === "line" && (
              <path
                d={`M ${f.x + f.w * 0.16} ${f.y + f.h * 0.66} C ${f.x + f.w * 0.34} ${f.y + f.h * 0.2}, ${f.x + f.w * 0.52} ${f.y + f.h * 0.85}, ${f.x + f.w * 0.7} ${f.y + f.h * 0.4} S ${f.x + f.w * 0.86} ${f.y + f.h * 0.5}, ${f.x + f.w * 0.86} ${f.y + f.h * 0.34}`}
                fill="none"
                stroke={c0}
                strokeWidth={3.4}
                strokeLinecap="round"
              />
            )}
            {spec.art === "botanical" && (
              <path
                d={`M ${f.x + f.w / 2} ${f.y + f.h * 0.82} C ${f.x + f.w * 0.3} ${f.y + f.h * 0.6}, ${f.x + f.w * 0.36} ${f.y + f.h * 0.3}, ${f.x + f.w / 2} ${f.y + f.h * 0.16} C ${f.x + f.w * 0.64} ${f.y + f.h * 0.3}, ${f.x + f.w * 0.7} ${f.y + f.h * 0.6}, ${f.x + f.w / 2} ${f.y + f.h * 0.82} Z`}
                fill={c0}
                opacity={0.8}
              />
            )}
            {spec.art === "geo" && (
              <>
                <rect x={f.x + f.w * 0.18} y={f.y + f.h * 0.3} width={f.w * 0.28} height={f.h * 0.46} fill={c0} opacity={0.85} />
                <path
                  d={`M ${f.x + f.w * 0.54} ${f.y + f.h * 0.76} A ${f.w * 0.15} ${f.w * 0.15} 0 0 1 ${f.x + f.w * 0.84} ${f.y + f.h * 0.76} Z`}
                  fill={c1}
                  opacity={0.8}
                />
              </>
            )}
          </g>
        );
      })}

      {/* Sideboard / media unit */}
      {showSideboard && (
        <g>
          <ellipse cx={782} cy={575} rx={95} ry={9} fill="#000" opacity={0.12} />
          <rect x={700} y={486} width={165} height={82} rx={5} fill={spec.wood} />
          <line x1={782} y1={490} x2={782} y2={564} stroke={shade(spec.wood, -0.25)} strokeWidth={3} />
          <rect x={708} y={568} width={10} height={12} fill={shade(spec.wood, -0.3)} />
          <rect x={848} y={568} width={10} height={12} fill={shade(spec.wood, -0.3)} />
          {dated ? (
            <g>
              <rect x={722} y={414} width={122} height={68} rx={4} fill="#1E1D1B" />
              <rect x={728} y={420} width={110} height={54} rx={2} fill="#31302C" />
            </g>
          ) : (
            <g>
              <path d="M 740 486 L 740 462 C 740 452, 756 452, 756 462 L 756 486 Z" fill={shade(spec.wallAccent, -0.25)} />
              <ellipse cx={812} cy={480} rx={22} ry={7} fill={shade(spec.wood, -0.35)} />
              <path d="M 812 476 C 802 460, 806 448, 812 440 C 818 448, 822 460, 812 476" fill="#6E7F5C" />
            </g>
          )}
        </g>
      )}

      {/* Rug */}
      <ellipse cx={600} cy={696} rx={298} ry={80} fill={spec.rug} />
      <ellipse cx={600} cy={696} rx={262} ry={66} fill="none" stroke={spec.rugAccent} strokeWidth={6} opacity={0.85} />
      {variant === 2 && (
        <ellipse cx={600} cy={696} rx={210} ry={50} fill="none" stroke={spec.rugAccent} strokeWidth={3} opacity={0.5} />
      )}

      {/* Sofa */}
      <ellipse cx={600} cy={668} rx={205} ry={26} fill="#000" opacity={0.16} />
      <rect x={445} y={468} width={310} height={104} rx={20} fill={spec.sofa} />
      <rect x={445} y={468} width={310} height={104} rx={20} fill="none" stroke={spec.sofaShadow} strokeWidth={2} opacity={0.5} />
      <rect x={413} y={494} width={48} height={152} rx={20} fill={shade(spec.sofa, -0.06)} />
      <rect x={739} y={494} width={48} height={152} rx={20} fill={shade(spec.sofa, -0.06)} />
      <rect x={447} y={554} width={150} height={68} rx={13} fill={shade(spec.sofa, 0.05)} stroke={spec.sofaShadow} strokeWidth={1.6} />
      <rect x={603} y={554} width={150} height={68} rx={13} fill={shade(spec.sofa, 0.05)} stroke={spec.sofaShadow} strokeWidth={1.6} />
      {cushions.map((c, i) => (
        <rect
          key={i}
          x={468 + i * 92}
          y={498 + (i % 2) * 7}
          width={80}
          height={60}
          rx={10}
          fill={c}
          stroke={shade(c, -0.2)}
          strokeWidth={1.4}
        />
      ))}
      <rect x={462} y={638} width={11} height={22} fill={spec.wood} />
      <rect x={727} y={638} width={11} height={22} fill={spec.wood} />

      {/* Coffee table */}
      <ellipse cx={600} cy={742} rx={112} ry={13} fill="#000" opacity={0.12} />
      <line x1={532} y1={706} x2={524} y2={742} stroke={shade(spec.wood, -0.2)} strokeWidth={7} />
      <line x1={668} y1={706} x2={676} y2={742} stroke={shade(spec.wood, -0.2)} strokeWidth={7} />
      <line x1={600} y1={712} x2={600} y2={748} stroke={shade(spec.wood, -0.28)} strokeWidth={7} />
      <ellipse cx={600} cy={700} rx={108} ry={27} fill={shade(spec.wood, -0.1)} />
      <ellipse cx={600} cy={695} rx={108} ry={27} fill={spec.wood} />
      {dated ? (
        <g>
          <rect x={556} y={672} width={54} height={9} rx={2} fill="#8A8175" />
          <rect x={563} y={664} width={40} height={8} rx={2} fill="#A39684" />
          <rect x={620} y={668} width={26} height={13} rx={2} fill="#4A4640" />
        </g>
      ) : (
        <g>
          <rect x={548} y={676} width={58} height={7} rx={2} fill={shade(spec.cushions[0] ?? spec.metal, -0.1)} />
          <rect x={556} y={669} width={44} height={7} rx={2} fill={shade(spec.cushions[1] ?? spec.metal, 0.1)} />
          <path d="M 640 682 L 656 682 L 653 662 L 643 662 Z" fill={shade(spec.wallAccent, -0.3)} />
        </g>
      )}

      {/* Floor lamp */}
      <ellipse cx={962} cy={700} rx={44} ry={9} fill="#000" opacity={0.13} />
      <circle cx={962} cy={410} r={72} fill={`url(#${g("glow")})`} opacity={dated ? 0.3 : 0.35 + spec.warmth * 0.4} />
      <line x1={962} y1={700} x2={962} y2={432} stroke={spec.metal} strokeWidth={6} />
      <ellipse cx={962} cy={700} rx={32} ry={7} fill={spec.metal} />
      <path d="M 928 376 L 996 376 L 1006 436 L 918 436 Z" fill={spec.lampGlow} stroke={spec.metal} strokeWidth={3} />

      {/* Plant */}
      {spec.plant && !dated && (
        <g>
          <ellipse cx={272} cy={708} rx={44} ry={9} fill="#000" opacity={0.12} />
          <path d="M 300 570 C 282 600, 276 622, 273 646" fill="none" stroke="#5F7457" strokeWidth={9} strokeLinecap="round" />
          <path d="M 244 566 C 258 598, 266 620, 271 646" fill="none" stroke="#6E8262" strokeWidth={9} strokeLinecap="round" />
          <path d="M 272 548 C 271 586, 271 616, 272 646" fill="none" stroke="#4E6349" strokeWidth={10} strokeLinecap="round" />
          <path d="M 318 606 C 300 622, 286 636, 276 650" fill="none" stroke="#5F7457" strokeWidth={8} strokeLinecap="round" />
          <path d="M 228 610 C 246 626, 258 638, 268 650" fill="none" stroke="#66795B" strokeWidth={8} strokeLinecap="round" />
          <path d="M 242 644 L 302 644 L 293 710 L 251 710 Z" fill={dated ? "#8A6F52" : "#A65E3F"} />
          <path d="M 242 644 L 302 644 L 300 656 L 244 656 Z" fill={shade("#A65E3F", -0.18)} />
        </g>
      )}

      {/* Ceiling light */}
      {dated ? (
        <g>
          <line x1={600} y1={0} x2={600} y2={86} stroke="#7A756A" strokeWidth={3} />
          <circle cx={600} cy={100} r={15} fill="#F3E9C8" stroke="#C9BE9E" strokeWidth={2} />
        </g>
      ) : (
        spec.pendant && (
          <g>
            <line x1={600} y1={0} x2={600} y2={106} stroke={spec.metal} strokeWidth={3} />
            <path d="M 556 130 A 44 44 0 0 1 644 130 L 644 142 L 556 142 Z" fill={spec.metal} />
            <circle cx={600} cy={156} r={40} fill={`url(#${g("glow")})`} opacity={0.4 + spec.warmth * 0.4} />
          </g>
        )
      )}

      {/* Dated wear & clutter */}
      {dated && (
        <g>
          <ellipse cx={210} cy={300} rx={60} ry={90} fill="#000" opacity={0.05} />
          <ellipse cx={760} cy={250} rx={70} ry={40} fill="#000" opacity={0.045} />
          <g>
            <polygon points="1002,648 1096,648 1096,720 1002,720" fill="#B79A6F" />
            <polygon points="1002,648 1049,634 1096,648 1049,662" fill="#C6AB80" />
            <line x1={1002} y1={648} x2={1096} y2={648} stroke="#94794F" strokeWidth={3} />
            <line x1={1049} y1={662} x2={1049} y2={720} stroke="#94794F" strokeWidth={2} opacity={0.6} />
          </g>
          <path d="M 900 700 C 930 690, 960 706, 986 698" fill="none" stroke="#3B3833" strokeWidth={3} opacity={0.5} />
        </g>
      )}

      {/* Atmosphere */}
      <circle cx={240} cy={380} r={480} fill={`url(#${g("daylight")})`} />
      <rect x={0} y={0} width={1200} height={800} fill={`url(#${g("warm")})`} />
      <rect x={0} y={0} width={1200} height={800} fill={`url(#${g("vignette")})`} />
    </svg>
  );
}
