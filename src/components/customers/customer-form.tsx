"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { musteriKaydet } from "@/app/panel/musteriler/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

export type CustomerDraft = {
  id: number | null;
  firma: string;
  yetkili: string;
  telefon: string;
  eposta: string;
  vergiDairesi: string;
  vergiNo: string;
  il: string;
  adres: string;
  notlar: string;
  iskontoGrubuId: number | null;
  sahipId: number | null;
  markaId: number | null;
};
export const emptyCustomer = (markaId: number | null = null): CustomerDraft => ({
  id: null, firma: "", yetkili: "", telefon: "", eposta: "", vergiDairesi: "", vergiNo: "", il: "", adres: "", notlar: "", iskontoGrubuId: null, sahipId: null, markaId,
});

export type GroupOption = { id: number; ad: string; fiyatListesi: "perakende" | "toptan"; oran: number };

/** Müşteri ekleme / düzenleme. İskonto grubu ve temsilci yalnızca yöneticide görünür. */
export function CustomerForm({
  open,
  onClose,
  initial,
  admin,
  groups,
  staff,
  brands,
}: {
  open: boolean;
  onClose: () => void;
  initial: CustomerDraft;
  admin: boolean;
  groups: GroupOption[];
  staff: { id: number; adSoyad: string }[];
  /** Kullanıcının markaları; birden fazlaysa "Geldiği marka" seçilir */
  brands: { id: number; ad: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof CustomerDraft, l: string, ph = "", type = "text") => (
    <label className="block">
      <span className={label}>{l}</span>
      <input type={type} value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} placeholder={ph} />
    </label>
  );

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await musteriKaydet(f);
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    onClose();
    if (!f.id && r.id) router.push(`/panel/musteriler/${r.id}`);
    else router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title={f.id ? "Müşteriyi düzenle" : "Yeni müşteri"} className="md:max-w-2xl">
      <div className="space-y-3">
        {field("firma", "Firma / müşteri adı", "ör. Akdeniz Reklam Ltd.")}
        <div className="grid gap-3 sm:grid-cols-3">
          {field("yetkili", "Yetkili")}
          {field("telefon", "Telefon", "05xx xxx xx xx", "tel")}
          {field("eposta", "E-posta", "", "email")}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {field("vergiDairesi", "Vergi dairesi")}
          {field("vergiNo", "Vergi / TC no")}
          {field("il", "İl")}
        </div>
        <label className="block">
          <span className={label}>Adres</span>
          <textarea rows={2} value={f.adres} onChange={(e) => setF({ ...f, adres: e.target.value })} className={`${input} h-auto resize-none py-2`} />
        </label>
        <label className="block">
          <span className={label}>Not (yalnızca panelde görünür)</span>
          <textarea rows={2} value={f.notlar} onChange={(e) => setF({ ...f, notlar: e.target.value })} className={`${input} h-auto resize-none py-2`} />
        </label>
        {brands.length > 1 && (
          <label className="block">
            <span className={label}>Geldiği marka</span>
            <select value={f.markaId ?? ""} onChange={(e) => setF({ ...f, markaId: Number(e.target.value) || null })} className={input}>
              {!f.markaId && <option value="">Seçin…</option>}
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ad}
                </option>
              ))}
            </select>
          </label>
        )}
        {admin && (
          <div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>İskonto grubu</span>
              <select value={f.iskontoGrubuId ?? ""} onChange={(e) => setF({ ...f, iskontoGrubuId: Number(e.target.value) || null })} className={input}>
                <option value="">Grup yok (perakende liste)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.ad} · {g.fiyatListesi === "toptan" ? "Toptan" : "Perakende"}
                    {g.oran ? ` · %${String(g.oran).replace(".", ",")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Temsilci (satışçı)</span>
              <select value={f.sahipId ?? ""} onChange={(e) => setF({ ...f, sahipId: Number(e.target.value) || null })} className={input}>
                {!f.id && <option value="">Ben</option>}
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.adSoyad}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.firma.trim()} onClick={save}>
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Sheet>
  );
}
