"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { initialJobs, nextStage, stations, type Job, type JobItem, type StationKey } from "@/lib/station-data";

type Store = {
  ready: boolean;
  jobs: Job[];
  start: (jobId: string, s: StationKey) => void;
  /** Kalemi bu istasyonda tamamlandı / geri alındı olarak işaretler. */
  toggleItem: (jobId: string, itemId: string, s: StationKey) => void;
  sendForApproval: (jobId: string) => void;
  approve: (jobId: string) => void;
  ship: (jobId: string, note: string) => void;
  block: (jobId: string, s: StationKey, reason: string) => void;
  resume: (jobId: string, s: StationKey) => void;
  reset: () => void;
};

const Ctx = createContext<Store | null>(null);
const KEY = "sky-station-jobs-v2";

const clock = () => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date());

function hydrate(list: Job[]): Job[] {
  // Örnek veride aktif işler ~25 dk önce başlamış gibi gösterilir.
  const ago = Date.now() - 25 * 60_000;
  return list.map((j) => ({
    ...j,
    startedAt: Object.fromEntries(j.active.map((s) => [s, j.startedAt[s] ?? ago])),
  }));
}

/** İstasyonda kalem kalmadıysa işi o istasyon için kapatır. */
function settle(j: Job, s: StationKey): Job {
  if (j.items.some((i) => i.stage === s)) return j;
  return {
    ...j,
    active: j.active.filter((x) => x !== s),
    doneToday: j.doneToday.includes(s) ? j.doneToday : [...j.doneToday, s],
  };
}

/**
 * Prototipte işler tarayıcıda tutulur; bir istasyonda tamamlanan kalem diğer istasyonun ekranında görünür.
 * Gerçek sistemde her hareket sunucuya yazılır ve tüm ekranlar anlık güncellenir.
 */
export function StationProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let list = initialJobs;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) list = JSON.parse(raw);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yalnızca ilk yüklemede okunur
    setJobs(hydrate(list));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(jobs));
    } catch {}
  }, [jobs, ready]);

  const update = (id: string, fn: (j: Job) => Job) => setJobs((list) => list.map((j) => (j.id === id ? fn(j) : j)));
  const log = (j: Job, stage: Job["log"][number]["stage"], action: string, by: string): Job => ({
    ...j,
    log: [...j.log, { stage, action, by, at: clock() }],
  });

  const value: Store = {
    ready,
    jobs,

    start: (jobId, s) =>
      update(jobId, (j) =>
        log({ ...j, active: [...new Set([...j.active, s])], startedAt: { ...j.startedAt, [s]: Date.now() } }, s, "Başlandı", stations[s].operator),
      ),

    toggleItem: (jobId, itemId, s) =>
      update(jobId, (j) => {
        const it = j.items.find((i) => i.id === itemId);
        if (!it) return j;
        const next = nextStage(it, s);
        const isDone = it.done.includes(s);
        // Geri alma: bir sonraki istasyon kalem üzerinde henüz işlem yapmadıysa
        const canUndo = isDone && (it.stage === s || (it.stage === next && !(next in stations && it.done.includes(next as StationKey))));
        let changed: JobItem;
        if (!isDone && it.stage === s) {
          const moves = s === "print" || s === "production";
          changed = { ...it, done: [...it.done, s], stage: moves ? next : s };
        } else if (canUndo) {
          changed = { ...it, done: it.done.filter((x) => x !== s), stage: s };
        } else return j;
        const updated = { ...j, items: j.items.map((i) => (i.id === itemId ? changed : i)) };
        const action = `${it.name}: ${changed.done.includes(s) ? stations[s].itemDone : "geri alındı"}`;
        return settle(log(updated, s, action, stations[s].operator), s);
      }),

    sendForApproval: (jobId) =>
      update(jobId, (j) => {
        const updated = {
          ...j,
          revision: undefined,
          items: j.items.map((i) => (i.stage === "design" && i.done.includes("design") ? { ...i, stage: "customer_review" as const } : i)),
        };
        return settle(log(updated, "design", "Tüm tasarımlar müşteri onayına gönderildi", stations.design.operator), "design");
      }),

    approve: (jobId) =>
      update(jobId, (j) =>
        log(
          {
            ...j,
            items: j.items.map((i) => (i.stage === "customer_review" ? { ...i, stage: i.route[i.route.indexOf("design") + 1] ?? "shipped" } : i)),
          },
          "customer_review",
          "Müşteri tüm tasarımları onayladı",
          j.customer,
        ),
      ),

    ship: (jobId, note) =>
      update(jobId, (j) =>
        settle(
          log({ ...j, items: j.items.map((i) => (i.stage === "shipping" ? { ...i, stage: "shipped" as const } : i)) }, "shipping", `Sevk edildi · ${note}`, stations.shipping.operator),
          "shipping",
        ),
      ),

    block: (jobId, s, reason) =>
      update(jobId, (j) => log({ ...j, blocked: { ...j.blocked, [s]: reason } }, s, `Sorun bildirildi: ${reason}`, stations[s].operator)),

    resume: (jobId, s) =>
      update(jobId, (j) => {
        const blocked = { ...j.blocked };
        delete blocked[s];
        return log(
          { ...j, blocked, active: [...new Set([...j.active, s])], startedAt: { ...j.startedAt, [s]: j.startedAt[s] ?? Date.now() } },
          s,
          "Devam edildi",
          stations[s].operator,
        );
      }),

    reset: () => setJobs(hydrate(initialJobs)),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStations() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStations must be used inside StationProvider");
  return ctx;
}
