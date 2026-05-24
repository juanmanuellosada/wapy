'use client';

import { useState, useTransition } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getOrderStats } from '@/lib/store/orders/actions';
import type { OrderStatsRange, OrderStatsResult } from '@/lib/store/orders/actions';

type Props = {
  accentColor: string;
  initialStats: OrderStatsResult;
  initialRange: OrderStatsRange;
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatCompact(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function hexWithOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function generateDonutColors(baseHex: string, count: number): string[] {
  const opacities = [1, 0.75, 0.55, 0.38, 0.25];
  return Array.from({ length: count }, (_, i) => hexWithOpacity(baseHex, opacities[i] ?? 0.2));
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number; name?: string }>;
  label?: string;
};

function AreaTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E1820] backdrop-blur-md px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#FBF7EC]">{formatPrice(payload[0].value)}</p>
    </div>
  );
}

function BarTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E1820] backdrop-blur-md px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-sm font-semibold text-[#FBF7EC]">{payload[0].value} unidades</p>
    </div>
  );
}

type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { count: number } }>;
  total: number;
};

function PieTooltip({ active, payload, total }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const count = item.payload?.count ?? 0;
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-xl border border-white/10 bg-[#0E1820] backdrop-blur-md px-3 py-2 shadow-xl">
      <p className="text-xs text-white/50 mb-1">{item.name}</p>
      <p className="text-sm font-semibold text-[#FBF7EC]">
        {count} pedidos · {pct}%
      </p>
    </div>
  );
}

const RANGE_LABELS: Record<OrderStatsRange, string> = {
  '30d': 'Últimos 30 días',
  '90d': 'Últimos 90 días',
  ytd: 'Este año',
};

export function OrdersStats({ accentColor, initialStats, initialRange }: Props) {
  const [stats, setStats] = useState<OrderStatsResult>(initialStats);
  const [range, setRange] = useState<OrderStatsRange>(initialRange);
  const [isPending, startTransition] = useTransition();

  const handleRangeChange = (newRange: OrderStatsRange) => {
    setRange(newRange);
    startTransition(async () => {
      const result = await getOrderStats(newRange);
      if (!('error' in result)) {
        setStats(result);
      }
    });
  };

  const { kpis, revenue_by_day, top_products, orders_by_section } = stats;

  const isEmpty = kpis.order_count === 0;

  const donutColors = generateDonutColors(accentColor, orders_by_section.length);
  const donutTotal = orders_by_section.reduce((s, d) => s + d.count, 0);

  const gradientId = 'revenueGradient';

  return (
    <div className="mb-8 space-y-6">
      {/* Header row with range selector */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Métricas</h2>
        <div className="flex items-center gap-1">
          {isPending && (
            <span className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/60 animate-spin mr-2" />
          )}
          {(['30d', '90d', 'ytd'] as OrderStatsRange[]).map((r) => (
            <button
              key={r}
              type="button"
              disabled={isPending}
              onClick={() => handleRangeChange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                range === r
                  ? 'bg-white/15 text-[#FBF7EC] border border-white/20'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/8 border border-transparent'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-6 py-10 text-center">
          <p className="text-sm text-white/50 leading-relaxed">
            Todavía no recibiste pedidos. Cuando tu primer cliente compre, vas a ver acá los gráficos y métricas.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-2xl font-bold text-[#FBF7EC]">{formatPrice(kpis.revenue_cents)}</p>
              <p className="text-xs text-white/40 mt-1">Ingresos · confirmados o entregados</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-2xl font-bold text-[#FBF7EC]">{kpis.order_count}</p>
              <p className="text-xs text-white/40 mt-1">Pedidos · en el período</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-2xl font-bold text-[#FBF7EC]">{formatPrice(kpis.avg_ticket_cents)}</p>
              <p className="text-xs text-white/40 mt-1">Ticket promedio · por pedido</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-2xl font-bold text-[#FBF7EC]">
                {(kpis.confirmation_rate * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-white/40 mt-1">Tasa de confirmación · confirmados / total</p>
            </div>
          </div>

          {/* Area chart */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 pt-4 pb-2">
            <p className="text-xs font-medium text-white/50 mb-4">Ingresos por día</p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenue_by_day} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={accentColor} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  tickFormatter={(v: string) => {
                    const [, m, d] = v.split('-');
                    return `${d}/${m}`;
                  }}
                  interval={Math.floor(revenue_by_day.length / 6)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  tickFormatter={(v: number) => formatCompact(v)}
                  width={64}
                />
                <Tooltip content={<AreaTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                <Area
                  type="monotone"
                  dataKey="cents"
                  stroke={accentColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: accentColor, stroke: '#16222E', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bar + Donut row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Bar chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 pt-4 pb-2">
              <p className="text-xs font-medium text-white/50 mb-4">Productos más vendidos</p>
              {top_products.length === 0 ? (
                <p className="text-xs text-white/30 py-6 text-center">Sin datos</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={top_products}
                    layout="vertical"
                    margin={{ top: 0, right: 4, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                      width={90}
                      tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 12) + '…' : v)}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="units" fill={accentColor} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Donut chart */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 pt-4 pb-2 flex flex-col">
              <p className="text-xs font-medium text-white/50 mb-4">Pedidos por sección</p>
              {orders_by_section.length === 0 ? (
                <p className="text-xs text-white/30 py-6 text-center">Sin datos</p>
              ) : (
                <div className="flex-1 flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={orders_by_section}
                        dataKey="count"
                        nameKey="section_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {orders_by_section.map((_, i) => (
                          <Cell key={i} fill={donutColors[i] ?? hexWithOpacity(accentColor, 0.2)} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip total={donutTotal} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-white/30 -mt-10 mb-6 font-medium">
                    {donutTotal} total
                  </p>
                  {/* Legend */}
                  <div className="w-full space-y-1 mt-2">
                    {orders_by_section.map((s, i) => (
                      <div key={s.section_name} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: donutColors[i] ?? accentColor }}
                        />
                        <span className="text-xs text-white/50 truncate flex-1">{s.section_name}</span>
                        <span className="text-xs text-white/30">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
