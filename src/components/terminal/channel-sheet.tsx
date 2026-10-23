"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, X } from "lucide-react";
import { kanalKaydet } from "@/app/panel/teklifler/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

export type Channel = { id: number; ad: string; aktif: boolean; teklif: number };
const input = "h-10 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";

/**
 * Kanallar (yönetici): müşterinin geldiği yer. Teklif kaydederken bu listeden seçilir.
 * Silinmez, kapatılır: kapalı kanal yeni teklifte çıkmaz, eski tekliflerde adı görünür.
 */
export function ChannelSheet({ open, onClose, channels }: { open: boolean; onClose: () => void; channels: Channel[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: number | null; ad: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(c: { id: number | null; ad: string; aktif: boolean }) {
    setBusy(true);
    const r = await kanalKaydet(c);
    setBusy(false);
    if (!r.ok) return setErr(r.hata);
    setErr(null);
    setEdit(null);
    router.refresh();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Kanallar" className="md:max-w-lg">
      <p className="text-sm text-muted-foreground">Müşterinin nereden geldiği. Teklif kaydederken bu listeden seçilir; kapatılan kanal yeni tekliflerde çıkmaz.</p>
      <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
        {channels.map((c) =>
          edit?.id === c.id ? (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <input autoFocus value={edit.ad} onChange={(e) => setEdit({ ...edit, ad: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save({ id: c.id, ad: edit.ad, aktif: c.aktif })} maxLength={80} className={input} />
              <Button size="icon-sm" disabled={busy} aria-label="Kaydet" onClick={() => save({ id: c.id, ad: edit.ad, aktif: c.aktif })}>
                <Check />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Vazgeç" onClick={() => setEdit(null)}>
                <X />
              </Button>
            </li>
          ) : (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className={c.aktif ? "text-sm font-semibold" : "text-sm font-semibold text-muted-foreground line-through"}>{c.ad}</p>
                <p className="text-[11px] text-muted-foreground">{c.teklif} teklif</p>
              </div>
              {!c.aktif && <Badge tone="neutral">Kapalı</Badge>}
              <button type="button" disabled={busy} onClick={() => save({ id: c.id, ad: c.ad, aktif: !c.aktif })} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                {c.aktif ? "Kapat" : "Aç"}
              </button>
              <Button size="icon-sm" variant="ghost" aria-label="Adını düzenle" onClick={() => setEdit({ id: c.id, ad: c.ad })}>
                <Pencil />
              </Button>
            </li>
          ),
        )}
        {edit?.id === null && (
          <li className="flex items-center gap-2 px-3 py-2">
            <input autoFocus value={edit.ad} onChange={(e) => setEdit({ ...edit, ad: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save({ id: null, ad: edit.ad, aktif: true })} maxLength={80} className={input} placeholder="ör. TikTok" />
            <Button size="icon-sm" disabled={busy || !edit.ad.trim()} aria-label="Ekle" onClick={() => save({ id: null, ad: edit.ad, aktif: true })}>
              <Check />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Vazgeç" onClick={() => setEdit(null)}>
              <X />
            </Button>
          </li>
        )}
      </ul>
      {err && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{err}</p>}
      {edit?.id !== null && (
        <Button variant="outline" className="mt-4 w-full" onClick={() => setEdit({ id: null, ad: "" })}>
          <Plus /> Yeni kanal
        </Button>
      )}
    </Sheet>
  );
}
