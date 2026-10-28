// Veritabanı şeması (MySQL/MariaDB). Teklif ve müşteri tabloları SKY fiyat terminalinin (PHP) tablolarıyla aynı yapıdadır:
// terminaldeki kayıtlar tek seferde aktarılabilir. Her teklif o anki halini (fiyatlar dahil) "veri" alanında eksiksiz saklar.
//
// Görünürlük: satışçı yalnızca kendi teklif, sipariş ve carilerini görür (sahip/kullanici_id); yönetici hepsini.
import { type AnyMySqlColumn, boolean, date, decimal, index, int, longtext, mysqlEnum, mysqlTable, primaryKey, smallint, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const kullanicilar = mysqlTable("kullanicilar", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  kullaniciAdi: varchar("kullanici_adi", { length: 60 }).notNull().unique(),
  adSoyad: varchar("ad_soyad", { length: 120 }).notNull(),
  eposta: varchar("eposta", { length: 160 }),
  telefon: varchar("telefon", { length: 40 }),
  sifreHash: varchar("sifre_hash", { length: 255 }).notNull(),
  /** yonetici: her şey · satis: kendi teklif/sipariş/müşterileri · personel: yalnızca görevler */
  rol: mysqlEnum("rol", ["yonetici", "satis", "personel"]).notNull().default("satis"),
  aktif: boolean("aktif").notNull().default(true),
  sonGiris: timestamp("son_giris"),
  olusturma: timestamp("olusturma").notNull().defaultNow(),
});

/**
 * Marka (şirket kartı): SKY Görsel, GazeboTente… Teklif hangi markayla verilirse PDF, numara öneki, müşteri linki
 * ve mesaj metni o markanın olur. Her marka ayrı şirket olabilir (unvan, vergi, IBAN ayrı).
 */
