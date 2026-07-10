import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ProductCategory, RoomStyleSpec } from "@/lib/types";

/**
 * Procedural PBR room builder. Generates a complete furnished room from a
 * RoomStyleSpec — the same spec objects that drive the 2D render engine —
 * as a THREE.Group with layered lights, per-material clipping support
 * (for the live before/after divider) and animation hooks.
 */

export const ROOM = { w: 6, d: 5, h: 2.8 } as const; // meters

export interface RoomHandles {
  group: THREE.Group;
  /** Called every frame with (elapsed, delta). */
  animate: (t: number, dt: number) => void;
  /** Called when time-of-day changes (0 dawn → 1 night). */
  setTime: (t: number) => void;
  /** Meshes that respond to hotspot raycasts (userData.category set). */
  hotspots: THREE.Object3D[];
  /** Recolor a category's primary material live. */
  recolor: (category: ProductCategory, hex: string) => void;
  dispose: () => void;
}

interface BuildOptions {
  spec: RoomStyleSpec;
  dated: boolean;
  variant: number;
  /** Render layer for meshes + lights (camera enables all room layers). */
  layer: number;
  /** Clipping plane confining this room to one side of the divider. */
  clip: THREE.Plane | null;
  /** Rooms that cast real-time shadows (the redesigned room). */
  shadows: boolean;
}

/* ————————————————— helpers ————————————————— */

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

