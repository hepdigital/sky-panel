// Teklif dökümü düz metin olarak (WhatsApp/e-posta için kopyala): SKY fiyat terminalindeki "Dökümü kopyala" ile aynı biçim.
// Tutarlar ekrandaki KDV tercihine göre yazılır; hesap tek yerden (hesap / gzRows).

import { SZ, TL, cartUnpriced, colorName, colorText, gzRows, gzTotal, hesap, iskEtiket, iskYok, itemLines, modeName, netBirim, val, type BrandCard, type Catalog, type QuoteState } from "./calc";

export function quoteText(q: QuoteState, catalog: Catalog, brand: Pick<BrandCard, "ad">) {
  const show = (n: number) => TL(q.vat ? n * 1.2 : n);
  const L: string[] = [];
  L.push(brand.ad.toLocaleUpperCase("tr"));
  L.push(`${modeName(q.mode)} teklif · ${new Date().toLocaleDateString("tr-TR")}`);
  L.push(q.vat ? "Fiyatlara KDV dahildir." : "Fiyatlara KDV dahil değildir.");
  L.push("");

  let no = 0;
  // 1) Gazeboler: her biri bileşenleriyle
  for (const c of q.cart) {
    no++;
    const liste = gzTotal(c, q.mode);
    const unit = netBirim(liste, c.isk);
    L.push(`${no}) Gazebo ${SZ[c.size]} m${c.qty > 1 ? ` × ${c.qty} adet` : ""} — ${show(unit * c.qty)}`);
    if (!iskYok(c.isk)) L.push(`   Liste: ${show(liste * c.qty)} · ${iskEtiket(c.isk)}`);
    if (c.qty > 1) L.push(`   Birim fiyat: ${show(unit)}`);
    for (const r of gzRows(c, q.mode)) L.push(`   • ${r.c || r.t} — ${r.bad ? "fiyat alınız" : show(r.v)}`);
    L.push(`   • ${colorText(c)}`);
    L.push("");
  }

  // 2) Katalog ürünleri (renkli ürünlerde her renk ayrı satır)
  for (const g of catalog)
    for (const it of g.items) {
      const pr = val(it.p, q.mode);
      if (pr === null) continue;
      for (const { key, hex, qty } of itemLines(q, it)) {
        no++;
        const i = q.prodIsk[key];
        const net = netBirim(pr, i);
        L.push(`${no}) ${hex ? `${it.n} · ${colorName(hex)}` : it.n}${qty > 1 ? ` × ${qty} adet` : ""} — ${show(net * qty)}`);
        L.push(`   ${it.s}${qty > 1 ? ` · birim ${show(net)}` : ""}${iskYok(i) ? "" : ` · liste ${show(pr)} · ${iskEtiket(i)}`}`);
        L.push("");
      }
    }

  // 3) Ek kalemler (nakliye, montaj…)
  for (const x of q.extra ?? []) {
    no++;
    const net = netBirim(x.birim, x.isk);
    L.push(`${no}) ${x.ad}${x.adet > 1 ? ` × ${x.adet} adet` : ""} — ${show(net * x.adet)}`);
    const detail = [x.aciklama, x.adet > 1 ? `birim ${show(net)}` : "", iskYok(x.isk) ? "" : `liste ${show(x.birim)} · ${iskEtiket(x.isk)}`].filter(Boolean);
    if (detail.length) L.push(`   ${detail.join(" · ")}`);
    L.push("");
  }

  if (no === 0) L.push("(Henüz ürün seçilmedi)", "");

  // 4) Toplam: hesap KDV'siz yapılır, KDV dahil modda 1,2 ile çarpılır
  const H = hesap(q, catalog);
  if (H.satirIsk || H.genelIsk) {
    L.push(`Ara toplam (liste): ${show(H.araListe)}`);
    if (H.satirIsk) L.push(`${H.satirIsk > 0 ? "Satır indirimleri: −" : "Satır ilaveleri: +"}${show(Math.abs(H.satirIsk))}`);
    if (H.genelIsk) L.push(`Genel ${H.genelIsk > 0 ? "indirim" : "ilave"} (${iskEtiket(q.isk)}): ${H.genelIsk > 0 ? "−" : "+"}${show(Math.abs(H.genelIsk))}`);
  }
  if (q.vat) {
    L.push(`TOPLAM (KDV dahil): ${TL(H.net * 1.2)}`);
    L.push(`KDV hariç tutar: ${TL(H.net)}`);
  } else {
    L.push(`TOPLAM (KDV hariç): ${TL(H.net)}`);
    L.push(`KDV %20: ${TL(H.net * 0.2)}`);
    L.push(`GENEL TOPLAM: ${TL(H.net * 1.2)}`);
  }

  const unpriced = cartUnpriced(q);
  if (unpriced) L.push("", `! ${unpriced} duvarın fiyatı listede yok, toplama dahil edilmedi.`);
  if (!q.mode) L.push("", "! Bu bir TOPTAN (bayi) fiyat listesidir, son kullanıcıya verilmez.");
  return L.join("\n");
}

/** Panoya kopyalar; tarayıcı izin vermezse false (metin elle kopyalanmak üzere gösterilir) */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
