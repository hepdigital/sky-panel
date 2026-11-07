/* SKY Fiyat Terminali — PDF teklifin ustundeki firma ve odeme bilgileri.
   Bos birakilan alan PDF'e hic basilmaz, yani yanlis bilgi yerine eksik bilgi cikar. */
const FIRMA = {
  ad:       "SKY Görsel Çözümler",      /* marka — logo ve sayfa altinda */
  unvan:    "Bry Group Reklamcılık Organizasyon San. ve Tic. A.Ş.",
  adres:    "Topçusırtı Mah. Topçu Sırtı (Kuzuluk) Cd. No: 83/2 · Akyazı / Sakarya",
  telefon:  "0542 241 1490",
  eposta:   "",                          /* orn. "satis@skygorselcozumler.com" */
  web:      "",                          /* orn. "skygorselcozumler.com" */
  vergi:    "Akyazı V.D. 187 176 24",
  ticSicil: "3448",
  mersis:   "0187176240600001"
};

/* PDF'in en altindaki odeme bloku. banka alani bos birakilirsa blok hic basilmaz. */
const BANKA = {
  banka:     "Vakıfbank · Akyazı Şubesi",
  hesapAdi:  "Bry Group Reklamcılık Organizasyon San. ve Tic. A.Ş.",
  musteriNo: "445020693147",
  iban:      "TR54 0001 5001 5800 7374 1469 38"
};

/* Her PDF'in altina eklenecek sabit maddeler. Teklif formundaki
   "Teklif notu" alanina yazilanlar bunlarin ustune eklenir. */
const SABIT_NOTLAR = [
  "Fiyatlar 2026 fiyat listesine göre hazırlanmıştır."
  // "Nakliye ve montaj fiyatlara dahil değildir.",
  // "Sipariş onayından sonra teslim süresi 10 iş günüdür.",
];

/* Teklif numarasi kalibi: {YIL} ve {SIRA} degistirilir. */
const TEKLIF_NO_KALIBI = "SKY-{YIL}-{SIRA}";
