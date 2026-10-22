// İstasyon ekranları için örnek işler.
// 1 iş emri = 1 sipariş; içinde birden fazla ürün (kalem) bulunur. Her kalemin kendi rotası vardır
// (örn. baskılı tavan: tasarım → baskı → üretim → sevkiyat, iskelet: üretim → sevkiyat).

export type StationKey = "design" | "print" | "production" | "shipping";
export type ItemStage = StationKey | "customer_review" | "shipped";
export type PlanDay = "today" | "tomorrow" | "week";

export type JobLog = { stage: ItemStage; action: string; by: string; at: string };

export type JobItem = {
  id: string;
  name: string;
  image: string;
  qty: number;
  spec: string;
  route: StationKey[];
  stage: ItemStage; // kalemin şu an bulunduğu yer
  done: StationKey[]; // tamamlanan istasyonlar
};

export type Job = {
  id: string; // iş emri no
  order: string;
  customer: string;
  due: string;
  plan: PlanDay;
  priority?: "urgent";
  late?: boolean;
  note?: string;
  revision?: string;
  delivery?: "cargo" | "pickup";
  active: StationKey[]; // hangi istasyonlarda üzerinde çalışılıyor
  startedAt: Partial<Record<StationKey, number>>;
  blocked: Partial<Record<StationKey, string>>;
  doneToday: StationKey[];
  items: JobItem[];
  log: JobLog[];
};

export const stations: Record<
  StationKey,
  {
    title: string;
    operator: string;
    initials: string;
    dot: string;
    startLabel: string;
    itemDone: string; // kalem işaretleme etiketi
    itemDoneShort: string;
    pending: string; // bu istasyona henüz gelmemiş kalem etiketi
    problems: string[];
  }
> = {
  design: {
    title: "Tasarım",
    operator: "Burak Aydın",
    initials: "BA",
    dot: "bg-[#c98a1a]",
    startLabel: "Tasarıma başla",
    itemDone: "Tasarım hazır",
    itemDoneShort: "hazır",
    pending: "Tasarımda",
    problems: ["Logo / görsel eksik", "Ölçü bilgisi belirsiz", "Müşteriye ulaşılamıyor", "Diğer"],
  },
  print: {
    title: "Baskı",
    operator: "Cem Yıldız",
    initials: "CY",
    dot: "bg-brand-500",
    startLabel: "Baskıya başla",
    itemDone: "Basıldı",
    itemDoneShort: "basıldı",
    pending: "Baskıda",
    problems: ["Kumaş / malzeme eksik", "Makine arızası", "Dosya hatalı", "Renk uyuşmazlığı", "Diğer"],
  },
  production: {
    title: "Üretim",
    operator: "Hakan Öz",
    initials: "HÖ",
    dot: "bg-[#0f9d6b]",
    startLabel: "Üretime başla",
    itemDone: "Üretildi",
    itemDoneShort: "üretildi",
    pending: "Üretimde",
    problems: ["İskelet / parça eksik", "Dikiş hatası", "Baskı hatalı geldi", "Diğer"],
  },
  shipping: {
    title: "Sevkiyat",
    operator: "Murat Şen",
    initials: "MŞ",
    dot: "bg-[#64748b]",
    startLabel: "Paketlemeye başla",
    itemDone: "Paketlendi",
    itemDoneShort: "paketlendi",
    pending: "Sevkiyatta",
    problems: ["Eksik ürün", "Adres hatalı", "Ödeme onayı bekleniyor", "Diğer"],
  },
};

export const stageLabel: Record<ItemStage, string> = {
  design: "Tasarımda",
  customer_review: "Müşteri onayında",
  print: "Baskıda",
  production: "Üretimde",
  shipping: "Sevkiyatta",
  shipped: "Kargoda",
};

const img = (id: string, ext = "jpg") => `/products/${id}.${ext}`;
const FULL: StationKey[] = ["design", "print", "production", "shipping"];

let seq = 0;
function item(name: string, image: string, qty: number, spec: string, route: StationKey[], stage: ItemStage, done: StationKey[] = []): JobItem {
  seq += 1;
  return { id: `K${seq}`, name, image, qty, spec, route, stage, done };
}

function job(j: Omit<Job, "active" | "startedAt" | "blocked" | "doneToday" | "log"> & Partial<Job>): Job {
  return { active: [], startedAt: {}, blocked: {}, doneToday: [], log: [], ...j };
}

