"use server";

import { revalidatePath } from "next/cache";
import { getSeller } from "@/server/auth";
import { SIPARIS_DURUMLARI } from "@/server/db/schema";
import { brandsFor } from "@/server/brands";
import { convertQuote, getOrder, setOrderStatus } from "@/server/orders";
import { listSites, pushAction, syncSite, type SiteAction } from "@/server/sites";

type Result = { ok: true; id?: number } | { ok: false; hata: string };

/** Onaylanan teklifi siparişe dönüştürür; sipariş sayfasına yönlendirmek için sipariş kimliği döner */
export async function siparisOlustur(teklifId: number): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const r = await convertQuote(me, teklifId);
  revalidatePath(`/panel/teklifler/${teklifId}`);
  return r;
}

export async function siparisDurumu(id: number, durum: string, notlar?: string): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const d = SIPARIS_DURUMLARI.find((x) => x === durum);
  if (!d) return { ok: false, hata: "Geçersiz durum." };
  if (!(await setOrderStatus(me, id, d, notlar))) return { ok: false, hata: "Sipariş bulunamadı." };
  revalidatePath(`/panel/siparisler/${id}`);
  revalidatePath("/panel/siparisler");
  return { ok: true };
}

/** Site siparişinde işlem (durum, ödeme, kargo, not): siteye yazılır, panel kaydı sitenin güncel haliyle yenilenir */
export async function siteIslem(id: number, a: SiteAction): Promise<Result> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const o = await getOrder(me, Number(id));
  if (!o || o.kaynak !== "site") return { ok: false, hata: "Sipariş bulunamadı." };
  try {
    await pushAction(o.id, a, me.adSoyad);
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : "Siteye yazılamadı." };
  }
  revalidatePath(`/panel/siparisler/${id}`);
  revalidatePath("/panel/siparisler");
  return { ok: true };
}

/** Siparişler ekranındaki "Şimdi eşitle": kullanıcının görebildiği markaların aktif siteleri */
export async function siteleriEsitle(): Promise<Result & { adet?: number; hatalar?: string[] }> {
  const me = await getSeller();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  const ids = new Set((await brandsFor(me)).map((b) => b.id));
  const list = (await listSites()).filter((s) => s.aktif && ids.has(s.markaId));
  let adet = 0;
  const hatalar: string[] = [];
  for (const s of list) {
    const r = await syncSite(s.id);
    adet += r.count;
    if (!r.ok) hatalar.push(`${s.ad}: ${r.hata}`);
  }
  revalidatePath("/panel/siparisler");
  return { ok: true, adet, hatalar };
}
