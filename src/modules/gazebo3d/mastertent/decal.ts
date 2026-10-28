import {
  BufferGeometry,
  CanvasTexture,
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  type Material,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  type Scene,
  Shape,
  FrontSide,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buckleMaterial, glassMaterial, strapMaterial, type PaintedWall } from "./wall-paint";

// Baskılı yüzeylere tam kaplama örnek baskı tasarımı: koyu zemin, marka kırmızısı fırça darbeleri ve yarım ton noktalar,
// ortada "LOGONUZ BURADA" rozeti; saçakta slogan bandı. Modelin kendi UV'leri tavan ve saçakta kullanılamaz olduğu için
// üçgenler çadır merkezine göre konumlarından (ön/arka/sağ/sol) gruplanır ve her grup kendi düzleminde doku koordinatı alır.

const INK = "#141414";
const RED = "#c8102e";
const RED_DARK = "#7d0a1d";
const FONT = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';

const textureCache = new Map<string, CanvasTexture>();

/**
 * Desen yazılarının fontu: sistem fontu da tuvalde ilk kullanımda geç yüklenebilir. Bu söz yüklenince çözülür;
 * görüntü alma (snapshot) bunu bekler ki sepet görselinde yedek font çıkmasın.
 */
const BADGE_FONT = `italic 900 40px ${FONT}`;
export const decalFontReady: Promise<unknown> =
  typeof document === "undefined" ? Promise.resolve() : document.fonts.load(BADGE_FONT).catch(() => undefined);

/** Her yüzeyde aynı görünen (tekrarlanabilir) desen için tohumlu rastgele sayı */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uçları dağınık, kalınlığı değişen fırça darbesi */
function brushStroke(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, length: number, thickness: number, angle: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  const steps = 18;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6;
    ctx.lineTo(t * length, -thickness * 0.5 * taper * (0.75 + rand() * 0.5));
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6;
    ctx.lineTo(t * length, thickness * 0.5 * taper * (0.75 + rand() * 0.5));
  }
  ctx.closePath();
  ctx.fill();
  // Kuru fırça izleri: darbenin ucunda ince çizgiler
  for (let i = 0; i < 7; i++) {
    const off = (rand() - 0.5) * thickness;
    const len = length * (0.15 + rand() * 0.35);
    ctx.fillRect(length * (0.75 + rand() * 0.2), off, len, Math.max(1.5, thickness * 0.04));
  }
  ctx.restore();
}

/** Bir köşeden yayılan, küçülen yarım ton noktalar */
function halftone(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, step: number, color: string) {
  ctx.fillStyle = color;
  for (let y = cy - radius; y <= cy + radius; y += step) {
    for (let x = cx - radius; x <= cx + radius; x += step) {
      const d = Math.hypot(x - cx, y - cy) / radius;
      if (d >= 1) continue;
      ctx.beginPath();
      ctx.arc(x, y, step * 0.42 * (1 - d), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function patternBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const rand = seeded(Math.round(w * 7 + h));
  const unit = Math.min(w, h);
  // Köşelerden içeri uzanan çapraz fırça darbeleri
  const count = Math.max(6, Math.round((w / h) * 5));
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0;
    const x = fromLeft ? -unit * 0.2 + rand() * w * 0.25 : w * (0.6 + rand() * 0.35);
    const y = h * (0.05 + rand() * 0.9);
    const angle = (fromLeft ? -0.35 : Math.PI - 0.35) + (rand() - 0.5) * 0.3;
    brushStroke(ctx, rand, x, y, unit * (0.45 + rand() * 0.5), unit * (0.05 + rand() * 0.09), angle, rand() > 0.35 ? RED : RED_DARK);
  }
  halftone(ctx, w * 0.06, h * 0.12, unit * 0.32, unit * 0.035, RED);
  halftone(ctx, w * 0.94, h * 0.9, unit * 0.36, unit * 0.035, RED);
}

/** Kırmızı fırça halkası içinde "LOGONUZ BURADA" */
function logoBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const rand = seeded(Math.round(r * 13));
  ctx.save();
  ctx.translate(cx, cy);
  // Halka: kalınlığı değişen üst üste yaylar
  ctx.strokeStyle = RED;
  ctx.lineCap = "round";
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = r * (0.07 + rand() * 0.07);
    const startA = -0.4 + rand() * 0.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (0.95 + rand() * 0.08), r * (0.88 + rand() * 0.08), -0.15, startA, startA + Math.PI * (1.6 + rand() * 0.35));
    ctx.stroke();
  }
  // Yazı: hafif eğik, kalın beyaz
  ctx.rotate(-0.1);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (text: string, size: number, maxW: number) => {
    ctx.font = `italic 900 ${size}px ${FONT}`;
    const wText = ctx.measureText(text).width;
    if (wText > maxW) ctx.font = `italic 900 ${(size * maxW) / wText}px ${FONT}`;
  };
  fit("LOGONUZ", r * 0.42, r * 1.5);
  ctx.fillText("LOGONUZ", 0, -r * 0.2);
  fit("BURADA", r * 0.5, r * 1.4);
  ctx.fillText("BURADA", 0, r * 0.26);
  ctx.restore();
}

