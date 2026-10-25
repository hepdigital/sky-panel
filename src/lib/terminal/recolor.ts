// Renkli ürün görseli: fotoğraftaki sarı kumaş (ör. şemsiye) seçilen renge boyanır; gölge ve kıvrımlar korunur,
// direk, ayak ve beyaz zemin olduğu gibi kalır. 3D yerine tarayıcıda canvas ile yapılır, sonuç önbellekte tutulur.
// PHP fiyat terminalinde (js/app.js) aynı hesap vardır.

/** Görsellerdeki kumaşın kendi rengi: bu renk seçilince görsel değiştirilmez */
export const SOURCE_COLOR = "#f6c915";

const done = new Map<string, string>();
const running = new Map<string, Promise<string>>();
const keyOf = (src: string, hex: string) => `${src}|${hex}`;

/** Sarılık 0–1: ton 28–78°, renk doygunluğu arttıkça 1'e gider (beyaz zemine karışan kenarlar yumuşak geçer) */
function yellowness(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b);
  const c = mx - Math.min(r, g, b);
  if (c < 0.03) return 0;
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h *= 60;
  if (h < 0) h += 360;
  if (h < 28 || h > 78) return 0;
  return Math.min(1, (c - 0.03) / 0.2);
}

function paint(img: HTMLImageElement, hex: string) {
  const T = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0);
  const im = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = im.data;
  // Kumaşın aydınlık yüzü (parlaklığın %90'lık dilimi) hedef rengin kendisi olur; daha koyu yüzler gölgedir
  const vs: number[] = [];
  for (let i = 0; i < d.length; i += 4) if (yellowness(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255) > 0.9) vs.push(Math.max(d[i], d[i + 1], d[i + 2]) / 255);
  if (!vs.length) return null;
  vs.sort((a, b) => a - b);
  const ref = vs[Math.floor(vs.length * 0.9)];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const k = yellowness(r, g, b);
    if (!k) continue;
    const shade = Math.max(r, g, b) / ref;
    const white = Math.min(r, g, b) * (1 - k);
    const o = [r, g, b];
    for (let j = 0; j < 3; j++) {
      const n = (T[j] * Math.min(shade, 1) + (1 - T[j]) * Math.max(0, shade - 1)) * (1 - white) + white;
      d[i + j] = Math.round(Math.max(0, Math.min(1, o[j] * (1 - k) + n * k)) * 255);
    }
  }
  ctx.putImageData(im, 0, 0);
  return cv.toDataURL("image/webp", 0.86);
}

/** Boyanmış görsel hazırsa adresi (yoksa undefined); kaynak renk seçiliyse görselin kendisi */
export function recolored(src: string, hex: string) {
  return hex === SOURCE_COLOR ? src : done.get(keyOf(src, hex));
}

/** Görseli boyar (tarayıcıda); başarısızsa görselin kendisi döner */
export function recolor(src: string, hex: string): Promise<string> {
  const ready = recolored(src, hex);
  if (ready) return Promise.resolve(ready);
  const key = keyOf(src, hex);
  let p = running.get(key);
  if (!p) {
    p = new Promise<string>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        let out = src;
        try {
          out = paint(img, hex) ?? src;
        } catch {}
        done.set(key, out);
        resolve(out);
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
    running.set(key, p);
  }
  return p;
}
