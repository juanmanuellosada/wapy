'use client';

import { useState, useMemo } from 'react';
import { Search, X, ClipboardList, Download } from 'lucide-react';
import { updateOrderStatus, exportOrdersCsv } from '@/lib/store/orders/actions';
import type { OrderWithItems, OrderStatus, OrderChannel, OrderPaymentStatus } from '@/lib/store/orders/actions';
import { toast } from '@/lib/toast';
import type { Store, Section } from '@/lib/onboarding/state';
import { Select } from '@/app/components/Select';
import { DatePicker } from '@/app/components/DatePicker';

type Props = {
  store: Store;
  initialOrders: OrderWithItems[];
  sections: Section[];
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDateLong(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  delivered: 'Entregado',
};

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  confirmed: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  cancelled: 'bg-red-500/15 text-red-300 border-red-500/20',
  delivered: 'bg-green-500/15 text-green-300 border-green-500/20',
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  pending: 'Pago pendiente',
  approved: 'Pagado',
  rejected: 'Rechazado',
  cancelled: 'Pago cancelado',
};

const PAYMENT_STATUS_BADGE: Record<OrderPaymentStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-300/80 border-amber-500/15',
  approved: 'bg-green-500/15 text-green-300 border-green-500/20',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/20',
  cancelled: 'bg-red-500/10 text-red-300/60 border-red-500/15',
};

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  whatsapp: 'WhatsApp',
  mercadopago: 'Mercado Pago',
};

