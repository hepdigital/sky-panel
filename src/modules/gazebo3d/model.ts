// Gazebo konfigüratörü: veri modeli, fiyat hesabı ve URL durumu.
// Saf fonksiyonlardır; sunucu (SEO içeriği, JSON-LD) ve istemci (canlı fiyat) aynı kodu kullanır.

export const sides = ["on", "sag", "arka", "sol"] as const;
export type Side = (typeof sides)[number];
export const sideLabels: Record<Side, string> = { on: "Ön", sag: "Sağ", arka: "Arka", sol: "Sol" };

export type WallStyle = "yok" | "kapali" | "pencereli" | "kapili" | "yarim";
/** Seçeneklerin her yerdeki sırası: yok, kapalı, yarım, pencereli, kapılı */
export const wallStyles: WallStyle[] = ["yok", "kapali", "yarim", "pencereli", "kapili"];

/** Kumaş: baskısız ürün 690D ya da 200D; baskılı kısımlar dijital baskılı Oxford */
export type Fabric = "690d" | "200d" | "baskili";
export const plainFabrics = ["690d", "200d"] as const;
export type PlainFabric = (typeof plainFabrics)[number];

/** Kumaşa göre fiyat; null = o kumaşta üretilmiyor (ör. şeffaf PVC duvara baskı yapılmaz) */
type FabricPrices = Record<Fabric, number | null>;

export type ConfiguratorData = {
  /** image: iskelet ürün görseli; color: 3D modeldeki iskelet rengi */
  frames: Record<string, { label: string; note: string; image?: string; color?: string }>;
  walls: Record<WallStyle, { label: string }>;
  fabrics: Record<Fabric, { label: string; note: string }>;
  colors: { name: string; hex: string }[];
};

export type ConfigurableSize = {
  key: string;
  slug: string;
  /** Ön/arka kenar uzunluğu (m) */
  front: number;
  /** Sağ/sol kenar uzunluğu (m) */
  side: number;
  /** Yalnızca iskelet fiyatı (iskelet anahtarı → fiyat) */
  frames: Record<string, number>;
  /** Tavan kumaşı fiyatı */
  roof: FabricPrices;
  /** Tek duvar fiyatı: front = ön/arka kenardaki bir bölme, side = yan kenar */
  wallPrices: Record<"front" | "side", Record<Exclude<WallStyle, "yok">, FabricPrices>>;
  /** 3D model sahnesi (public/models/mastertent/scene-{model}.json). Yoksa üstten plan gösterilir. */
  model?: string;
  /** Ön/arka kenardaki duvar bölmesi sayısı (ara ayak varsa her bölmeye ayrı duvar takılır; varsayılan 1) */
  bays?: number;
};

/** Takılabilen tek bir duvar: kenar ara ayaklarla bölünüyorsa her bölme ayrı duvardır (ör. 4x8'de "Ön Duvar 1", "Ön Duvar 2") */
export type WallSlot = { id: string; side: Side; bay: number; count: number; label: string; length: number };

const sideBays = (size: ConfigurableSize, side: Side) => (side === "on" || side === "arka" ? (size.bays ?? 1) : 1);
export const wallSlotId = (side: Side, bay: number, count: number) => (count > 1 ? `${side}${bay + 1}` : side);
/** Kenar bütünüyle "kapılı" seçildiğinde kapının takıldığı bölme (ortadaki ya da ortanın solundaki) */
export const doorBay = (count: number) => Math.floor((count - 1) / 2);

export function wallSlots(size: ConfigurableSize): WallSlot[] {
  return sides.flatMap((side) => {
    const count = sideBays(size, side);
    return Array.from({ length: count }, (_, bay) => ({
      id: wallSlotId(side, bay, count),
      side,
      bay,
      count,
      label: `${sideLabels[side]} Duvar${count > 1 ? ` ${bay + 1}` : ""}`,
      length: sideLength(size, side) / count,
    }));
  });
}

/**
 * Kenar bazlı duvar düzenini (hazır modeller) bölmelere açar.
 * Birden çok bölmeli kenarda kapı tek bölmededir, diğer bölmeler kapalı duvardır.
 */
export function expandWalls(size: ConfigurableSize, walls: Partial<Record<Side, WallStyle>>): Record<string, WallStyle> {
  const out: Record<string, WallStyle> = {};
  for (const slot of wallSlots(size)) {
    const style = walls[slot.side] ?? "yok";
    out[slot.id] = style === "kapili" && slot.bay !== doorBay(slot.count) ? "kapali" : style;
  }
  return out;
}

