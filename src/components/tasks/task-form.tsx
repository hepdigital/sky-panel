"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { gorevKaydet } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PRIORITY, type Person, type TaskPriority } from "./task-meta";

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

export type TaskDraft = {
  id: number | null;
  baslik: string;
  aciklama: string;
  atananId: number | null;
  oncelik: TaskPriority;
  bitis: string | null;
  musteriId?: number | null;
  teklifId?: number | null;
  siparisId?: number | null;
  /** İlgili kayıt etiketi ("Teklif SKY-2026-1009 · Akış Testi") */
  ilgili?: string | null;
};

/** Görev oluşturma / düzenleme penceresi */
export function TaskForm({ open, onClose, initial, people, meId, onSaved }: { open: boolean; onClose: () => void; initial: TaskDraft; people: Person[]; meId: number; onSaved?: (id: number) => void }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await gorevKaydet({ ...f, bitis: f.bitis || null });
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    router.refresh();
    onSaved?.(r.id!);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={f.id ? "Görevi düzenle" : "Yeni görev"} className="md:max-w-xl">
      <div className="space-y-3">
        {f.ilgili && (
          <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">
            <Link2 className="size-3.5" /> {f.ilgili}
          </p>
        )}
        <label className="block">
          <span className={label}>Görev</span>
          <input autoFocus value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} maxLength={200} className={input} placeholder="ör. Akış Testi'nin baskı dosyasını hazırla" />
        </label>
        <label className="block">
          <span className={label}>Açıklama (isteğe bağlı)</span>
          <textarea rows={4} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} className={`${input} h-auto resize-y py-2`} placeholder="Ayrıntılar, ölçüler, linkler…" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Kime</span>
            <select value={f.atananId ?? ""} onChange={(e) => setF({ ...f, atananId: Number(e.target.value) || null })} className={input}>
              <option value="">Atanmamış</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.adSoyad}
                  {p.id === meId ? " (ben)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Son tarih</span>
            <input type="date" value={f.bitis ?? ""} onChange={(e) => setF({ ...f, bitis: e.target.value || null })} className={input} />
          </label>
        </div>
        <div>
          <span className={label}>Öncelik</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(["dusuk", "normal", "yuksek", "acil"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setF({ ...f, oncelik: p })}
                className={cn("h-9 rounded-xl border text-xs font-semibold", f.oncelik === p ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {PRIORITY[p].label}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.baslik.trim()} onClick={save}>
          {busy ? "Kaydediliyor…" : f.id ? "Kaydet" : "Görevi oluştur"}
        </Button>
      </div>
    </Sheet>
  );
}
