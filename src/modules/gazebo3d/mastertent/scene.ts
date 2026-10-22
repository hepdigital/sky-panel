import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from "three";
import type { Side } from "../model";

// Mastertent sahne dosyalarını (EGR GF formatı) düz parça listesine çevirir ve
// duvar parçalarını kenarlara yerleştirir. Hesaplar skygorselcozumler konfigüratörüyle aynıdır.

type SceneNode = {
  Geometry?: string;
  Material?: string;
  Layer?: string;
  Transform?: { Position?: number[]; Rotation?: number[]; Scale?: number[] };
  Children?: SceneNode[];
};
export type SceneFile = { Objects?: SceneNode[] };

export type Part = { geometry: string; material: string; layer: string; matrix: Matrix4 };

function nodeMatrix(t?: SceneNode["Transform"]) {
  const m = new Matrix4();
  if (!t) return m;
  const position = new Vector3();
  if (t.Position) position.fromArray(t.Position);
  const rotation = new Quaternion();
  const r = t.Rotation;
  if (r?.length === 4) rotation.fromArray(r);
  else if (r?.length === 3) rotation.setFromEuler(new Euler(r[0], r[1], r[2]));
  else if (r?.length === 9) rotation.setFromRotationMatrix(new Matrix4().setFromMatrix3(new Matrix3().fromArray(r)));
  else if (r?.length === 16) rotation.setFromRotationMatrix(new Matrix4().fromArray(r));
  const scale = new Vector3(1, 1, 1);
  if (t.Scale) scale.fromArray(t.Scale);
  return m.compose(position, rotation, scale);
}

/** Sahnedeki tüm geometri düğümlerini dünya matrisleriyle düz listeye çevirir (kök nesnenin kendi dönüşümü atlanır). */
export function flattenScene(scene: SceneFile): Part[] {
  const parts: Part[] = [];
  const visit = (node: SceneNode, parent: Matrix4) => {
    const world = new Matrix4().multiplyMatrices(parent, nodeMatrix(node.Transform));
    if (node.Geometry) {
      parts.push({
        geometry: node.Geometry,
        material: (node.Material ?? "").split(";")[0].trim(),
        layer: node.Layer ?? "",
        matrix: world,
      });
    }
    for (const child of node.Children ?? []) visit(child, world);
  };
  for (const root of scene.Objects ?? []) for (const child of root.Children ?? []) visit(child, new Matrix4());
  return parts;
}

/** Ayakların (FUSS katmanı) zemindeki yayılımı: duvar ölçeği ve dönüş merkezi buradan hesaplanır. */
export function footprint(parts: Part[], width: number, depth: number) {
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const xs: number[] = [];
  const zs: number[] = [];
  for (const part of parts) {
    if (!part.layer.includes("_STRUK_D3_FUSS")) continue;
    part.matrix.decompose(p, q, s);
    if (p.y <= 0.5) {
      xs.push(p.x);
      zs.push(p.z);
    }
  }
  const fallback = { spanX: width - 0.0606, spanZ: depth - 0.0606, minX: 0, minZ: 0 };
  const withStops = (fp: typeof fallback) => {
    // Kenar boyunca ayak konumları (köşeler + ara ayaklar): duvarlar ayaklar arasındaki bölmelere yerleşir
    const along = (values: number[], cross: number[], crossMin: number, min: number, span: number) =>
      uniqueSorted([min, min + span, ...values.filter((_, i) => Math.abs(cross[i] - crossMin) < 0.2)]);
    return { ...fp, stopsX: along(xs, zs, fp.minZ, fp.minX, fp.spanX), stopsZ: along(zs, xs, fp.minX, fp.minZ, fp.spanZ) };
  };
  if (xs.length < 2) return withStops(fallback);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanZ = Math.max(...zs) - Math.min(...zs);
  return withStops(spanX < 1 || spanZ < 1 ? fallback : { spanX, spanZ, minX: Math.min(...xs), minZ: Math.min(...zs) });
}

/** Birbirine 0,5 m'den yakın değerleri tek sayar */
function uniqueSorted(values: number[]) {
  const out: number[] = [];
  for (const v of [...values].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 0.5) out.push(v);
  return out;
}

export type Footprint = ReturnType<typeof footprint>;

/**
 * Kenarı ara ayaklara göre bölmelere ayırır: her bölme ayrı bir duvardır (ör. 4x8'in uzun kenarında 2 duvar).
 * Duvar formülü kenarın çadır köşesinden başladığını varsayar: bölme köşede kurulur, sonra kenar boyunca kaydırılır.
 */
export function wallBays(fp: Footprint, side: Side): { fp: Footprint; shift: Vector3 }[] {
  const frontBack = side === "on" || side === "arka";
  const stops = frontBack ? fp.stopsX : fp.stopsZ;
  return stops.slice(1).map((end, i) => {
    const start = stops[i];
    return frontBack
      ? { fp: { ...fp, spanX: end - start }, shift: new Vector3(start - fp.minX, 0, 0) }
      : { fp: { ...fp, spanZ: end - start }, shift: new Vector3(0, 0, start - fp.minZ) };
  });
}

const sideAngle: Record<Side, number> = { arka: 0, sol: Math.PI / 2, on: Math.PI, sag: (3 * Math.PI) / 2 };
const Y = new Vector3(0, 1, 0);

/** Duvar varyant sahnesindeki duvar parçalarını verilen kenara taşır. */
export function placeWall(parts: Part[], side: Side, fp: Footprint): Part[] {
  const frontBack = side === "on" || side === "arka";
  const span = frontBack ? fp.spanX : fp.spanZ;
  const sx = (span + 0.04) / 2.9911;
  let dx = frontBack ? 2.9394 - fp.spanX : 2.9394 - (fp.spanX + fp.spanZ) / 2;
  const dz = frontBack ? 0 : (fp.spanX - fp.spanZ) / 2;
  dx += 0.00394 + 0.002544 * sx;
  const pivot = { x: fp.minX + fp.spanX / 2, z: fp.minZ + fp.spanZ / 2 };
  const angle = sideAngle[side];
  const turn = new Quaternion().setFromAxisAngle(Y, angle);

  return parts.map((part) => {
    const pos = new Vector3();
    const rot = new Quaternion();
    const scale = new Vector3();
    part.matrix.decompose(pos, rot, scale);
    scale.x *= sx;
    pos.addScaledVector(new Vector3(1, 0, 0).applyQuaternion(rot), dx);
    pos.addScaledVector(new Vector3(0, 0, 1).applyQuaternion(rot), 0.029 + dz);
    pos.x -= pivot.x;
    pos.z -= pivot.z;
    pos.applyAxisAngle(Y, angle);
    pos.x += pivot.x;
    pos.z += pivot.z;
    rot.premultiply(turn);
    return { ...part, matrix: new Matrix4().compose(pos, rot, scale) };
  });
}
