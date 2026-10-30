
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `gorev_kayitlari`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gorev_kayitlari` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `gorev_id` int(10) unsigned NOT NULL,
  `kullanici_id` int(10) unsigned DEFAULT NULL,
  `tip` enum('yorum','olay') NOT NULL DEFAULT 'yorum',
  `metin` text NOT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `gorev_kayit_gorev` (`gorev_id`),
  KEY `gorev_kayitlari_kullanici_id_kullanicilar_id_fk` (`kullanici_id`),
  CONSTRAINT `gorev_kayitlari_gorev_id_gorevler_id_fk` FOREIGN KEY (`gorev_id`) REFERENCES `gorevler` (`id`) ON DELETE CASCADE,
  CONSTRAINT `gorev_kayitlari_kullanici_id_kullanicilar_id_fk` FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `gorevler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `gorevler` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `baslik` varchar(200) NOT NULL,
  `aciklama` text DEFAULT NULL,
  `atanan_id` int(10) unsigned DEFAULT NULL,
  `olusturan_id` int(10) unsigned DEFAULT NULL,
  `durum` enum('yapilacak','devam','bekliyor','tamam') NOT NULL DEFAULT 'yapilacak',
  `oncelik` enum('dusuk','normal','yuksek','acil') NOT NULL DEFAULT 'normal',
  `bitis` date DEFAULT NULL,
  `musteri_id` int(10) unsigned DEFAULT NULL,
  `teklif_id` int(10) unsigned DEFAULT NULL,
  `siparis_id` int(10) unsigned DEFAULT NULL,
  `tamamlanma` timestamp NULL DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  `guncelleme` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `gorev_atanan` (`atanan_id`),
  KEY `gorev_olusturan` (`olusturan_id`),
  KEY `gorev_durum` (`durum`),
  KEY `gorevler_musteri_id_musteriler_id_fk` (`musteri_id`),
  KEY `gorevler_teklif_id_teklifler_id_fk` (`teklif_id`),
  KEY `gorevler_siparis_id_siparisler_id_fk` (`siparis_id`),
  CONSTRAINT `gorevler_atanan_id_kullanicilar_id_fk` FOREIGN KEY (`atanan_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gorevler_musteri_id_musteriler_id_fk` FOREIGN KEY (`musteri_id`) REFERENCES `musteriler` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gorevler_olusturan_id_kullanicilar_id_fk` FOREIGN KEY (`olusturan_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gorevler_siparis_id_siparisler_id_fk` FOREIGN KEY (`siparis_id`) REFERENCES `siparisler` (`id`) ON DELETE SET NULL,
  CONSTRAINT `gorevler_teklif_id_teklifler_id_fk` FOREIGN KEY (`teklif_id`) REFERENCES `teklifler` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iskonto_gruplari`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `iskonto_gruplari` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ad` varchar(80) NOT NULL,
  `fiyat_listesi` enum('perakende','toptan') NOT NULL DEFAULT 'perakende',
  `oran` decimal(5,2) NOT NULL DEFAULT 0.00,
  `aciklama` varchar(255) DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `iskonto_gruplari_ad_unique` (`ad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kanallar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kanallar` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ad` varchar(80) NOT NULL,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `sira` int(11) NOT NULL DEFAULT 0,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `kanallar_ad_unique` (`ad`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kullanici_markalar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kullanici_markalar` (
  `kullanici_id` int(10) unsigned NOT NULL,
  `marka_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`kullanici_id`,`marka_id`),
  KEY `km_marka` (`marka_id`),
  CONSTRAINT `kullanici_markalar_kullanici_id_kullanicilar_id_fk` FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar` (`id`) ON DELETE CASCADE,
  CONSTRAINT `kullanici_markalar_marka_id_markalar_id_fk` FOREIGN KEY (`marka_id`) REFERENCES `markalar` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `kullanicilar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `kullanicilar` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `kullanici_adi` varchar(60) NOT NULL,
  `ad_soyad` varchar(120) NOT NULL,
  `eposta` varchar(160) DEFAULT NULL,
  `telefon` varchar(40) DEFAULT NULL,
  `sifre_hash` varchar(255) NOT NULL,
  `rol` enum('yonetici','satis','personel') NOT NULL DEFAULT 'satis',
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `son_giris` timestamp NULL DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `kullanicilar_kullanici_adi_unique` (`kullanici_adi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `markalar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `markalar` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `kod` varchar(20) NOT NULL,
  `ad` varchar(120) NOT NULL,
  `unvan` varchar(200) DEFAULT NULL,
  `adres` varchar(300) DEFAULT NULL,
  `telefon` varchar(40) DEFAULT NULL,
  `eposta` varchar(160) DEFAULT NULL,
  `web` varchar(160) DEFAULT NULL,
  `vergi` varchar(160) DEFAULT NULL,
  `tic_sicil` varchar(40) DEFAULT NULL,
  `mersis` varchar(40) DEFAULT NULL,
  `banka` varchar(160) DEFAULT NULL,
  `hesap_adi` varchar(200) DEFAULT NULL,
  `musteri_no` varchar(40) DEFAULT NULL,
  `iban` varchar(40) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `renk` varchar(7) NOT NULL DEFAULT '#008355',
  `renk2` varchar(7) NOT NULL DEFAULT '#111a26',
  `sablon` enum('klasik','modern') NOT NULL DEFAULT 'klasik',
  `teklif_on_eki` varchar(10) NOT NULL,
  `notlar` text DEFAULT NULL,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `sira` int(11) NOT NULL DEFAULT 0,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `markalar_kod_unique` (`kod`),
  UNIQUE KEY `markalar_teklif_on_eki_unique` (`teklif_on_eki`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `musteriler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `musteriler` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `firma` varchar(200) NOT NULL,
  `yetkili` varchar(120) DEFAULT NULL,
  `telefon` varchar(40) DEFAULT NULL,
  `eposta` varchar(160) DEFAULT NULL,
  `vergi_dairesi` varchar(120) DEFAULT NULL,
  `vergi_no` varchar(20) DEFAULT NULL,
  `adres` text DEFAULT NULL,
  `il` varchar(60) DEFAULT NULL,
  `notlar` text DEFAULT NULL,
  `iskonto_grubu_id` int(10) unsigned DEFAULT NULL,
  `marka_id` int(10) unsigned DEFAULT NULL,
  `sahip_id` int(10) unsigned DEFAULT NULL,
  `olusturan` varchar(120) DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  `guncelleme` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `musteri_firma` (`firma`),
  KEY `musteri_sahip` (`sahip_id`),
  KEY `musteriler_iskonto_grubu_id_iskonto_gruplari_id_fk` (`iskonto_grubu_id`),
  KEY `musteriler_marka_id_markalar_id_fk` (`marka_id`),
  CONSTRAINT `musteriler_iskonto_grubu_id_iskonto_gruplari_id_fk` FOREIGN KEY (`iskonto_grubu_id`) REFERENCES `iskonto_gruplari` (`id`) ON DELETE SET NULL,
  CONSTRAINT `musteriler_marka_id_markalar_id_fk` FOREIGN KEY (`marka_id`) REFERENCES `markalar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `musteriler_sahip_id_kullanicilar_id_fk` FOREIGN KEY (`sahip_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `oturumlar`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `oturumlar` (
  `token_hash` varchar(64) NOT NULL,
  `kullanici_id` int(10) unsigned NOT NULL,
  `bitis` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`token_hash`),
  KEY `oturum_kullanici` (`kullanici_id`),
  CONSTRAINT `oturumlar_kullanici_id_kullanicilar_id_fk` FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `siparisler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `siparisler` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `no` varchar(40) NOT NULL,
  `yil` smallint(5) unsigned NOT NULL,
  `sira` int(10) unsigned NOT NULL,
  `teklif_id` int(10) unsigned DEFAULT NULL,
  `musteri_id` int(10) unsigned DEFAULT NULL,
  `kullanici_id` int(10) unsigned DEFAULT NULL,
  `marka_id` int(10) unsigned NOT NULL,
  `kaynak` enum('teklif','site') NOT NULL DEFAULT 'teklif',
  `site_id` int(10) unsigned DEFAULT NULL,
  `dis_no` varchar(40) DEFAULT NULL,
  `dis_durum` varchar(32) DEFAULT NULL,
  `odeme_yontemi` varchar(80) DEFAULT NULL,
  `odeme_durumu` varchar(32) DEFAULT NULL,
  `musteri_adi` varchar(200) DEFAULT NULL,
  `durum` enum('alindi','uretimde','hazir','kargoda','teslim','iptal') NOT NULL DEFAULT 'alindi',
  `tutar_kdv_haric` decimal(12,2) NOT NULL DEFAULT 0.00,
  `tutar_kdv_dahil` decimal(12,2) NOT NULL DEFAULT 0.00,
  `veri` longtext NOT NULL,
  `site_veri` longtext DEFAULT NULL,
  `dis_tarih` timestamp NULL DEFAULT NULL,
  `notlar` text DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  `guncelleme` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `siparisler_no_unique` (`no`),
  UNIQUE KEY `siparisler_teklif_id_unique` (`teklif_id`),
  UNIQUE KEY `siparis_site_dis_no` (`site_id`,`dis_no`),
  KEY `siparis_musteri` (`musteri_id`),
  KEY `siparis_kullanici` (`kullanici_id`),
  KEY `siparis_marka` (`marka_id`),
  KEY `siparis_kaynak` (`kaynak`),
  CONSTRAINT `siparisler_kullanici_id_kullanicilar_id_fk` FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `siparisler_marka_id_markalar_id_fk` FOREIGN KEY (`marka_id`) REFERENCES `markalar` (`id`),
  CONSTRAINT `siparisler_musteri_id_musteriler_id_fk` FOREIGN KEY (`musteri_id`) REFERENCES `musteriler` (`id`) ON DELETE SET NULL,
  CONSTRAINT `siparisler_site_id_site_baglantilari_id_fk` FOREIGN KEY (`site_id`) REFERENCES `site_baglantilari` (`id`),
  CONSTRAINT `siparisler_teklif_id_teklifler_id_fk` FOREIGN KEY (`teklif_id`) REFERENCES `teklifler` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `site_baglantilari`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `site_baglantilari` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `marka_id` int(10) unsigned NOT NULL,
  `tur` enum('gazebotente','woocommerce','trendyol','hepsiburada') NOT NULL,
  `ad` varchar(120) NOT NULL,
  `adres` varchar(255) NOT NULL,
  `anahtar` varchar(255) DEFAULT NULL,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `imlec` varchar(40) DEFAULT NULL,
  `son_deneme` timestamp NULL DEFAULT NULL,
  `son_basari` timestamp NULL DEFAULT NULL,
  `son_hata` text DEFAULT NULL,
  `sozluk` longtext DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `site_marka` (`marka_id`),
  CONSTRAINT `site_baglantilari_marka_id_markalar_id_fk` FOREIGN KEY (`marka_id`) REFERENCES `markalar` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `teklifler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teklifler` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `no` varchar(40) NOT NULL,
  `yil` smallint(5) unsigned NOT NULL,
  `sira` int(10) unsigned NOT NULL,
  `musteri_id` int(10) unsigned DEFAULT NULL,
  `kullanici_id` int(10) unsigned DEFAULT NULL,
  `kanal_id` int(10) unsigned DEFAULT NULL,
  `marka_id` int(10) unsigned NOT NULL,
  `kullanici` varchar(120) DEFAULT NULL,
  `musteri_adi` varchar(200) DEFAULT NULL,
  `fiyat_tipi` enum('perakende','toptan') NOT NULL,
  `kalem_sayisi` smallint(5) unsigned NOT NULL DEFAULT 0,
  `tutar_kdv_haric` decimal(12,2) NOT NULL DEFAULT 0.00,
  `tutar_kdv_dahil` decimal(12,2) NOT NULL DEFAULT 0.00,
  `veri` longtext NOT NULL,
  `durum` longtext DEFAULT NULL,
  `asama` enum('taslak','gonderildi','onaylandi','reddedildi','siparis') NOT NULL DEFAULT 'taslak',
  `token` varchar(64) DEFAULT NULL,
  `gecerlilik` timestamp NULL DEFAULT NULL,
  `gonderim` timestamp NULL DEFAULT NULL,
  `ilk_gorulme` timestamp NULL DEFAULT NULL,
  `son_gorulme` timestamp NULL DEFAULT NULL,
  `gorulme_sayisi` int(10) unsigned NOT NULL DEFAULT 0,
  `yanit_tarihi` timestamp NULL DEFAULT NULL,
  `yanit_ad` varchar(120) DEFAULT NULL,
  `yanit_not` text DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `teklifler_no_unique` (`no`),
  UNIQUE KEY `teklif_marka_yil_sira` (`marka_id`,`yil`,`sira`),
  UNIQUE KEY `teklifler_token_unique` (`token`),
  KEY `teklif_musteri` (`musteri_id`),
  KEY `teklif_tarih` (`olusturma`),
  KEY `teklif_kullanici` (`kullanici_id`),
  KEY `teklif_kanal` (`kanal_id`),
  CONSTRAINT `teklifler_kanal_id_kanallar_id_fk` FOREIGN KEY (`kanal_id`) REFERENCES `kanallar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `teklifler_kullanici_id_kullanicilar_id_fk` FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL,
  CONSTRAINT `teklifler_marka_id_markalar_id_fk` FOREIGN KEY (`marka_id`) REFERENCES `markalar` (`id`),
  CONSTRAINT `teklifler_musteri_id_musteriler_id_fk` FOREIGN KEY (`musteri_id`) REFERENCES `musteriler` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `urun_kategorileri`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `urun_kategorileri` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `ad` varchar(80) NOT NULL,
  `aciklama` varchar(255) DEFAULT NULL,
  `uyari` varchar(500) DEFAULT NULL,
  `sira` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `urunler`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `urunler` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `kod` varchar(60) NOT NULL,
  `kategori_id` int(10) unsigned DEFAULT NULL,
  `ad` varchar(160) NOT NULL,
  `aciklama` varchar(255) DEFAULT NULL,
  `gorsel` varchar(255) DEFAULT NULL,
  `toptan` decimal(12,2) DEFAULT NULL,
  `perakende` decimal(12,2) DEFAULT NULL,
  `uyari` varchar(500) DEFAULT NULL,
  `renk_secimi` tinyint(1) NOT NULL DEFAULT 0,
  `secenek_ad` varchar(120) DEFAULT NULL,
  `secenek_toptan` decimal(12,2) DEFAULT NULL,
  `secenek_perakende` decimal(12,2) DEFAULT NULL,
  `sira` int(11) NOT NULL DEFAULT 0,
  `aktif` tinyint(1) NOT NULL DEFAULT 1,
  `olusturan_id` int(10) unsigned DEFAULT NULL,
  `olusturma` timestamp NOT NULL DEFAULT current_timestamp(),
  `guncelleme` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `urunler_kod_unique` (`kod`),
  KEY `urun_kategori` (`kategori_id`),
  KEY `urunler_olusturan_id_kullanicilar_id_fk` (`olusturan_id`),
  CONSTRAINT `urunler_kategori_id_urun_kategorileri_id_fk` FOREIGN KEY (`kategori_id`) REFERENCES `urun_kategorileri` (`id`) ON DELETE SET NULL,
  CONSTRAINT `urunler_olusturan_id_kullanicilar_id_fk` FOREIGN KEY (`olusturan_id`) REFERENCES `kullanicilar` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Pazaryeri (ürün kartı, listeleme, kategori önbelleği, ayarlar, işlem kaydı); canlıda ilk kullanımda da oluşur (src/server/db/ensure.ts)
CREATE TABLE IF NOT EXISTS pazaryeri_urunleri (
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
    kdv smallint unsigned NOT NULL DEFAULT 20,
    fiyat decimal(12,2) NULL,
    stok int unsigned NOT NULL DEFAULT 0,
    hazirlik_gun smallint unsigned NOT NULL DEFAULT 3,
    aktif tinyint(1) NOT NULL DEFAULT 1,
    olusturma timestamp NOT NULL DEFAULT current_timestamp(),
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    UNIQUE KEY pazaryeri_urunleri_stok_kodu_unique (stok_kodu),
    UNIQUE KEY pazaryeri_urunleri_barkod_unique (barkod),
    KEY pu_grup (grup_kodu),
    CONSTRAINT pazaryeri_urunleri_urun_id_urunler_id_fk FOREIGN KEY (urun_id) REFERENCES urunler (id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pazaryeri_listelemeleri (
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
    durum enum('taslak','gonderildi','onay','yayinda','hata','pasif') NOT NULL DEFAULT 'taslak',
    olustu tinyint(1) NOT NULL DEFAULT 0,
    batch_id varchar(80) NULL,
    hata text NULL,
    son_fiyat_stok varchar(80) NULL,
    son_gonderim timestamp NULL,
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    UNIQUE KEY pl_urun_site (urun_id, site_id),
    KEY pl_site_durum (site_id, durum),
    CONSTRAINT pazaryeri_listelemeleri_urun_id_pazaryeri_urunleri_id_fk FOREIGN KEY (urun_id) REFERENCES pazaryeri_urunleri (id) ON DELETE CASCADE,
    CONSTRAINT pazaryeri_listelemeleri_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pazaryeri_kategorileri (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pazaryeri_ayarlari (
    site_id int unsigned NOT NULL PRIMARY KEY,
    veri longtext NOT NULL,
    guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    CONSTRAINT pazaryeri_ayarlari_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pazaryeri_islemleri (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
