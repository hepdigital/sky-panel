// Hazır gazebo ürünleri: modüler yapılandırmanın sabit bir kurulumu (ölçü, iskelet, tavan, renk, duvarlar).
// Teklife eklenince modüler gazebo gibi fiyatlanır ve 3D'de görünür; satışçı isterse açıp değiştirebilir.
// Şimdilik ürün yok; eklendiğinde teklif ekranının üst menüsünde "Hazır gazebolar" sekmesi kendiliğinden görünür.
// (İleride ürünler panelden, veritabanından gelecek.)
import type { Gazebo } from "@/lib/terminal/calc";

export type ReadyGazebo = { id: string; name: string; desc: string; gazebo: Gazebo };

export const READY_GAZEBOS: ReadyGazebo[] = [];