export const initialJobs: Job[] = [
  // ── Tasarım
  job({
    id: "İE-1201", order: "SP-2026-0981", customer: "Akdeniz Reklam", due: "21 Eki", plan: "today", priority: "urgent",
    revision: "Logo alınlıkta daha büyük olsun, telefon numarası eklensin.",
    items: [
      item("3x3 Gazebo tavan baskısı", img("18928", "jpeg"), 2, "Polyester 600D · logo alınlıkta", FULL, "design"),
      item("Tam duvar baskısı", img("18914"), 6, "3 duvar × 2 gazebo", FULL, "design"),
      item("Damla bayrak", img("15758", "png"), 4, "130x278 · tek yön", FULL, "design"),
      item("40'lık çelik iskelet", img("18928", "jpeg"), 2, "3x3 · çanta dahil", ["production", "shipping"], "production"),
    ],
  }),
  job({
    id: "İE-1207", order: "SP-2026-0985", customer: "Ege Promosyon", due: "22 Eki", plan: "today", active: ["design"],
    items: [
      item("Örümcek stand kumaş · ön yüz", img("16286", "webp"), 6, "300x225 · streç", FULL, "design", ["design"]),
      item("Örümcek stand kumaş · yan panel", img("16286", "webp"), 12, "75x225 · streç", FULL, "design"),
      item("Örümcek stand mekanizma", img("16281", "webp"), 6, "3x3 mekanizma + çanta", ["production", "shipping"], "production"),
    ],
  }),
  job({
    id: "İE-1210", order: "SP-2026-0983", customer: "Başkent Organizasyon", due: "21 Eki", plan: "today",
    items: [
      item("X banner baskı", img("15880", "png"), 15, "80x180 · mat PVC", ["design", "print", "shipping"], "design"),
      item("Roll-up baskı", img("15888", "png"), 5, "85x200 · petfilm", ["design", "print", "shipping"], "design"),
    ],
  }),
  // ── Müşteri onayında
  job({
    id: "İE-1198", order: "SP-2026-0976", customer: "Başkent Organizasyon", due: "20 Eki", plan: "today", late: true,
    items: [
      item("Roll-up baskı", img("15888", "png"), 20, "85x200 · petfilm", ["design", "print", "shipping"], "customer_review", ["design"]),
      item("Roll-up kasa", img("15888", "png"), 20, "Alüminyum kasa + çanta", ["shipping"], "shipping"),
    ],
  }),
  // ── Baskı
  job({
    id: "İE-1190", order: "SP-2026-0962", customer: "Ege Promosyon", due: "15 Eki", plan: "today", priority: "urgent", late: true, active: ["print"],
    items: [
      item("3x6 Gazebo tavan baskısı", img("19889"), 2, "Polyester 600D", FULL, "production", ["design", "print"]),
      item("Tam duvar baskısı", img("19889"), 8, "4 duvar × 2 gazebo", FULL, "print", ["design"]),
      item("Alınlık baskısı", img("19889"), 4, "Ön + arka", FULL, "print", ["design"]),
      item("40'lık çelik iskelet 3x6", img("18928", "jpeg"), 2, "Çanta dahil", ["production", "shipping"], "production"),
    ],
  }),
  job({
    id: "İE-1193", order: "SP-2026-0954", customer: "Akdeniz Reklam", due: "18 Eki", plan: "today",
    items: [
      item("Beach flag kumaş", img("16781"), 12, "100x400 · bayrak kumaşı", FULL.slice(1), "print"),
      item("Beach flag direk seti", img("16781"), 12, "Direk + çapraz ayak + çanta", ["production", "shipping"], "production"),
    ],
  }),
  job({
    id: "İE-1195", order: "SP-2026-0979", customer: "Karadeniz Matbaa", due: "19 Eki", plan: "tomorrow",
    items: [item("Gönder bayrağı", img("16794"), 50, "100x150 · raşel · kenar dikişli", FULL.slice(1), "print")],
  }),
  // ── Üretim
  job({
    id: "İE-1186", order: "SP-2026-0969", customer: "Kapadokya Etkinlik", due: "17 Eki", plan: "today",
    items: [
      item("2x3 Gazebo tavan", img("19943"), 1, "Baskısız · beyaz", ["production", "shipping"], "production"),
      item("Tam duvar", img("19943"), 3, "Baskısız · fermuarlı", ["production", "shipping"], "production"),
      item("30'luk çelik iskelet", img("19943"), 1, "Beyaz", ["production", "shipping"], "production", ["production"]),
    ],
  }),
  job({
    id: "İE-1180", order: "SP-2026-0941", customer: "Karadeniz Matbaa", due: "14 Eki", plan: "today", late: true,
    blocked: { production: "İskelet / parça eksik" },
    items: [item("Baskılı katlanır sandalye", img("16251"), 30, "Kumaş geçirme", ["production", "shipping"], "production")],
  }),
  job({
    id: "İE-1214", order: "SP-2026-0990", customer: "Marmara Fuarcılık", due: "24 Eki", plan: "week", note: "Finans onayı sonrası başlanacak",
    items: [
      item("3x6 Gazebo tavan baskısı", img("19889"), 2, "Polyester 600D", FULL.slice(1), "print"),
      item("40'lık çelik iskelet 3x6", img("18928", "jpeg"), 2, "Çanta dahil", ["production", "shipping"], "production"),
    ],
  }),
  // ── Sevkiyat
  job({
    id: "İE-1176", order: "SP-2026-0948", customer: "Başkent Organizasyon", due: "Bugün 14:00", plan: "today", delivery: "pickup", note: "Fabrikadan teslim · randevulu",
    items: [item("A pano 60x100", img("16219", "png"), 4, "4 koli · 18 kg", ["shipping"], "shipping")],
  }),
  job({
    id: "İE-1174", order: "SP-2026-0936", customer: "Ege Promosyon", due: "Bugün 16:00", plan: "today", delivery: "cargo",
    items: [
      item("Damla bayrak kumaş", img("15758", "png"), 20, "2 koli", ["shipping"], "shipping", ["shipping"]),
      item("Damla bayrak direk + ayak", img("15758", "png"), 20, "1 koli · 14 kg", ["shipping"], "shipping"),
    ],
  }),
  job({
    id: "İE-1172", order: "SP-2026-0930", customer: "Kapadokya Etkinlik", due: "Bugün 16:00", plan: "today", delivery: "cargo",
    items: [
      item("Portatif masa", img("16260", "webp"), 2, "1 koli · 22 kg", ["shipping"], "shipping"),
      item("Masa örtüsü", img("16260", "webp"), 8, "1 koli · 4 kg", ["shipping"], "shipping"),
    ],
  }),
];

