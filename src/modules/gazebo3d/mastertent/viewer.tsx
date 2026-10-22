"use client";

import { ContactShadows, OrbitControls, PerspectiveCamera, useGLTF, useTexture } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, use, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, FrontSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera as Camera, RepeatWrapping, SRGBColorSpace, Vector3, type Texture } from "three";
import { configToParams, sides, wallSlotId, type GazeboConfig, type WallStyle } from "../model";
import { buildDecals, decalFontReady, setCurtainOpen, type DecalOptions } from "./decal";
import { flattenScene, footprint, placeWall, wallBays, type Part, type SceneFile } from "./scene";
import { wallPaint, type WallDesign } from "./wall-paint";

const BASE = "/models/mastertent";

/** Konfigüratördeki duvar tipleri → Mastertent duvar varyant sahneleri */
const wallVariant: Record<Exclude<WallStyle, "yok">, string> = {
  kapali: "standard",
  pencereli: "fenster",
  kapili: "tuer",
  yarim: "halbwand",
};

/** Seçilen kumaş rengini alan malzemeler */
const fabricMaterials = new Set([
  "mastertent.basics.pirontex_pantone11_0601",
  "mastertent.basics.klett_pantone11_0601",
  "mastertent.basics.swu_pirontex_pantone11_0601",
  "mastertent.basics.print_klassik_3x3_g",
  "mastertent.basics.print_roof_inside",
]);

/** Baskı yüzeyleri: tavan örtüsü (iki yarım; eğimli yüzler tavan, dik yüzler saçak) ve duvar kumaşı (katman) */
// Tüm ölçülerin tavan örtüsü geometrileri (her ölçüde iki yarım; skygorselcozumler konfigüratöründen)
const CANOPY = new Set([
  "55a58833224843d4b62e5c4605fc15d1", "0b5b2c7e293ab17cce29ce1894fce5c8", "ae43ad86a2dd11cbfe87a62da0dd7751",
  "580f4cd3b1741478192fa53d43114a48", "08e005c846766477f7b6dab2da3b9df2", "52b2672cd9216cefcada295764ef8561",
  "42d8a8c4c27dd0ca8b7e3db3288f5b1d", "c3479347d6e1c2f12a7e2e3a277a39ce", "611b4933b3b162d5d6e13432bc3b6b18",
  "a2e1577da76037031df540b3cce06216", "396b1f23550a9ba6a48010094e120e3c", "e4f55fe679fa265602243dce63ac67f8",
  "c42d71b3bc67dcccfc38e45988db9901", "72fdca84adb55b7daa73e45cc09d1033", "f6cc4de2b7700335eb5e2c007479c6a1",
  "4d31db63a832f5105da93f71842104d5",
]);

/** 4 m derinlikli ölçülerde duvarlar daha yüksektir (dikey ölçek) */
const TALL_WALL_SCALE: Record<string, number> = { "4x4": 1.0588, "6x4": 1.0588, "8x4": 1.0588 };
/** Sahnede bulunmayan, uzun kenar ortasındaki ek ayakların konumları (köşe ayağına göre ofset) */
const EXTRA_LEG_OFFSETS: Record<string, { dx: number; dz: number }[]> = {
  "6x4": [
    { dx: 2, dz: 0.03 },
    { dx: 4, dz: 0.03 },
    { dx: 2, dz: 3.82 },
    { dx: 4, dz: 3.82 },
  ],
};
const LEG_LAYERS = ["_STRUK_D3_FUSS", "_STRUK_D3_GESTELL", "_STRUK_D3_PLASTIK", "_STRUK_D3_VERSTELL_KNOPF"];
const isWallFabric = (part: Part) => part.layer.includes("SEIT_D3_SEITENWAND");
/** Çizilmiş duvarda (wall-paint) düz kumaş gizlenir, yerine çizim katmanı görünür */
const HIDDEN = new MeshBasicMaterial({ visible: false });

/** Aynı etiket tanımı için aynı dizi nesnesi döner (parça mesh'leri gereksiz yeniden kurulmaz) */
const decalSpecCache = new Map<string, DecalOptions[]>();
function decalSpecs(specs: DecalOptions[]) {
  const key = JSON.stringify(specs);
  if (!decalSpecCache.has(key)) decalSpecCache.set(key, specs);
  return decalSpecCache.get(key)!;
}