export const markalar = mysqlTable("markalar", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  kod: varchar("kod", { length: 20 }).notNull().unique(),
  ad: varchar("ad", { length: 120 }).notNull(),
  unvan: varchar("unvan", { length: 200 }),
  adres: varchar("adres", { length: 300 }),
  telefon: varchar("telefon", { length: 40 }),
  eposta: varchar("eposta", { length: 160 }),
  web: varchar("web", { length: 160 }),
  vergi: varchar("vergi", { length: 160 }),
  ticSicil: varchar("tic_sicil", { length: 40 }),
  mersis: varchar("mersis", { length: 40 }),
  banka: varchar("banka", { length: 160 }),
  hesapAdi: varchar("hesap_adi", { length: 200 }),
  musteriNo: varchar("musteri_no", { length: 40 }),
  iban: varchar("iban", { length: 40 }),
  /** Logo adresi (/brand/… ya da yüklenen /dosya/marka/…) */
  logo: varchar("logo", { length: 255 }),
  renk: varchar("renk", { length: 7 }).notNull().default("#008355"),
  /** İkinci (koyu) renk: modern şablonda üst ve alt şerit, toplam kutusu */
  renk2: varchar("renk2", { length: 7 }).notNull().default("#111a26"),
  /** PDF şablonu: klasik (beyaz başlık, sağda künye) ya da modern (koyu şerit başlık, künye altta) */
  sablon: mysqlEnum("sablon", ["klasik", "modern"]).notNull().default("klasik"),
  /** Teklif numarası öneki: SKY-2026-1001, GT-2026-1001 */
  teklifOnEki: varchar("teklif_on_eki", { length: 10 }).notNull().unique(),
  /** PDF'in altına her teklifte basılan sabit notlar (satır satır) */
  notlar: text("notlar"),
  aktif: boolean("aktif").notNull().default(true),
  sira: int("sira").notNull().default(0),
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
    /** Geldiği marka (ilk teklifinin markası) */
    markaId: int("marka_id", { unsigned: true }).references(() => markalar.id, { onDelete: "set null" }),
    /** Siteden gelen müşteri: hangi siteden (panelde açılan müşterilerle eşleştirilmez) */
    siteId: int("site_id", { unsigned: true }).references((): AnyMySqlColumn => siteBaglantilari.id, { onDelete: "set null" }),
    /** Cariyi açan satışçı (sahibi); satışçı yalnızca kendi carilerini görür */
    sahipId: int("sahip_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    olusturan: varchar("olusturan", { length: 120 }),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("musteri_firma").on(t.firma), index("musteri_sahip").on(t.sahipId)],
);

/** Müşterinin geldiği kanal (Web sitesi, Instagram…): yönetici tanımlar, teklifte listeden seçilir */
export const kanallar = mysqlTable("kanallar", {
  id: int("id", { unsigned: true }).autoincrement().primaryKey(),
  ad: varchar("ad", { length: 80 }).notNull().unique(),
  /** Kapalı kanal yeni tekliflerde seçilemez, eski tekliflerde görünmeye devam eder */
  aktif: boolean("aktif").notNull().default(true),
  sira: int("sira").notNull().default(0),
  olusturma: timestamp("olusturma").notNull().defaultNow(),
});

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
    /** Müşterinin geldiği kanal */
    kanalId: int("kanal_id", { unsigned: true }).references(() => kanallar.id, { onDelete: "set null" }),
    /** Teklifi veren marka; numara marka başına sayar */
    markaId: int("marka_id", { unsigned: true })
      .notNull()
      .references(() => markalar.id),
    /** Teklifi kaydedenin adı (kayıt anındaki; eski kayıtlarda yalnızca bu vardır) */
    kullanici: varchar("kullanici", { length: 120 }),
    /** Teklif anındaki müşteri adı (müşteri kartı sonradan değişse de) */
    musteriAdi: varchar("musteri_adi", { length: 200 }),
    fiyatTipi: mysqlEnum("fiyat_tipi", ["perakende", "toptan"]).notNull(),
    kalemSayisi: smallint("kalem_sayisi", { unsigned: true }).notNull().default(0),
    tutarKdvHaric: decimal("tutar_kdv_haric", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    tutarKdvDahil: decimal("tutar_kdv_dahil", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    /** Kayıt anındaki toplam maliyet (KDV hariç; yalnızca yönetici görür). null = hiçbir kalemin maliyeti girilmemiş */
    maliyet: decimal("maliyet", { precision: 12, scale: 2, mode: "number" }),
    /** Bazı kalemlerin (gazebo, ek kalem, maliyetsiz ürün) maliyeti bilinmiyor: kâr eksik hesaplanmıştır */
    maliyetEksik: boolean("maliyet_eksik").notNull().default(false),
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
    uniqueIndex("teklif_marka_yil_sira").on(t.markaId, t.yil, t.sira),
    index("teklif_musteri").on(t.musteriId),
    index("teklif_kullanici").on(t.kullaniciId),
    index("teklif_kanal").on(t.kanalId),
    index("teklif_tarih").on(t.olusturma),
  ],
);

/**
 * Site bağlantısı: markanın e-ticaret sitesi (GazeboTente sitesi ya da WooCommerce). Panel siteden siparişleri çeker,
 * paneldeki durum/ödeme/kargo değişikliğini siteye yazar. anahtar: GazeboTente için API anahtarı, WooCommerce için "ck_…:cs_…".
 */
export const siteBaglantilari = mysqlTable(
  "site_baglantilari",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    markaId: int("marka_id", { unsigned: true })
      .notNull()
      .references(() => markalar.id),
    tur: mysqlEnum("tur", ["gazebotente", "woocommerce"]).notNull(),
    ad: varchar("ad", { length: 120 }).notNull(),
    /** Sitenin adresi (https://…) */
    adres: varchar("adres", { length: 255 }).notNull(),
    anahtar: varchar("anahtar", { length: 255 }),
    aktif: boolean("aktif").notNull().default(true),
    /** Son çekilen değişiklik anı (bir sonraki çekme buradan devam eder) */
    imlec: varchar("imlec", { length: 40 }),
    sonDeneme: timestamp("son_deneme"),
    sonBasari: timestamp("son_basari"),
    sonHata: text("son_hata"),
    /** Sitenin durum, ödeme ve kargo listeleri (JSON; siteden gelir) */
    sozluk: longtext("sozluk"),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
  },
  (t) => [index("site_marka").on(t.markaId)],
);

/** Site form talebi (toptan alım, bayilik, iletişim) takip aşaması */
export const TALEP_DURUMLARI = ["yeni", "arandi", "teklif", "kazanildi", "kaybedildi"] as const;

/**
 * Sitelerden gelen form talepleri (GazeboTente: /api/panel/talepler). Siteden çekilir, takibi panelde yapılır
 * (durum, not, ilgilenen). Tablo yoksa ilk eşitlemede oluşturulur (server/site-requests.ts).
 */
