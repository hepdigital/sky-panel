import "server-only";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Bağlantı ilk kullanımda kurulur (derleme sırasında veritabanı gerekmez)
let instance: MySql2Database<typeof schema> | null = null;

export function db() {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tanımlı değil");
    // Zamanlar UTC tutulur: Drizzle tarihleri UTC yazar/okur; veritabanının NOW()/varsayılanları da aynı saati versin
    const pool = mysql.createPool({ uri: url, connectionLimit: 5, timezone: "Z" });
    pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
    instance = drizzle(pool, { schema, mode: "default" });
  }
  return instance;
}

export { schema };