const sceneCache = new Map<string, Promise<SceneFile>>();
const placedWalls = new Map<string, Part[]>();
/** Sahne dosyasını yükler; yoksa (ör. ölçüye özel duvar sahnesi) yedek adresi dener */
function loadScene(url: string, fallbackUrl?: string) {
  if (!sceneCache.has(url)) {
    sceneCache.set(
      url,
      fetch(url).then((r) => {
        if (r.ok) return r.json();
        if (fallbackUrl) return fetch(fallbackUrl).then((f) => f.json());
        throw new Error(`Sahne bulunamadı: ${url}`);
      }),
    );
  }
  return sceneCache.get(url)!;
}

function useMaterials(frameColor: string, metallicFrame: boolean, fabricHex: string) {
  const loaded = useTexture({
    seamCorner: `${BASE}/textures/seam_corner_blau.png`,
    seamCornerNormal: `${BASE}/textures/seam_corner_normal.png`,
    spanngurt: `${BASE}/textures/spanngurt.png`,
  });
  // Hook'tan dönen dokular değiştirilmez; ayarlar klonlar üzerinde yapılır
  const tex = useMemo(() => {
    const prepare = (t: Texture, srgb: boolean) => {
      const c = t.clone();
      c.wrapS = c.wrapT = RepeatWrapping;
      c.anisotropy = 8;
      if (srgb) c.colorSpace = SRGBColorSpace;
      c.needsUpdate = true;
      return c;
    };
    return {
      seamCorner: prepare(loaded.seamCorner, true),
      seamCornerNormal: prepare(loaded.seamCornerNormal, false),
      spanngurt: prepare(loaded.spanngurt, true),
    };
  }, [loaded]);
  return useMemo(() => {
    // Alüminyum hafif metalik (ortam haritası olmadığı için yüksek metaliklik koyu görünür), boyalı çelik mat
    const frame = metallicFrame
      ? new MeshStandardMaterial({ color: frameColor, metalness: 0.45, roughness: 0.35 })
      : new MeshStandardMaterial({ color: frameColor, metalness: 0.25, roughness: 0.55 });
    const fabric = new MeshStandardMaterial({ color: new Color().setStyle(fabricHex, "srgb"), roughness: 0.7, metalness: 0, side: FrontSide });
    const map: Record<string, MeshStandardMaterial> = {
      "mastertent.basics.frame_alu": frame,
      "mastertent.basics.alu_elox": frame,
      "mastertent.basics.stainless_steel": new MeshStandardMaterial({ color: "#a8adb3", metalness: 0.95, roughness: 0.2 }),
      "mastertent.basics.plastic_ral7001": new MeshStandardMaterial({ color: "#8c95a0", metalness: 0.05, roughness: 0.55 }),
      "mastertent.basics.plastic_ral5007": new MeshStandardMaterial({ color: "#2a2d31", metalness: 0.05, roughness: 0.45 }),
      "mastertent.basics.plastic_black": new MeshStandardMaterial({ color: "#1a1c1e", metalness: 0.05, roughness: 0.5 }),
      "mastertent.basics.plastic_anthrazit": new MeshStandardMaterial({ color: "#3a3d40", metalness: 0.05, roughness: 0.55 }),
      "mastertent.basics.plastic_grey": new MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.05, roughness: 0.55 }),
      "mastertent.basics.seam_corner_blau": new MeshStandardMaterial({ map: tex.seamCorner, normalMap: tex.seamCornerNormal, roughness: 0.7, side: FrontSide }),
      "mastertent.basics.spanngurt": new MeshStandardMaterial({ map: tex.spanngurt, roughness: 0.85 }),
      "mastertent.basics.window": new MeshStandardMaterial({ color: "#cfd8dc", roughness: 0.15, transparent: true, opacity: 0.35, side: DoubleSide }),
      "egr.aci.aci7": new MeshStandardMaterial({ color: "#dcdcdc", roughness: 0.7 }),
    };
    for (const name of fabricMaterials) map[name] = fabric;
    return map;
  }, [tex, frameColor, metallicFrame, fabricHex]);
}

