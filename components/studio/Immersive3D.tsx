"use client";

import { Aperture, Footprints, Moon, Orbit as OrbitIcon, ShoppingBag, Sun, Sunrise, Sunset, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import ProductDetailPanel from "@/components/ProductDetailPanel";
import { buildRoom, ROOM, type RoomHandles } from "@/lib/three/roomBuilder";
import { formatPrice } from "@/lib/products";
import type { Product, ProductCategory, RoomStyleSpec } from "@/lib/types";

interface Immersive3DProps {
  beforeSpec: RoomStyleSpec;
  afterSpec: RoomStyleSpec;
  variant: number;
  styleId: string;
  styleName: string;
  beforeLabel: string;
  products: Product[];
  onReplaceProduct?: (product: Product) => void;
  onAddProduct: (p: Product) => void;
  onBuyAll: () => void;
  onClose: () => void;
}

interface HoverInfo {
  category: ProductCategory;
  x: number;
  y: number;
}

const SPLIT_MIN = -2.75;
const SPLIT_MAX = 2.75;

/** Imperative three.js application driven by the React shell below. */
class RoomApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private bokeh: BokehPass;
  private clock = new THREE.Clock();
  private raf = 0;
  private before: RoomHandles | null = null;
  private after: RoomHandles | null = null;
  private beforePlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.2);
  private afterPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -0.2);
  private divider = new THREE.Group();
  private dividerHit: THREE.Mesh;
  private split = 0.2;
  private draggingDivider = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private hoverCategory: ProductCategory | null = null;
  private highlighted: THREE.MeshPhysicalMaterial[] = [];
  private mode: "orbit" | "walk" = "orbit";
  private yaw = -0.5;
  private pitch = -0.05;
  private keys = new Set<string>();
  private lookDrag: { x: number; y: number } | null = null;
  private time = 0.3;
  private disposed = false;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private fill!: THREE.PointLight;
  private lampPoint!: THREE.PointLight;
  private pendantPoint!: THREE.PointLight;

  constructor(
    private canvas: HTMLCanvasElement,
    private cbs: {
      onHover: (h: HoverInfo | null) => void;
      onSelect: (c: ProductCategory | null) => void;
      onSplit: (s: number) => void;
    },
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor("#0B0B0E");

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 60);
    this.camera.position.set(4.6, 2.5, 4.8);
    this.camera.layers.enable(1);
    this.camera.layers.enable(2);
    this.raycaster.layers.enable(1);
    this.raycaster.layers.enable(2);

    // Image-based lighting = soft global-illumination look
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0.2, 1.05, -0.3);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 11;
    this.controls.maxPolarAngle = 1.52;
    this.controls.minPolarAngle = 0.12;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;

    // Shared light rig — one physically-consistent set for both worlds
    // (three.js lights illuminate every rendered object regardless of layers,
    // so per-room lights would double-light the scene).
    this.hemi = new THREE.HemisphereLight("#EAF1F4", "#8A7458", 0.55);
    this.sun = new THREE.DirectionalLight("#FFF2DC", 3.2);
    this.sun.position.set(-6, 4.5, 0.6);
    this.sun.target.position.set(1.5, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -5;
    this.sun.shadow.camera.right = 5;
    this.sun.shadow.camera.top = 5;
    this.sun.shadow.camera.bottom = -5;
    this.sun.shadow.camera.far = 20;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.radius = 4;
    this.fill = new THREE.PointLight("#FFE9C4", 1.2, 9, 2);
    this.fill.position.set(1.5, 2.3, 1.7);
    this.lampPoint = new THREE.PointLight("#FFE3B0", 2, 6, 1.8);
    this.lampPoint.position.set(1.95, 1.45, -1.7);
    this.pendantPoint = new THREE.PointLight("#FFE3B0", 1, 7, 1.8);
    this.pendantPoint.position.set(0.1, 2.0, 0.35);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.lampPoint, this.pendantPoint);

    // Glowing divider between the two worlds — a faint film with a bright
    // frame outline, so it reads as a golden seam rather than a veil.
    const film = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.d + 0.1, ROOM.h),
      new THREE.MeshBasicMaterial({ color: "#E8C88A", transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    film.rotation.y = Math.PI / 2;
    film.position.y = ROOM.h / 2;
    const glowStrip = new THREE.MeshBasicMaterial({ color: "#E8C88A", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const beamFront = new THREE.Mesh(new THREE.BoxGeometry(0.022, ROOM.h, 0.022), glowStrip);
    beamFront.position.set(0, ROOM.h / 2, ROOM.d / 2 + 0.03);
    const beamBack = new THREE.Mesh(new THREE.BoxGeometry(0.022, ROOM.h, 0.022), glowStrip);
    beamBack.position.set(0, ROOM.h / 2, -ROOM.d / 2 - 0.03);
    const ceilStrip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, ROOM.d + 0.1), glowStrip);
    ceilStrip.position.y = ROOM.h - 0.011;
    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, ROOM.d + 0.3),
      new THREE.MeshBasicMaterial({ color: "#C8A96E", transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.y = 0.015;
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.022, 12, 32),
      new THREE.MeshBasicMaterial({ color: "#F1DCAE", transparent: true, opacity: 0.95 }),
    );
    handle.position.set(0, 1.3, ROOM.d / 2 + 0.28);
    this.dividerHit = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, ROOM.h + 0.6, ROOM.d + 1.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.dividerHit.position.y = ROOM.h / 2;
    this.divider.add(film, beamFront, beamBack, ceilStrip, floorGlow, handle, this.dividerHit);
    this.divider.position.x = this.split;
    this.scene.add(this.divider);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 4.5, aperture: 0.00011, maxblur: 0.0055 });
    this.bokeh.enabled = true;
    this.composer.addPass(this.bokeh);
    this.composer.addPass(new OutputPass());

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("click", this.onClick);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);

    this.loop();
  }

  /* ——— rooms ——— */
  setRooms(beforeSpec: RoomStyleSpec, afterSpec: RoomStyleSpec, variant: number) {
    for (const room of [this.before, this.after]) {
      if (room) {
        this.scene.remove(room.group);
        room.dispose();
      }
    }
    this.before = buildRoom({ spec: beforeSpec, dated: true, variant: 0, layer: 1, clip: this.beforePlane, shadows: false });
    this.after = buildRoom({ spec: afterSpec, dated: false, variant, layer: 2, clip: this.afterPlane, shadows: true });
    this.scene.add(this.before.group, this.after.group);
    this.applyTime();
    this.applySplit(this.split);
  }

  recolor(category: ProductCategory, hex: string) {
    this.after?.recolor(category, hex);
  }

  /* ——— divider ——— */
  applySplit(s: number) {
    this.split = THREE.MathUtils.clamp(s, SPLIT_MIN, SPLIT_MAX);
    this.beforePlane.constant = this.split;
    this.afterPlane.constant = -this.split;
    this.divider.position.x = this.split;
  }

  /* ——— time of day ——— */
  setTime(t: number) {
    this.time = t;
    this.applyTime();
  }
  private applyTime() {
    const t = this.time;
    this.before?.setTime(t);
    this.after?.setTime(t);
    const dayness = t < 0.7 ? 1 - Math.abs(t - 0.35) / 0.5 : Math.max(0, 1 - (t - 0.7) / 0.15);
    const nightness = Math.max(0, (t - 0.7) / 0.3);
    // Sun sweeps across the window wall through the day, warms toward sunset
    const sunElev = Math.sin(Math.min(t / 0.7, 1) * Math.PI) * 5 + 0.6;
    const sunSweep = -2.9 + Math.min(t / 0.7, 1) * 5;
    this.sun.position.set(-6.5, Math.max(0.4, sunElev), sunSweep);
    this.sun.intensity = 3.4 * Math.max(0.04, dayness) * (1 - nightness);
    const warm = t > 0.45 && t < 0.85 ? Math.min(1, ((t - 0.45) / 0.4) * 1.4) : 0;
    this.sun.color.set(new THREE.Color("#FFF4E0").lerp(new THREE.Color("#FF9E5A"), warm));
    this.hemi.intensity = 0.55 * Math.max(0.12, dayness) * (1 - nightness) + nightness * 0.09;
    const lampsOn = nightness > 0.05 ? 1 : t > 0.55 ? (t - 0.55) / 0.15 : 0;
    this.lampPoint.intensity = 2 + lampsOn * 15;
    this.pendantPoint.intensity = 1 + lampsOn * 10;
    this.fill.intensity = 1 + lampsOn * 2.4;
    this.renderer.toneMappingExposure = 1.05 - nightness * 0.38;
  }

  setDof(on: boolean) {
    this.bokeh.enabled = on;
  }

  setMode(mode: "orbit" | "walk") {
    this.mode = mode;
    this.highlight(null);
    this.hoverCategory = null;
    this.cbs.onHover(null);
    if (mode === "walk") {
      this.controls.enabled = false;
      this.camera.position.set(2.1, 1.55, 1.9);
      this.yaw = 0.85;
      this.pitch = -0.04;
    } else {
      this.controls.enabled = true;
      this.camera.position.set(4.6, 2.5, 4.8);
      this.controls.target.set(0.2, 1.05, -0.3);
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  /* ——— input ——— */
  private setPointer(e: PointerEvent | MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.controls.autoRotate = false;
    this.setPointer(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.intersectObject(this.dividerHit, false).length > 0) {
      this.draggingDivider = true;
      this.controls.enabled = false;
      return;
    }
    if (this.mode === "walk") {
      this.lookDrag = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    this.setPointer(e);
    if (this.draggingDivider) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hit)) {
        this.applySplit(hit.x);
        this.cbs.onSplit(this.split);
      }
      return;
    }
    if (this.mode === "walk" && this.lookDrag) {
      this.yaw -= (e.clientX - this.lookDrag.x) * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - (e.clientY - this.lookDrag.y) * 0.003, -0.9, 0.9);
      this.lookDrag = { x: e.clientX, y: e.clientY };
      return;
    }
    // Hotspot hover (redesigned room only, on its visible side of the divider)
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.after?.hotspots ?? [];
    const hits = this.raycaster.intersectObjects(targets, true);
    const hit = hits.find((h) => h.point.x >= this.split - 0.03);
    let category: ProductCategory | null = null;
    if (hit) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj && !obj.userData.category) obj = obj.parent;
      category = (obj?.userData.category as ProductCategory) ?? null;
    }
    if (category !== this.hoverCategory) {
      this.hoverCategory = category;
      this.highlight(category);
      this.canvas.style.cursor = category ? "pointer" : "grab";
    }
    this.cbs.onHover(category ? { category, x: e.clientX, y: e.clientY } : null);
  };

  private onPointerUp = () => {
    if (this.draggingDivider) {
      this.draggingDivider = false;
      if (this.mode === "orbit") this.controls.enabled = true;
    }
    this.lookDrag = null;
  };

  private onClick = () => {
    if (this.hoverCategory) this.cbs.onSelect(this.hoverCategory);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private highlight(category: ProductCategory | null) {
    for (const m of this.highlighted) {
      const base = m.userData.hlBase as { color: number; intensity: number } | undefined;
      if (base) {
        m.emissive.setHex(base.color);
        m.emissiveIntensity = base.intensity;
      }
    }
    this.highlighted = [];
    if (!category || !this.after) return;
    this.after.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.category === category && o.material instanceof THREE.MeshPhysicalMaterial) {
        const m = o.material;
        m.userData.hlBase = { color: m.emissive.getHex(), intensity: m.emissiveIntensity };
        if (m.emissive.getHex() === 0) {
          m.emissive.set("#C8A96E");
          m.emissiveIntensity = 0.18;
        } else {
          m.emissiveIntensity = m.emissiveIntensity + 0.35;
        }
        this.highlighted.push(m);
      }
    });
  }

  /* ——— frame loop ——— */
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.before?.animate(t, dt);
    this.after?.animate(t, dt);

    if (this.mode === "walk") {
      const speed = 1.9 * dt;
      const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(-1);
      const right = new THREE.Vector3(-forward.z, 0, forward.x);
      const move = new THREE.Vector3();
      if (this.keys.has("w") || this.keys.has("arrowup")) move.add(forward);
      if (this.keys.has("s") || this.keys.has("arrowdown")) move.sub(forward);
      if (this.keys.has("d") || this.keys.has("arrowright")) move.add(right);
      if (this.keys.has("a") || this.keys.has("arrowleft")) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed);
        this.camera.position.add(move);
        this.camera.position.x = THREE.MathUtils.clamp(this.camera.position.x, -2.5, 2.7);
        this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z, -2.05, 2.35);
      }
      this.camera.position.y = 1.55;
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, "YXZ"));
      this.bokeh.enabled = false;
    } else {
      this.controls.update();
      const bokehFocus = (this.bokeh.materialBokeh.uniforms as { focus: { value: number } }).focus;
      bokehFocus.value = this.camera.position.distanceTo(this.controls.target);
    }
    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("click", this.onClick);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.controls.dispose();
    for (const room of [this.before, this.after]) {
      if (room) {
        this.scene.remove(room.group);
        room.dispose();
      }
    }
    this.composer.dispose();
    this.renderer.dispose();
  }
}