/** Kenarın (ilk bölmesinin) duvar tipi: üstten plan gibi kenar bazlı gösterimler için */
export const sideStyle = (config: GazeboConfig, side: Side): WallStyle => config.walls[side] ?? config.walls[`${side}1`] ?? "yok";

export type Accessory = { productId: number; label: string; price: number; image: string | null; suggest: number };

/** Hazır model: duvar düzeni sabit, iskelet/renk/aksesuar müşteri seçimi; istenirse özelleştirilir */
export type Preset = { key: string; name: string; summary: string; walls: Partial<Record<Side, WallStyle>> };

/** Hazır modelin başlangıç yapılandırması */
export function presetConfig(size: ConfigurableSize, data: ConfiguratorData, preset: Preset): GazeboConfig {
  return { ...defaultConfig(size, data), walls: expandWalls(size, preset.walls) };
}

/** Yapılandırma hazır modelle aynı mı (duvarlar aynı ve baskısız) */
export function matchesPreset(config: GazeboConfig, preset: Preset, size: ConfigurableSize) {
  const walls = expandWalls(size, preset.walls);
  return !config.printed && Object.keys(walls).every((id) => (config.walls[id] ?? "yok") === walls[id]);
}

export type GazeboConfig = {
  frame: string;
  printed: boolean;
  color: string;
  /** Baskısız kısımların kumaşı */
  fabric: PlainFabric;
  /** Duvar bölmesi kimliği (WallSlot.id) → duvar tipi */
  walls: Record<string, WallStyle>;
  accessories: Record<number, number>;
};

export const sideLength = (size: ConfigurableSize, side: Side) => (side === "on" || side === "arka" ? size.front : size.side);

export function defaultConfig(size: ConfigurableSize, data: ConfiguratorData): GazeboConfig {
  const cheapest = Object.entries(size.frames).sort((a, b) => a[1] - b[1])[0][0];
  return {
    frame: cheapest,
    printed: false,
    color: data.colors[0].name,
    fabric: "690d",
    walls: expandWalls(size, {}),
    accessories: {},
  };
}

export type PriceLine = { label: string; detail?: string; amount: number };

/** Tek duvarın fiyatı (null: bu kumaşta üretilmiyor) */
export function wallPrice(size: ConfigurableSize, slot: WallSlot, style: WallStyle, fabric: Fabric): number | null {
  if (style === "yok") return 0;
  return size.wallPrices[slot.side === "on" || slot.side === "arka" ? "front" : "side"][style][fabric];
}

/**
 * Baskılı üründe her yer (tavan, saçak, tüm duvarlar) dijital baskılı Oxford'dur; kumaş seçimi yalnızca baskısız üründe.
 * Pencereli duvar şeffaf PVC'lidir ve baskılısı üretilmez: baskılı üründe seçilemez.
 */
export const fabricOf = (config: GazeboConfig): Fabric => (config.printed ? "baskili" : config.fabric);
export const wallStylesFor = (config: GazeboConfig) => (config.printed ? wallStyles.filter((s) => s !== "pencereli") : wallStyles);

/** Baskıyı açar/kapatır; baskılıya geçerken pencereli duvarlar kapalı duvara döner */
export function withPrinted(config: GazeboConfig, printed: boolean): GazeboConfig {
  if (!printed) return { ...config, printed };
  const walls = Object.fromEntries(Object.entries(config.walls).map(([id, style]) => [id, style === "pencereli" ? "kapali" : style]));
  return { ...config, printed, walls };
}