function PartMesh({
  part,
  material,
  decals,
  center,
}: {
  part: Part;
  material: MeshStandardMaterial | undefined;
  decals?: DecalOptions[];
  center: Vector3;
}) {
  const { scene } = useGLTF(`${BASE}/glb/${part.geometry}.glb`);
  const object = useMemo(() => {
    const clone = scene.clone(true) as Group;
    clone.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        if (material) child.material = material;
        meshes.push(child);
      }
    });
    // Baskılı yüzeyde "LOGONUZ BURADA" etiketi; çizilmiş duvarda duvarın tamamı
    for (const spec of decals ?? []) {
      for (const mesh of meshes) {
        const meshToTent = new Matrix4().multiplyMatrices(part.matrix, mesh.matrixWorld);
        for (const overlay of buildDecals(mesh, meshToTent, center, spec)) mesh.add(overlay);
        if (spec.paint) mesh.material = HIDDEN;
      }
    }
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(part.matrix);
    return clone;
  }, [scene, material, part.matrix, decals, center]);
  return <primitive object={object} />;
}

type TentProps = {
  sizeKey: string;
  width: number;
  depth: number;
  config: GazeboConfig;
  fabricHex: string;
  frameColor?: string;
  registerArSource?: (source: (() => Group | null) | null) => void;
  /** Duvar yuvası → kodla çizilen duvar tipi (hazır 3D modeli olmayan duvarlar; standart duvarın üstüne çizilir) */
  wallDesigns?: Partial<Record<string, WallDesign>>;
  /** Duvar duvar baskı (yuva → baskılı mı); verilmezse config.printed tüm duvarlara uygulanır */
  printedWalls?: Partial<Record<string, boolean>>;
  /** Tavan baskılı mı; verilmezse config.printed */
  printedRoof?: boolean;
  /** Duvar kumaşının rengi; verilmezse tavanla aynı (fabricHex) */
  wallHex?: string;
};