export const siteTalepleri = mysqlTable(
  "site_talepleri",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    siteId: int("site_id", { unsigned: true })
      .notNull()
      .references(() => siteBaglantilari.id),
    markaId: int("marka_id", { unsigned: true }).notNull(),
    /** Sitedeki talep kimliği (eşitleme imleci) */
    disId: int("dis_id", { unsigned: true }).notNull(),
    tur: varchar("tur", { length: 24 }).notNull(),
    turAd: varchar("tur_ad", { length: 60 }).notNull(),
    ad: varchar("ad", { length: 120 }).notNull(),
    firma: varchar("firma", { length: 191 }),
    eposta: varchar("eposta", { length: 191 }).notNull(),
    telefon: varchar("telefon", { length: 32 }).notNull(),
    il: varchar("il", { length: 64 }),
    mesaj: text("mesaj").notNull(),
    disTarih: timestamp("dis_tarih").notNull(),
    durum: mysqlEnum("durum", TALEP_DURUMLARI).notNull().default("yeni"),
    not: text("not"),
    ilgilenenId: int("ilgilenen_id", { unsigned: true }),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("talep_site_dis").on(t.siteId, t.disId), index("talep_durum").on(t.durum)],
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
    /** Tekliften gelen marka */
    markaId: int("marka_id", { unsigned: true })
      .notNull()
      .references(() => markalar.id),
    /** teklif: panelde tekliften dönüştü · site: e-ticaret sitesinden geldi */
    kaynak: mysqlEnum("kaynak", ["teklif", "site"]).notNull().default("teklif"),
    siteId: int("site_id", { unsigned: true }).references(() => siteBaglantilari.id),
    /** Sitedeki sipariş numarası ve durumu (sitenin kendi durum anahtarı) */
    disNo: varchar("dis_no", { length: 40 }),
    disDurum: varchar("dis_durum", { length: 32 }),
    odemeYontemi: varchar("odeme_yontemi", { length: 80 }),
    odemeDurumu: varchar("odeme_durumu", { length: 32 }),
    musteriAdi: varchar("musteri_adi", { length: 200 }),
    /** Panelin genel durumu (site siparişlerinde sitenin durumundan türetilir) */
    durum: mysqlEnum("durum", SIPARIS_DURUMLARI).notNull().default("alindi"),
    tutarKdvHaric: decimal("tutar_kdv_haric", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    tutarKdvDahil: decimal("tutar_kdv_dahil", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    /** Kayıt anındaki toplam maliyet (KDV hariç; yalnızca yönetici görür). null = hiçbir kalemin maliyeti girilmemiş */
    maliyet: decimal("maliyet", { precision: 12, scale: 2, mode: "number" }),
    /** Bazı kalemlerin (gazebo, ek kalem, maliyetsiz ürün) maliyeti bilinmiyor: kâr eksik hesaplanmıştır */
    maliyetEksik: boolean("maliyet_eksik").notNull().default(false),
    veri: longtext("veri").notNull(),
    /** Site siparişinin tüm ayrıntısı (JSON: müşteri, adres, fatura, kalemler, kargo, geçmiş, dosyalar, linkler) */
    siteVeri: longtext("site_veri"),
    /** Siparişin sitede verildiği an */
    disTarih: timestamp("dis_tarih"),
    notlar: text("notlar"),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [
    uniqueIndex("siparis_site_dis_no").on(t.siteId, t.disNo),
    index("siparis_kaynak").on(t.kaynak),
    index("siparis_musteri").on(t.musteriId),
    index("siparis_kullanici").on(t.kullaniciId),
  ],
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
    /** Birim maliyet (KDV hariç); yalnızca yönetici görür. Boşsa maliyet kontrolü yapılmaz */
    maliyet: decimal("maliyet", { precision: 12, scale: 2, mode: "number" }),
    uyari: varchar("uyari", { length: 500 }),
    /** Renk seçilebilir ürün (gazebo renkleri): her renk teklifte ayrı satırdır */
    renkSecimi: boolean("renk_secimi").notNull().default(false),
    /** Ek seçenek (ör. "Kumaş baskı dahil"): kartta anahtarla açılır, fiyatı ürünün fiyatına eklenir */
    secenekAd: varchar("secenek_ad", { length: 120 }),
    secenekToptan: decimal("secenek_toptan", { precision: 12, scale: 2, mode: "number" }),
    secenekPerakende: decimal("secenek_perakende", { precision: 12, scale: 2, mode: "number" }),
    /** Seçeneğin ek maliyeti */
    secenekMaliyet: decimal("secenek_maliyet", { precision: 12, scale: 2, mode: "number" }),
    sira: int("sira").notNull().default(0),
    aktif: boolean("aktif").notNull().default(true),
    /** Ürünü ekleyen; satışçı yalnızca kendi eklediği ürünleri düzenleyebilir */
    olusturanId: int("olusturan_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("urun_kategori").on(t.kategoriId)],
);

/**
 * Ürünün markaya özel fiyatı/görseli: boş alanlar ürünün ortak değerini kullanır; gizli = o markanın teklif ekranında görünmez.
 */
export const urunMarkalari = mysqlTable(
  "urun_markalari",
  {
    urunId: int("urun_id", { unsigned: true }).notNull().references(() => urunler.id, { onDelete: "cascade" }),
    markaId: int("marka_id", { unsigned: true }).notNull().references(() => markalar.id, { onDelete: "cascade" }),
    toptan: decimal("toptan", { precision: 12, scale: 2, mode: "number" }),
    perakende: decimal("perakende", { precision: 12, scale: 2, mode: "number" }),
    gorsel: varchar("gorsel", { length: 255 }),
    gizli: boolean("gizli").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.urunId, t.markaId] }), index("urun_markalari_marka").on(t.markaId)],
);

