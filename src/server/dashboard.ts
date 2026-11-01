import "server-only";
import { and, desc, eq, gte, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { isAdmin, type Me } from "./auth";
import { db, schema } from "./db";
import { orderScope } from "./orders";
import { listPaymentLinks } from "./payment-links";
import { listOpenDesigns, newRequestCount } from "./site-requests";

const { teklifler, siparisler, kullanicilar } = schema;

export type Period = "ay" | "30" | "yil" | "tum";
export const PERIODS: { id: Period; label: string }[] = [
  { id: "ay", label: "Bu ay" },
  { id: "30", label: "Son 30 gün" },
  { id: "yil", label: "Bu yıl" },
  { id: "tum", label: "Tümü" },
];

/** Dönem başlangıcı (Türkiye saatiyle ay/yıl başı) */
function since(p: Period): Date | null {
  const TR = 3 * 3_600_000;
  const now = new Date(Date.now() + TR);
  if (p === "ay") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - TR);
  if (p === "yil") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1) - TR);
  if (p === "30") return new Date(Date.now() - 30 * 86_400_000);
  return null;
}

const n = (v: unknown) => Number(v ?? 0);

/** Dashboard verisi: yönetici herkesin, satışçı kendi kayıtlarının özetini görür */
/** markaId: yalnızca o markanın kayıtları (null = tüm markalar) */
export async function dashboard(me: Me, p: Period, markaId: number | null = null) {
  const from = since(p);
  const admin = isAdmin(me);
  const qOwn: SQL | undefined = and(admin ? undefined : eq(teklifler.kullaniciId, me.id), markaId ? eq(teklifler.markaId, markaId) : undefined);
  const oOwn: SQL | undefined = and(admin ? undefined : eq(siparisler.kullaniciId, me.id), markaId ? eq(siparisler.markaId, markaId) : undefined);
  const qIn = and(qOwn, from ? gte(teklifler.olusturma, from) : undefined);
  // Site siparişinin tarihi sitede verildiği an (panele aktarıldığı an değil); ciro: iptal olmayan, tekliften dönen ya da ödenmiş siparişler
  const tarih = sql`COALESCE(${siparisler.disTarih}, ${siparisler.olusturma})`;
  const odenen = sql`${siparisler.durum} <> 'iptal' AND (${siparisler.kaynak} = 'teklif' OR ${siparisler.odemeDurumu} = 'odendi')`;
  const oIn = and(oOwn, from ? sql`${tarih} >= ${from}` : undefined, odenen);
  // Takip: ödeme bekleyen site siparişleri (son 30 gün) — satışçı çalıştığı markaların site siparişlerini görür
  const scope = await orderScope(me);
  const bekleyenOdeme = and(
    scope,
    markaId ? eq(siparisler.markaId, markaId) : undefined,
    eq(siparisler.kaynak, "site"),
    sql`${siparisler.durum} <> 'iptal' AND COALESCE(${siparisler.odemeDurumu}, '') <> 'odendi' AND ${tarih} >= ${new Date(Date.now() - 30 * 86_400_000)}`,
  );

  const [quoteStats, orderStats, open, recentQuotes, recentOrders, perQuote, perOrder, staff, byChannel, sources, unpaid, designs, requests, links] = await Promise.all([
    db()
      .select({
        adet: sql<number>`COUNT(*)`,
        tutar: sql<number>`COALESCE(SUM(${teklifler.tutarKdvDahil}), 0)`,
        gonderilen: sql<number>`SUM(${teklifler.gonderim} IS NOT NULL)`,
        gorulen: sql<number>`SUM(${teklifler.ilkGorulme} IS NOT NULL)`,
        onaylanan: sql<number>`SUM(${teklifler.asama} IN ('onaylandi', 'siparis'))`,
        reddedilen: sql<number>`SUM(${teklifler.asama} = 'reddedildi')`,
        bekleyen: sql<number>`SUM(${teklifler.asama} = 'gonderildi')`,
      })
      .from(teklifler)
      .where(qIn),
    db()
      .select({
        adet: sql<number>`COUNT(*)`,
        tutar: sql<number>`COALESCE(SUM(${siparisler.tutarKdvDahil}), 0)`,
        // Kâr (yalnız yönetici gösterir): maliyeti girilmiş siparişlerde KDV hariç tutar − maliyet
        kar: sql<number>`COALESCE(SUM(CASE WHEN ${siparisler.maliyet} IS NOT NULL THEN ${siparisler.tutarKdvHaric} - ${siparisler.maliyet} END), 0)`,
        karTutar: sql<number>`COALESCE(SUM(CASE WHEN ${siparisler.maliyet} IS NOT NULL THEN ${siparisler.tutarKdvHaric} END), 0)`,
        maliyetsiz: sql<number>`SUM(${siparisler.maliyet} IS NULL OR ${siparisler.maliyetEksik})`,
      })
      .from(siparisler)
      .where(oIn),
    // Açık siparişler (dönemden bağımsız): teslim edilmemiş ve iptal olmamış
    db()
      .select({ durum: siparisler.durum, adet: sql<number>`COUNT(*)` })
      .from(siparisler)
      .where(and(oOwn, notInArray(siparisler.durum, ["teslim", "iptal"])))
      .groupBy(siparisler.durum),
    db()
      .select({
        id: teklifler.id, no: teklifler.no, musteri: teklifler.musteriAdi, asama: teklifler.asama, dahil: teklifler.tutarKdvDahil,
        olusturma: teklifler.olusturma, ilkGorulme: teklifler.ilkGorulme, satisci: sql<string | null>`COALESCE(${kullanicilar.adSoyad}, ${teklifler.kullanici})`,
      })
      .from(teklifler)
      .leftJoin(kullanicilar, eq(kullanicilar.id, teklifler.kullaniciId))
      .where(qOwn)
      .orderBy(desc(teklifler.id))
      .limit(6),
    db()
      .select({ id: siparisler.id, no: siparisler.no, musteri: siparisler.musteriAdi, durum: siparisler.durum, dahil: siparisler.tutarKdvDahil, olusturma: sql<Date>`${tarih}`.mapWith((v: unknown) => (v instanceof Date ? v : new Date(`${String(v).replace(" ", "T")}Z`))), satisci: kullanicilar.adSoyad })
      .from(siparisler)
      .leftJoin(kullanicilar, eq(kullanicilar.id, siparisler.kullaniciId))
      .where(oOwn)
      .orderBy(desc(tarih), desc(siparisler.id))
      .limit(6),
    // Satışçı bazında (yalnızca yönetici)
    admin
      ? db()
          .select({
            id: teklifler.kullaniciId,
            teklif: sql<number>`COUNT(*)`,
            teklifTutar: sql<number>`COALESCE(SUM(${teklifler.tutarKdvDahil}), 0)`,
            onay: sql<number>`SUM(${teklifler.asama} IN ('onaylandi', 'siparis'))`,
          })
          .from(teklifler)
          .where(qIn)
          .groupBy(teklifler.kullaniciId)
      : Promise.resolve([]),
    admin
      ? db()
          .select({ id: siparisler.kullaniciId, siparis: sql<number>`COUNT(*)`, ciro: sql<number>`COALESCE(SUM(${siparisler.tutarKdvDahil}), 0)` })
          .from(siparisler)
          .where(oIn)
          .groupBy(siparisler.kullaniciId)
      : Promise.resolve([]),
    admin
      ? db()
          .select({ id: kullanicilar.id, adSoyad: kullanicilar.adSoyad, rol: kullanicilar.rol, aktif: kullanicilar.aktif })
          .from(kullanicilar)
          .where(inArray(kullanicilar.rol, ["yonetici", "satis"]))
      : Promise.resolve([]),
    // Kanallara göre: dönemde verilen teklifler, onaylananlar ve bu tekliflerden doğan sipariş tutarı
    db()
      .select({
        kanal: schema.kanallar.ad,
        teklif: sql<number>`COUNT(*)`,
        onay: sql<number>`SUM(${teklifler.asama} IN ('onaylandi', 'siparis'))`,
        ciro: sql<number>`COALESCE(SUM(CASE WHEN ${siparisler.durum} <> 'iptal' THEN ${siparisler.tutarKdvDahil} END), 0)`,
      })
      .from(teklifler)
      .leftJoin(schema.kanallar, eq(schema.kanallar.id, teklifler.kanalId))
      .leftJoin(siparisler, eq(siparisler.teklifId, teklifler.id))
      .where(qIn)
      .groupBy(teklifler.kanalId, schema.kanallar.ad),
    // Kaynaklara göre ciro: tekliften dönen siparişler ve her site/pazaryeri
    db()
      .select({
        kaynak: siparisler.kaynak,
        site: schema.siteBaglantilari.ad,
        marka: schema.markalar.ad,
        adet: sql<number>`COUNT(*)`,
        tutar: sql<number>`COALESCE(SUM(${siparisler.tutarKdvDahil}), 0)`,
      })
      .from(siparisler)
      .leftJoin(schema.siteBaglantilari, eq(schema.siteBaglantilari.id, siparisler.siteId))
      .leftJoin(schema.markalar, eq(schema.markalar.id, siparisler.markaId))
      .where(oIn)
      .groupBy(siparisler.kaynak, siparisler.siteId, schema.siteBaglantilari.ad, schema.markalar.ad),
    db()
      .select({ adet: sql<number>`COUNT(*)`, tutar: sql<number>`COALESCE(SUM(${siparisler.tutarKdvDahil}), 0)` })
      .from(siparisler)
      .where(bekleyenOdeme),
    listOpenDesigns(me, markaId).catch(() => []),
    newRequestCount(me),
    listPaymentLinks(me).catch(() => []),
  ]);

  const q = quoteStats[0];
  const o = orderStats[0];
  const performans = staff
    .map((u) => {
      const a = perQuote.find((x) => x.id === u.id);
      const b = perOrder.find((x) => x.id === u.id);
      const teklif = n(a?.teklif);
      return { id: u.id, adSoyad: u.adSoyad, aktif: u.aktif, teklif, teklifTutar: n(a?.teklifTutar), onay: n(a?.onay), siparis: n(b?.siparis), ciro: n(b?.ciro), oran: teklif ? n(a?.onay) / teklif : 0 };
    })
    .filter((r) => r.aktif || r.teklif || r.siparis)
    .sort((x, y) => y.ciro - x.ciro || y.teklifTutar - x.teklifTutar);

  return {
    teklif: { adet: n(q?.adet), tutar: n(q?.tutar), gonderilen: n(q?.gonderilen), gorulen: n(q?.gorulen), onaylanan: n(q?.onaylanan), reddedilen: n(q?.reddedilen), bekleyen: n(q?.bekleyen) },
    siparis: { adet: n(o?.adet), tutar: n(o?.tutar), ...(admin ? { kar: n(o?.kar), karTutar: n(o?.karTutar), maliyetsiz: n(o?.maliyetsiz) } : {}) },
    kaynaklar: sources
      .map((r) => ({ ad: r.kaynak === "teklif" ? "Tekliften" : (r.site ?? "Site"), marka: r.marka, adet: n(r.adet), tutar: n(r.tutar) }))
      .sort((a, b) => b.tutar - a.tutar),
    takip: {
      odemeBekleyen: { adet: n(unpaid[0]?.adet), tutar: n(unpaid[0]?.tutar) },
      tasarim: designs.filter((d) => d.t.durum === "yeni").length,
      // Menü sayacı tasarımları da sayar; burada ayrı gösterilir
      talep: Math.max(0, requests - designs.filter((d) => d.t.durum === "yeni").length),
      odemeLinki: (() => {
        const open = links.filter((l) => l.durum === "bekliyor");
        return { adet: open.length, tutar: open.reduce((t, l) => t + l.toplam, 0) };
      })(),
    },
    acik: Object.fromEntries(open.map((r) => [r.durum, n(r.adet)])) as Partial<Record<(typeof schema.SIPARIS_DURUMLARI)[number], number>>,
    sonTeklifler: recentQuotes.map((r) => ({ ...r, olusturma: r.olusturma.toISOString(), ilkGorulme: r.ilkGorulme?.toISOString() ?? null })),
    sonSiparisler: recentOrders.map((r) => ({ ...r, olusturma: r.olusturma.toISOString() })),
    performans,
    kanallar: byChannel
      .map((r) => ({ kanal: r.kanal ?? "Belirtilmemiş", teklif: n(r.teklif), onay: n(r.onay), ciro: n(r.ciro) }))
      .sort((a, b) => b.teklif - a.teklif),
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboard>>;
