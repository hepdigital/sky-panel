import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const tryFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tryWhole = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

/** whole: kuruşsuz gösterim (dar alanlar için). */
export function formatTRY(value: number, opts?: { whole?: boolean }) {
  return (opts?.whole ? tryWhole : tryFormatter).format(value);
}

/** Tarih/saat her zaman Türkiye saatiyle: sunucu (UTC) ve tarayıcı aynı metni üretir */
export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", ...opts }).format(new Date(iso));
}