/** Saçak bandı: koyu zemin üzerinde slogan */
function sloganBand(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const parts: [string, string][] = [
    ["CESUR OL. ", "#ffffff"],
    ["GÖRÜN.", RED],
    [" MARKANI BÜYÜT.", "#ffffff"],
  ];
  let size = h * 0.48;
  ctx.font = `italic 900 ${size}px ${FONT}`;
  const total = parts.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0);
  if (total > w * 0.86) size *= (w * 0.86) / total;
  ctx.font = `italic 900 ${size}px ${FONT}`;
  const width = parts.reduce((sum, [text]) => sum + ctx.measureText(text).width, 0);
  let x = (w - width) / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const [text, color] of parts) {
    ctx.fillStyle = color;
    ctx.fillText(text, x, h * 0.54);
    x += ctx.measureText(text).width;
  }
}

/** Yüzeyin en/boy oranında baskı dokusu; band: saçak (slogan), değilse logo rozeti uCenters kadar tekrar */
/** Duvar baskı dokusu (örnek baskı + ortada "LOGONUZ BURADA"): çizilmiş duvarların baskılı zemini */
export const wallPrintTexture = (aspect: number) => decalTexture(aspect, 0.62, 0.52, [0.5], false);

function decalTexture(aspect: number, scale: number, vCenter: number, uCenters: number[], band: boolean) {
  const ratio = Math.min(Math.max(aspect, 0.25), 16);
  const key = `${ratio.toFixed(2)}|${scale}|${vCenter}|${uCenters.join(",")}|${band}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  // Uzun saçak şeritlerinde doku genişliği sınırlanır
  let h = 512;
  let w = Math.round(h * ratio);
  if (w > 4096) {
    w = 4096;
    h = Math.round(w / ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const paint = () => {
    patternBackground(ctx, w, h);
    if (band) {
      sloganBand(ctx, w, h);
    } else {
      // Rozet yüzeyin kısa kenarına göre ölçeklenir; vCenter: dikey merkez (0 = alt kenar, 1 = üst kenar)
      const slotW = w / uCenters.length;
      const r = Math.min((h * scale) / 2, slotW * 0.42);
      const midY = h * (1 - vCenter);
      for (const u of uCenters) logoBadge(ctx, w * u, midY, r);
    }
  };
  paint();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  textureCache.set(key, texture);
  // Yazı fontu henüz hazır değilse yedek fontla çizilmiş olur: font yüklenince doku yeniden çizilir
  if (!document.fonts.check(BADGE_FONT)) {
    decalFontReady.then(() => {
      paint();
      texture.needsUpdate = true;
    });
  }
  return texture;
}

const UP = new Vector3(0, 1, 0);

/** Rulo perde (m): sarılmış kumaş kesiti spiral olarak uzatılır, uçlarda kat kat sargı görünür */
const ROLL_RADIUS = 0.055;
/** Kayış: ruloyu saran siyah dokuma bant; önünde plastik toka */
const STRAP = new CylinderGeometry(ROLL_RADIUS + 0.003, ROLL_RADIUS + 0.003, 0.032, 32);
const BUCKLE = new BoxGeometry(0.024, 0.042, 0.024);

/** Spiral kesit: içten dışa ~3 tur, katlar arasında ince boşluk; dış ucu sargının bittiği yerde basamak yapar */
function rollShape() {
  const turns = 3.2;
  const r0 = 0.01;
  const pitch = (ROLL_RADIUS - r0) / turns;
  const thick = pitch * 0.82;
  const steps = Math.round(turns * 48);
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = r0 + (pitch * t) / (Math.PI * 2);
    outer.push([Math.cos(t) * r, Math.sin(t) * r]);
    inner.push([Math.cos(t) * (r - thick), Math.sin(t) * (r - thick)]);
  }
  const shape = new Shape();
  shape.moveTo(...outer[0]);
  for (const p of outer.slice(1)) shape.lineTo(...p);
  for (const p of inner.reverse()) shape.lineTo(...p);
  shape.closePath();
  return shape;
}

const rollGeometries = new Map<string, ExtrudeGeometry>();
function rollGeometry(length: number) {
  const key = length.toFixed(3);
  let g = rollGeometries.get(key);
  if (!g) {
    g = new ExtrudeGeometry(rollShape(), { depth: length, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -length / 2);
    // Yan yüzler yumuşak gölgelensin (sargı yuvarlak görünsün)
    g.deleteAttribute("normal");
    g = mergeVertices(g) as ExtrudeGeometry;
    g.computeVertexNormals();
    rollGeometries.set(key, g);
  }
  return g;
}
const Z = new Vector3(0, 0, 1);
const FLAP = new PlaneGeometry(1, 1);

/** Sahnedeki perdeler; açıklık oranı (0 kapalı – 1 açık) değişince hepsi yeniden konumlanır */
type Curtain = { object: Mesh; update: (t: number) => void; shown?: boolean };
const curtains = new Set<Curtain>();
let curtainOpen = 1;
export function setCurtainOpen(t: number) {
  curtainOpen = t;
  for (const c of curtains) {
    // Sahneden kalkmış (yeniden kurulmuş duvar) perdeler bırakılır; henüz eklenmemiş yeni perde korunur
    let o: Object3D | null = c.object;
    while (o?.parent) o = o.parent;
    const inScene = !!(o as Scene | null)?.isScene;
    if (inScene) c.shown = true;
    if (!inScene && c.shown) curtains.delete(c);
    else c.update(t);
  }
}

/**
 * Bir kumaş mesh'i için etiket katmanları üretir.
 * meshToTent: mesh geometrisinden çadır uzayına dönüşüm; center: çadır ekseninde bir nokta (dışa yönü belirlemek için).
 * Dönen mesh'ler kaynak mesh'in çocuğu olarak eklenir (geometri mesh uzayındadır).
 */
export type DecalOptions = {
  scale?: number;
  vCenter?: number;
  /** Etiketlerin yatay merkezleri (0–1); kapılı duvarda kapının iki yanı */
  uCenters?: number[];
  /** slope: eğimli tavan yüzleri, band: dik saçak yüzleri (slogan bandı), all: hepsi */
  faces?: "slope" | "band" | "all";
  /** İç yüze de baskı (duvarlar): içeriden bakınca da yazı düz okunur */
  bothSides?: boolean;
  /** Etiket yerine duvarın tamamı çizilir (PVC pencere, kapı vb.); altındaki düz kumaş gizlenir */
  /** Duvar yüzeyinin genişliği ve yüksekliği (m) ile çağrılır */
  paint?: (width: number, height: number) => PaintedWall;
};

export function buildDecals(
  mesh: Mesh,
  meshToTent: Matrix4,
  center: Vector3,
  { scale = 0.6, vCenter = 0.5, uCenters = [0.5], faces = "all", bothSides = false, paint }: DecalOptions,
): Mesh[] {
  const geo = mesh.geometry as BufferGeometry;
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  if (!pos || !nor) return [];
  const index = geo.getIndex();
  const triCount = (index ? index.count : pos.count) / 3;
  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const normalMatrix = new Matrix3().getNormalMatrix(meshToTent);

  // Dışa bakan üçgenleri yatay yönlerine göre (4 kenar) grupla
  const groups = new Map<string, { tris: number[]; normal: Vector3; area: number }>();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const p = new Vector3();
  const n = new Vector3();
  const centroid = new Vector3();
  for (let t = 0; t < triCount; t++) {
    centroid.set(0, 0, 0);
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const i = vi(t, k);
      centroid.add(p.fromBufferAttribute(pos, i).applyMatrix4(meshToTent));
      n.add(new Vector3().fromBufferAttribute(nor, i).applyMatrix3(normalMatrix));
    }
    centroid.divideScalar(3);
    a.fromBufferAttribute(pos, vi(t, 0)).applyMatrix4(meshToTent);
    b.fromBufferAttribute(pos, vi(t, 1)).applyMatrix4(meshToTent);
    c.fromBufferAttribute(pos, vi(t, 2)).applyMatrix4(meshToTent);
    const area = b.sub(a).cross(c.sub(a)).length() / 2;
    n.normalize();
    const outward = centroid.clone().sub(center);
    // Yalnızca dış yüzler basılır; iç yüzlerde desen ayna görüntüsü olarak görünürdü
    if (n.dot(outward) <= 0.05) continue;
    if (Math.hypot(n.x, n.z) < 0.15) continue; // tam yatay (tepe) yüzeyler
    // Tavan ile saçak aynı mesh'te: eğime göre ayrılır (skygorselcozumler konfigüratörüyle aynı eşik)
    if (faces === "slope" && Math.abs(n.y) <= 0.2) continue;
    if (faces === "band" && Math.abs(n.y) > 0.2) continue;
    // Kenar, yüzeyin kendi yönünden bulunur: merkezden konuma göre bakılsaydı dikdörtgen çadırda uzun kenarın uçları
    // (ör. 4,5 m duvarın kenarları) yan yüz sayılır, çizim/etiket parçalara bölünürdü
    const horizontal = Math.abs(n.x) > Math.abs(n.z) ? (n.x > 0 ? "+x" : "-x") : n.z > 0 ? "+z" : "-z";
    const group = groups.get(horizontal) ?? { tris: [], normal: new Vector3(), area: 0 };
    group.tris.push(t);
    group.normal.addScaledVector(n, area);
    group.area += area;
    groups.set(horizontal, group);
  }

  // Kenar şeritleri gibi küçük yüzlere etiket konmaz
  const maxArea = Math.max(0, ...[...groups.values()].map((g) => g.area));
  const overlays: Mesh[] = [];
  for (const { tris, normal, area } of groups.values()) {
    if (area < maxArea * 0.3) continue;
    const N = normal.normalize();
    const U = new Vector3().crossVectors(UP, N).normalize();
    const V = new Vector3().crossVectors(N, U).normalize();

    const positions: number[] = [];
    const normals: number[] = [];
    const proj: number[] = [];
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    let nmax = -Infinity; // dış yüzeyin N yönündeki konumu (rulo bunun önüne konur)
    for (const t of tris) {
      // Görünen (ön) yüz üçgenin sarım yönüyle belirlenir; bazı parçalarda (kapı kanatları) sarım normalle terstir.
      // Sarım, katmanın dışa bakacağı yöne göre düzeltilir; aksi halde dışarıdan iç yüz katmanı (ayna yazı) görünür.
      a.fromBufferAttribute(pos, vi(t, 0));
      b.fromBufferAttribute(pos, vi(t, 1)).sub(a);
      c.fromBufferAttribute(pos, vi(t, 2)).sub(a);
      const facing = b.cross(c).applyMatrix3(normalMatrix).dot(N);
      for (const k of facing >= 0 ? [0, 1, 2] : [0, 2, 1]) {
        const i = vi(t, k);
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
        p.fromBufferAttribute(pos, i).applyMatrix4(meshToTent);
        const u = p.dot(U);
        const v = p.dot(V);
        proj.push(u, v);
        umin = Math.min(umin, u); umax = Math.max(umax, u);
        nmax = Math.max(nmax, p.dot(N));
        vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
      }
    }
    const du = umax - umin || 1;
    const dv = vmax - vmin || 1;
    const uvs = proj.map((value, j) => (j % 2 === 0 ? (value - umin) / du : (value - vmin) / dv));

    const overlayGeo = new BufferGeometry();
    overlayGeo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    overlayGeo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    overlayGeo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));

    const painted = paint?.(du, dv);
    const material = new MeshStandardMaterial({
      map: painted ? painted.map : decalTexture(du / dv, scale, vCenter, uCenters, faces === "band"),
      // Çizilmiş duvarda şeffaf PVC bölgeleri yarı saydamdır
      transparent: !!painted,
      // Tek yüzlü: arkadan görülünce ayna yazı çıkmasın (iç yüz için ayrı, çevrilmiş katman üretilir)
      side: FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      roughness: 0.7,
    });
    const overlay = new Mesh(overlayGeo, material);
    overlay.renderOrder = 1;
    overlays.push(overlay);
    // Perdeler: açıklığın kumaş kapağı ve üstünde toplanan rulo (kayış + toka). Açıklık oranı değişince (animasyon)
    // kapak aşağıdan yukarı kısalır, rulo yukarı çıkarken kalınlaşır; kapalıyken kapak açıklığı tamamen örter.
    if (painted?.rolls.length) {
      const toMesh = meshToTent.clone().invert();
      const along = new Quaternion().setFromUnitVectors(UP, U);
      const alongZ = new Quaternion().setFromUnitVectors(Z, U);
      const facing = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(U, V, N));
      for (const r of painted.rolls) {
        const make = (geo: BufferGeometry, mat: Material) => {
          const m = new Mesh(geo, mat);
          m.matrixAutoUpdate = false;
          m.castShadow = true;
          overlays.push(m);
          return m;
        };
        const roll = make(rollGeometry(r.w * du), painted.rollMaterial);
        const flap = make(FLAP, painted.flapMaterial);
        const straps = [0.18, 0.82].map((f) => ({ f, strap: make(STRAP, strapMaterial), buckle: make(BUCKLE, buckleMaterial) }));
        const top = vmax - r.y * dv;
        const fullH = r.h * dv;
        // U, V, N birbirine dik birim vektörler: nokta = u·U + v·V + (dış yüzey + çıkıntı)·N
        const point = (u: number, v: number, out: number) =>
          U.clone().multiplyScalar(umin + u * du).addScaledVector(V, v).addScaledVector(N, nmax + out);
        const set = (m: Mesh, pos: Vector3, rot: Quaternion, scale: Vector3) =>
          m.matrix.copy(toMesh).multiply(new Matrix4().compose(pos, rot, scale));
        const curtain: Curtain = {
          object: roll,
          shown: false,
          update(t) {
            const e = t * t * (3 - 2 * t); // yumuşak başla, yumuşak dur
            const h = fullH * (1 - e); // kapağın açıkta kalan boyu
            // Rulo sarılan kumaşla kalınlaşır (kesit alanı boyla orantılı); perde tamamen inince rulo kalmaz
            const s = Math.max(Math.sqrt(e), 0.05);
            const rolled = e > 0.02;
            roll.visible = rolled;
            // Kayış ve tokalar ruloyla hareket etmez: yalnızca perde tamamen açık (toplanmış) iken görünür
            for (const { strap, buckle } of straps) strap.visible = buckle.visible = e > 0.995;
            const radius = ROLL_RADIUS * s;
            const v = top - h;
            set(roll, point(r.x + r.w / 2, v, radius + 0.004), alongZ, new Vector3(s, s, 1));
            for (const { f, strap, buckle } of straps) {
              set(strap, point(r.x + r.w * f, v, radius + 0.004), along, new Vector3(s, 1, s));
              set(buckle, point(r.x + r.w * f, v, radius * 2 + 0.006), along, new Vector3(1, 1, 1));
            }
            flap.visible = h > 0.003;
            set(flap, point(r.x + r.w / 2, top - h / 2, 0.003), facing, new Vector3(r.fw * du, Math.max(h, 0.001), 1));
          },
        };
        curtain.update(curtainOpen);
        curtains.add(curtain);
      }
    }
    // PVC bölgelerinde cam katmanı (yansıma ve parlaklık)
    const glass = painted?.glass ? glassMaterial(painted.glass) : null;
    if (glass) {
      const pane = new Mesh(overlayGeo, glass);
      pane.renderOrder = 2;
      overlays.push(pane);
    }

    if (bothSides) {
      // İç yüz: üçgen yönü ters, normal içe, doku yatayda çevrili (içeriden bakınca yazı düz okunur)
      const backPositions: number[] = [];
      const backNormals: number[] = [];
      const backUvs: number[] = [];
      for (let t = 0; t < positions.length / 9; t++) {
        for (const k of [0, 2, 1]) {
          const i = t * 3 + k;
          backPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          backNormals.push(-normals[i * 3], -normals[i * 3 + 1], -normals[i * 3 + 2]);
          backUvs.push(1 - uvs[i * 2], uvs[i * 2 + 1]);
        }
      }
      const backGeo = new BufferGeometry();
      backGeo.setAttribute("position", new Float32BufferAttribute(backPositions, 3));
      backGeo.setAttribute("normal", new Float32BufferAttribute(backNormals, 3));
      backGeo.setAttribute("uv", new Float32BufferAttribute(backUvs, 2));
      const back = new Mesh(backGeo, material);
      back.renderOrder = 1;
      overlays.push(back);
      if (glass) {
        const pane = new Mesh(backGeo, glass);
        pane.renderOrder = 2;
        overlays.push(pane);
      }
    }
  }
  return overlays;
}
