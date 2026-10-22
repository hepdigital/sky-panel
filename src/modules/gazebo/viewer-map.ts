// Modüler gazebo → 3D görüntüleyici (GazeboTente'nin Mastertent görüntüleyicisi) girdileri.
// Düz tam ve yarım duvar hazır modelden, diğerleri kodla çizilmiş duvardan (gazebo3d/mastertent/wall-paint.ts).
import type { Gazebo } from "@/lib/terminal/calc";
import type { GazeboConfig, WallStyle } from "@/modules/gazebo3d/model";
import { wallDesign } from "./walls";

/** Gazebo ölçüsü (en × uzun kenar) → sahne anahtarı (ön kenar × derinlik) */
const SCENE: Record<string, string> = { "2x2": "2x2", "2x3": "3x2", "3x3": "3x3", "3x4.5": "4.5x3", "3x6": "6x3", "4x4": "4x4", "4x6": "6x4", "4x8": "8x4" };

/** Kenar sırası (Ön, Arka, Sol, Sağ) → görüntüleyici kenarı */
const SIDE = ["on", "arka", "sol", "sag"] as const;

/** İskelet rengi gerçek ürüne göre: SQ3 beyaz çelik, SH4/SQ4 siyah çelik, AH4/AH5 alüminyum */
const FRAME_COLOR: Record<string, string> = { SQ3: "#e6e8ea", SH4: "#2a2c2f", SQ4: "#2a2c2f", AH4: "#c4c8cc", AH5: "#c4c8cc" };

export const DEFAULT_COLOR = "#ffffff";

export function viewerInput(g: Gazebo) {
  const [a, b] = g.size.split("x").map(Number);
  const walls: Record<string, WallStyle> = {};
  const designs: Record<string, string> = {};
  /** Baskılı kumaştan duvarlar 3D'de örnek baskıyla görünür */
  const printedWalls: Record<string, boolean> = {};
  g.sides.forEach((s, i) => {
    // Görüntüleyicide uzun kenar ara ayaklarla bölmelere ayrılır (yuva: "on" ya da "on1", "on2", "on3").
    // Tek parça kenarda her bölmeye aynı duvar; iki parçalı kenarda ilk bölmeye 1. duvar, sonrakilere 2. duvar.
    const pick = (bay: number) => (s.split ? s.walls[Math.min(bay, s.walls.length - 1)] : s.walls[0]);
    const slotsOf = [
      [SIDE[i], 0],
      [`${SIDE[i]}1`, 0],
      [`${SIDE[i]}2`, 1],
      [`${SIDE[i]}3`, 1],
    ] as const;
    for (const [slot, bay] of slotsOf) {
      const w = pick(bay);
      const d = w ? wallDesign(w) : null;
      if (!d) continue;
      walls[slot] = d.style;
      if (d.design) designs[slot] = d.design;
      if (w!.f === 2) printedWalls[slot] = true;
    }
  });
  const config: GazeboConfig = {
    frame: g.frame?.startsWith("AH") ? "aluminyum-40" : "celik-30",
    // Baskı duvar duvar (printedWalls) ve tavan için (printedRoof) ayrı verilir
    printed: false,
    color: "",
    fabric: "690d",
    walls,
    accessories: {},
  };
  return {
    sizeKey: SCENE[g.size],
    width: b,
    depth: a,
    config,
    wallDesigns: designs,
    printedWalls,
    // Baskılı tavanda örnek baskı ("logonuz burada") görünür
    printedRoof: g.roofFab === 2,
    frameColor: g.frame ? FRAME_COLOR[g.frame] : FRAME_COLOR.SQ3,
    fabricHex: g.color ?? DEFAULT_COLOR,
    // Duvarlar tavandan farklı renkte olabilir
    wallHex: g.wallColor ?? g.color ?? DEFAULT_COLOR,
  };
}
