"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Palette, Search, ShoppingBag, Sparkles, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { QtyStepper } from "@/components/ui/qty-stepper";
import { currentCustomer, customerPricing } from "@/lib/mock";
import { unitPrice } from "@/lib/pricing";
import { categories, products, type Product, type ProductCategory } from "@/lib/products";
import { cn, formatTRY } from "@/lib/utils";
import { useCart } from "./cart-context";

export function Catalog() {
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr");
    return products.filter(
      (p) =>
        (category === "all" || p.category === category) &&
        (!q || p.name.toLocaleLowerCase("tr").includes(q) || p.sku.toLocaleLowerCase("tr").includes(q)),
    );
  }, [category, query]);

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6">
      <div className="min-w-0 flex-1">
        {/* Başlık */}
        <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">Ürünler</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fiyatlar <span className="font-semibold text-foreground">{currentCustomer.discountGroup}</span> grubu{" "}
              <span className="font-semibold text-foreground">%{currentCustomer.discountRate}</span> iskontonuz
              uygulanarak gösterilir. Baskı bedeli fiyata dahildir.
            </p>
          </div>
        </div>

        {/* Arama + kategoriler */}
        <div className="sticky top-16 z-20 -mx-4 mt-4 space-y-3 bg-background/85 px-4 pt-1 pb-3 backdrop-blur-md md:top-[76px] md:mx-0 md:px-0">
          <label className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-card px-4 text-sm shadow-card focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı veya stok kodu ara"
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle" className="text-muted-foreground">
                <X className="size-4" />
              </button>
            )}
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar md:mx-0 md:flex-wrap md:px-0">
            {categories.map((c) => {
              const count = c.key === "all" ? products.length : products.filter((p) => p.category === c.key).length;
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                  <span className={cn("text-[11px] font-medium", active ? "opacity-75" : "opacity-60")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ürün ızgarası */}
        {filtered.length ? (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 2xl:grid-cols-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Aramanızla eşleşen ürün bulunamadı.
          </div>
        )}
      </div>

      <CartPanel />
      <FloatingCartBar />
    </div>
  );
}

function ProductCard({ product }: { product: Product }) {
  const { qtyOf, setQty, add } = useCart();
  const qty = qtyOf(product.id);
  const price = unitPrice(product, customerPricing);

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-colors",
        qty ? "border-primary/40" : "border-border/70",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(min-width: 1536px) 22vw, (min-width: 640px) 30vw, 50vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {price.source === "special" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-900 px-2 py-1 text-[10px] font-semibold text-white">
              <Sparkles className="size-3" /> Size özel fiyat
            </span>
          )}
          {product.requiresDesign && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-brand-900 ring-1 ring-black/5">
              <Palette className="size-3" /> Baskılı
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3 md:p-4">
        <p className="text-[11px] font-medium text-muted-foreground">{product.sku}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-10 text-[13px] leading-5 font-semibold md:text-sm">{product.name}</h3>

        <div className="mt-3 flex items-center gap-1.5">
          <span className="tabular text-xs text-muted-foreground line-through">{formatTRY(price.list)}</span>
          <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success">
            %{price.discountRate}
          </span>
        </div>
        <p className="tabular text-lg leading-tight font-bold tracking-tight md:text-xl">{formatTRY(price.net)}</p>
        <p className="text-[11px] text-muted-foreground">KDV hariç · {product.leadTimeDays} iş günü</p>

        <div className="mt-3 pt-0.5">
          {qty ? (
            <QtyStepper value={qty} onChange={(n) => setQty(product.id, n)} size="sm" className="w-full" />
          ) : (
            <button
              type="button"
              onClick={() => add(product.id)}
              className={cn(buttonVariants({ variant: "soft", size: "sm" }), "h-9 w-full")}
            >
              <ShoppingBag /> Sepete ekle
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Geniş ekranlarda sağda sabit duran sepet özeti. */
function CartPanel() {
  const { lines, count, totals, setQty } = useCart();
  return (
    <aside className="sticky top-[92px] hidden h-[calc(100dvh-110px)] w-80 shrink-0 flex-col rounded-2xl border border-border/70 bg-card shadow-card xl:flex">
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 className="text-[15px] font-semibold">Sepetiniz</h2>
        <span className="text-xs text-muted-foreground">{count} ürün</span>
      </div>

      {lines.length ? (
        <ul className="mt-3 flex-1 space-y-1 overflow-y-auto px-3">
          {lines.map(({ product, qty }) => {
            const p = unitPrice(product, customerPricing);
            return (
              <li key={product.id} className="flex gap-3 rounded-xl p-2">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-border">
                  <Image src={product.image} alt="" fill sizes="56px" className="object-contain p-1" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-xs leading-4 font-semibold">{product.name}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <QtyStepper value={qty} onChange={(n) => setQty(product.id, n)} size="sm" className="h-8 w-24 [&_button]:size-8" />
                    <span className="tabular text-xs font-bold">{formatTRY(p.net * qty)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <ShoppingBag className="size-5" />
          </span>
          <p className="mt-3 text-sm font-semibold">Sepetiniz boş</p>
          <p className="mt-1 text-xs text-muted-foreground">Ürün kartlarından ekleme yapabilirsiniz.</p>
        </div>
      )}

      <div className="space-y-1.5 border-t border-border px-5 pt-4 pb-5 text-sm">
        <Row label="Liste toplamı" value={formatTRY(totals.list)} muted />
        <Row label="İskonto" value={`−${formatTRY(totals.discount)}`} className="text-success" />
        <Row label="Ara toplam (KDV hariç)" value={formatTRY(totals.subtotal)} strong />
        <Link
          href="/portal/siparis-ver"
          aria-disabled={!lines.length}
          className={cn(buttonVariants({ size: "lg" }), "mt-3 w-full", !lines.length && "pointer-events-none opacity-50")}
        >
          Siparişi tamamla <ArrowRight />
        </Link>
      </div>
    </aside>
  );
}

/** Mobil / tablet: sepette ürün varken alt kısımda görünen özet çubuğu. */
function FloatingCartBar() {
  const { count, totals } = useCart();
  if (!count) return null;
  return (
    <Link
      href="/portal/siparis-ver"
      className="fixed inset-x-4 bottom-[84px] z-30 flex items-center gap-3 rounded-2xl bg-inverse px-4 py-3 text-inverse-foreground shadow-pop md:inset-x-auto md:right-6 md:bottom-6 md:w-96 xl:hidden"
    >
      <span className="relative grid size-10 place-items-center rounded-xl bg-white/10">
        <ShoppingBag className="size-5" />
        <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-brand-400 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="tabular block text-[15px] font-bold">{formatTRY(totals.subtotal)}</span>
        <span className="block text-[11px] text-white/60">
          KDV hariç · {formatTRY(totals.discount)} iskonto
        </span>
      </span>
      <span className="flex items-center gap-1 text-sm font-semibold">
        Sepet <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
  className,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between", muted && "text-muted-foreground", strong && "pt-1 font-bold", className)}>
      <span className={cn(!strong && "text-xs")}>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