/** Kumaş renkleri: aktif = stokta. Stokta olmayan renk teklif ekranında seçilemez, GazeboTente sitesinde gösterilmez */
export const kumasRenkleri = mysqlTable("kumas_renkleri", {
  hex: varchar("hex", { length: 7 }).primaryKey(),
  ad: varchar("ad", { length: 40 }).notNull(),
  sira: int("sira").notNull().default(0),
  aktif: boolean("aktif").notNull().default(true),
  guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
});

/** Görev durumları: yapılacak → devam ediyor → (beklemede) → tamamlandı */
export const GOREV_DURUMLARI = ["yapilacak", "devam", "bekliyor", "tamam"] as const;
export const GOREV_ONCELIKLERI = ["dusuk", "normal", "yuksek", "acil"] as const;

/**
 * Görev: herkes oluşturup bir kişiye atayabilir. Kişi kendisine atanan ve kendi oluşturduğu görevleri görür, yönetici hepsini.
 * İsteğe bağlı olarak bir müşteri, teklif ya da siparişe bağlanır.
 */
export const gorevler = mysqlTable(
  "gorevler",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    baslik: varchar("baslik", { length: 200 }).notNull(),
    aciklama: text("aciklama"),
    atananId: int("atanan_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    olusturanId: int("olusturan_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    durum: mysqlEnum("durum", GOREV_DURUMLARI).notNull().default("yapilacak"),
    oncelik: mysqlEnum("oncelik", GOREV_ONCELIKLERI).notNull().default("normal"),
    /** Son tarih (gün) */
    bitis: date("bitis", { mode: "string" }),
    musteriId: int("musteri_id", { unsigned: true }).references(() => musteriler.id, { onDelete: "set null" }),
    teklifId: int("teklif_id", { unsigned: true }).references(() => teklifler.id, { onDelete: "set null" }),
    siparisId: int("siparis_id", { unsigned: true }).references(() => siparisler.id, { onDelete: "set null" }),
    tamamlanma: timestamp("tamamlanma"),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
    guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [index("gorev_atanan").on(t.atananId), index("gorev_olusturan").on(t.olusturanId), index("gorev_durum").on(t.durum)],
);

/** Görevin akışı: yorumlar ve olaylar (durum değişti, yeniden atandı…) */
export const gorevKayitlari = mysqlTable(
  "gorev_kayitlari",
  {
    id: int("id", { unsigned: true }).autoincrement().primaryKey(),
    gorevId: int("gorev_id", { unsigned: true })
      .notNull()
      .references(() => gorevler.id, { onDelete: "cascade" }),
    kullaniciId: int("kullanici_id", { unsigned: true }).references(() => kullanicilar.id, { onDelete: "set null" }),
    tip: mysqlEnum("tip", ["yorum", "olay"]).notNull().default("yorum"),
    metin: text("metin").notNull(),
    olusturma: timestamp("olusturma").notNull().defaultNow(),
  },
  (t) => [index("gorev_kayit_gorev").on(t.gorevId)],
);

/** Satışçının satış yapabileceği markalar; kaydı olmayan kullanıcı tüm markalarla çalışır */
export const kullaniciMarkalar = mysqlTable(
  "kullanici_markalar",
  {
    kullaniciId: int("kullanici_id", { unsigned: true })
      .notNull()
      .references(() => kullanicilar.id, { onDelete: "cascade" }),
    markaId: int("marka_id", { unsigned: true })
      .notNull()
      .references(() => markalar.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.kullaniciId, t.markaId] }), index("km_marka").on(t.markaId)],
);

/**
 * Modüler gazebo fiyat düzeltmeleri (fiyatlar.json'daki varsayılanların üstüne): kapsam "ortak", "marka-<id>" ya da "maliyet".
 * veri: hücre anahtarı → [toptan, perakende] (maliyette → sayı). Bkz. lib/terminal/price-table.ts
 */
export const gazeboFiyatlari = mysqlTable("gazebo_fiyatlari", {
  kapsam: varchar("kapsam", { length: 20 }).primaryKey(),
  veri: longtext("veri").notNull(),
  guncelleme: timestamp("guncelleme").notNull().defaultNow().onUpdateNow(),
});