function plankTexture(floor: string, seam: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 512;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, 512, 512);
  const plankW = 512 / 6;
  for (let i = 0; i <= 6; i++) {
    ctx.strokeStyle = seam;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(i * plankW, 0);
    ctx.lineTo(i * plankW, 512);
    ctx.stroke();
    // Staggered end seams + grain
    for (let y = 0; y < 512; y += 128) {
      const off = ((i * 61) % 128) + y;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(i * plankW, off % 512);
      ctx.lineTo((i + 1) * plankW, off % 512);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;
    for (let g = 0; g < 8; g++) {
      const gx = i * plankW + 8 + g * 9.5;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 3, 170, gx - 3, 340, gx, 512);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 4;
  return tex;
}

function backWallTexture(spec: RoomStyleSpec, dated: boolean): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 512;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = spec.wall;
  ctx.fillRect(0, 0, 1024, 512);

  const accent = spec.wallAccent;
  if (!dated) {
    if (spec.panel === "slats") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 1024, 512);
      for (let x = 0; x < 1024; x += 26) {
        ctx.fillStyle = shade(accent, -0.07);
        ctx.fillRect(x, 0, 9, 512);
      }
    } else if (spec.panel === "brick") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.strokeStyle = shade(accent, -0.13);
      ctx.lineWidth = 3;
      for (let y = 0; y < 512; y += 34) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1024, y);
        ctx.stroke();
        const off = (y / 34) % 2 === 0 ? 0 : 42;
        for (let x = off; x < 1024; x += 84) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 34);
          ctx.stroke();
        }
      }
    } else if (spec.panel === "arch") {
      ctx.fillStyle = accent;
      const cx = 512, w = 300, top = 512 - 400;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, 512);
      ctx.lineTo(cx - w / 2, top + w / 2);
      ctx.arc(cx, top + w / 2, w / 2, Math.PI, 0);
      ctx.lineTo(cx + w / 2, 512);
      ctx.closePath();
      ctx.fill();
    } else if (spec.panel === "wainscot") {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 512 - 190, 1024, 190);
      ctx.strokeStyle = shade(accent, -0.09);
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 512 - 190, 1024, 5);
      for (let x = 60; x < 1024; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, 512 - 175);
        ctx.lineTo(x, 512);
        ctx.stroke();
      }
    }
  } else {
    // Sun-fade patches and scuffs for the "before" room
    for (const [x, y, r] of [[220, 200, 130], [760, 150, 100], [520, 380, 150]] as const) {
      const g = ctx.createRadialGradient(x, y, 10, x, y, r);
      g.addColorStop(0, "rgba(70,55,35,0.10)");
      g.addColorStop(1, "rgba(70,55,35,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function artTexture(spec: RoomStyleSpec): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 192;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = shade(spec.wall, 0.1);
  ctx.fillRect(0, 0, 256, 192);
  const [c0raw, c1raw] = [spec.artColors[0] ?? spec.metal, spec.artColors[1] ?? spec.wood];
  if (spec.art === "abstract" || spec.art === "none") {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c0raw;
    ctx.beginPath();
    ctx.arc(100, 110, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = c1raw;
    ctx.beginPath();
    ctx.arc(160, 78, 38, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.art === "line") {
    ctx.strokeStyle = c0raw;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(40, 130);
    ctx.bezierCurveTo(85, 40, 130, 165, 175, 80);
    ctx.quadraticCurveTo(200, 55, 215, 70);
    ctx.stroke();
  } else if (spec.art === "botanical") {
    ctx.fillStyle = c0raw;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(128, 160);
    ctx.bezierCurveTo(80, 120, 88, 60, 128, 32);
    ctx.bezierCurveTo(168, 60, 176, 120, 128, 160);
    ctx.fill();
    ctx.strokeStyle = c1raw;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 160);
    ctx.lineTo(128, 40);
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = c0raw;
    ctx.fillRect(50, 55, 62, 92);
    ctx.fillStyle = c1raw;
    ctx.beginPath();
    ctx.arc(170, 140, 36, Math.PI, 0);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial contact-shadow blob (cheap ambient occlusion under furniture). */
function shadowBlobTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.42)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/* ————————————————— main builder ————————————————— */

export function buildRoom(opts: BuildOptions): RoomHandles {
  const { spec, dated, variant, layer, clip, shadows } = opts;
  const group = new THREE.Group();
  const glowMats: { mat: THREE.MeshPhysicalMaterial; base: number; night: number }[] = [];
  const hotspots: THREE.Object3D[] = [];
  const animators: ((t: number, dt: number) => void)[] = [];
  const disposables: { dispose: () => void }[] = [];
  const matsByCategory = new Map<ProductCategory, THREE.MeshPhysicalMaterial[]>();

  const mat = (
    color: string,
    o: {
      rough?: number;
      metal?: number;
      emissive?: string;
      emissiveIntensity?: number;
      clearcoat?: number;
      envInt?: number;
      map?: THREE.Texture;
      side?: THREE.Side;
      transparent?: boolean;
      opacity?: number;
      category?: ProductCategory;
    } = {},
  ) => {
    const m = new THREE.MeshPhysicalMaterial({
      color,
      roughness: o.rough ?? 0.85,
      metalness: o.metal ?? 0,
      clearcoat: o.clearcoat ?? 0,
      envMapIntensity: o.envInt ?? 0.55,
      map: o.map ?? null,
      side: o.side ?? THREE.FrontSide,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
    });
    if (o.emissive) {
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity ?? 1;
    }
    if (clip) m.clippingPlanes = [clip];
    disposables.push(m);
    if (o.category) {
      const arr = matsByCategory.get(o.category) ?? [];
      arr.push(m);
      matsByCategory.set(o.category, arr);
    }
    return m;
  };

  const add = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    pos: [number, number, number],
    o: { rot?: [number, number, number]; cast?: boolean; receive?: boolean; category?: ProductCategory; scale?: [number, number, number] } = {},
  ) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...pos);
    if (o.rot) mesh.rotation.set(...o.rot);
    if (o.scale) mesh.scale.set(...o.scale);
    mesh.castShadow = shadows && (o.cast ?? true);
    mesh.receiveShadow = o.receive ?? true;
    mesh.layers.set(layer);
    if (o.category) mesh.userData.category = o.category;
    disposables.push(geo);
    group.add(mesh);
    return mesh;
  };

  const blobTex = shadowBlobTexture();
  disposables.push(blobTex);
  const blob = (x: number, z: number, sx: number, sz: number) => {
    const m = new THREE.MeshBasicMaterial({
      map: blobTex,
      transparent: true,
      depthWrite: false,
      opacity: dated ? 0.55 : 0.75,
    });
    if (clip) m.clippingPlanes = [clip];
    const mesh = add(new THREE.PlaneGeometry(sx, sz), m, [x, 0.012, z], {
      rot: [-Math.PI / 2, 0, 0],
      cast: false,
      receive: false,
    });
    mesh.renderOrder = 1;
  };

  const { w: W, d: D, h: H } = ROOM;

  /* ——— shell ——— */
  const floorTex = plankTexture(spec.floor, spec.floorSeam);
  disposables.push(floorTex);
  add(
    new THREE.PlaneGeometry(W, D),
    mat("#ffffff", { map: floorTex, rough: dated ? 0.9 : 0.55, clearcoat: dated ? 0 : 0.12, envInt: 0.7 }),
    [0, 0, 0],
    { rot: [-Math.PI / 2, 0, 0], cast: false },
  );
  const wallTex = backWallTexture(spec, dated);
  disposables.push(wallTex);
  add(new THREE.PlaneGeometry(W, H), mat("#ffffff", { map: wallTex, rough: 0.94, envInt: 0.35 }), [0, H / 2, -D / 2], { cast: false });
  // Right wall
  add(new THREE.PlaneGeometry(D, H), mat(shade(spec.wall, -0.045), { rough: 0.94, envInt: 0.3 }), [W / 2, H / 2, 0], {
    rot: [0, -Math.PI / 2, 0],
    cast: false,
  });
  // Ceiling
  add(new THREE.PlaneGeometry(W, D), mat(shade(spec.wall, 0.05), { rough: 0.96, envInt: 0.2 }), [0, H, 0], {
    rot: [Math.PI / 2, 0, 0],
    cast: false,
  });
  // Baseboards
  const baseMat = mat(shade(spec.wall, -0.12), { rough: 0.8 });
  add(new THREE.BoxGeometry(W, 0.09, 0.02), baseMat, [0, 0.045, -D / 2 + 0.011], { cast: false });
  add(new THREE.BoxGeometry(0.02, 0.09, D), baseMat, [W / 2 - 0.011, 0.045, 0], { cast: false });

  /* ——— window wall (−x) with opening ——— */
  const wallMat = mat(shade(spec.wall, -0.02), { rough: 0.94, envInt: 0.3 });
  const winW = 2.0, winH = 1.5, winY = 1.55, winZ = -0.4; // opening center
  // Wall segments around opening (plane at x=-W/2, facing +x)
  const seg = (h: number, d: number, y: number, z: number) =>
    add(new THREE.PlaneGeometry(d, h), wallMat, [-W / 2, y, z], { rot: [0, Math.PI / 2, 0], cast: false });
  seg(winY - winH / 2, D, (winY - winH / 2) / 2, 0); // below
  seg(H - (winY + winH / 2), D, (H + winY + winH / 2) / 2, 0); // above
  const leftD = D / 2 + (winZ - winW / 2);
  const rightD = D / 2 - (winZ + winW / 2);
  seg(winH, leftD, winY, -D / 2 + leftD / 2); // toward back
  seg(winH, rightD, winY, D / 2 - rightD / 2); // toward front

  // Window frame + mullions
  const frameMat = mat(dated ? "#8F887A" : spec.wood, { rough: 0.6, category: undefined });
  const fx = -W / 2 + 0.02;
  add(new THREE.BoxGeometry(0.08, winH + 0.12, 0.08), frameMat, [fx, winY, winZ - winW / 2]);
  add(new THREE.BoxGeometry(0.08, winH + 0.12, 0.08), frameMat, [fx, winY, winZ + winW / 2]);
  add(new THREE.BoxGeometry(0.08, 0.08, winW + 0.12), frameMat, [fx, winY + winH / 2, winZ]);
  add(new THREE.BoxGeometry(0.08, 0.08, winW + 0.12), frameMat, [fx, winY - winH / 2, winZ]);
  add(new THREE.BoxGeometry(0.05, winH, 0.05), frameMat, [fx, winY, winZ]);
  add(new THREE.BoxGeometry(0.05, 0.05, winW), frameMat, [fx, winY, winZ]);

  // Sky plane behind the window — its color follows time-of-day
  const skyMat = new THREE.MeshBasicMaterial({ color: spec.windowLight, toneMapped: false });
  if (clip) skyMat.clippingPlanes = [clip];
  disposables.push(skyMat);
  const sky = add(new THREE.PlaneGeometry(3.2, 2.4), skyMat, [-W / 2 - 0.55, winY, winZ], {
    rot: [0, Math.PI / 2, 0],
    cast: false,
    receive: false,
  });
  sky.layers.set(layer);

  // Curtains (animated cloth planes)
  const curtainMat = mat(shade(spec.wallAccent, 0.06), { rough: 0.95, side: THREE.DoubleSide, envInt: 0.25 });
  const curtainGeos: THREE.PlaneGeometry[] = [];
  for (const side of [-1, 1] as const) {
    const cg = new THREE.PlaneGeometry(0.55, winH + 0.7, 10, 16);
    curtainGeos.push(cg);
    add(cg, curtainMat, [-W / 2 + 0.13, winY + 0.12, winZ + side * (winW / 2 + 0.28)], {
      rot: [0, Math.PI / 2, 0],
      cast: false,
    });
  }
  animators.push((t) => {
    for (const cg of curtainGeos) {
      const pos = cg.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const sway = Math.sin(t * 1.1 + x * 6 + y * 1.4) * 0.024 * (0.3 + (1 - (y + winH / 2 + 0.35) / (winH + 0.7)));
        pos.setZ(i, sway + Math.sin(x * 9) * 0.03);
      }
      pos.needsUpdate = true;
      cg.computeVertexNormals();
    }
  });

  /* ——— rug ——— */
  const rugMat = mat(spec.rug, { rough: 0.98, envInt: 0.25, category: "rug" });
  const rug = add(new THREE.CylinderGeometry(1, 1, 0.024, 48), rugMat, [0.1, 0.012, -0.15], {
    scale: [1.75, 1, 1.15],
    cast: false,
    category: "rug",
  });
  hotspots.push(rug);
  const ringMat = mat(spec.rugAccent, { rough: 0.95, envInt: 0.25, category: "rug" });
  add(new THREE.TorusGeometry(0.88, 0.022, 8, 64), ringMat, [0.1, 0.026, -0.15], {
    rot: [-Math.PI / 2, 0, 0],
    scale: [1.72, 1.12, 1],
    cast: false,
  });

  /* ——— sofa ——— */
  const sofa = new THREE.Group();
  sofa.position.set(0, 0, -1.55);
  const sofaMat = mat(spec.sofa, { rough: dated ? 0.95 : 0.82, envInt: 0.4, category: "sofa" });
  const sofaDarker = mat(shade(spec.sofa, -0.045), { rough: 0.88, envInt: 0.35, category: "sofa" });
  const woodMat = mat(spec.wood, { rough: 0.5, clearcoat: 0.25, envInt: 0.7 });
  const sMesh = (geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number]) => {
    const mm = new THREE.Mesh(geo, m);
    mm.position.set(...p);
    mm.castShadow = shadows;
    mm.receiveShadow = true;
    mm.layers.set(layer);
    mm.userData.category = "sofa";
    disposables.push(geo);
    sofa.add(mm);
    return mm;
  };
  sMesh(new RoundedBoxGeometry(2.15, 0.34, 0.95, 4, 0.07), sofaMat, [0, 0.36, 0]);
  sMesh(new RoundedBoxGeometry(2.15, 0.6, 0.24, 4, 0.08), sofaMat, [0, 0.76, -0.37]);
  sMesh(new RoundedBoxGeometry(0.27, 0.56, 0.95, 4, 0.09), sofaDarker, [-1.2, 0.64, 0]);
  sMesh(new RoundedBoxGeometry(0.27, 0.56, 0.95, 4, 0.09), sofaDarker, [1.2, 0.64, 0]);
  sMesh(new RoundedBoxGeometry(1.0, 0.15, 0.86, 4, 0.06), mat(shade(spec.sofa, 0.04), { rough: 0.85, envInt: 0.4, category: "sofa" }), [-0.52, 0.6, 0.02]);
  sMesh(new RoundedBoxGeometry(1.0, 0.15, 0.86, 4, 0.06), mat(shade(spec.sofa, 0.04), { rough: 0.85, envInt: 0.4, category: "sofa" }), [0.52, 0.6, 0.02]);
  spec.cushions.slice(0, 3).forEach((c, i) => {
    const cm = mat(c, { rough: 0.9, envInt: 0.35, category: "textile" });
    const cushion = sMesh(new RoundedBoxGeometry(0.5, 0.42, 0.16, 4, 0.07), cm, [-0.65 + i * 0.65, 0.86, -0.26]);
    cushion.rotation.x = -0.14;
    cushion.rotation.z = (i - 1) * 0.045;
    cushion.userData.category = "textile";
    hotspots.push(cushion);
  });
  for (const [lx, lz] of [[-1.0, 0.35], [1.0, 0.35], [-1.0, -0.35], [1.0, -0.35]] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.16, 10), woodMat);
    leg.position.set(lx, 0.1, lz);
    leg.castShadow = shadows;
    leg.layers.set(layer);
    sofa.add(leg);
  }
  sofa.layers.set(layer);
  group.add(sofa);
  hotspots.push(sofa);
  blob(0, -1.55, 3.1, 1.7);

  /* ——— coffee table ——— */
  const table = new THREE.Group();
  table.position.set(0.1, 0, 0.35);
  const tableMat = mat(spec.wood, { rough: 0.42, clearcoat: 0.35, envInt: 0.85, category: "table" });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.045, 40), tableMat);
  top.scale.set(1.15, 1, 0.72);
  top.position.y = 0.42;
  top.castShadow = shadows;
  top.receiveShadow = true;
  top.layers.set(layer);
  top.userData.category = "table";
  table.add(top);
  for (const a of [0.5, 2.6, 4.4]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.026, 0.42, 10),
      mat(shade(spec.wood, -0.06), { rough: 0.5, category: "table" }),
    );
    leg.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.3);
    leg.rotation.z = Math.cos(a) * 0.12;
    leg.castShadow = shadows;
    leg.layers.set(layer);
    leg.userData.category = "table";
    table.add(leg);
  }
  // Books + small vase on top
  if (!dated) {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.028, 0.18), mat(spec.cushions[0] ?? spec.metal, { rough: 0.7, category: "decor" }));
    b1.position.set(-0.18, 0.457, 0.02);
    b1.rotation.y = 0.3;
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.024, 0.16), mat(shade(spec.cushions[1] ?? spec.wood, 0.08), { rough: 0.7, category: "decor" }));
    b2.position.set(-0.18, 0.483, 0.02);
    b2.rotation.y = 0.18;
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.16, 14), mat(shade(spec.wallAccent, -0.15), { rough: 0.35, clearcoat: 0.5, category: "decor" }));
    vase.position.set(0.24, 0.5, -0.05);
    for (const d of [b1, b2, vase]) {
      d.castShadow = shadows;
      d.layers.set(layer);
      d.userData.category = "decor";
      table.add(d);
      hotspots.push(d);
    }
  } else {
    const remote = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.06), mat("#3B3833", { rough: 0.6 }));
    remote.position.set(0.15, 0.455, 0.05);
    remote.layers.set(layer);
    table.add(remote);
  }
  table.layers.set(layer);
  group.add(table);
  hotspots.push(table);
  blob(0.1, 0.35, 1.5, 1.0);

  /* ——— floor lamp ——— */
  const lamp = new THREE.Group();
  lamp.position.set(1.95, 0, -1.7);
  const metalMat = mat(spec.metal, { rough: 0.32, metal: 0.85, envInt: 1.1, category: "lighting" });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 10), metalMat);
  pole.position.y = 0.725;
  pole.castShadow = shadows;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.025, 24), metalMat);
  foot.position.y = 0.0125;
  const shadeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.23, 0.3, 24, 1, true),
    mat(spec.lampGlow, { rough: 0.9, side: THREE.DoubleSide, emissive: spec.lampGlow, emissiveIntensity: 0.25, category: "lighting" }),
  );
  shadeMesh.position.y = 1.52;
  const bulbMat = mat("#FFF3D8", { emissive: spec.lampGlow, emissiveIntensity: 1.2, category: "lighting" });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), bulbMat);
  bulb.position.y = 1.48;
  glowMats.push({ mat: bulbMat, base: 1.2, night: 3.2 });
  glowMats.push({ mat: shadeMesh.material as THREE.MeshPhysicalMaterial, base: 0.25, night: 1.1 });
  for (const m of [pole, foot, shadeMesh, bulb]) {
    m.layers.set(layer);
    m.userData.category = "lighting";
    lamp.add(m);
  }
  lamp.layers.set(layer);
  group.add(lamp);
  hotspots.push(lamp);
  blob(1.95, -1.7, 0.7, 0.55);

  /* ——— plant ——— */
  const plantParts: THREE.Mesh[] = [];
  if (spec.plant && !dated) {
    const plant = new THREE.Group();
    plant.position.set(-2.35, 0, -1.85);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 18), mat("#A65E3F", { rough: 0.85, category: "plant" }));
    pot.position.y = 0.15;
    pot.castShadow = shadows;
    pot.layers.set(layer);
    pot.userData.category = "plant";
    plant.add(pot);
    const leafColors = ["#5F7457", "#6E8262", "#4E6349", "#66795B"];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.13, 0.85, 1, 6),
        mat(leafColors[i % 4], { rough: 0.7, side: THREE.DoubleSide, envInt: 0.3, category: "plant" }),
      );
      leaf.position.set(Math.cos(a) * 0.05, 0.68, Math.sin(a) * 0.05);
      leaf.rotation.y = a;
      leaf.rotation.x = -0.28 - (i % 3) * 0.1;
      leaf.castShadow = shadows;
      leaf.layers.set(layer);
      leaf.userData.category = "plant";
      plant.add(leaf);
      plantParts.push(leaf);
    }
    plant.layers.set(layer);
    group.add(plant);
    hotspots.push(plant);
    blob(-2.35, -1.85, 0.65, 0.55);
    animators.push((t) => {
      plantParts.forEach((leaf, i) => {
        leaf.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.045;
      });
    });
  }

  /* ——— art ——— */
  const artCount = spec.art === "none" ? 0 : variant === 1 ? 2 : variant === 2 ? 3 : 1;
  if (artCount > 0) {
    const widths = artCount === 1 ? [1.15] : artCount === 2 ? [0.75, 0.65] : [0.52, 0.56, 0.5];
    let cx = artCount === 1 ? 0 : artCount === 2 ? -0.45 : -0.75;
    for (let i = 0; i < artCount; i++) {
      const w = widths[i];
      const h = w * 0.72;
      const frame = new THREE.Group();
      frame.position.set(cx + w / 2, 1.72 + (i % 2) * 0.05, -D / 2 + 0.035);
      const fMat = mat(spec.metal, { rough: 0.4, metal: 0.6, envInt: 0.9, category: "art" });
      const border = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.035), fMat);
      const aTex = artTexture(spec);
      disposables.push(aTex);
      const canvasMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        mat("#ffffff", { map: aTex, rough: 0.9, envInt: 0.2, category: "art" }),
      );
      canvasMesh.position.z = 0.02;
      for (const m of [border, canvasMesh]) {
        m.layers.set(layer);
        m.userData.category = "art";
        m.castShadow = false;
        frame.add(m);
      }
      frame.layers.set(layer);
      group.add(frame);
      hotspots.push(frame);
      cx += w + 0.22;
    }
  }

  /* ——— sideboard / media unit ——— */
  if (dated || variant > 0) {
    const board = new THREE.Group();
    board.position.set(1.7, 0, -2.22);
    const bodyMat = mat(spec.wood, { rough: 0.5, clearcoat: 0.2, envInt: 0.6, category: "storage" });
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.52, 0.4, 3, 0.02), bodyMat);
    body.position.y = 0.4;
    body.castShadow = shadows;
    body.receiveShadow = true;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.44, 0.012), mat(shade(spec.wood, -0.14), { rough: 0.6 }));
    seam.position.set(0, 0.4, 0.2);
    for (const [lx] of [[-0.65], [0.65]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), bodyMat);
      leg.position.set(lx, 0.07, 0.12);
      leg.layers.set(layer);
      board.add(leg);
    }
    for (const m of [body, seam]) {
      m.layers.set(layer);
      m.userData.category = "storage";
      board.add(m);
    }
    if (dated) {
      const tv = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.07), mat("#1E1D1B", { rough: 0.3, clearcoat: 0.6, envInt: 1 }));
      tv.position.set(0, 0.95, 0);
      tv.castShadow = shadows;
      tv.layers.set(layer);
      board.add(tv);
    } else {
      const vase2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.2, 14), mat(shade(spec.wallAccent, -0.2), { rough: 0.4, category: "decor" }));
      vase2.position.set(-0.4, 0.76, 0);
      vase2.layers.set(layer);
      vase2.userData.category = "decor";
      board.add(vase2);
    }
    board.layers.set(layer);
    group.add(board);
    hotspots.push(board);
    blob(1.7, -2.22, 1.7, 0.6);
  }

  /* ——— dated clutter ——— */
  if (dated) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.45), mat("#B79A6F", { rough: 0.95 }));
    box.position.set(2.45, 0.2, 0.9);
    box.rotation.y = 0.4;
    box.castShadow = shadows;
    box.layers.set(layer);
    group.add(box);
    blob(2.45, 0.9, 0.8, 0.7);
  }

  /* ——— ceiling light ——— */
  if (spec.pendant && !dated) {
    const pend = new THREE.Group();
    pend.position.set(0.1, 0, 0.35);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, H - 2.1, 6), metalMat);
    cord.position.y = H - (H - 2.1) / 2;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(spec.metal, { rough: 0.35, metal: 0.8, envInt: 1, side: THREE.DoubleSide, category: "lighting" }),
    );
    dome.position.y = 2.06;
    dome.rotation.x = Math.PI;
    const pBulbMat = mat("#FFF3D8", { emissive: spec.lampGlow, emissiveIntensity: 1 });
    const pBulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), pBulbMat);
    pBulb.position.y = 2.02;
    glowMats.push({ mat: pBulbMat, base: 1, night: 2.6 });
    for (const m of [cord, dome, pBulb]) {
      m.layers.set(layer);
      pend.add(m);
    }
    pend.layers.set(layer);
    group.add(pend);
  } else if (dated) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), mat("#7A756A", { rough: 0.8 }));
    cord.position.set(0.1, H - 0.25, 0.35);
    const bareMat = mat("#F3E9C8", { emissive: "#F3E9C8", emissiveIntensity: 1 });
    const bareBulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), bareMat);
    bareBulb.position.set(0.1, H - 0.53, 0.35);
    glowMats.push({ mat: bareMat, base: 1, night: 2.4 });
    for (const m of [cord, bareBulb]) {
      m.layers.set(layer);
      group.add(m);
    }
  }

  /* ——— dust motes in the light shaft ——— */
  const dustGeo = new THREE.BufferGeometry();
  const dustCount = 110;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = -W / 2 + 0.2 + Math.random() * 2.4;
    dustPos[i * 3 + 1] = 0.3 + Math.random() * 1.9;
    dustPos[i * 3 + 2] = winZ - 1 + Math.random() * 2.4;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: "#FFEECC",
    size: 0.014,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  if (clip) dustMat.clippingPlanes = [clip];
  disposables.push(dustGeo, dustMat);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.layers.set(layer);
  group.add(dust);
  animators.push((t, dt) => {
    const p = dustGeo.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      let y = p.getY(i) + Math.sin(t + i) * 0.0004 - dt * 0.012;
      if (y < 0.2) y = 2.2;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.5 + i * 2.3) * 0.0006);
    }
    p.needsUpdate = true;
  });

  /* ——— time of day ——— */
  const daySky = new THREE.Color(spec.windowLight);
  const duskSky = new THREE.Color("#F4B37C");
  const nightSky = new THREE.Color("#26304A");
  const setTime = (t: number) => {
    // t: 0 dawn → 0.35 noon → 0.7 sunset → 1 night
    const dayness = t < 0.7 ? 1 - Math.abs(t - 0.35) / 0.5 : Math.max(0, 1 - (t - 0.7) / 0.15);
    const nightness = Math.max(0, (t - 0.7) / 0.3);
    const skyCol = daySky.clone();
    if (t > 0.45 && t <= 0.7) skyCol.lerp(duskSky, (t - 0.45) / 0.25);
    else if (t > 0.7) skyCol.copy(duskSky).lerp(nightSky, Math.min(1, (t - 0.7) / 0.2));
    skyMat.color.copy(skyCol);
    const lampsOn = nightness > 0.05 ? 1 : t > 0.55 ? (t - 0.55) / 0.15 : 0;
    for (const g of glowMats) g.mat.emissiveIntensity = g.base + lampsOn * g.night;
    dustMat.opacity = 0.4 * dayness;
  };
  setTime(0.3);

  const recolor = (category: ProductCategory, hex: string) => {
    for (const m of matsByCategory.get(category) ?? []) {
      m.color.set(hex);
    }
  };

  const animate = (t: number, dt: number) => {
    for (const fn of animators) fn(t, dt);
  };

  const dispose = () => {
    for (const d of disposables) d.dispose();
  };

  return { group, animate, setTime, hotspots, recolor, dispose };
}
