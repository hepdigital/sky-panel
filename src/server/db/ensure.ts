import "server-only";
import { sql } from "drizzle-orm";
import { db, schema } from "./index";

// Pazaryeri şeması ilk kullanımda kurulur (canlıda drizzle push kullanılmaz): bağlantı türüne pazaryerleri, bağlantıya
// ürün kartı / listeleme / kategori / ayar / işlem tabloları ve sonradan eklenen kolonlar eklenir. Her adım tekrar çalıştırılabilir.
// Kısıt adları drizzle'ın adlandırmasıyla (tablo_kolon_hedef_kolon_fk) yazılır; db/kurulum.sql ile aynıdır.

const TABLES = [
  `CREATE TABLE IF NOT EXISTS pazaryeri_urunleri (
    id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    stok_kodu varchar(60) NOT NULL,
    barkod varchar(40) NOT NULL,
    ad varchar(150) NOT NULL,
    aciklama text NULL,
    grup_kodu varchar(60) NOT NULL,
    marka_adi varchar(80) NULL,
    urun_id int unsigned NULL,
    renk varchar(40) NULL,
    olcu varchar(60) NULL,
    gorseller text NULL,
    desi decimal(8,2) NULL,
    agirlik decimal(8,2) NULL,
    en decimal(8,1) NULL,
    boy decimal(8,1) NULL,
    yukseklik decimal(8,1) NULL,
    kdv smallint unsigned NOT NULL DEFAULT 20,
    fiyat decimal(12,2) NULL,
    secenek_dahil tinyint(1) NOT NULL DEFAULT 0,
    yalniz_secenek tinyint(1) NOT NULL DEFAULT 0,
    maliyet decimal(12,2) NULL,
    stok int unsigned NOT NULL DEFAULT 0,
    hazirlik_gun smallint unsigned NOT NULL DEFAULT 3,
    aktif tinyint(1) NOT NULL DEFAULT 1,
    olusturma timestamp NOT NULL DEFAULT current_timestamp(),
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    UNIQUE KEY pazaryeri_urunleri_stok_kodu_unique (stok_kodu),
    UNIQUE KEY pazaryeri_urunleri_barkod_unique (barkod),
    KEY pu_grup (grup_kodu),
    CONSTRAINT pazaryeri_urunleri_urun_id_urunler_id_fk FOREIGN KEY (urun_id) REFERENCES urunler (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS pazaryeri_listelemeleri (
    id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    urun_id int unsigned NOT NULL,
    site_id int unsigned NOT NULL,
    aktif tinyint(1) NOT NULL DEFAULT 1,
    kategori_id int unsigned NULL,
    kategori_yol varchar(500) NULL,
    marka_id int unsigned NULL,
    marka_ad varchar(120) NULL,
    ozellikler longtext NULL,
    fiyat decimal(12,2) NULL,
    fiyat_farki decimal(6,2) NULL,
    durum enum('taslak','gonderildi','onay','yayinda','hata','pasif') NOT NULL DEFAULT 'taslak',
    olustu tinyint(1) NOT NULL DEFAULT 0,
    batch_id varchar(80) NULL,
    hata text NULL,
    son_fiyat_stok varchar(80) NULL,
    son_gonderim timestamp NULL,
    dis_urun_id int unsigned NULL,
    dis_varyant_id int unsigned NULL,
    dis_ad varchar(255) NULL,
    dis_fiyat decimal(12,2) NULL,
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    UNIQUE KEY pl_urun_site (urun_id, site_id),
    KEY pl_site_durum (site_id, durum),
    CONSTRAINT pazaryeri_listelemeleri_urun_id_pazaryeri_urunleri_id_fk FOREIGN KEY (urun_id) REFERENCES pazaryeri_urunleri (id) ON DELETE CASCADE,
    CONSTRAINT pazaryeri_listelemeleri_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS pazaryeri_kategorileri (
    tur varchar(20) NOT NULL,
    id int unsigned NOT NULL,
    ust_id int unsigned NULL,
    ad varchar(200) NOT NULL,
    yol varchar(600) NOT NULL,
    yaprak tinyint(1) NOT NULL DEFAULT 0,
    ozellikler longtext NULL,
    ozellik_tarih timestamp NULL,
    PRIMARY KEY (tur, id),
    KEY pk_yaprak (tur, yaprak)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS pazaryeri_ayarlari (
    site_id int unsigned NOT NULL PRIMARY KEY,
    veri longtext NOT NULL,
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    CONSTRAINT pazaryeri_ayarlari_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS pazaryeri_islemleri (
    id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
    site_id int unsigned NOT NULL,
    tur varchar(30) NOT NULL,
    batch_id varchar(80) NULL,
    durum varchar(20) NOT NULL,
    ozet varchar(1000) NOT NULL,
    kullanici varchar(120) NULL,
    olusturma timestamp NOT NULL DEFAULT current_timestamp(),
    KEY pi_site (site_id, olusturma),
    CONSTRAINT pazaryeri_islemleri_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

/** Önceki sürümde oluşmuş tablolara sonradan eklenen kolonlar (yoksa eklenir) */
const COLUMNS: [table: string, column: string, def: string][] = [
  ["pazaryeri_urunleri", "agirlik", "decimal(8,2) NULL AFTER desi"],
  ["pazaryeri_urunleri", "en", "decimal(8,1) NULL AFTER agirlik"],
  ["pazaryeri_urunleri", "boy", "decimal(8,1) NULL AFTER en"],
  ["pazaryeri_urunleri", "yukseklik", "decimal(8,1) NULL AFTER boy"],
  ["pazaryeri_urunleri", "secenek_dahil", "tinyint(1) NOT NULL DEFAULT 0 AFTER fiyat"],
  ["pazaryeri_urunleri", "maliyet", "decimal(12,2) NULL AFTER secenek_dahil"],
  ["pazaryeri_urunleri", "yalniz_secenek", "tinyint(1) NOT NULL DEFAULT 0 AFTER secenek_dahil"],
  ["pazaryeri_listelemeleri", "dis_urun_id", "int unsigned NULL AFTER son_gonderim"],
  ["pazaryeri_listelemeleri", "dis_varyant_id", "int unsigned NULL AFTER dis_urun_id"],
  ["pazaryeri_listelemeleri", "dis_ad", "varchar(255) NULL AFTER dis_varyant_id"],
  ["pazaryeri_listelemeleri", "dis_fiyat", "decimal(12,2) NULL AFTER dis_ad"],
  ["pazaryeri_listelemeleri", "fiyat_farki", "decimal(6,2) NULL AFTER fiyat"],
];

async function columnType(table: string, column: string) {
  const [rows] = (await db().execute(
    sql`SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND COLUMN_NAME = ${column}`,
  )) as unknown as [{ t: string }[]];
  return rows[0]?.t ? String(rows[0].t) : null;
}

let ready: Promise<unknown> | null = null;

export const ensureMarketplaceSchema = () =>
  (ready ??= (async () => {
    const tur = (await columnType("site_baglantilari", "tur")) ?? "";
    if (schema.SITE_TURLERI.some((t) => !tur.includes(`'${t}'`))) {
      const list = schema.SITE_TURLERI.map((t) => `'${t}'`).join(",");
      await db().execute(sql.raw(`ALTER TABLE site_baglantilari MODIFY tur enum(${list}) NOT NULL`));
    }
    for (const t of TABLES) await db().execute(sql.raw(t));
    for (const [table, column, def] of COLUMNS) {
      if (!(await columnType(table, column))) await db().execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`));
    }
  })().catch((e) => {
    ready = null;
    throw e;
  }));
