"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { Capture } from "@/modules/gazebo3d/mastertent/viewer";
import { ViewerBoundary } from "@/modules/gazebo3d/mastertent/viewer-boundary";
import { cfgKey, imgSrc, type Gazebo } from "@/lib/terminal/calc";
import { viewerInput } from "@/modules/gazebo/viewer-map";

// 3D görüntüleyici yalnızca tarayıcıda ve sonradan yüklenir (three.js sayfanın ilk yükünü büyütmez)
const Viewer = dynamic(() => import("@/modules/gazebo3d/mastertent/viewer"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted-foreground">3D model yükleniyor…</div>,
});

/** Sağ-arka çapraz açı (sol-ön varsayılan açıyla birlikte dört kenarın hepsi görünür) */
const REAR = [4.4, 1.7, -5.6].map((v, _, a) => v / Math.hypot(...a));

/** İki çapraz açıdan görüntü alan fonksiyon: [sol-ön, sağ-arka] */
export type CaptureViews = () => string[];

export function Gazebo3D({ draft, onCaptureReady }: { draft: Gazebo; onCaptureReady: (fn: CaptureViews | null) => void }) {
  // Girdiler kurulum değişmedikçe aynı nesne kalır: model ve duvarlar gereksiz yere yeniden kurulmaz
  const key = cfgKey(draft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => viewerInput(draft), [key]);
  const register = useMemo(
    () => (capture: Capture | null) => onCaptureReady(capture ? () => [capture().url, capture(REAR).url] : null),
    [onCaptureReady],
  );
  return (
    // Seçenekler aşağıda düzenlenirken model görünür kalsın: üst çubuğun altında yapışkan, yüksekliği ekrana göre sınırlı
    <div className="sticky top-16 z-20 -mx-4 bg-card px-4 pb-3 md:top-[76px] md:-mx-5 md:px-5">
      <div className="relative h-[34vh] min-h-[220px] w-full overflow-hidden rounded-2xl bg-[#f4f4f4] ring-1 ring-border sm:h-[40vh] sm:max-h-[420px]">
        <ViewerBoundary
          fallback={
            <div className="relative size-full">
              <Image src={imgSrc(`r:${draft.size}`)} alt="" fill sizes="600px" className="object-contain p-6" />
            </div>
          }
        >
          <Viewer {...input} curtainsOpen registerCapture={register} />
        </ViewerBoundary>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground shadow-card">
          Sürükleyerek çevirin
        </span>
      </div>
    </div>
  );
}
