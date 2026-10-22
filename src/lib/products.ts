// Ürünler skygorselmarket.com'dan alınmıştır (liste fiyatları KDV hariç kabul edilmiştir).
// Gerçek sistemde ürün kataloğu veritabanından gelecek.

export type ProductCategory = "gazebo" | "stand" | "bayrak" | "display" | "oturma" | "aksesuar";

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  listPrice: number;
  image: string;
  /** Baskılı ürünlerde sipariş sonrası tasarım onayı adımı açılır. */
  requiresDesign: boolean;
  leadTimeDays: number;
};

export const categories: { key: ProductCategory | "all"; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "gazebo", label: "Gazebo" },
  { key: "stand", label: "Örümcek Stand" },
  { key: "bayrak", label: "Bayrak" },
  { key: "display", label: "Display" },
  { key: "oturma", label: "Masa & Oturma" },
  { key: "aksesuar", label: "Aksesuar" },
];

export const products: Product[] = [
  {
    id: "18914",
    sku: "SKY-18914",
    name: "3x3 Gazebo Baskılı Tavan 40’lık Çelik İskelet 3 adet Baskılı Tam Duvarlı Model",
    category: "gazebo",
    listPrice: 18950,
    image: "/products/18914.jpg",
    requiresDesign: true,
    leadTimeDays: 7,
  },
  {
    id: "18928",
    sku: "SKY-18928",
    name: "3x3 Gazebo Baskılı Tavan 40’lık Çelik İskeletli Model",
    category: "gazebo",
    listPrice: 11900,
    image: "/products/18928.jpeg",
    requiresDesign: true,
    leadTimeDays: 7,
  },
  {
    id: "19889",
    sku: "SKY-19889",
    name: "3x6 Gazebo Baskılı Tavan 40’lık Çelik İskelet 3 adet Baskılı Tam Duvarlı Model",
    category: "gazebo",
    listPrice: 31850,
    image: "/products/19889.jpg",
    requiresDesign: true,
    leadTimeDays: 7,
  },
  {
    id: "19943",
    sku: "gaz-2x2-1-1-2-1-1-1-2-1-1-1",
    name: "2x3 Gazebo 30’luk Çelik Gövdeli 3 Adet Tam Duvarlı Model",
    category: "gazebo",
    listPrice: 11700,
    image: "/products/19943.jpg",
    requiresDesign: true,
    leadTimeDays: 7,
  },
  {
    id: "16286",
    sku: "SKY-16286",
    name: "300x225 Örümcek Stand Baskılı",
    category: "stand",
    listPrice: 11990,
    image: "/products/16286.webp",
    requiresDesign: true,
    leadTimeDays: 5,
  },
  {
    id: "16281",
    sku: "SKY-16281",
    name: "225x225 Örümcek Stand Baskılı",
    category: "stand",
    listPrice: 10450,
    image: "/products/16281.webp",
    requiresDesign: true,
    leadTimeDays: 5,
  },
  {
    id: "15758",
    sku: "DBYR",
    name: "Damla Bayrak Set",
    category: "bayrak",
    listPrice: 1925,
    image: "/products/15758.png",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "16781",
    sku: "SKY-16781",
    name: "100x400 Beach Flag Bayrak Set",
    category: "bayrak",
    listPrice: 1925,
    image: "/products/16781.jpg",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "16042",
    sku: "DBYR-1",
    name: "Kanat Bayrak 75x325",
    category: "bayrak",
    listPrice: 1925,
    image: "/products/16042.webp",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "16794",
    sku: "SKY-16794",
    name: "Gönder Bayrağı 100x150",
    category: "bayrak",
    listPrice: 605,
    image: "/products/16794.jpg",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "15888",
    sku: "ROLL",
    name: "Roll-Up",
    category: "display",
    listPrice: 1750,
    image: "/products/15888.png",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "15880",
    sku: "XBNR",
    name: "X Banner",
    category: "display",
    listPrice: 1210,
    image: "/products/15880.png",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "16219",
    sku: "SKY-16219",
    name: "60x100cm A Pano",
    category: "display",
    listPrice: 2700,
    image: "/products/16219.png",
    requiresDesign: true,
    leadTimeDays: 3,
  },
  {
    id: "16251",
    sku: "SKY-16251",
    name: "Baskılı Katlanır Sandalye",
    category: "oturma",
    listPrice: 1650,
    image: "/products/16251.jpg",
    requiresDesign: true,
    leadTimeDays: 5,
  },
  {
    id: "16260",
    sku: "SKY-16260",
    name: "Portatif Masa",
    category: "oturma",
    listPrice: 6000,
    image: "/products/16260.webp",
    requiresDesign: false,
    leadTimeDays: 5,
  },
  {
    id: "15658",
    sku: "KTRB",
    name: "Kum Torbası",
    category: "aksesuar",
    listPrice: 650,
    image: "/products/15658.webp",
    requiresDesign: false,
    leadTimeDays: 1,
  },
];

export function getProduct(id: string) {
  return products.find((p) => p.id === id);
}
