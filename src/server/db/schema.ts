// Veritabanı şeması (MySQL/MariaDB). Teklif ve müşteri tabloları SKY fiyat terminalinin (PHP) tablolarıyla aynı yapıdadır:
// terminaldeki kayıtlar tek seferde aktarılabilir. Her teklif o anki halini (fiyatlar dahil) "veri" alanında eksiksiz saklar.
//
// Görünürlük: satışçı yalnızca kendi teklif, sipariş ve carilerini görür (sahip/kullanici_id); yönetici hepsini.
import { boolean, decimal, index, int, longtext, mysqlEnum, mysqlTable, smallint, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const kullanicilar = mysqlTable("kullanicilar", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  kullaniciAdi: varchar("kullanici_adi", { length: 60 }).notNull().unique(),
  adSoyad: varchar("ad_soyad", { length: 120 }).notNull(),
  eposta: varchar("eposta", { length: 160 }),
  telefon: varchar("telefon", { length: 40 }),
  sifreHash: varchar("sifre_hash", { length: 255 }).notNull(),
  rol: mysqlEnum("rol", ["yonetici", "satis"]).notNull().default("satis"),
  aktif: boolean("aktif").notNull().default(true),
  sonGiris: timestamp("son_giris"),
  olusturma: timestamp("olusturma").notNull().defaultNow(),
});

export const oturumlar = mysqlTable(
  "oturumlar",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    kullaniciId: int("kullanici_id", { unsigned: true })
      .notNull()
      .references(() => kullanicilar.id, { onDelete: "cascade" }),
    bitis: timestamp("bitis").notNull(),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
  },
  (t) => [index("oturum_kullanici").on(t.kullaniciId)],
);

/** İskonto grubu: müşteriye tanımlanır; teklifte müşteri seçilince grubun fiyat listesi ve iskontosu uygulanır */
export const iskontoGruplari = mysqlTable("iskonto_gruplari", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  ad: varchar("ad", { length: 80 }).notNull().unique(),
  fiyatListesi: mysqlEnum("fiyat_listesi", ["perakende", "toptan"]).notNull().default("perakende"),
  /** Genel iskonto yüzdesi (eksi değer ilave) */
  oran: decimal("oran", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  aciklama: varchar("aciklama", { length: 255 }),
  olusturma: timestamp("olusturma").notNull().defaultNow(),
});