function PaymentStatusBadge({ paymentStatus, channel }: { paymentStatus: OrderPaymentStatus; channel: OrderChannel }) {
  // Only show payment badge for MP orders or when payment status is non-trivially pending
  if (channel === 'whatsapp' && paymentStatus === 'pending') return null;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PAYMENT_STATUS_BADGE[paymentStatus]}`}
    >
      {PAYMENT_STATUS_LABELS[paymentStatus]}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: OrderChannel }) {
  if (channel === 'whatsapp') return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[#009EE3]/10 text-[#009EE3]/80 border-[#009EE3]/15">
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

type Filters = {
  search: string;
  status: OrderStatus | 'all';
  date_from: string;
  date_to: string;
  section_id: string;
};

const DEFAULT_FILTERS: Filters = {
  search: '',
  status: 'all',
  date_from: '',
  date_to: '',
  section_id: '',
};

function hasActiveFilters(f: Filters): boolean {
  return (
    f.search !== '' ||
    f.status !== 'all' ||
    f.date_from !== '' ||
    f.date_to !== '' ||
    f.section_id !== ''
  );
}

function applyFilters(orders: OrderWithItems[], f: Filters): OrderWithItems[] {
  let result = orders;

  if (f.status !== 'all') {
    result = result.filter((o) => o.status === f.status);
  }
  if (f.date_from) {
    const from = new Date(f.date_from).getTime();
    result = result.filter((o) => new Date(o.created_at).getTime() >= from);
  }
  if (f.date_to) {
    const to = new Date(f.date_to + 'T23:59:59').getTime();
    result = result.filter((o) => new Date(o.created_at).getTime() <= to);
  }
  if (f.section_id) {
    result = result.filter((o) =>
      o.items.some((item) => item.section_id === f.section_id)
    );
  }
  if (f.search.trim()) {
    const s = f.search.trim().toLowerCase().replace(/^#/, '');
    result = result.filter((o) => o.id.toLowerCase().startsWith(s));
  }

  return result;
}

type OrderDetailModalProps = {
  order: OrderWithItems;
  onClose: () => void;
  onStatusChange: (order: OrderWithItems) => void;
};

function OrderDetailModal({ order, onClose, onStatusChange }: OrderDetailModalProps) {
  const [loading, setLoading] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTransition = async (next: OrderStatus) => {
    setLoading(next);
    setError(null);
    const result = await updateOrderStatus(order.id, next);
    setLoading(null);
    if ('error' in result) {
      const messages: Record<string, string> = {
        unauthorized: 'No tenés permisos para cambiar este pedido.',
        invalid_transition: 'Transición de estado no permitida.',
        not_found: 'Pedido no encontrado.',
      };
      setError(messages[result.error] ?? 'Error al actualizar el estado.');
      return;
    }
    onStatusChange(result.order);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-lg bg-[#16222E] border border-white/15 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-white/10 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-white/40 font-mono">#{order.id.slice(0, 8)}</p>
            <p className="text-sm text-white/60 mt-0.5">{formatDateLong(order.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <ChannelBadge channel={order.channel} />
            <StatusBadge status={order.status} />
            <PaymentStatusBadge paymentStatus={order.payment_status} channel={order.channel} />
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {order.notes && (
            <p className="text-xs text-white/50">{order.notes}</p>
          )}

          {/* Items */}
          <div className="space-y-2">
            {order.items.map((item) => {
              // 6.2 Use snapshot price (price_at_purchase), not the live unit_price_cents.
              // This ensures historical orders don't change if the owner edits prices later.
              const snapshotPrice = item.price_at_purchase;
              return (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-white/5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[#FBF7EC]">{item.product_name}</p>
                    {/* 6.1 Show variant label from snapshot */}
                    {item.variant_label && (
                      <p className="text-xs text-white/50 mt-0.5">{item.variant_label}</p>
                    )}
                    {item.section_name && (
                      <p className="text-xs text-white/40 mt-0.5">{item.section_name}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-white/50">
                      {item.quantity} × {formatPrice(snapshotPrice)}
                    </p>
                    <p className="text-sm text-[#FBF7EC] font-medium">
                      {formatPrice(snapshotPrice * item.quantity)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm font-semibold text-white/70">Total</p>
            <p className="text-base font-bold text-[#F5C84B]">{formatPrice(order.total_cents)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-3 border-t border-white/10">
          {error && (
            <p className="text-xs text-red-300 mb-3">{error}</p>
          )}
          {order.status === 'pending' && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleTransition('confirmed')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading === 'confirmed' ? 'Confirmando...' : 'Confirmar pedido'}
              </button>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleTransition('cancelled')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading === 'cancelled' ? 'Cancelando...' : 'Cancelar'}
              </button>
            </div>
          )}
          {order.status === 'confirmed' && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleTransition('delivered')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-500/15 text-green-300 border border-green-500/20 hover:bg-green-500/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading === 'delivered' ? 'Guardando...' : 'Marcar entregado'}
              </button>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleTransition('cancelled')}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading === 'cancelled' ? 'Cancelando...' : 'Cancelar'}
              </button>
            </div>
          )}
          {(order.status === 'delivered' || order.status === 'cancelled') && (
            <p className="text-xs text-white/40 text-center">
              Este pedido está en estado terminal y no puede modificarse.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrdersPanel({ initialOrders, sections }: Props) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => applyFilters(orders, filters), [orders, filters]);

  const handleStatusChange = (updated: OrderWithItems) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setSelectedOrder(updated);
  };

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportOrdersCsv(filters);
      if ('error' in result) {
        if (result.error === 'empty') {
          toast.info('No hay pedidos para exportar');
        } else {
          toast.error('No se pudo exportar el CSV');
        }
        return;
      }
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `pedidos-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('CSV exportado');
    } catch {
      toast.error('No se pudo exportar el CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Pedidos</h1>

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Buscar por #id..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>

          {/* Status */}
          <div className="w-44">
            <Select
              value={filters.status}
              onChange={(v) => setFilter('status', v as Filters['status'])}
              options={[
                { value: 'all', label: 'Todos los estados' },
                { value: 'pending', label: 'Pendientes' },
                { value: 'confirmed', label: 'Confirmados' },
                { value: 'delivered', label: 'Entregados' },
                { value: 'cancelled', label: 'Cancelados' },
              ]}
              ariaLabel="Filtrar por estado"
            />
          </div>

          {/* Section */}
          {sections.length > 0 && (
            <div className="w-44">
              <Select
                value={filters.section_id}
                onChange={(v) => setFilter('section_id', v)}
                options={[
                  { value: '', label: 'Todas las secciones' },
                  ...sections.map((s) => ({ value: s.id, label: s.name })),
                ]}
                ariaLabel="Filtrar por sección"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Date from */}
          <DatePicker
            value={filters.date_from}
            onChange={(v) => setFilter('date_from', v)}
            placeholder="Desde"
            max={filters.date_to || undefined}
            ariaLabel="Fecha desde"
          />
          {/* Date to */}
          <DatePicker
            value={filters.date_to}
            onChange={(v) => setFilter('date_to', v)}
            placeholder="Hasta"
            min={filters.date_from || undefined}
            ariaLabel="Fecha hasta"
          />

          {hasActiveFilters(filters) && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 border border-white/10 transition-colors cursor-pointer"
            >
              <X size={12} />
              Limpiar filtros
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:text-white hover:bg-white/8 border border-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            {exporting ? (
              <span className="w-3 h-3 rounded-full border border-white/40 border-t-white/80 animate-spin" />
            ) : (
              <Download size={12} />
            )}
            Exportar CSV
          </button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 && orders.length === 0 && (
        <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-12 text-center">
          <ClipboardList size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/40">Todavía no recibiste pedidos.</p>
        </div>
      )}

      {filtered.length === 0 && orders.length > 0 && (
        <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
          <p className="text-sm text-white/40">Ningún pedido coincide con los filtros aplicados.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 bg-white/6 border border-white/10 rounded-xl px-4 py-3"
            >
              {/* Date + id */}
              <div className="flex-shrink-0 w-28">
                <p className="text-xs text-white/60">{formatDate(order.created_at)}</p>
                <p className="text-xs text-white/30 font-mono mt-0.5">#{order.id.slice(0, 8)}</p>
              </div>

              {/* Items count */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/60">
                  {order.items.length} {order.items.length === 1 ? 'producto' : 'productos'}
                </p>
              </div>

              {/* Total */}
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-semibold text-[#F5C84B]">
                  {formatPrice(order.total_cents)}
                </p>
              </div>

              {/* Status + payment */}
              <div className="flex-shrink-0 hidden sm:flex items-center gap-1.5 flex-wrap">
                <StatusBadge status={order.status} />
                <PaymentStatusBadge paymentStatus={order.payment_status} channel={order.channel} />
                <ChannelBadge channel={order.channel} />
              </div>

              {/* Ver button */}
              <button
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/8 text-white/70 hover:text-white hover:bg-white/15 border border-white/10 transition-colors cursor-pointer"
              >
                Ver
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