export function priceConfig(size: ConfigurableSize, config: GazeboConfig, data: ConfiguratorData, accessories: Accessory[]) {
  const lines: PriceLine[] = [];
  lines.push({ label: `${size.key} gazebo iskelet`, detail: data.frames[config.frame]?.label, amount: size.frames[config.frame] ?? 0 });
  const fabric = fabricOf(config);
  lines.push({ label: config.printed ? "Baskılı tavan ve saçak" : "Tavan ve saçak", detail: data.fabrics[fabric].label, amount: size.roof[fabric] ?? 0 });

  for (const slot of wallSlots(size)) {
    const style = config.walls[slot.id] ?? "yok";
    if (style === "yok") continue;
    lines.push({
      label: slot.label,
      detail: `${data.walls[style].label} · ${data.fabrics[fabric].label} · ${slot.length.toLocaleString("tr")} m`,
      amount: wallPrice(size, slot, style, fabric) ?? 0,
    });
  }

  for (const acc of accessories) {
    const qty = config.accessories[acc.productId] ?? 0;
    if (qty > 0) lines.push({ label: acc.label, detail: `${qty} adet`, amount: acc.price * qty });
  }

  return { lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}

/** Seçimlerin okunur özeti (sepet satırı, sipariş ve e-postalar): etiket → değer */
export function describeConfig(size: ConfigurableSize, config: GazeboConfig, data: ConfiguratorData, accessories: Accessory[]) {
  const opts: Record<string, string> = { İskelet: data.frames[config.frame]?.label ?? config.frame };
  opts.Kumaş = data.fabrics[fabricOf(config)].label;
  if (!config.printed) opts.Renk = config.color;
  for (const slot of wallSlots(size)) {
    const style = config.walls[slot.id] ?? "yok";
    if (style !== "yok") opts[slot.label] = data.walls[style].label;
  }
  if (config.printed) opts.Baskı = "Tam baskı (tavan, saçak, duvarlar)";
  for (const acc of accessories) if (config.accessories[acc.productId]) opts[acc.label] = `${config.accessories[acc.productId]} adet`;
  return opts;
}

/** Konfigürasyon ↔ URL sorgu parametreleri. Paylaşılabilir ve geri dönülebilir link sağlar. */
export function configToParams(config: GazeboConfig): URLSearchParams {
  const params = new URLSearchParams();
  params.set("iskelet", config.frame);
  // Baskılı üründe renk seçilmez (renkleri baskı belirler)
  // Baskılı üründe renk ve kumaş seçilmez (tek tip dijital baskılı kumaş)
  if (!config.printed) {
    params.set("renk", config.color);
    params.set("kumas", config.fabric);
  }
  for (const [id, style] of Object.entries(config.walls)) if (style !== "yok") params.set(id, style);
  if (config.printed) {
    params.set("baski", "tam");
  }
  const acc = Object.entries(config.accessories).filter(([, q]) => q > 0);
  if (acc.length) params.set("aksesuar", acc.map(([id, q]) => `${id}x${q}`).join(","));
  return params;
}

export function configFromParams(
  params: Record<string, string | string[] | undefined>,
  size: ConfigurableSize,
  data: ConfiguratorData,
  /** URL'de yapılandırma yoksa kullanılacak başlangıç (ör. hazır model) */
  base?: GazeboConfig,
): GazeboConfig {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  // Yapılandırma linkinde iskelet her zaman yazılır; yoksa link yapılandırma taşımıyordur
  if (!get("iskelet") && !get("baski")) return base ?? defaultConfig(size, data);
  const config = defaultConfig(size, data);

  const frame = get("iskelet");
  if (frame && frame in size.frames) config.frame = frame;
  const color = get("renk");
  if (color && data.colors.some((c) => c.name === color)) config.color = color;
  const fabric = get("kumas");
  if (plainFabrics.includes(fabric as PlainFabric)) config.fabric = fabric as PlainFabric;
  const styleParam = (k: string) => {
    const style = get(k) as WallStyle | undefined;
    return style && wallStyles.includes(style) ? style : undefined;
  };
  // Kenar bazlı eski linkler (ör. ?on=kapili) bölmelere açılır; bölme parametreleri (on1, on2…) önceliklidir
  config.walls = expandWalls(size, Object.fromEntries(sides.map((side) => [side, styleParam(side)]).filter(([, s]) => s)));
  for (const slot of wallSlots(size)) {
    const style = styleParam(slot.id);
    if (style) config.walls[slot.id] = style;
  }
  // Eski linklerdeki kısmi baskı (ör. baski=tavan,sacak) de tam baskı sayılır
  const print = get("baski");
  if (print && print !== "yok") Object.assign(config, withPrinted(config, true));
  for (const pair of get("aksesuar")?.split(",") ?? []) {
    const [id, qty] = pair.split("x").map(Number);
    if (Number.isInteger(id) && Number.isInteger(qty) && qty > 0 && qty < 100) config.accessories[id] = qty;
  }
  return config;
}

/** Sepette aynı konfigürasyonu tek satırda birleştirmek için kararlı sayı anahtar */
export function configHash(config: GazeboConfig): number {
  const text = configToParams(config).toString();
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}
