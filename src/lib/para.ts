/** AI maliyeti: kur girilmişse ₺ (küçük tutarlarda kuruş hassasiyetiyle), değilse $ */
export function aiPara(usd: number, kur: number | null) {
  if (kur) {
    const tl = usd * kur;
    return `₺${tl.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: tl < 1 ? 4 : 2 })}`;
  }
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 4 : 2 })}`;
}
