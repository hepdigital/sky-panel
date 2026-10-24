/** Seçilen görseli en fazla `max` px'e küçültüp webp'e çevirir; base64 döner (sunucu eylemine gönderilir) */
export async function toWebp(file: File, max = 900) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * scale);
  cv.height = Math.round(bmp.height * scale);
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/webp", quality));
    if (!blob) break;
    if (blob.size < 600_000) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }
  }
  throw new Error("Görsel küçültülemedi.");
}
