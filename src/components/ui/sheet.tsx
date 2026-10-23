"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE = "(max-width: 767px)";
/** Bu kadar (px) aşağı çekilirse ya da hızlı fırlatılırsa kapanır */
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 0.6; // px/ms
const OUT_MS = 220;

/**
 * Mobilde alttan açılan panel; masaüstünde ortalanmış pencere.
 * Mobilde uygulama gibi: tutamak/başlıktan, içerik en üstteyken içerikten de aşağı çekince kapanır.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Açılış: bir sonraki karede yukarı kayarak gelir
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => {
      cancelAnimationFrame(id);
      setShown(false);
    };
  }, [open]);

  // Aşağı çekerek kapatma (yalnızca mobil)
  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let v = 0;
    let dy = 0;
    let active = false;
    let fromHandle = false;
    let decided = false;

    const set = (y: number, animate: boolean) => {
      el.style.transition = animate ? `transform ${OUT_MS}ms cubic-bezier(.2,.8,.2,1)` : "none";
      el.style.transform = y ? `translateY(${y}px)` : "";
      if (backdrop.current) {
        backdrop.current.style.transition = animate ? `opacity ${OUT_MS}ms` : "none";
        backdrop.current.style.opacity = String(Math.max(0, 1 - y / (el.offsetHeight || 1)));
      }
    };
    const onStart = (e: TouchEvent) => {
      if (!window.matchMedia(MOBILE).matches || e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      fromHandle = !!t.closest("[data-sheet-handle]");
      // İçerikten başlayan çekme yalnızca içerik en üstteyken; kaydırılabilir iç alanlarda (yatay listeler vb.) değil
      if (!fromHandle && el.scrollTop > 0) return;
      active = true;
      decided = fromHandle;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      dy = 0;
      v = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const y = e.touches[0].clientY;
      const d = y - startY;
      if (!decided) {
        // İlk hareket yukarıysa normal kaydırma; aşağıysa sürükleme
        if (Math.abs(d) < 6) return;
        if (d < 0 || el.scrollTop > 0) {
          active = false;
          return;
        }
        decided = true;
      }
      dy = Math.max(0, d);
      if (e.cancelable) e.preventDefault();
      // Son hareketin hızı (px/ms): hızlı fırlatma kısa çekmede de kapatır
      v = (y - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = y;
      lastT = e.timeStamp;
      set(dy, false);
    };
    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      if (!decided) return;
      const fresh = e.timeStamp - lastT < 100;
      if (dy > CLOSE_DISTANCE || (fresh && v > CLOSE_VELOCITY && dy > 20)) {
        set(el.offsetHeight, true);
        setTimeout(() => closeRef.current(), OUT_MS);
      } else set(0, true);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" onClick={onClose}>
      <div ref={backdrop} className={cn("absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200", shown ? "opacity-100" : "opacity-0")} />
      <div
        ref={panel}
        role="dialog"
        aria-modal
        className={cn(
          "relative max-h-[88dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] md:rounded-3xl md:pt-5 md:transition-none",
          shown ? "translate-y-0" : "max-md:translate-y-full",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tutamak + başlık: buradan her zaman aşağı çekilebilir */}
        <div data-sheet-handle className="sticky top-0 z-10 -mx-5 bg-card px-5 pt-3 md:static md:mx-0 md:bg-transparent md:p-0">
          <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-border md:hidden" />
          {title && (
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">{title}</h3>
              <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-muted" aria-label="Kapat">
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
