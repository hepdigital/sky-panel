"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { kullaniciEkle, kullaniciGuncelle, sifreSifirla, type UserFormState } from "@/app/panel/kullanicilar/actions";
import { kullaniciMarkalari } from "@/app/panel/markalar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

type User = {
  id: number;
  kullaniciAdi: string;
  adSoyad: string;
  eposta: string | null;
  telefon: string | null;
  rol: "yonetici" | "satis" | "personel";
  aktif: boolean;
  sonGiris: string | null;
  teklif: number;
  /** Atanmış markalar; boş = tüm markalar */
  markalar: number[];
};
type BrandOpt = { id: number; ad: string; renk: string };

const ROL_AD = { yonetici: "Yönetici", satis: "Satışçı", personel: "Personel" } as const;

const input = "h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
const label = "mb-1 block text-xs font-semibold text-muted-foreground";

/** Personel hesapları (yalnızca yönetici): ekle, düzenle, pasife al, şifre sıfırla */
export function UserAdmin({ users, meId, brands }: { users: User[]; meId: number; brands: BrandOpt[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Kullanıcılar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Satışçı yalnızca kendi teklif, sipariş ve müşterilerini görür; personel yalnızca görevlerini görür; yönetici hepsini görür ve kullanıcıları yönetir.</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>
          <UserPlus /> Yeni kullanıcı
        </Button>
      </div>

      {adding && <NewUser onDone={() => setAdding(false)} />}

      <Card className="mt-4 overflow-hidden">
        <ul className="divide-y divide-border">
          {users.map((u) => (
            <UserRow key={u.id} u={u} self={u.id === meId} brands={brands} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Result({ state }: { state: UserFormState }) {
  if (!state) return null;
  if (state.hata) return <p className="rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">{state.hata}</p>;
  return (
    <div className="rounded-xl bg-success-soft px-3 py-2 text-xs font-medium text-success">
      {state.mesaj}
      {state.sifre && (
        <p className="mt-1 text-foreground">
          Geçici şifre: <code className="rounded bg-card px-1.5 py-0.5 text-sm font-bold">{state.sifre}</code>
          <span className="ml-1 text-muted-foreground">— yalnızca şimdi görünür, kullanıcıya iletin.</span>
        </p>
      )}
    </div>
  );
}

function NewUser({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(kullaniciEkle, undefined);
  return (
    <Card className="mt-4 p-5">
      <h2 className="text-[15px] font-semibold">Yeni kullanıcı</h2>
      <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>Ad soyad</span>
          <input name="adSoyad" required maxLength={120} className={input} />
        </label>
        <label>
          <span className={label}>Kullanıcı adı</span>
          <input name="kullaniciAdi" required pattern="[a-z0-9._\-]{3,60}" placeholder="örn. elif.kaya" autoCapitalize="none" className={input} />
        </label>
        <label>
          <span className={label}>E-posta</span>
          <input name="eposta" type="email" className={input} placeholder="opsiyonel" />
        </label>
        <label>
          <span className={label}>Telefon</span>
          <input name="telefon" className={input} placeholder="opsiyonel" />
        </label>
        <label>
          <span className={label}>Rol</span>
          <select name="rol" defaultValue="satis" className={input}>
            <option value="satis">Satışçı</option>
                <option value="personel">Personel (yalnızca görevler)</option>
            <option value="yonetici">Yönetici</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Ekleniyor…" : "Kullanıcıyı ekle"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Kapat
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Result state={state} />
        </div>
      </form>
    </Card>
  );
}

function UserRow({ u, self, brands }: { u: User; self: boolean; brands: BrandOpt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(kullaniciGuncelle, undefined);
  const [pw, pwAction, pwPending] = useActionState(sifreSifirla, undefined);
  return (
    <li className={cn("px-4 py-3.5 md:px-5", !u.aktif && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {u.adSoyad} {self && <span className="text-xs font-normal text-muted-foreground">(siz)</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {u.kullaniciAdi} · {u.teklif} teklif · son giriş {u.sonGiris ? formatDate(u.sonGiris, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
          </p>
        </div>
        <Badge tone={u.rol === "yonetici" ? "info" : u.rol === "satis" ? "success" : "neutral"}>{ROL_AD[u.rol]}</Badge>
        {!u.aktif && <Badge tone="danger">Pasif</Badge>}
        {brands.length > 1 && u.rol === "satis" && (
          <span className="text-[11px] text-muted-foreground">
            {u.markalar.length ? brands.filter((b) => u.markalar.includes(b.id)).map((b) => b.ad).join(", ") : "Tüm markalar"}
          </span>
        )}
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          Düzenle
        </Button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-xl bg-muted/50 p-3 md:grid-cols-[1fr_auto]">
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={u.id} />
            <label>
              <span className={label}>Ad soyad</span>
              <input name="adSoyad" defaultValue={u.adSoyad} required className={input} />
            </label>
            <label>
              <span className={label}>Rol</span>
              <select name="rol" defaultValue={u.rol} className={input}>
                <option value="satis">Satışçı</option>
                <option value="personel">Personel (yalnızca görevler)</option>
                <option value="yonetici">Yönetici</option>
              </select>
            </label>
            <label>
              <span className={label}>E-posta</span>
              <input name="eposta" type="email" defaultValue={u.eposta ?? ""} className={input} />
            </label>
            <label>
              <span className={label}>Telefon</span>
              <input name="telefon" defaultValue={u.telefon ?? ""} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="aktif" defaultChecked={u.aktif} className="size-4 accent-[var(--primary)]" /> Aktif (pasif kullanıcı giriş yapamaz)
            </label>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Kaydet
              </Button>
            </div>
            <div className="sm:col-span-2">
              <Result state={state} />
            </div>
          </form>
          {brands.length > 1 && u.rol === "satis" && <BrandAssign userId={u.id} brands={brands} initial={u.markalar} />}
          <form action={pwAction} className="flex flex-col gap-2 md:w-64">
            <input type="hidden" name="id" value={u.id} />
            <Button type="submit" size="sm" variant="outline" disabled={pwPending}>
              <KeyRound /> Şifre sıfırla
            </Button>
            <Result state={pw} />
          </form>
        </div>
      )}
    </li>
  );
}

/** Satışçının satış yapabileceği markalar; hiçbiri seçilmezse tüm markalar */
function BrandAssign({ userId, brands, initial }: { userId: number; brands: BrandOpt[]; initial: number[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<number[]>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-xl bg-card p-3 md:col-span-2">
      <p className={label}>Satabileceği markalar (hiçbiri seçilmezse tüm markalar)</p>
      <div className="flex flex-wrap items-center gap-3">
        {brands.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sel.includes(b.id)}
              onChange={(e) => setSel(e.target.checked ? [...sel, b.id] : sel.filter((x) => x !== b.id))}
              className="size-4 accent-[var(--primary)]"
            />
            <span className="size-2 rounded-full" style={{ background: b.renk }} /> {b.ad}
          </label>
        ))}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await kullaniciMarkalari(userId, sel);
            setBusy(false);
            setMsg(r.ok ? "Markalar kaydedildi." : r.hata);
            router.refresh();
          }}
        >
          Markaları kaydet
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
