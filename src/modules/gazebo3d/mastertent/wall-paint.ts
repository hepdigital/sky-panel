import { wallPrintTexture } from "./decal";
import { CanvasTexture, DoubleSide, EquirectangularReflectionMapping, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";

/**
 * Kodla çizilen duvarlar (hazır 3D modeli olmayanlar). Duvar modülerdir; gerçek ürün kuralları:
 * - Pencere 137×137 cm: şeffaf PVC ve/veya sineklik; perde (kumaş kapak) isteğe bağlı ektir.
 * - Kapı 90 cm genişlik, duvar boyunca (üstte boşluk yok): perde her zaman vardır, yalnızca sineklik eklenebilir (PVC olmaz).
 * - Açıklıklar duvarda ortalanır; pencere + kapı birlikteyse grup olarak.
 * Perde açıkken yukarıda 3D rulo olarak toplanır, kapalıyken fermuarla kapanmış kumaş görünür (bkz. decal.ts).
 * Standart duvarın yüzeyine doku olarak giydirilir; ölçüler metre cinsinden duvara göre hesaplanır.
 */
export type Opening = { pvc: boolean; sineklik: boolean; perde?: boolean };
/** Perdenin açık/kapalı durumu dokuya girmez: kapak ayrı 3D yüzeydir ve animasyonla açılıp kapanır (bkz. decal.ts) */
export type WallSpec = { pencere?: Opening; kapi?: Opening };
/** Açıklığı olmayan özel duvarlar: tamamı sineklik olan duvar ve ortadan tek fermuarlı duvar */
export const SPECIAL_WALLS = ["tam-sineklik", "tek-fermuar", "tam-pvc"] as const;

/**
 * Duvar tanımının kısa anahtarı (önbellek ve parça anahtarı için; "|" içermez).
 * Pencere: PVC, sineklik, perde (ör. "p101" = PVC + perde); kapı: sineklik (ör. "k1"); "x" = yok. Örnek: "p100-k1".
 */
export type WallDesign = string;
export const wallDesignKey = (s: WallSpec): WallDesign =>
  `p${s.pencere ? `${+s.pencere.pvc}${+s.pencere.sineklik}${+!!s.pencere.perde}` : "x"}-k${s.kapi ? `${+s.kapi.sineklik}` : "x"}`;
function parseDesign(key: WallDesign): WallSpec {
  if ((SPECIAL_WALLS as readonly string[]).includes(key)) return {};
  const [p, k] = key.split("-").map((b) => b.slice(1));
  return {
    pencere: p === "x" ? undefined : { pvc: p[0] === "1", sineklik: p[1] === "1", perde: p[2] === "1" },
    kapi: k === "x" ? undefined : { pvc: false, sineklik: k[0] === "1", perde: true },
  };
}

type Rect = { x: number; y: number; w: number; h: number };
type Ctx = CanvasRenderingContext2D;

const ZIP = "#33373c";
/** Toplanmış rulo perde: duvar genişliği/yüksekliğine oranla x, w ve merkez y (yukarıdan); 3D silindir olarak çizilir */
/** x, w: rulo (açıklıktan biraz geniş); y, h, fw: açıklığın üstü, yüksekliği ve genişliği (kapak) */
export type Roll = { x: number; w: number; y: number; h: number; fw: number };
/** Çizilmiş duvar: kumaş dokusu, (PVC varsa) cam katmanının maskesi (beyaz = cam) ve rulo perdeler */
export type PaintedWall = { map: CanvasTexture; glass?: CanvasTexture; rolls: Roll[]; rollMaterial: MeshStandardMaterial; flapMaterial: MeshStandardMaterial };
const textures = new Map<string, PaintedWall>();
/** Çizim sırasında PVC bölgeleri ve rulolar toplanır; cam katmanı yalnızca PVC bölgelerinde görünür */
let glassRects: Rect[] = [];
let rolls: Roll[] = [];

/** Standart ölçüler (m): pencere 137×137 kare, kapı 90 cm genişlik; pencere ile kapı arası ve duvar kenarına en az pay */
const WINDOW = 1.37;
const DOOR = 0.9;
const GAP = 0.3;
const EDGE = 0.1;

/**
 * Açıklıkların yeri (m, sol-üst köşeden): tek açıklık ortada, pencere + kapı grup olarak ortada.
 * Dar duvarda (ör. 2 m) önce aradaki boşluk, sonra pencere genişliği daralır; kapı her zaman 90 cm kalır.
 */
function layout(wm: number, hm: number, hasWindow: boolean, hasDoor: boolean) {
  const winH = Math.min(WINDOW, hm - 2 * EDGE);
  const winY = (hm - winH) / 2;
  if (!hasDoor) {
    const w = Math.min(WINDOW, wm - 2 * EDGE);
    return { win: { x: (wm - w) / 2, y: winY, w, h: winH } };
  }
  const door = Math.min(DOOR, wm - 2 * EDGE);
  if (!hasWindow) return { door: { x: (wm - door) / 2, y: 0, w: door, h: hm } };
  const room = wm - 2 * EDGE - door;
  const gap = Math.max(0.08, Math.min(GAP, room - WINDOW));
  const w = Math.max(0.3, Math.min(WINDOW, room - gap));
  const x0 = (wm - (w + gap + door)) / 2;
  return { win: { x: x0, y: winY, w, h: winH }, door: { x: x0 + w + gap, y: 0, w: door, h: hm } };
}

/** wm, hm: duvar yüzeyinin genişliği ve yüksekliği (m) */
/** printed: duvar dijital baskılı kumaştan (zemin örnek baskı, açıklıklar yine kesilir) */
export function wallPaint(design: WallDesign, fabricHex: string, printed = false) {
  return (wm: number, hm: number) => {
    const key = `${design}|${fabricHex}|${+printed}|${wm.toFixed(2)}x${hm.toFixed(2)}`;
    const cached = textures.get(key);
    if (cached) return cached;
    const W = 1024;
    const H = Math.round((W * hm) / wm);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    glassRects = [];
    rolls = [];
    // Fermuar ve rulo boyutları için ölçü birimi: duvar yüksekliğinin %2si (~4 cm)
    const tape = H * 0.02;
    const px = (r: Rect): Rect => ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H });
    /** metre → piksel */
    const m = (r: Rect): Rect => ({ x: (r.x / wm) * W, y: (r.y / hm) * H, w: (r.w / wm) * W, h: (r.h / hm) * H });

    if (printed) ctx.drawImage(wallPrintTexture(wm / hm).image as CanvasImageSource, 0, 0, W, H);
    else {
      ctx.fillStyle = fabricHex;
      ctx.fillRect(0, 0, W, H);
    }

    // Tamamı sineklik: kenarda kumaş pay yok
    if (design === "tam-sineklik") flyScreen(ctx, px({ x: 0, y: 0, w: 1, h: 1 }), true);
    // Tam PVC: kenarlarda ~12 cm kumaş pay, geri kalanı şeffaf PVC
    if (design === "tam-pvc") pvc(ctx, m({ x: 0.12, y: 0.12, w: wm - 0.24, h: hm - 0.24 }));
    if (design === "tek-fermuar") {
      zipLine(ctx, W * 0.5, 0, H, tape);
      ctx.fillStyle = ZIP;
      ctx.fillRect(W * 0.5 - tape * 0.6, H * 0.4, tape * 1.2, tape * 2.4); // çekecek
    }
    const spec = parseDesign(design);
    const at = layout(wm, hm, !!spec.pencere, !!spec.kapi);
    if (spec.pencere && at.win) opening(ctx, m(at.win), spec.pencere, false, tape);
    if (spec.kapi && at.door) opening(ctx, m(at.door), spec.kapi, true, tape);

    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = 8;
    const painted: PaintedWall = {
      map,
      glass: glassRects.length ? glassMask(W, H, glassRects) : undefined,
      rolls: rolls.map((r) => ({ x: r.x / W, w: r.w / W, y: r.y / H, h: r.h / H, fw: r.fw / W })),
      // Baskılı duvarda perde ve rulosu baskının koyu zemin renginde
      rollMaterial: rollMaterial(printed ? "#1d1d1f" : fabricHex),
      flapMaterial: flapMaterial(printed ? "#1d1d1f" : fabricHex),
    };
    textures.set(key, painted);
    return painted;
  };
}

