"use client";

import { createContext, useContext } from "react";
import { roles, type Role } from "@/lib/admin-mock";

/** Oturumdaki personel (sunucudan gelir) */
/** openTasks: bana atanan açık görev sayısı (menü sayacı) */
export type PanelUser = { id: number; adSoyad: string; kullaniciAdi: string; rol: "yonetici" | "satis" | "personel"; openTasks: number };

type RoleValue = { role: Role; me: PanelUser; user: { key: Role; label: string; user: string; initials: string } };

const RoleContext = createContext<RoleValue | null>(null);

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toLocaleUpperCase("tr"))
    .join("");

/** Rol oturumdaki kullanıcıdan gelir: yönetici → admin, satışçı → sales, personel → staff (menü ve ekran izinleri bu anahtarlarla çalışır) */
export function RoleProvider({ me, children }: { me: PanelUser; children: React.ReactNode }) {
  const role: Role = me.rol === "yonetici" ? "admin" : me.rol === "satis" ? "sales" : "staff";
  const label = roles.find((r) => r.key === role)!.label;
  return <RoleContext.Provider value={{ role, me, user: { key: role, label, user: me.adSoyad, initials: initialsOf(me.adSoyad) } }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}
