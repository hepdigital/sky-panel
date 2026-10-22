// Komut satırından personel hesabı açar ya da şifresini sıfırlar (ilk yönetici hesabı için).
// Kullanım: node scripts/kullanici-ekle.mjs <kullanici_adi> "<Ad Soyad>" <yonetici|satis>
// Şifre otomatik üretilir ve yalnızca bir kez ekrana yazılır. Bağlantı: DATABASE_URL ya da .env.local
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import mysql from "mysql2/promise";

const [ad, adSoyad, rol = "satis"] = process.argv.slice(2);
if (!ad || !adSoyad || !["yonetici", "satis"].includes(rol)) {
  console.error('Kullanım: node scripts/kullanici-ekle.mjs <kullanici_adi> "<Ad Soyad>" <yonetici|satis>');
  process.exit(1);
}
const url =
  process.env.DATABASE_URL ??
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length);
if (!url) throw new Error("DATABASE_URL bulunamadı");

// Şifre ve özet uygulamadaki ile aynı biçimde (src/server/auth.ts: scrypt$tuz$anahtar)
const sifre = randomBytes(9).toString("base64url");
const salt = randomBytes(16);
const key = await promisify(scrypt)(sifre, salt, 64);
const hash = `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;

const conn = await mysql.createConnection(url);
const kullaniciAdi = ad.toLowerCase();
const [rows] = await conn.execute("SELECT id FROM kullanicilar WHERE kullanici_adi = ?", [kullaniciAdi]);
if (rows.length) {
  await conn.execute("UPDATE kullanicilar SET sifre_hash = ?, ad_soyad = ?, rol = ?, aktif = 1 WHERE id = ?", [hash, adSoyad, rol, rows[0].id]);
  await conn.execute("DELETE FROM oturumlar WHERE kullanici_id = ?", [rows[0].id]);
  console.log(`Güncellendi: ${kullaniciAdi} (${rol})`);
} else {
  await conn.execute("INSERT INTO kullanicilar (kullanici_adi, ad_soyad, sifre_hash, rol) VALUES (?, ?, ?, ?)", [kullaniciAdi, adSoyad, hash, rol]);
  console.log(`Eklendi: ${kullaniciAdi} (${rol})`);
}
console.log(`Şifre: ${sifre}`);
await conn.end();
