import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CustomerQuote } from "@/components/terminal/customer-quote";
import { getMe } from "@/server/auth";
import { getPublicQuote, recordView } from "@/server/quote-flow";

// Müşterinin teklif sayfası: WhatsApp/e-posta ile giden link. Giriş gerekmez; arama motorlarına kapalı.
export const metadata: Metadata = { title: "Fiyat teklifi", robots: { index: false, follow: false } };

async function Quote({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const q = await getPublicQuote(token);
  if (!q) notFound();
  // Personel kendi panelinden açınca "görüldü" sayılmaz
  if (!(await getMe())) await recordView(token);
  return (
    <CustomerQuote
      token={token}
      q={{
        ...q,
        gecerlilik: q.gecerlilik?.toISOString() ?? null,
        yanitTarihi: q.yanitTarihi?.toISOString() ?? null,
      }}
    />
  );
}

export default function CustomerQuotePage({ params }: PageProps<"/t/[token]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-background" />}>
      <Quote params={params} />
    </Suspense>
  );
}
