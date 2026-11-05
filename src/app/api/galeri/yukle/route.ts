import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { GALLERY_FILE_MAX, addImages } from "@/server/gallery";

/**
 * Galeriye fotoğraf yükleme (çok parçalı form): album, dosya (bir ya da birkaç). Sunucu eylemlerinin 1 MB sınırına
 * takılmasın diye ayrı uç; panel fotoğrafları tarayıcıda küçültüp birer birer gönderir. Paneldeki herkes yükleyebilir.
 */
export async function POST(request: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ ok: false, hata: "Oturum kapanmış." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, hata: "Dosyalar okunamadı." }, { status: 400 });
  }
  const albumId = Number(form.get("album")) || 0;
  const files = form.getAll("dosya").filter((f): f is File => f instanceof File && f.size > 0);
  if (!albumId) return NextResponse.json({ ok: false, hata: "Albüm belirtilmedi." }, { status: 400 });
  if (!files.length) return NextResponse.json({ ok: false, hata: "Fotoğraf seçilmedi." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ ok: false, hata: "Bir seferde en çok 10 fotoğraf." }, { status: 400 });
  const big = files.find((f) => f.size > GALLERY_FILE_MAX);
  if (big) return NextResponse.json({ ok: false, hata: `“${big.name}” çok büyük (en çok 25 MB).` }, { status: 400 });
  try {
    const n = await addImages(me, albumId, await Promise.all(files.map(async (f) => ({ name: f.name || "foto.jpg", data: Buffer.from(await f.arrayBuffer()) }))));
    revalidatePath(`/panel/galeri/${albumId}`);
    return NextResponse.json({ ok: true, sayi: n });
  } catch (e) {
    return NextResponse.json({ ok: false, hata: e instanceof Error ? e.message : "Fotoğraf eklenemedi." }, { status: 400 });
  }
}
