import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMe } from "@/server/auth";
import { TASK_FILE_MAX } from "@/server/files";
import { addComment, addFiles } from "@/server/tasks";

/**
 * Görev eki yükleme (çok parçalı form): gorev, dosya (bir ya da birkaç), yorum (varsa dosyalar o yorumla birlikte eklenir).
 * Sunucu eylemlerinin 1 MB sınırına takılmasın diye ayrı uç; istek başına en çok 10 dosya.
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
  const gorevId = Number(form.get("gorev")) || 0;
  const files = form.getAll("dosya").filter((f): f is File => f instanceof File && f.size > 0);
  const yorum = form.get("yorum");
  if (!gorevId) return NextResponse.json({ ok: false, hata: "Görev belirtilmedi." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ ok: false, hata: "Bir seferde en çok 10 dosya eklenebilir." }, { status: 400 });
  const big = files.find((f) => f.size > TASK_FILE_MAX);
  if (big) return NextResponse.json({ ok: false, hata: `“${big.name}” çok büyük (en çok 15 MB).` }, { status: 400 });
  try {
    let kayitId: number | null = null;
    if (typeof yorum === "string") {
      kayitId = await addComment(me, gorevId, yorum, files.length > 0);
      if (!kayitId) return NextResponse.json({ ok: false, hata: "Yorum eklenemedi." }, { status: 400 });
    } else if (!files.length) return NextResponse.json({ ok: false, hata: "Dosya seçilmedi." }, { status: 400 });
    if (files.length) await addFiles(me, gorevId, kayitId, await Promise.all(files.map(async (f) => ({ name: f.name || "gorsel.png", type: f.type, data: Buffer.from(await f.arrayBuffer()) }))));
  } catch (e) {
    return NextResponse.json({ ok: false, hata: e instanceof Error ? e.message : "Dosya eklenemedi." }, { status: 400 });
  }
  revalidatePath(`/panel/gorevler/${gorevId}`);
  revalidatePath("/panel/gorevler");
  return NextResponse.json({ ok: true });
}