/* ————————————————————————— React shell ————————————————————————— */

export default function Immersive3D({
  beforeSpec,
  afterSpec,
  variant,
  styleId,
  styleName,
  beforeLabel,
  products,
  onReplaceProduct,
  onAddProduct,
  onBuyAll,
  onClose,
}: Immersive3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<RoomApp | null>(null);
  const prevProducts = useRef<Product[]>(products);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [selected, setSelected] = useState<ProductCategory | null>(null);
  const [split, setSplit] = useState(0.2);
  const [time, setTime] = useState(0.3);
  const [mode, setMode] = useState<"orbit" | "walk">("orbit");
  const [dof, setDof] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);

  const total = products.reduce((n, p) => n + p.price, 0);
  const selectedProduct = selected ? products.find((p) => p.category === selected) : undefined;

  // Create the app once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    let app: RoomApp;
    try {
      app = new RoomApp(canvas, {
        onHover: setHover,
        onSelect: (c) => setSelected(c),
        onSplit: setSplit,
      });
    } catch (err) {
      console.error("[maison] WebGL unavailable:", err);
      setWebglFailed(true);
      return;
    }
    appRef.current = app;
    const ro = new ResizeObserver(() => {
      app.resize(frame.clientWidth, frame.clientHeight);
    });
    ro.observe(frame);
    app.resize(frame.clientWidth, frame.clientHeight);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      app.dispose();
      appRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build rooms when specs change.
  useEffect(() => {
    appRef.current?.setRooms(beforeSpec, afterSpec, variant);
  }, [beforeSpec, afterSpec, variant]);

  // Recolor swapped products live.
  useEffect(() => {
    const prev = prevProducts.current;
    for (const p of products) {
      const old = prev.find((o) => o.category === p.category);
      if (old && old.id !== p.id) appRef.current?.recolor(p.category, p.color);
    }
    prevProducts.current = products;
  }, [products]);

  useEffect(() => {
    appRef.current?.setTime(time);
  }, [time]);
  useEffect(() => {
    appRef.current?.setDof(dof);
  }, [dof]);
  useEffect(() => {
    appRef.current?.setMode(mode);
  }, [mode]);

  const setSplitBoth = useCallback((s: number) => {
    setSplit(s);
    appRef.current?.applySplit(s);
  }, []);

  const recolorSelected = (hex: string) => {
    if (selected) appRef.current?.recolor(selected, hex);
  };

  const handleReplace = (product: Product) => {
    onReplaceProduct?.(product);
    setSelected(null);
  };

  const TIME_PRESETS = [
    { t: 0.08, label: "Dawn", icon: Sunrise },
    { t: 0.32, label: "Noon", icon: Sun },
    { t: 0.62, label: "Golden", icon: Sunset },
    { t: 0.95, label: "Night", icon: Moon },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line/70 px-5 py-3">
        <div>
          <div className="eyebrow">Immersive room · {styleName}</div>
          <div className="text-xs text-cream-faint">
            {mode === "orbit"
              ? "Drag to orbit · scroll to zoom · drag the golden divider to morph between worlds · click any object to shop it"
              : "Drag to look · WASD / arrows to walk · drag the golden divider to morph"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-ink-line">
            <button
              onClick={() => setMode("orbit")}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition ${mode === "orbit" ? "bg-brass/15 text-brass-bright" : "text-cream-dim hover:text-cream"}`}
            >
              <OrbitIcon size={13} /> Orbit
            </button>
            <button
              onClick={() => setMode("walk")}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold transition ${mode === "walk" ? "bg-brass/15 text-brass-bright" : "text-cream-dim hover:text-cream"}`}
            >
              <Footprints size={13} /> Walk
            </button>
          </div>
          <button
            onClick={() => setDof(!dof)}
            className={`btn-ghost !px-3.5 !py-2 text-xs ${dof ? "!border-brass/50 !text-brass-bright" : ""}`}
            title="Cinematic depth of field"
          >
            <Aperture size={13} /> DoF
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-ink-line p-2.5 text-cream-dim transition hover:border-brass/50 hover:text-cream"
            aria-label="Exit immersive room"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={frameRef} className="relative flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="h-full w-full" style={{ display: "block", touchAction: "none" }} />
        {webglFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-cream-dim">
            Your browser couldn&apos;t start WebGL — the immersive room needs hardware acceleration enabled.
          </div>
        )}

        {/* World labels */}
        <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-cream backdrop-blur">
          {beforeLabel}
        </span>
        <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-brass/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink backdrop-blur">
          {styleName}
        </span>

        {/* Hover tooltip */}
        {hover && !selected && (() => {
          const p = products.find((x) => x.category === hover.category);
          if (!p) return null;
          return (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-xl border border-brass/40 bg-ink/90 px-3.5 py-2 backdrop-blur"
              style={{ left: hover.x, top: Math.max(70, hover.y - 64) }}
            >
              <div className="text-sm font-semibold text-cream">{p.name}</div>
              <div className="text-[11px] text-cream-faint">
                {p.brand} · <span className="font-semibold text-brass-bright">{formatPrice(p.price)}</span>
              </div>
            </div>
          );
        })()}

      </div>

      {/* Footer controls */}
      <div className="grid gap-3 border-t border-ink-line/70 px-5 py-3.5 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-cream-faint">{beforeLabel}</span>
          <input
            type="range"
            min={SPLIT_MIN}
            max={SPLIT_MAX}
            step={0.01}
            value={split}
            onChange={(e) => setSplitBoth(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-ew-resize appearance-none rounded-full bg-ink-line accent-[#C8A96E]"
            aria-label="Before / after divider"
          />
          <span className="text-[10px] uppercase tracking-widest text-brass-bright">{styleName}</span>
        </div>
        <div className="flex items-center gap-2">
          {TIME_PRESETS.map(({ t, label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => setTime(t)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] transition ${Math.abs(time - t) < 0.08 ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"}`}
            >
              <Icon size={11} /> {label}
            </button>
          ))}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={time}
            onChange={(e) => setTime(Number(e.target.value))}
            className="h-1.5 w-24 appearance-none rounded-full bg-ink-line accent-[#C8A96E]"
            aria-label="Time of day"
          />
        </div>
        <button onClick={onBuyAll} className="btn-primary !py-2.5">
          <ShoppingBag size={14} /> Buy the room · {formatPrice(total)}
        </button>
      </div>

      {selectedProduct && (
        <ProductDetailPanel
          product={selectedProduct}
          styleId={styleId}
          onClose={() => setSelected(null)}
          onReplace={handleReplace}
          onRecolor={recolorSelected}
        />
      )}
    </div>,
    document.body,
  );
}
