"use server";

import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { createAlbum, deleteAlbum, deleteImage, moveAlbum, moveImage, moveToFront, setCaption, setCover, updateAlbum, updateSettings } from "@/server/gallery";

type Result = { ok: true; id?: number | null } | { ok: false; hata: string };
export type AlbumInput = { ad: string; slug?: string; aciklama?: string | null; gizli?: boolean; ctaUrl?: string | null; ctaAd?: string | null };

const refresh = () => revalidatePath("/panel/galeri", "layout");

/** Oturumu denetler, işlemi yapar; hata mesajını kullanıcıya döner */
async function run(fn: (me: NonNullable<Awaited<ReturnType<typeof getMe>>>) => Promise<number | null | void>): Promise<Result> {
  const me = await getMe();
  if (!me) return { ok: false, hata: "Oturum kapanmış." };
  try {
    const id = await fn(me);
    refresh();
    return { ok: true, id: id ?? null };
  } catch (e) {
    return { ok: false, hata: e instanceof Error ? e.message : "İşlem yapılamadı." };
  }
}

export const albumOlustur = async (ustId: number | null, input: AlbumInput) => run((me) => createAlbum(me, { ...input, ustId }));
export const albumGuncelle = async (id: number, input: AlbumInput) => run((me) => updateAlbum(me, id, input));
export const albumSil = async (id: number) => run((me) => deleteAlbum(me, id));
export const albumTasi = async (id: number, ustId: number | null) => run((me) => moveAlbum(me, id, ustId));
export const gorselSil = async (id: number) => run((me) => deleteImage(me, id));
export const gorselKapak = async (id: number) => run(() => setCover(id));
export const gorselBasa = async (id: number) => run(() => moveToFront(id));
export const gorselAciklama = async (id: number, baslik: string) => run(() => setCaption(id, String(baslik ?? "")));
export const gorselTasi = async (id: number, albumId: number) => run((me) => moveImage(me, id, albumId));
export const galeriAyarKaydet = async (input: { opaklik: number; boyut: number; siteUrl: string; filigranKaldir?: boolean }) => run((me) => updateSettings(me, input));