function glassMask(W: number, H: number, rects: Rect[]) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
  return new CanvasTexture(canvas);
}

/** Cama yansıyan ortam: kodla çizilmiş gökyüzü, ufuk ve zemin (dosya indirilmez) */
let env: CanvasTexture | null = null;
function glassEnv() {
  if (env) return env;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#9fc4e6");
  g.addColorStop(0.45, "#eef5fb");
  g.addColorStop(0.5, "#b9bec3");
  g.addColorStop(1, "#5d6166");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  // Parlak yansıma şeritleri (gökyüzünde açık bulut / pencere ışığı)
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (const x of [60, 210, 330, 450]) ctx.fillRect(x, 40, 28, 70);
  env = new CanvasTexture(canvas);
  env.mapping = EquirectangularReflectionMapping;
  env.colorSpace = SRGBColorSpace;
  return env;
}

/** Cam: parlak, yansımalı ve yarı saydam; maske dışında görünmez */
const glassMaterials = new Map<CanvasTexture, MeshPhysicalMaterial>();
export function glassMaterial(mask: CanvasTexture) {
  let m = glassMaterials.get(mask);
  if (!m) {
    m = new MeshPhysicalMaterial({
      color: "#dcecf4",
      metalness: 0,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMap: glassEnv(),
      envMapIntensity: 1.4,
      alphaMap: mask,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    glassMaterials.set(mask, m);
  }
  return m;
}

/** Şeffaf PVC: kumaş kesilir, yerine yarı saydam açık mavi-gri yüzey ve hafif yansıma çizgileri */
function pvc(ctx: Ctx, r: Rect) {
  glassRects.push(r);
  ctx.clearRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "rgba(214, 230, 238, 0.22)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = r.w * 0.025;
  for (const f of [0.25, 0.33]) {
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * f, r.y + r.h);
    ctx.lineTo(r.x + r.w * (f + 0.35), r.y);
    ctx.stroke();
  }
  ctx.restore();
}



/** Sineklik: ince baklava örgülü file. open: arkası açık (içerisi soluk görünür), değilse PVC'nin önünde */
function flyScreen(ctx: Ctx, r: Rect, open: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (open) ctx.clearRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "rgba(55, 60, 66, 0.22)";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "rgba(40, 44, 50, 0.55)";
  ctx.lineWidth = 1.6;
  const step = 14;
  for (let d = -r.h; d < r.w + r.h; d += step) {
    ctx.beginPath();
    ctx.moveTo(r.x + d, r.y);
    ctx.lineTo(r.x + d + r.h, r.y + r.h);
    ctx.moveTo(r.x + d, r.y + r.h);
    ctx.lineTo(r.x + d + r.h, r.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Açıklığın üstünde toplanmış rulo perde: kumaş renginde silindir ve iki bağlama kayışı */
function rollBar(ctx: Ctx, r: Rect, tape: number) {
  // Kapak (perde) ve rulosu 3D'dir (decal.ts): açıklığın yeri ve rulo genişliği kaydedilir
  rolls.push({ x: r.x - tape * 0.4, w: r.w + tape * 0.8, y: r.y, h: r.h, fw: r.w });
}

/** Kapak: duvar kumaşı, iki yanında fermuar dişi; iki yüzü de görünür */
const flapMaterials = new Map<string, MeshStandardMaterial>();
function flapMaterial(fabricHex: string) {
  let m = flapMaterials.get(fabricHex);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = fabricHex;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = ZIP;
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(2, y, 5, 4);
      ctx.fillRect(249, y, 5, 4);
    }
    const map = new CanvasTexture(c);
    map.colorSpace = SRGBColorSpace;
    m = new MeshStandardMaterial({ map, roughness: 0.8, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    flapMaterials.set(fabricHex, m);
  }
  return m;
}

/** Rulo perde: duvar kumaşıyla aynı renkte, mat; yüzeyde ince dokuma kabartısı */
const rollMaterials = new Map<string, MeshStandardMaterial>();
function rollMaterial(fabricHex: string) {
  let m = rollMaterials.get(fabricHex);
  if (!m) {
    m = new MeshStandardMaterial({ color: fabricHex, roughness: 0.82, bumpMap: weave(), bumpScale: 0.6 });
    rollMaterials.set(fabricHex, m);
  }
  return m;
}

/** Dokuma kumaş kabartı dokusu (küçük, tekrarlanan) */
let weaveTex: CanvasTexture | null = null;
function weave() {
  if (weaveTex) return weaveTex;
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 16, 16);
  for (let i = 0; i < 16; i += 4) {
    ctx.fillStyle = "#a0a0a0";
    ctx.fillRect(i, 0, 2, 16);
    ctx.fillStyle = "#606060";
    ctx.fillRect(0, i + 2, 16, 1);
  }
  weaveTex = new CanvasTexture(c);
  weaveTex.wrapS = weaveTex.wrapT = RepeatWrapping;
  // Ekstrüzyon UV'leri metre cinsindendir: ~4 mm'de bir tekrar
  weaveTex.repeat.set(250, 250);
  return weaveTex;
}
export const strapMaterial = new MeshStandardMaterial({ color: "#1d1f22", roughness: 0.9 });
export const buckleMaterial = new MeshStandardMaterial({ color: "#121314", roughness: 0.35, metalness: 0.1 });

/** Dikey fermuar dişi */
function zipLine(ctx: Ctx, x: number, y: number, h: number, tape: number) {
  ctx.strokeStyle = ZIP;
  ctx.lineWidth = tape * 0.35;
  ctx.setLineDash([tape * 0.45, tape * 0.35]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + h);
  ctx.stroke();
  ctx.setLineDash([]);
}

function zipSides(ctx: Ctx, r: Rect, tape: number) {
  zipLine(ctx, r.x - tape * 0.2, r.y, r.h, tape);
  zipLine(ctx, r.x + r.w + tape * 0.2, r.y, r.h, tape);
}


/**
 * Açıklık (pencere ya da kapı): içeride seçilen katmanlar (PVC, sineklik; ikisi de yoksa açık boşluk).
 * Kumaş kapak (perde) ve rulosu ayrı 3D parçalardır.
 */
function opening(ctx: Ctx, r: Rect, o: Opening, isDoor: boolean, tape: number) {
  // Açıklık doğrudan duvara kesilir (çevresinde pervaz/biye yok). Kapıya PVC takılmaz.
  const glass = o.pvc && !isDoor;
  if (glass) pvc(ctx, r);
  if (o.sineklik) flyScreen(ctx, r, !glass);
  if (!glass && !o.sineklik) ctx.clearRect(r.x, r.y, r.w, r.h);
  // Kapıda perde her zaman var; pencerede isteğe bağlı. Perdesiz pencerede fermuar da yoktur (PVC/sineklik sabit dikilir).
  if (isDoor || o.perde) {
    zipSides(ctx, r, tape);
    rollBar(ctx, r, tape);
  }
}
