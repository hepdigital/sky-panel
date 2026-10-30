import "server-only";
import type { SiteAction, SiteOrder, Vocabulary } from "../sites";

// Trendyol satıcı API'si (apigw.trendyol.com/integration). Bağlantının anahtarı "saticiId:apiKey:apiSecret",
// adresi https://apigw.trendyol.com (test ortamı: https://stageapigw.trendyol.com).
// Panelde her sipariş bir sevkiyat paketidir: Trendyol paketi bölerse eski paket "UnPacked" olur, yenileri ayrı gelir.

type Conn = { adres: string; anahtar: string | null };
const TIMEOUT = 20_000;

export function tyCredentials(anahtar: string | null) {
  const [saticiId = "", apiKey = "", apiSecret = ""] = (anahtar ?? "").split(":");
  return { saticiId, apiKey, apiSecret };
}

/** Anahtar biçimi: satıcı ID (sayı) : API key : API secret */
export const tyKeyValid = (anahtar: string) => /^\d+:[^:\s]+:[^:\s]+$/.test(anahtar);

export async function tyRequest(c: Conn, path: string, init?: RequestInit) {
  const { saticiId, apiKey, apiSecret } = tyCredentials(c.anahtar);
  if (!saticiId || !apiKey || !apiSecret) throw new Error("Trendyol: satıcı ID, API key ve API secret eksik.");
  const url = `${c.adres.replace(/\/+$/, "")}/integration${path.replaceAll("{saticiId}", saticiId)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
      "User-Agent": `${saticiId} - SelfIntegration`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const d = data as { errors?: { message?: string }[]; message?: string; exception?: string } | null;
    const why = d?.errors?.map((e) => e.message).filter(Boolean).join("; ") || d?.message || d?.exception;
    throw new Error(res.status === 401 || res.status === 403 ? "Trendyol: API bilgileri reddedildi (satıcı ID, key, secret)." : `Trendyol: ${why || `HTTP ${res.status}`}`);
  }
  return data;
}

/* ───────────── siparişler ───────────── */

type TyAddress = { fullName?: string; firstName?: string; lastName?: string; company?: string; address1?: string; address2?: string; fullAddress?: string; city?: string; district?: string; phone?: string | null; taxOffice?: string; taxNumber?: string };
type TyPackage = {
  id: number;
  orderNumber: string;
  orderDate: number;
  lastModifiedDate: number;
  status: string;
  shipmentPackageStatus?: string;
  customerFirstName?: string;
  customerLastName?: string;
  customerEmail?: string;
  tcIdentityNumber?: string;
  taxNumber?: string;
  commercial?: boolean;
  shipmentAddress?: TyAddress;
  invoiceAddress?: TyAddress;
  grossAmount?: number;
  totalDiscount?: number;
  totalPrice: number;
  cargoProviderName?: string;
  cargoTrackingNumber?: number | string;
  cargoTrackingLink?: string;
  invoiceLink?: string;
  agreedDeliveryDate?: number;
  lines: { id: number; quantity: number; productName: string; merchantSku?: string; barcode?: string; productColor?: string; productSize?: string; amount: number; discount?: number; price: number; vatBaseAmount?: number; orderLineItemStatusName?: string }[];
  packageHistories?: { createdDate: number; status: string }[];
};

/** Paket durumları (Trendyol anahtarı → ad). Panelden yazılabilenler: Hazırlanıyor, Faturalandı */
const DURUMLAR: [string, string][] = [
  ["Awaiting", "Ödeme bekleniyor"],
  ["Created", "Yeni"],
  ["Picking", "Hazırlanıyor"],
  ["Invoiced", "Faturalandı"],
  ["Shipped", "Kargoda"],
  ["AtCollectionPoint", "Teslim noktasında"],
  ["Delivered", "Teslim edildi"],
  ["UnDelivered", "Teslim edilemedi"],
  ["Returned", "İade edildi"],
  ["Cancelled", "İptal edildi"],
  ["UnSupplied", "Tedarik edilemedi"],
  ["UnPacked", "Paket bölündü"],
];
const YAZILABILIR = ["Picking", "Invoiced"];

export const TY_PANEL_STATUS: Record<string, "alindi" | "uretimde" | "hazir" | "kargoda" | "teslim" | "iptal"> = {
  Awaiting: "alindi", Created: "alindi", Picking: "uretimde", Invoiced: "hazir", Shipped: "kargoda", AtCollectionPoint: "kargoda",
  UnDelivered: "kargoda", Delivered: "teslim", Returned: "iptal", Cancelled: "iptal", UnSupplied: "iptal", UnPacked: "iptal",
};

export const tyVocabulary = (): Vocabulary => ({
  durumlar: DURUMLAR.map(([key, label]) => ({ key, label })),
  yazilabilir: YAZILABILIR,
  odemeDurumlari: [],
  odemeYontemleri: [{ key: "trendyol", label: "Trendyol (pazaryeri tahsil eder)" }],
  kargolar: [],
});

const r2 = (v: number) => Math.round(v * 100) / 100;
const iso = (ms: number | undefined) => new Date(ms ?? Date.now()).toISOString();
const nameOf = (a?: TyAddress) => a?.fullName || [a?.firstName, a?.lastName].filter(Boolean).join(" ");
const addrOf = (a?: TyAddress) => a?.fullAddress || [a?.address1, a?.address2].filter(Boolean).join(" ");

function tyToOrder(p: TyPackage): SiteOrder {
  const ad = [p.customerFirstName, p.customerLastName].filter(Boolean).join(" ") || nameOf(p.invoiceAddress) || nameOf(p.shipmentAddress);
  const inv = p.invoiceAddress;
  const kurumsal = !!p.commercial || !!inv?.company;
  // Satır fiyatı (price) indirim sonrası KDV dahil birim fiyattır; KDV satır oranından ayrılır
  const kdv = r2(p.lines.reduce((s, l) => s + (l.price * l.quantity * (l.vatBaseAmount ?? 20)) / (100 + (l.vatBaseAmount ?? 20)), 0));
  const toplam = r2(p.totalPrice);
  return {
    no: p.orderNumber,
    disNo: String(p.id),
    disId: String(p.id),
    durum: p.shipmentPackageStatus || p.status,
    odemeYontemi: "trendyol",
    odemeYontemiAd: "Trendyol",
    odemeDurumu: "odendi",
    musteri: {
      ad, eposta: p.customerEmail ?? "", telefon: p.shipmentAddress?.phone ?? "", il: inv?.city || p.shipmentAddress?.city || "", ilce: inv?.district || p.shipmentAddress?.district || "",
      adres: addrOf(inv) || addrOf(p.shipmentAddress), faturaTipi: kurumsal ? "kurumsal" : "bireysel", firma: inv?.company || null,
      vergiDairesi: inv?.taxOffice || null, vergiNo: inv?.taxNumber || p.taxNumber || p.tcIdentityNumber || null,
    },
    teslimat: p.shipmentAddress ? { ad: nameOf(p.shipmentAddress), adres: addrOf(p.shipmentAddress), il: p.shipmentAddress.city ?? "", ilce: p.shipmentAddress.district ?? "", telefon: p.shipmentAddress.phone ?? "" } : null,
    musteriNotu: null,
    araToplam: r2(toplam - kdv),
    indirim: r2(p.totalDiscount ?? 0),
    kdv,
    toplam,
    kargo: { firma: p.cargoProviderName ?? null, takipNo: p.cargoTrackingNumber ? String(p.cargoTrackingNumber) : null, gonderim: null, link: p.cargoTrackingLink || null },
    fatura: { link: p.invoiceLink || null },
    paketSatirlari: p.lines.map((l) => ({ id: l.id, adet: l.quantity })),
    kalemler: p.lines.map((l) => ({
      ad: l.productName,
      adet: l.quantity,
      birim: r2(l.price),
      secenekler: Object.fromEntries(
        [["Barkod", l.barcode], ["Stok kodu", l.merchantSku], ["Renk", l.productColor], ["Beden/ölçü", l.productSize], ["Satır durumu", l.orderLineItemStatusName]].filter((x): x is [string, string] => !!x[1]),
      ),
      gorsel: null,
    })),
    gecmis: (p.packageHistories ?? []).map((h) => ({ durum: h.status, mesaj: null, gorunur: true, kim: "system", kimAd: "Trendyol", tarih: iso(h.createdDate) })),
    dosyalar: [],
    linkler: {},
    olusturma: iso(p.orderDate),
    guncelleme: iso(p.lastModifiedDate),
  };
}

const PAGE = 200;
const WINDOW = 14 * 24 * 3600_000;
/** İlk eşitlemede geriye doğru bakılacak süre */
const FIRST_LOOKBACK = 30 * 24 * 3600_000;
/**
 * Trendyol zaman damgaları Türkiye saatine kaydırılmış gelebilir: pencere sonu üç saat ileride, sonraki pencerenin başı
 * dört saat geride tutulur; hiçbir değişiklik kaçmaz (kayıt eşsiz, tekrar çekmek zararsız)
 */
const AHEAD = 3 * 3600_000;
const OVERLAP = 4 * 3600_000;

/**
 * Değişen paketler, son değişiklik anına göre. İmleç "pencereBaşı|sayfa" (ms). Trendyol bir istekte en çok iki haftalık
 * aralık kabul eder: pencere iki haftadır, bitince başı ilerler.
 */
export async function tyFetch(c: Conn, cursor: string | null) {
  const [startRaw, pageRaw] = (cursor ?? "").split("|");
  const now = Date.now();
  const start = Number(startRaw) || now - FIRST_LOOKBACK;
  const page = Number(pageRaw) || 0;
  const end = Math.min(now + AHEAD, start + WINDOW);
  const q = new URLSearchParams({
    startDate: String(start), endDate: String(end), page: String(page), size: String(PAGE), orderByField: "PackageLastModifiedDate", orderByDirection: "ASC",
  });
  const data = (await tyRequest(c, `/order/sellers/{saticiId}/orders?${q}`)) as { content: TyPackage[]; totalPages: number };
  const orders = (data.content ?? []).map(tyToOrder);
  const lastPage = page + 1 >= (data.totalPages ?? 0);
  let next: string;
  let done = false;
  if (!lastPage) next = `${start}|${page + 1}`;
  else if (end < now + AHEAD) next = `${end - OVERLAP}|0`;
  else {
    next = `${Math.max(start, now - OVERLAP)}|0`;
    done = true;
  }
  return { orders, vocab: tyVocabulary(), cursor: next, done };
}

export async function tyOrder(c: Conn, paketId: string) {
  const q = new URLSearchParams({ shipmentPackageIds: paketId });
  const data = (await tyRequest(c, `/order/sellers/{saticiId}/orders?${q}`)) as { content: TyPackage[] };
  const p = data.content?.[0];
  return p ? tyToOrder(p) : null;
}

/** Panelden Trendyol'a: paket durumu (Hazırlanıyor / Faturalandı) ve fatura linki */
export async function tyAction(c: Conn, o: SiteOrder, a: SiteAction) {
  const paketId = o.disId;
  if (!paketId) throw new Error("Trendyol paket numarası eksik.");
  const lines = (o.paketSatirlari ?? []).map((l) => ({ lineId: l.id, quantity: l.adet }));
  if (a.islem === "durum") {
    if (!YAZILABILIR.includes(a.durum)) throw new Error("Bu durum Trendyol'da panelden değiştirilemez.");
    if (a.durum === "Invoiced" && !a.mesaj) throw new Error("Faturalandı için fatura numarasını yazın.");
    await tyRequest(c, `/order/sellers/{saticiId}/shipment-packages/${paketId}`, {
      method: "PUT",
      body: JSON.stringify({ lines, params: a.durum === "Invoiced" ? { invoiceNumber: a.mesaj } : {}, status: a.durum }),
    });
  } else if (a.islem === "fatura") {
    if (!/^https:\/\/\S+$/.test(a.link)) throw new Error("Fatura linkini https:// ile yazın.");
    await tyRequest(c, `/order/sellers/{saticiId}/seller-invoice-links`, { method: "POST", body: JSON.stringify({ invoiceLink: a.link, shipmentPackageId: Number(paketId) }) });
  } else {
    throw new Error("Trendyol siparişlerinde ödeme, kargo ve not Trendyol tarafından yönetilir.");
  }
  return tyOrder(c, paketId);
}

export async function tyTest(c: Conn) {
  await tyRequest(c, `/order/sellers/{saticiId}/orders?size=1`);
}

/* ───────────── ürünler ───────────── */

type TyCategory = { id: number; name: string; parentId?: number | null; subCategories?: TyCategory[] };

/** Kategori ağacı düz liste olarak (yol: "Ev & Yaşam > Bahçe > Gazebo") */
export async function tyCategories(c: Conn) {
  const data = (await tyRequest(c, "/product/product-categories")) as { categories: TyCategory[] };
  const out: { id: number; ustId: number | null; ad: string; yol: string; yaprak: boolean }[] = [];
  const walk = (list: TyCategory[], parent: TyCategory | null, path: string) => {
    for (const k of list) {
      const yol = path ? `${path} > ${k.name}` : k.name;
      const subs = k.subCategories ?? [];
      out.push({ id: k.id, ustId: parent?.id ?? null, ad: k.name, yol, yaprak: !subs.length });
      walk(subs, k, yol);
    }
  };
  walk(data.categories ?? [], null, "");
  return out;
}

/** Kategori özelliği (panelin biçimi): değer listesi varsa listeden seçilir, serbest değer izinliyse yazılabilir */
export type CategoryAttribute = { id: number; ad: string; zorunlu: boolean; serbest: boolean; varyant: boolean; degerler: { id: number; ad: string }[] };

export async function tyCategoryAttributes(c: Conn, kategoriId: number): Promise<CategoryAttribute[]> {
  const data = (await tyRequest(c, `/product/product-categories/${kategoriId}/attributes`)) as {
    categoryAttributes: { allowCustom: boolean; required: boolean; varianter?: boolean; attribute: { id: number; name: string }; attributeValues: { id: number; name: string }[] }[];
  };
  return (data.categoryAttributes ?? [])
    .map((a) => ({ id: a.attribute.id, ad: a.attribute.name, zorunlu: !!a.required, serbest: !!a.allowCustom, varyant: !!a.varianter, degerler: (a.attributeValues ?? []).map((v) => ({ id: v.id, ad: v.name })) }))
    .sort((a, b) => Number(b.zorunlu) - Number(a.zorunlu) || a.ad.localeCompare(b.ad, "tr"));
}

export async function tyBrands(c: Conn, ad: string) {
  const data = (await tyRequest(c, `/product/brands/by-name?name=${encodeURIComponent(ad)}`)) as { id: number; name: string }[] | null;
  return (data ?? []).slice(0, 20).map((b) => ({ id: b.id, ad: b.name }));
}

/** Trendyol ürün kalemi (oluşturma ve güncelleme aynı biçim; fiyat/stok güncellemede dikkate alınmaz) */
export type TyItem = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType: "TRY";
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId?: number;
  deliveryDuration?: number;
  images: { url: string }[];
  attributes: ({ attributeId: number; attributeValueId: number } | { attributeId: number; customAttributeValue: string })[];
};

/** Yeni kartlar POST, var olanlar PUT; Trendyol toplu işlem numarası döner */
export async function tySendProducts(c: Conn, items: TyItem[], update: boolean) {
  const data = (await tyRequest(c, "/product/sellers/{saticiId}/products", { method: update ? "PUT" : "POST", body: JSON.stringify({ items }) })) as { batchRequestId: string };
  return data.batchRequestId;
}

export async function tyPriceStock(c: Conn, items: { barcode: string; quantity: number; salePrice: number; listPrice: number }[]) {
  const data = (await tyRequest(c, "/inventory/sellers/{saticiId}/products/price-and-inventory", { method: "POST", body: JSON.stringify({ items }) })) as { batchRequestId: string };
  return data.batchRequestId;
}

export type BatchResult = { bitti: boolean; kalemler: { barkod: string; basarili: boolean; hatalar: string[] }[] };

export async function tyBatch(c: Conn, batchId: string): Promise<BatchResult> {
  const data = (await tyRequest(c, `/product/sellers/{saticiId}/products/batch-requests/${encodeURIComponent(batchId)}`)) as {
    status?: string;
    items?: { status: string; failureReasons?: string[]; requestItem?: { barcode?: string; product?: { barcode?: string } } }[];
  };
  return {
    bitti: data.status !== "IN_PROGRESS",
    kalemler: (data.items ?? []).map((i) => ({
      barkod: i.requestItem?.barcode ?? i.requestItem?.product?.barcode ?? "",
      basarili: i.status === "SUCCESS",
      hatalar: i.failureReasons ?? [],
    })),
  };
}

/** Oluşmuş kartın onay durumu: onaylı / reddedildi (gerekçesiyle) / bekliyor; kart yoksa null */
export async function tyProductState(c: Conn, barkod: string) {
  const data = (await tyRequest(c, `/product/sellers/{saticiId}/products?barcode=${encodeURIComponent(barkod)}&size=1`)) as {
    content?: { approved?: boolean; rejected?: boolean; archived?: boolean; onSale?: boolean; rejectReasonDetails?: { rejectReason?: string; rejectReasonDetail?: string }[] }[];
  };
  const p = data.content?.[0];
  if (!p) return null;
  const neden = (p.rejectReasonDetails ?? []).map((r) => [r.rejectReason, r.rejectReasonDetail].filter(Boolean).join(": ")).join("; ");
  return { onayli: !!p.approved, reddedildi: !!p.rejected, satista: !!p.onSale, neden: neden || null };
}
