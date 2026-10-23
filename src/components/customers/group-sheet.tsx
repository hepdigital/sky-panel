"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { grupKaydet, grupSil } from "@/app/panel/musteriler/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Group = { id: number; ad: string; fiyatListesi: "perakende" | "toptan"; oran: number; aciklama: string | null; musteri: number };
const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const blank = { id: null as number | null, ad: "", fiyatListesi: "perakende" as "perakende" | "toptan", oran: "", aciklama: "" };

/**
 * İskonto grupları (yönetici): her grup bir fiyat listesi (toptan/perakende) ve genel iskonto yüzdesi taşır.
 * Teklif ekranında müşteri seçilince grubu uygulanır.
 */
export function GroupSheet({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: Group[] }) {
  const router = useRouter();
  const [f, setF] = useState<typeof blank | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!f) return;
    const oran = Number(String(f.oran).replace(",", ".") || 0);
    if (!Number.isFinite(oran)) return setErr("İskonto oranını rakamla yazın.");
    setBusy(true);
    const r = await grupKaydet({ id: f.id, ad: f.ad, fiyatListesi: f.fiyatListesi, oran, aciklama: f.aciklama });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    setErr(null);
    setF(null);
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="İskonto grupları" className="md:max-w-xl">
      <p className="text-sm text-muted-foreground">Müşteriye grup tanımlayınca teklif ekranında o müşteri seçildiğinde grubun fiyat listesi ve iskontosu otomatik uygulanır.</p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {groups.map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{g.ad}</p>
              <p className="text-xs text-muted-foreground">
                {g.fiyatListesi === "toptan" ? "Toptan" : "Perakende"} liste · {g.oran ? `%${String(Math.abs(g.oran)).replace(".", ",")} ${g.oran > 0 ? "iskonto" : "ilave"}` : "iskontosuz"} · {g.musteri} müşteri
              </p>
            </div>
            <Button size="icon-sm" variant="ghost" aria-label="Düzenle" onClick={() => setF({ id: g.id, ad: g.ad, fiyatListesi: g.fiyatListesi, oran: String(g.oran), aciklama: g.aciklama ?? "" })}>
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Sil"
              onClick={async () => {
                if (!confirm(`“${g.ad}” silinsin mi?${g.musteri ? ` ${g.musteri} müşteri grupsuz kalır.` : ""}`)) return;
                await grupSil(g.id);
                router.refresh();
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
        {!groups.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">Henüz grup yok.</li>}
      </ul>

      {f ? (
        <div className="mt-4 space-y-3 rounded-xl bg-muted/50 p-4">
          <label className="block">
            <span className={label}>Grup adı</span>
            <input autoFocus value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} className={input} placeholder="ör. Bayi A" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Fiyat listesi</span>
              <div className="inline-flex w-full rounded-full bg-card p-1 ring-1 ring-border">
                {(["perakende", "toptan"] as const).map((l) => (
                  <button key={l} type="button" onClick={() => setF({ ...f, fiyatListesi: l })} className={cn("h-8 flex-1 rounded-full text-xs font-semibold", f.fiyatListesi === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                    {l === "toptan" ? "Toptan" : "Perakende"}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className={label}>Genel iskonto (%)</span>
              <input value={f.oran} onChange={(e) => setF({ ...f, oran: e.target.value })} inputMode="decimal" className={`${input} tabular`} placeholder="ör. 10 (eksi = ilave)" />
            </label>
          </div>
          <label className="block">
            <span className={label}>Açıklama (isteğe bağlı)</span>
            <input value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} className={input} />
          </label>
          {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setF(null)}>
              Vazgeç
            </Button>
            <Button className="flex-1" disabled={busy || !f.ad.trim()} onClick={save}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setF({ ...blank })}>
          <Plus /> Yeni grup
        </Button>
      )}
    </Sheet>
  );
}
