const fs = require("fs");
const path = require("path");
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(path.join(__dirname, "startup.log"), line); } catch {}
  console.log(msg);
};
// Ayarlar ve yüklenen dosyalar dağıtımlar arasında kalıcı klasörde: ~/skypanel/.env ve ~/skypanel/yuklemeler
// Ev dizini uygulamanın yolundan bulunur (Hostinger'ın Node başlatıcısında HOME güvenilir değil)
const userHome = (__dirname.match(/^\/home\/[^/]+/) || [])[0] || require("os").homedir();
const home = path.join(userHome, "skypanel");
try {
  process.loadEnvFile(path.join(home, ".env"));
  log(`Ayarlar yüklendi: ${path.join(home, ".env")} · veritabanı ${process.env.DATABASE_URL ? "tanımlı" : "YOK"}`);
} catch (e) {
  log(`Ayar dosyası okunamadı (${path.join(home, ".env")}): ${e.message}`);
}
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(home, "yuklemeler");
process.env.HOSTNAME = process.env.BIND_HOST || "0.0.0.0";
process.env.NODE_ENV = "production";
log(`Başlatılıyor · node ${process.version} · PORT=${process.env.PORT} · ${__dirname}`);
process.on("uncaughtException", (e) => { log(`HATA: ${(e && e.stack) || e}`); process.exit(1); });
process.on("unhandledRejection", (e) => log(`HATA (promise): ${(e && e.stack) || e}`));
try {
  require("./next-server.js");
} catch (e) {
  log(`HATA (başlatma): ${(e && e.stack) || e}`);
  throw e;
}
