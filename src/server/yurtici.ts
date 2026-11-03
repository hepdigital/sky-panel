import "server-only";

// Yurtiçi Kargo web servisleri (SOAP, ws.yurticikargo.com/KOPSWebServices). Yalnızca okuma:
//  - WsReportWithReferenceServices.listInvDocumentWithDocDateInvCustId: fatura müşterisi olduğumuz gönderiler (giden ve
//    bizim ödediğimiz gelen), tarih aralığıyla; desi, koli, ücret, durum, takip adresi.
//  - ShippingOrderDispatcherServices.queryShipment: bağlantı testi (olmayan bir kargo anahtarı sorgulanır).
// Gönderici ödemeli ve alıcı ödemeli kullanıcıların raporu aynı kayıtları verir; tek kullanıcı yeterlidir.

const BASE = "https://ws.yurticikargo.com/KOPSWebServices";
const TIMEOUT = 30_000;

export type YkCredentials = { kullanici: string; sifre: string; musteriNo: string };

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
const unesc = (s: string) => s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

async function soap(service: string, ns: string, body: string) {
  const res = await fetch(`${BASE}/${service}`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${ns}"><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  if (!res.ok && !text.includes("Envelope")) throw new Error(`Yurtiçi: HTTP ${res.status}`);
  const fault = text.match(/<faultstring>([^<]*)<\/faultstring>/);
  if (fault) throw new Error(`Yurtiçi: ${unesc(fault[1])}`);
  return text;
}

const tag = (xml: string, t: string) => {
  const m = xml.match(new RegExp(`<${t}>([^<]*)</${t}>`));
  return m ? unesc(m[1]).trim() : "";
};

/** Kullanıcı ve şifreyi doğrular: olmayan bir kargo anahtarı sorgulanır, "bulunamadı" yanıtı bilgilerin doğru olduğunu gösterir */
export async function ykTest(c: YkCredentials) {
  const xml = await soap(
    "ShippingOrderDispatcherServices",
    "http://yurticikargo.com.tr/ShippingOrderDispatcherServices",
    `<ws:queryShipment><wsUserName>${esc(c.kullanici)}</wsUserName><wsPassword>${esc(c.sifre)}</wsPassword><wsLanguage>TR</wsLanguage><keys>PANELTEST0001</keys><keyType>0</keyType><addHistoricalData>false</addHistoricalData><onlyTracking>false</onlyTracking></ws:queryShipment>`,
  );
  if (tag(xml, "outFlag") !== "0") throw new Error(`Yurtiçi: ${tag(xml, "outResult") || "kullanıcı ya da şifre reddedildi"}`);
  return { musteriNo: tag(xml, "senderCustId") };
}

export type YkShipment = {
  belgeId: string;
  belgeNo: string;
  tarih: string;
  gondericiId: string;
  gonderici: string;
  alici: string;
  aliciAdres: string;
  koli: number;
  desi: number;
  kg: number;
  /** KDV hariç ücret, KDV ve toplam */
  ucret: number;
  kdv: number;
  toplam: number;
  durumKodu: string;
  durum: string;
  red: boolean;
  takipUrl: string | null;
  tahminiTeslim: string | null;
};

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ymd = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);

/** Tarih aralığındaki gönderiler (gün: "YYYYMMDD"); servis bir istekte bir ayı rahat verir */
export async function ykShipments(c: YkCredentials, start: string, end: string): Promise<YkShipment[]> {
  const xml = await soap(
    "WsReportWithReferenceServices",
    "http://yurticikargo.com.tr/sswIntegrationServices",
    `<ws:listInvDocumentWithDocDateInvCustId><userName>${esc(c.kullanici)}</userName><password>${esc(c.sifre)}</password><language>TR</language><invCustParamsVO><invCustIdArray>${esc(c.musteriNo)}</invCustIdArray></invCustParamsVO><unitParamsVO/><startDate>${start}</startDate><endDate>${end}</endDate><wsUserGroupId>0</wsUserGroupId><pageSequenceNumber>1</pageSequenceNumber><totalPages>0</totalPages></ws:listInvDocumentWithDocDateInvCustId>`,
  );
  const head = xml.split("<shippingDetailResponseVOArray>")[0];
  const flag = tag(head, "outFlag");
  const why = tag(head, "outResult") || tag(head, "errMessage");
  // Gönderisi olmayan aralık hata olarak döner: boş liste sayılır
  if (flag && flag !== "0" && /kay[ıi]t bulunamad/i.test(why)) return [];
  if (flag && flag !== "0") throw new Error(`Yurtiçi: ${why || "rapor alınamadı"}`);
  return [...xml.matchAll(/<shippingDetailResponseVOArray>([\s\S]*?)<\/shippingDetailResponseVOArray>/g)].map(([, r]) => ({
    belgeId: tag(r, "docId"),
    belgeNo: tag(r, "docNumber"),
    tarih: ymd(tag(r, "documentDate")) ?? new Date().toISOString().slice(0, 10),
    gondericiId: tag(r, "senderCustId"),
    gonderici: tag(r, "senderCustName"),
    alici: tag(r, "receiverCustName"),
    aliciAdres: tag(r, "receiverAddressTxt"),
    koli: Math.max(1, num(tag(r, "totalCargoCount"))),
    desi: num(tag(r, "totalDesi")),
    kg: num(tag(r, "totalKg")),
    ucret: num(tag(r, "totalPrice")),
    kdv: num(tag(r, "totalVat")),
    toplam: num(tag(r, "totalAmount")),
    durumKodu: tag(r, "cargoEventId"),
    durum: tag(r, "cargoEventExplanation"),
    red: tag(r, "rejectFlag") === "1",
    takipUrl: tag(r, "trackingUrl") || null,
    tahminiTeslim: ymd(tag(r, "estimatedDeliveryDate")),
  })).filter((s) => s.belgeId);
}