function Tent({ sizeKey, width, depth, config, fabricHex, wallHex, frameColor, registerArSource, wallDesigns, printedWalls, printedRoof }: TentProps) {
  // AR için ekrandaki çadır modeline erişim
  const groupRef = useRef<Group>(null);
  useEffect(() => {
    registerArSource?.(() => groupRef.current);
    return () => registerArSource?.(null);
  }, [registerArSource]);

  const base = use(loadScene(`${BASE}/scene-${sizeKey}.json`));
  // Yalnızca seçili duvar tiplerinin sahneleri (ve parçaları) indirilir
  const usedStyles = new Set(Object.values(config.walls).filter((s) => s !== "yok"));
  const usedVariants = [...usedStyles].map((style) => wallVariant[style as Exclude<WallStyle, "yok">]);
  if (wallDesigns && Object.keys(wallDesigns).length) usedVariants.push("standard");
  const variants: Record<string, SceneFile> = {};
  // Ölçüye özel duvar sahnesi yoksa 3x3 duvarları kullanılır (kenar uzunluğuna göre ölçeklenir)
  for (const v of usedVariants) variants[v] = use(loadScene(`${BASE}/scene-${sizeKey}-${v}.json`, `${BASE}/scene-3x3-${v}.json`));

  // İskelet rengi gerçek ürüne göre (30 mm çelik beyaz, 40 mm çelik siyah boyalı, alüminyum gümüş)
  const materials = useMaterials(frameColor ?? "#c4c8cc", config.frame.startsWith("aluminyum"), fabricHex);
  // Duvarlar tavandan farklı renkte olabilir (verilmezse tavanla aynı)
  const wallFabric = wallHex ?? fabricHex;
  const wallMaterials = useMaterials(frameColor ?? "#c4c8cc", config.frame.startsWith("aluminyum"), wallFabric);

  const baseParts = useMemo(() => {
    // Çatıdaki üretici logosu gösterilmez
    const parts = flattenScene(base).filter((p) => !p.layer.includes("_SEIT_D3_") && !p.layer.includes("DACH_D3_LOGO"));
    // Uzun kenarlı bazı ölçülerde orta ayaklar sahnede yoktur: köşe ayağı kopyalanarak eklenir
    const offsets = EXTRA_LEG_OFFSETS[sizeKey];
    if (!offsets) return parts;
    const pos = new Vector3();
    const cornerLeg = parts.filter((p) => {
      if (!LEG_LAYERS.some((l) => p.layer.includes(l))) return false;
      pos.setFromMatrixPosition(p.matrix);
      return pos.y <= 1.8 && Math.abs(pos.x) < 0.15 && Math.abs(pos.z) < 0.15;
    });
    const extra = offsets.flatMap(({ dx, dz }) =>
      cornerLeg.map((p) => ({ ...p, matrix: new Matrix4().makeTranslation(dx, 0, dz).multiply(p.matrix) })),
    );
    return [...parts, ...extra];
  }, [base, sizeKey]);
  const fp = useMemo(() => footprint(baseParts, width, depth), [baseParts, width, depth]);
  // Kenara yerleştirilmiş duvar parçaları önbellekten gelir; matrisler sabit kalır, gereksiz yeniden kurulum olmaz
  // Uzun kenarda ara ayak varsa her bölmeye ayrı duvar takılır (ör. 4x8'de uzun kenarda 2, 4x6'da 3 duvar)
  const wallParts = sides.flatMap((side) => {
    const bays = wallBays(fp, side);
    return bays.flatMap((bay, i) => {
      const slot = wallSlotId(side, i, bays.length);
      const design = wallDesigns?.[slot];
      const style = config.walls[slot] ?? "yok";
      if (style === "yok" && !design) return [];
      const variant = design ? "standard" : wallVariant[style as Exclude<WallStyle, "yok">];
      const key = `${sizeKey}|${side}|${i}|${variant}`;
      if (!placedWalls.has(key)) {
        const parts = flattenScene(variants[variant]).filter((p) => p.layer.includes("_SEIT_D3_"));
        const scaleY = TALL_WALL_SCALE[sizeKey];
        const move = new Matrix4().makeTranslation(bay.shift).multiply(new Matrix4().makeScale(1, scaleY ?? 1, 1));
        placedWalls.set(
          key,
          placeWall(parts, side, bay.fp).map((p) => ({ ...p, matrix: move.clone().multiply(p.matrix) })),
        );
      }
      return placedWalls.get(key)!.map((p) => ({ ...p, key: design ? `${key}|${design}` : key, slot }));
    });
  });

  const center = useMemo(() => new Vector3(fp.minX + fp.spanX / 2, 1, fp.minZ + fp.spanZ / 2), [fp]);
  // Çizilmiş duvarların katmanı: tasarım ve renk başına bir dizi (mesh'ler gereksiz yeniden kurulmaz)
  const wallPrinted = (slot?: string) => (printedWalls ? !!(slot && printedWalls[slot]) : config.printed);
  // Çizilmiş duvarların katmanı: tasarım, baskı ve renk başına bir dizi (mesh'ler gereksiz yeniden kurulmaz)
  const paintSpecs = useMemo(() => {
    const keys = new Set(
      Object.entries(wallDesigns ?? {}).map(([slot, d]) => `${d}|${+(printedWalls ? !!printedWalls[slot] : config.printed)}`),
    );
    return Object.fromEntries(
      [...keys].map((k) => {
        const [d, p] = k.split("|");
        return [k, [{ bothSides: true, paint: wallPaint(d, wallFabric, p === "1") }]];
      }),
    ) as Record<string, DecalOptions[]>;
  }, [wallDesigns, printedWalls, config.printed, wallFabric]);
  const decalsFor = (part: Part & { key?: string; slot?: string }, isWall: boolean): DecalOptions[] | undefined => {
    const design = isWall && isWallFabric(part) ? part.key?.split("|")[4] : undefined;
    if (design) return paintSpecs[`${design}|${+wallPrinted(part.slot)}`];
    if (isWall) {
      if (!wallPrinted(part.slot)) return undefined;
      if (!isWallFabric(part)) return undefined;
      // Kapılı duvarda kapının iki yanına, pencereli duvarda pencerelerin altına
      if (part.key?.endsWith("|tuer")) return decalSpecs([{ scale: 0.3, vCenter: 0.55, uCenters: [0.17, 0.83], bothSides: true }]);
      // Pencereli duvar şeffaf PVC'lidir, baskı yapılmaz (fiyat listesinde de baskılısı yok)
      if (part.key?.endsWith("|fenster")) return undefined;
      return decalSpecs([{ scale: 0.62, vCenter: 0.52, bothSides: true }]);
    }
    if (!(printedRoof ?? config.printed)) return undefined;
    if (!CANOPY.has(part.geometry)) return undefined;
    const specs: DecalOptions[] = [];
    // Tavan yüzü üçgen: etiket küçük ve saçağa yakın, geniş kısımda durur
    specs.push({ scale: 0.6, vCenter: 0.36, faces: "slope" }, { scale: 0.78, vCenter: 0.5, faces: "band" });
    return decalSpecs(specs);
  };

  return (
    <group ref={groupRef} position={[-(fp.minX + fp.spanX / 2), 0, -(fp.minZ + fp.spanZ / 2)]}>
      {baseParts.map((part, i) => (
        <PartMesh key={i} part={part} material={materials[part.material]} decals={decalsFor(part, false)} center={center} />
      ))}
      {wallParts.map((part, i) => (
        <PartMesh key={`${part.key}-${i}`} part={part} material={wallMaterials[part.material]} decals={decalsFor(part, true)} center={center} />
      ))}
    </group>
  );
}

