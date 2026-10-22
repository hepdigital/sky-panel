"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatTRY } from "@/lib/utils";

type Row = { month: string; alim: number; odeme: number };

export function ActivityChart({ data }: { data: Row[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} barCategoryGap="28%" margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}B`}
          />
          <Tooltip cursor={{ fill: "var(--muted)", radius: 8 }} content={<ChartTooltip />} />
          <Bar dataKey="alim" name="Alım" fill="var(--chart-1)" radius={[6, 6, 6, 6]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="odeme" name="Ödeme" fill="var(--chart-2)" radius={[6, 6, 6, 6]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="tabular ml-auto pl-3 font-semibold text-foreground">{formatTRY(p.value)}</span>
        </p>
      ))}
    </div>
  );
}
