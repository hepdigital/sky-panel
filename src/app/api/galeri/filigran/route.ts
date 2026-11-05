import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMe, isAdmin } from "@/server/auth";
import { saveWatermark } from "@/server/gallery";

/** Galeri filigranı yükleme (yönetici): dosya (saydam PNG önerilir) */
export async function POST(request: Request) {
  const me = await getMe();
  if (!me || !isAdmin(me)) return NextResponse.json({ ok: false, hata: "Yalnızca yönetici değiştirebilir." }, { status: 403 });
  const f = (await request.formData().catch(() => null))?.get("dosya");
  if (!(f instanceof File) || !f.size) return NextResponse.json({ ok: false, hata: "Görsel seçilmedi." }, { status: 400 });
  if (f.size > 10_000_000) return NextResponse.json({ ok: false, hata: "Görsel çok büyük (en çok 10 MB)." }, { status: 400 });
  try {
    await saveWatermark(me, Buffer.from(await f.arrayBuffer()));
    revalidatePath("/panel/galeri", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, hata: e instanceof Error ? e.message : "Filigran kaydedilemedi." }, { status: 400 });
  }
}