/** Perdeleri açıp kapatma animasyonu (~0,9 sn); yalnızca hareket sürerken kare çizilir */
function CurtainAnimator({ open }: { open: boolean }) {
  const t = useRef(open ? 1 : 0);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [open, invalidate]);
  useFrame((_, delta) => {
    const target = open ? 1 : 0;
    if (t.current === target) return;
    const step = Math.min(delta, 0.05) / 0.9;
    t.current = open ? Math.min(1, t.current + step) : Math.max(0, t.current - step);
    setCurtainOpen(t.current);
    invalidate();
  });
  return null;
}

const TARGET: [number, number, number] = [0, 1.3, 0];
// Sol-ön, hafif yukarıdan bakış (sepet görseliyle aynı açı)
const VIEW_DIR = [-4.4, 1.7, 5.6].map((v, _, a) => v / Math.hypot(...a));
const FOV = 40;

/** Modeli ekranın dar kenarına göre sığdıran kamera (dar mobil ekranda geri çekilir). */
function FitCamera({ radius }: { radius: number }) {
  const aspect = useThree((state) => state.size.width / state.size.height);
  const vfov = (FOV * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
  const position = VIEW_DIR.map((d, i) => TARGET[i] + d * distance) as [number, number, number];
  return <PerspectiveCamera makeDefault fov={FOV} position={position} />;
}

export type Snapshot = { key: string; url: string };
/** Anlık görüntü; dir verilirse o yönden (birim vektör, çadır merkezinden kameraya), yoksa varsayılan sol-ön açıdan */
export type Capture = (dir?: readonly number[]) => Snapshot;
/** Sağ-arka çapraz açı: sol-ön ile birlikte dört kenarın hepsi görünür */
export const REAR_VIEW_DIR = [4.4, 1.7, -5.6].map((v, _, a) => v / Math.hypot(...a));
const SHOT_W = 600;
const SHOT_H = 450;

/**
 * Modelin sabit açıdan 4:3 görüntüsünü alır. Sürekli çizim yapılmaz: yapılandırma değişip
 * model hazır olduktan kısa süre sonra tek kare çizilir, ardından ekran eski kamerayla geri çizilir.
 */
function Snapshotter({
  snapshotKey,
  radius,
  onSnapshot,
  registerCapture,
}: {
  snapshotKey: string;
  radius: number;
  onSnapshot?: (shot: Snapshot) => void;
  registerCapture?: (capture: Capture | null) => void;
}) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  const capture = useMemo(
    () =>
      (dir: readonly number[] = VIEW_DIR): Snapshot => {
      const src = gl.domElement;
      const cropAspect = SHOT_W / SHOT_H;
      const aspect = src.width / src.height;
      // Ekranın ortasından 4:3 bir kesit alınır; kamera modeli bu kesite sığdıracak uzaklığa konur
      const cropW = aspect > cropAspect ? src.height * cropAspect : src.width;
      const cropH = aspect > cropAspect ? src.height : src.width / cropAspect;
      const tanV = Math.tan((FOV * Math.PI) / 360) * (cropH / src.height);
      const half = Math.atan(Math.min(tanV, tanV * cropAspect));
      // Görüntüde çadır kadrajı doldursun (sınır küresi gerçek siluetten büyüktür)
      const distance = (radius * 0.88) / Math.sin(half);
      const shotCamera = new Camera(FOV, aspect, 0.1, 100);
      shotCamera.position.set(...(dir.map((d, i) => TARGET[i] + d * distance) as [number, number, number]));
      shotCamera.lookAt(...TARGET);

      gl.render(scene, shotCamera);
      const canvas = document.createElement("canvas");
      canvas.width = SHOT_W;
      canvas.height = SHOT_H;
      canvas.getContext("2d")!.drawImage(src, (src.width - cropW) / 2, (src.height - cropH) / 2, cropW, cropH, 0, 0, SHOT_W, SHOT_H);
      gl.render(scene, camera);

      let url = canvas.toDataURL("image/webp", 0.8);
      // WebP desteklemeyen tarayıcılar PNG döndürür; boyut için JPEG'e düşülür
      if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.85);
      return { key: snapshotKey, url };
    },
    [gl, scene, camera, radius, snapshotKey],
  );

  useEffect(() => {
    registerCapture?.(capture);
    return () => registerCapture?.(null);
  }, [capture, registerCapture]);

  useEffect(() => {
    if (!onSnapshot) return;
    // Hızlı ardışık değişikliklerde yalnızca son durum çekilir; baskı deseninin fontu hazır olunca
    let cancelled = false;
    const timer = setTimeout(() => decalFontReady.then(() => !cancelled && onSnapshot(capture())), 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [capture, onSnapshot]);

  return null;
}

export type ViewerProps = {
  sizeKey: string;
  width: number;
  depth: number;
  config: GazeboConfig;
  fabricHex: string;
  /** Seçili iskeletin rengi (veriden) */
  frameColor?: string;
  /** Model her yeni yapılandırmada hazır olunca alınan görüntü */
  onSnapshot?: (shot: Snapshot) => void;
  /** Anlık görüntü alma fonksiyonunu dışarı verir (ör. sepete eklerken) */
  registerCapture?: (capture: Capture | null) => void;
  /** AR için ekrandaki çadır modelini dışarı verir */
  registerArSource?: (source: (() => Group | null) | null) => void;
  /** Duvar yuvası → kodla çizilen duvar tipi (bkz. wall-paint.ts) */
  wallDesigns?: Partial<Record<string, WallDesign>>;
  /** Duvar duvar baskı (yuva → baskılı mı); verilmezse config.printed tüm duvarlara uygulanır */
  printedWalls?: Partial<Record<string, boolean>>;
  /** Tavan baskılı mı; verilmezse config.printed */
  printedRoof?: boolean;
  /** Duvar kumaşının rengi; verilmezse tavanla aynı (fabricHex) */
  wallHex?: string;
  /** Kodla çizilen duvarlarda perdeler açık mı (değişince animasyonla açılır/kapanır) */
  curtainsOpen?: boolean;
};

export default function MastertentViewer({ onSnapshot, registerCapture, registerArSource, ...props }: ViewerProps) {
  // Yeni duvar modeli inerken önceki görünüm ekranda kalır (çadır bir anlığına kaybolmaz)
  const config = useDeferredValue(props.config);
  const fabricHex = useDeferredValue(props.fabricHex);
  const solidHex = fabricHex.startsWith("#") ? fabricHex : "#6b6b3a";
  const wallHex = useDeferredValue(props.wallHex);
  const radius = Math.hypot(props.width, props.depth) / 2 + 0.6;
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      // Boyut, CSS dönüşümünden etkilenmeyen offset ölçüsüyle alınır: mobilde alan küçülürken tuval yeniden boyutlanmaz/kaymaz
      resize={{ offsetSize: true }}
      // Dikey kaydırma sayfayı kaydırır, yatay sürükleme modeli döndürür (parmak modelin üstündeyken sayfa takılmaz).
      // OrbitControls tuvale satır içi touch-action: none yazdığı için !important ile ezilir.
      className="touch-pan-y [&_canvas]:touch-pan-y!"
    >
      <FitCamera radius={radius} />
      <color attach="background" args={["#f4f4f4"]} />
      <hemisphereLight args={["#ffffff", "#cfcfcf", 1.4]} />
      <directionalLight position={[5, 8, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -3]} intensity={0.6} />
      <Suspense fallback={null}>
        <Tent {...props} config={config} fabricHex={solidHex} wallHex={wallHex?.startsWith("#") ? wallHex : undefined} registerArSource={registerArSource} />
        <CurtainAnimator open={props.curtainsOpen ?? true} />
        <ContactShadows position={[0, 0.001, 0]} opacity={0.45} scale={10} blur={2.2} far={4} />
        <Snapshotter
          snapshotKey={configToParams(config).toString()}
          radius={radius}
          onSnapshot={onSnapshot}
          registerCapture={registerCapture}
        />
      </Suspense>
      <OrbitControls
        target={TARGET}
        enablePan={false}
        minDistance={3.5}
        maxDistance={16}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
        makeDefault
      />
    </Canvas>
  );
}
