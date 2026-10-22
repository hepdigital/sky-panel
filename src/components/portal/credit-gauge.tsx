"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatTRY } from "@/lib/utils";

export function CreditGauge({ used, limit }: { used: number; limit: number }) {
  const available = Math.max(limit - used, 0);
  const pct = Math.round((used / limit) * 100);
  const data = [
    { name: "Kullanılan", value: used },
    { name: "Kullanılabilir", value: available },
  ];

  return (
    <div className="relative mx-auto aspect-[2/1] w-full max-w-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={180}
            endAngle={0}
            cx="50%"
            cy="100%"
            innerRadius="150%"
            outerRadius="196%"
            cornerRadius={8}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="var(--chart-1)" />
            <Cell fill="var(--chart-2)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-[11px] font-medium text-muted-foreground">Kullanılabilir limit</p>
        <p className="tabular text-xl font-bold tracking-tight">{formatTRY(available)}</p>
        <p className="text-[11px] text-muted-foreground">%{pct} kullanıldı</p>
      </div>
    </div>
  );
}