export const musteriler = mysqlTable(
  "musteriler",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    firma: varchar("firma", { length: 200 }).notNull(),
    yetkili: varchar("yetkili", { length: 120 }),
    telefon: varchar("telefon", { length: 40 }),
    eposta: varchar("eposta", { length: 160 }),
    vergiDairesi: varchar("vergi_dairesi", { length: 120 }),
    vergiNo: varchar("vergi_no", { length: 20 }),
    adres: text("adres"),
    il: varchar("il", { length: 60 }),
    notlar: text("notlar"),
    iskontoGrubuId: int("iskonto_grubu_id", { unsigned: true }).references(() => iskontoGruplari.id, { onDelete: "set null" }),
    /** Cariyi açan satışçı (sahibi); satışçı yalnızca kendi carilerini görür */
    sahipId: int("sahip_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    olusturan: varchar("olusturan", { length: 120 }),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("musteri_firma").on(t.firma), index("musteri_sahip").on(t.sahipId)],
);

/**
 * Teklif aşaması: taslak (kaydedildi) → gonderildi (WhatsApp/e-posta ile iletildi) → onaylandi / reddedildi → siparis.
 * Müşteri teklif linkini açınca ilk/son görülme ve sayısı tutulur; linkten kabul ya da revizyon isteği gelebilir.
 */
export const TEKLIF_ASAMALARI = ["taslak", "gonderildi", "onaylandi", "reddedildi", "siparis"] as const;

export const teklifler = mysqlTable(
  "teklifler",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    no: varchar("no", { length: 40 }).notNull().unique(),
    yil: smallint("yil", { unsigned: true }).notNull(),
    sira: int("sira", { unsigned: true }).notNull(),
    musteriId: int("musteri_id", { unsigned: true }).references(() => musteriler.id, { onDelete: "set null" }),
    /** Teklifi veren satışçı */
    kullaniciId: int("kullanici_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    /** Teklifi kaydedenin adı (kayıt anındaki; eski kayıtlarda yalnızca bu vardır) */
    kullanici: varchar("kullanici", { length: 120 }),
    /** Teklif anındaki müşteri adı (müşteri kartı sonradan değişse de) */
    musteriAdi: varchar("musteri_adi", { length: 200 }),
    fiyatTipi: mysqlEnum("fiyat_tipi", ["perakende", "toptan"]).notNull(),
    kalemSayisi: smallint("kalem_sayisi", { unsigned: true }).notNull().default(0),
    tutarKdvHaric: decimal("tutar_kdv_haric", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    tutarKdvDahil: decimal("tutar_kdv_dahil", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    /** PDF'in tüm verisi (JSON): yeniden indirme ve aktarım için */
    veri: longtext("veri").notNull(),
    /** Terminal sepeti (JSON): teklifi yeniden açıp kopyalamak için */
    durum: longtext("durum"),
    asama: mysqlEnum("asama", TEKLIF_ASAMALARI).notNull().default("taslak"),
    /** Müşteriye giden teklif linkinin kodu (tahmin edilemez) */
    token: varchar("token", { length: 64 }).unique(),
    /** Geçerlilik sonu (link bu tarihten sonra kabul almaz) */
    gecerlilik: timestamp("gecerlilik"),
    gonderim: timestamp("gonderim"),
    ilkGorulme: timestamp("ilk_gorulme"),
    sonGorulme: timestamp("son_gorulme"),
    gorulmeSayisi: int("gorulme_sayisi", { unsigned: true }).notNull().default(0),
    /** Müşterinin linkten verdiği yanıt: kabul eden ad ya da revizyon/red notu */
    yanitTarihi: timestamp("yanit_tarihi"),
    yanitAd: varchar("yanit_ad", { length: 120 }),
    yanitNot: text("yanit_not"),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("teklif_yil_sira").on(t.yil, t.sira),
    index("teklif_musteri").on(t.musteriId),
    index("teklif_kullanici").on(t.kullaniciId),
    index("teklif_tarih").on(t.olusturma),
  ],
);

/** Sipariş durumu: alındı → üretimde → hazır → kargoda/sevkiyatta → teslim edildi (ya da iptal) */
export const SIPARIS_DURUMLARI = ["alindi", "uretimde", "hazir", "kargoda", "teslim", "iptal"] as const;

/** Onaylanan tekliften oluşan sipariş: teklifin kalemleri ve tutarları aynen kopyalanır (sonradan teklif değişse de sipariş sabit) */
export const siparisler = mysqlTable(
  "siparisler",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    no: varchar("no", { length: 40 }).notNull().unique(),
    yil: smallint("yil", { unsigned: true }).notNull(),
    sira: int("sira", { unsigned: true }).notNull(),
    teklifId: int("teklif_id", { unsigned: true })
      .unique()
      .references(() => teklifler.id, { onDelete: "set null" }),
    musteriId: int("musteri_id", { unsigned: true }).references(() => musteriler.id, { onDelete: "set null" }),
    kullaniciId: int("kullanici_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    musteriAdi: varchar("musteri_adi", { length: 200 }),
    durum: mysqlEnum("durum", SIPARIS_DURUMLARI).notNull().default("alindi"),
    tutarKdvHaric: decimal("tutar_kdv_haric", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    tutarKdvDahil: decimal("tutar_kdv_dahil", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    veri: longtext("veri").notNull(),
    notlar: text("notlar"),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("siparis_yil_sira").on(t.yil, t.sira), index("siparis_musteri").on(t.musteriId), index("siparis_kullanici").on(t.kullaniciId)],
);

/** Ürün kategorisi: terminalin üst menüsünde sırasıyla görünür (modüler gazebo hariç tüm ürünler) */
export const urunKategorileri = mysqlTable("urun_kategorileri", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  ad: varchar("ad", { length: 80 }).notNull(),
  aciklama: varchar("aciklama", { length: 255 }),
  /** Kategorideki tüm ürünler için satışçıya gösterilen uyarı (ör. "baskı fiyata dahil değil") */
  uyari: varchar("uyari", { length: 500 }),
  sira: int("sira").notNull().default(0),
  aktif: boolean("aktif").notNull().default(true),
  olusturma: timestamp("olusturma").notNull().defaultNow(),
});

/**
 * Katalog ürünü. kod teklif sepetindeki anahtardır (eski terminal kayıtlarıyla aynı: "rollup", "kum"…), değişmez.
 * Fiyatlar KDV hariç; boş fiyat "fiyat sorunuz" demektir. gorsel: terminal görsel anahtarı ("p:rollup") ya da yüklenen dosyanın adresi.
 */
export const urunler = mysqlTable(
  "urunler",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    kod: varchar("kod", { length: 60 }).notNull().unique(),
    kategoriId: int("kategori_id", { unsigned: true }).references(() => urunKategorileri.id, { onDelete: "set null" }),
    ad: varchar("ad", { length: 160 }).notNull(),
    aciklama: varchar("aciklama", { length: 255 }),
    gorsel: varchar("gorsel", { length: 255 }),
    toptan: decimal("toptan", { precision: 12, scale: 2, mode: "number" }),
    perakende: decimal("perakende", { precision: 12, scale: 2, mode: "number" }),
    uyari: varchar("uyari", { length: 500 }),
    sira: int("sira").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    /** Ürünü ekleyen; satışçı yalnızca kendi eklediği ürünleri düzenleyebilir */
    olusturanId: int("olusturan_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("urun_kategori").on(t.kategoriId)],
);