export const carriers = ["Aras Kargo", "Yurtiçi Kargo", "MNG Kargo", "Kendi aracımız"];

/* ───────── Hesaplamalar ───────── */

/** Kalemin toplam adım sayısı (tasarım varsa müşteri onayı da bir adımdır). */
function steps(i: JobItem) {
  return i.route.length + (i.route.includes("design") ? 1 : 0);
}
function stepsDone(i: JobItem) {
  if (i.stage === "shipped") return steps(i);
  const passedReview = i.route.includes("design") && i.done.includes("design") && i.stage !== "design" && i.stage !== "customer_review";
  // Paketlenmiş ama henüz sevk edilmemiş kalemde sevkiyat adımı tamamlanmış sayılmaz.
  const packedOnly = i.done.includes("shipping") ? 1 : 0;
  return i.done.length - packedOnly + (passedReview ? 1 : 0);
}

/** Siparişin genel tamamlanma yüzdesi. */
export function jobProgress(j: Job) {
  const total = j.items.reduce((s, i) => s + steps(i), 0);
  const done = j.items.reduce((s, i) => s + stepsDone(i), 0);
  return Math.round((done / total) * 100);
}

/** Bir istasyon için: o istasyondan geçecek kalemler ve tamamlananlar. */
export function stationProgress(j: Job, s: StationKey) {
  const relevant = j.items.filter((i) => i.route.includes(s));
  const done = relevant.filter((i) => i.done.includes(s)).length;
  return { done, total: relevant.length, pct: relevant.length ? Math.round((done / relevant.length) * 100) : 0 };
}

/** İş bu istasyonun ekranında görünür mü? (istasyonda en az bir kalem) */
export function isAtStation(j: Job, s: StationKey) {
  // Tasarım ve sevkiyatta işaretlenen kalemler, iş toplu olarak devredilene kadar ekranda kalır.
  return j.items.some((i) => i.stage === s);
}

export function nextStage(i: JobItem, from: StationKey): ItemStage {
  if (from === "design") return "customer_review";
  const idx = i.route.indexOf(from);
  return i.route[idx + 1] ?? "shipped";
}
