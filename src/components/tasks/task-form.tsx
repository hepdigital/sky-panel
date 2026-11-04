"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Repeat as RepeatIcon } from "lucide-react";
import { gorevKaydet, tekrarKaydet } from "@/app/panel/gorevler/actions";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AttachButton, PendingList, uploadFiles, usePendingFiles } from "./task-files";
import { PRIORITY, WEEKDAYS, repeatText, type Person, type Repeat, type TaskMode, type TaskPriority } from "./task-meta";

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";
const chip = (on: boolean) => cn("h-9 rounded-xl border px-3 text-xs font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground");

export type TaskDraft = {
  id: number | null;
  baslik: string;
  aciklama: string;
  atananlar: number[];
  tamamlama: TaskMode;
  oncelik: TaskPriority;
  bitis: string | null;
  musteriId?: number | null;
  teklifId?: number | null;
  siparisId?: number | null;
  /** İlgili kayıt etiketi ("Teklif SKY-2026-1009 · Akış Testi") */
  ilgili?: string | null;
  /** Tekrarlayan görev tanımı düzenleniyorsa */
  tekrarId?: number;
  tekrar?: Repeat | null;
  aktif?: boolean;
};

/** Görev oluşturma / düzenleme penceresi; tekrarlayan görev tanımı da bununla düzenlenir */
export function TaskForm({ open, onClose, initial, people, meId, onSaved }: { open: boolean; onClose: () => void; initial: TaskDraft; people: Person[]; meId: number; onSaved?: (id: number | null) => void }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [repeat, setRepeat] = useState<Repeat | null>(initial.tekrar ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = usePendingFiles();
  const template = !!f.tekrarId;
  const isNew = !f.id && !template;
  const allowFiles = !template && !repeat;

  const toggle = (id: number) => setF({ ...f, atananlar: f.atananlar.includes(id) ? f.atananlar.filter((x) => x !== id) : [...f.atananlar, id] });
  const toggleDay = (d: number) => setRepeat((r) => r && { ...r, gunler: r.gunler.includes(d) ? r.gunler.filter((x) => x !== d) : [...r.gunler, d] });

  async function save() {
    setBusy(true);
    setErr(null);
    const r = template
      ? await tekrarKaydet({ id: f.tekrarId!, baslik: f.baslik, aciklama: f.aciklama, atananlar: f.atananlar, tamamlama: f.tamamlama, oncelik: f.oncelik, tekrar: repeat!, aktif: f.aktif !== false })
      : await gorevKaydet({ ...f, bitis: repeat ? null : f.bitis || null, tekrar: isNew ? repeat : null });
    if (!r.ok) {
      setBusy(false);
      return setErr(r.hata);
    }
    const id = "id" in r ? (r.id ?? null) : null;
    if (id && pending.files.length) {
      const u = await uploadFiles(id, pending.files);
      if (!u.ok) {
        setBusy(false);
        // Görev kaydedildi; yalnızca dosyalar eklenemedi
        setF({ ...f, id });
        return setErr(`Görev kaydedildi ama dosyalar eklenemedi: ${u.hata}`);
      }
    }
    setBusy(false);
    router.refresh();
    onSaved?.(id);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={template ? "Tekrarlayan görev" : f.id ? "Görevi düzenle" : "Yeni görev"} className="md:max-w-xl">
      <div className="space-y-4" onDrop={allowFiles ? pending.onDrop : undefined} onDragOver={allowFiles ? pending.onDragOver : undefined}>
        {f.ilgili && (
          <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-soft-foreground">
            <Link2 className="size-3.5" /> {f.ilgili}
          </p>
        )}
        <label className="block">
          <span className={label}>Görev</span>
          <input autoFocus value={f.baslik} onChange={(e) => setF({ ...f, baslik: e.target.value })} maxLength={200} className={input} placeholder="ör. Instagram'a ürün paylaşımı yap" />
        </label>
        <label className="block">
          <span className={label}>Açıklama (isteğe bağlı)</span>
          <textarea
            rows={4}
            value={f.aciklama}
            onChange={(e) => setF({ ...f, aciklama: e.target.value })}
            onPaste={allowFiles ? pending.onPaste : undefined}
            className={`${input} h-auto resize-y py-2`}
            placeholder={allowFiles ? "Ayrıntılar, ölçüler, linkler… Görseli Ctrl+V ile yapıştırabilirsiniz." : "Ayrıntılar, ölçüler, linkler…"}
          />
        </label>
        {allowFiles && (
          <div className="space-y-2">
            <AttachButton onPick={pending.add} label="Dosya / görsel ekle" />
            <PendingList pending={pending} />
          </div>
        )}

        <div>
          <span className={label}>Kime (birden fazla seçilebilir)</span>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = f.atananlar.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)} className={cn(chip(on), "inline-flex items-center gap-1.5")}>
                  {on && <Check className="size-3.5" />}
                  {p.adSoyad}
                  {p.id === meId ? " (ben)" : ""}
                </button>
              );
            })}
          </div>
          {f.atananlar.length > 1 && (
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {(
                [
                  ["ortak", "Ortak iş", "Biri tamamlayınca görev biter"],
                  ["kisi", "Herkes ayrı tamamlasın", "Her kişi kendi payını bitirir; herkes bitirince tamamlanır"],
                ] as const
              ).map(([m, t, d]) => (
                <button key={m} type="button" onClick={() => setF({ ...f, tamamlama: m })} className={cn("rounded-xl border px-3 py-2 text-left", f.tamamlama === m ? "border-primary bg-primary-soft" : "border-border hover:border-primary/50")}>
                  <span className="block text-xs font-semibold">{t}</span>
                  <span className="block text-[11px] text-muted-foreground">{d}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {isNew && (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => setRepeat(null)} className={chip(!repeat)}>
              Tek seferlik
            </button>
            <button type="button" onClick={() => setRepeat(repeat ?? { siklik: "hafta", gunler: [] })} className={cn(chip(!!repeat), "inline-flex items-center justify-center gap-1.5")}>
              <RepeatIcon className="size-3.5" /> Tekrarlayan
            </button>
          </div>
        )}

        {repeat ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setRepeat({ siklik: "hafta", gunler: [] })} className={chip(repeat.siklik === "hafta")}>
                Haftanın günleri
              </button>
              <button type="button" onClick={() => setRepeat({ siklik: "ay", gunler: [] })} className={chip(repeat.siklik === "ay")}>
                Ayın günleri
              </button>
            </div>
            {repeat.siklik === "hafta" ? (
              <>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((d, i) => (
                    <button key={d} type="button" onClick={() => toggleDay(i + 1)} className={cn(chip(repeat.gunler.includes(i + 1)), "px-0")}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3 text-[11px] font-semibold text-primary">
                  <button type="button" onClick={() => setRepeat({ siklik: "hafta", gunler: [1, 2, 3, 4, 5] })}>
                    Hafta içi her gün
                  </button>
                  <button type="button" onClick={() => setRepeat({ siklik: "hafta", gunler: [1, 2, 3, 4, 5, 6, 7] })}>
                    Her gün
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <button key={d} type="button" onClick={() => toggleDay(d)} className={cn(chip(repeat.gunler.includes(d)), "h-8 px-0")}>
                    {d}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {repeat.gunler.length ? (
                <>
                  <b className="text-foreground">{repeatText(repeat)}</b> sabah seçilen kişilerin listesine düşer ve bildirim gider; günün sonuna kadar yapılmadıysa öğleden sonra hatırlatılır.
                </>
              ) : (
                "Görevin hangi günlerde verileceğini seçin."
              )}
            </p>
            {template && (
              <label className="flex items-center gap-2 pt-1 text-sm font-medium">
                <input type="checkbox" checked={f.aktif !== false} onChange={(e) => setF({ ...f, aktif: e.target.checked })} className="size-4 accent-[var(--primary)]" />
                Etkin (kapatılırsa yeni görev üretilmez)
              </label>
            )}
          </div>
        ) : (
          <label className="block">
            <span className={label}>Son tarih</span>
            <input type="date" value={f.bitis ?? ""} onChange={(e) => setF({ ...f, bitis: e.target.value || null })} className={input} />
          </label>
        )}

        <div>
          <span className={label}>Öncelik</span>
          <div className="grid grid-cols-4 gap-1.5">
            {(["dusuk", "normal", "yuksek", "acil"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setF({ ...f, oncelik: p })} className={chip(f.oncelik === p)}>
                {PRIORITY[p].label}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
        <Button size="lg" className="w-full" disabled={busy || !f.baslik.trim() || (!!repeat && (!repeat.gunler.length || !f.atananlar.length))} onClick={save}>
          {busy ? "Kaydediliyor…" : template || f.id ? "Kaydet" : repeat ? "Tekrarlayan görevi oluştur" : "Görevi oluştur"}
        </Button>
      </div>
    </Sheet>
  );
}
