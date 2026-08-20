'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ClipboardList, Download, AlertTriangle, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import {
  updateOrderStatus,
  exportOrdersCsv,
  listOrders,
  batchUpdateOrderStatus,
  getBacklogPendingCount,
  deleteOrder,
  batchDeleteOrders,
  getOrderDeleteImpact,
} from '@/lib/store/orders/actions';
import type {
  OrderWithItems,
  OrderStatus,
  OrderChannel,
  OrderPaymentStatus,
  BatchUpdateOrderStatusResult,
  ListOrdersFilters,
} from '@/lib/store/orders/actions';
import { toast } from '@/lib/toast';
import type { Store, Section } from '@/lib/onboarding/state';
import { Select } from '@/app/components/Select';
import { DatePicker } from '@/app/components/DatePicker';
import { ConfirmModal } from '@/app/components/ConfirmModal';

type Props = {
  store: Store;
  initialOrders: OrderWithItems[];
  initialTotal: number;
  initialPageSize: number;
  sections: Section[];
  /** Pedido resuelto server-side desde `?order=<uuid>` (deep link de WhatsApp, grupo 5). */
  initialDeepLinkOrder: OrderWithItems | null;
  /** 10.4/10.5: pendientes de WhatsApp anteriores a la fecha de vigencia de la política. */
  initialBacklogCount: number;
  waLifecycleEffectiveFrom: string;
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

/** 6.5: el número correlativo es la identificación visible del pedido; el UUID corto queda de respaldo. */
function orderDisplayRef(order: Pick<OrderWithItems, 'id' | 'store_order_number'>): string {
  return order.store_order_number != null ? `#${order.store_order_number}` : `#${order.id.slice(0, 8)}`;
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
  refunded: 'Reembolsado',
  charged_back: 'Contracargo',
  in_mediation: 'En disputa',
  in_process: 'En proceso',
};

const PAYMENT_STATUS_BADGE: Record<OrderPaymentStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-300/80 border-amber-500/15',
  approved: 'bg-green-500/15 text-green-300 border-green-500/20',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/20',
  cancelled: 'bg-red-500/10 text-red-300/60 border-red-500/15',
  refunded: 'bg-purple-500/15 text-purple-300 border-purple-500/20',
  charged_back: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
  in_mediation: 'bg-orange-500/15 text-orange-300 border-orange-500/20',
  in_process: 'bg-sky-500/10 text-sky-300/80 border-sky-500/15',
};

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  whatsapp: 'WhatsApp',
  mercadopago: 'Mercado Pago',
};

const CHANNEL_BADGE: Record<OrderChannel, string> = {
  whatsapp: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20',
  mercadopago: 'bg-[#009EE3]/10 text-[#009EE3]/80 border-[#009EE3]/15',
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

// 6.1: el canal WhatsApp también se distingue a simple vista (antes esta
// función devolvía null y solo Mercado Pago era visible).
function ChannelBadge({ channel }: { channel: OrderChannel }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${CHANNEL_BADGE[channel]}`}>
      {CHANNEL_LABELS[channel]}
    </span>
  );
}

type Filters = {
  search: string;
  status: OrderStatus | 'all';
  channel: OrderChannel | 'all';
  date_from: string;
  date_to: string;
  section_id: string;
  /** 10.4: seteado al tocar el banner de backlog; no tiene control propio en la UI. */
  created_before: string;
};

const DEFAULT_FILTERS: Filters = {
  search: '',
  status: 'all',
  channel: 'all',
  date_from: '',
  date_to: '',
  section_id: '',
  created_before: '',
};

// 7.6: motivos de fallo del lote agrupados por tipo, no listados por id — con
// selecciones grandes ("29 confirmados, 11 no...") es lo único legible.
const BATCH_FAILURE_REASON_LABELS: Record<
  BatchUpdateOrderStatusResult['failed'][number]['reason'],
  string
> = {
  invalid_transition: 'ya estaban en un estado que no permite este cambio',
  not_found: 'no se encontraron',
  stock_insufficient: 'no tenían stock suficiente',
};

function summarizeBatchFailures(failed: BatchUpdateOrderStatusResult['failed']): string {
  const counts = new Map<string, number>();
  for (const f of failed) counts.set(f.reason, (counts.get(f.reason) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([reason, count]) => `${count} ${BATCH_FAILURE_REASON_LABELS[reason as keyof typeof BATCH_FAILURE_REASON_LABELS]}`)
    .join('; ');
}

const BATCH_ACTION_WORDS: Record<'confirmed' | 'cancelled', { noun: string; verb: string }> = {
  confirmed: { noun: 'confirmado', verb: 'confirmarse' },
  cancelled: { noun: 'cancelado', verb: 'cancelarse' },
};

function hasActiveFilters(f: Filters): boolean {
  return (
    f.search !== '' ||
    f.status !== 'all' ||
    f.channel !== 'all' ||
    f.date_from !== '' ||
    f.date_to !== '' ||
    f.section_id !== '' ||
    f.created_before !== ''
  );
}

type OrderDetailModalProps = {
  order: OrderWithItems;
  onClose: () => void;
  onStatusChange: () => void;
  onDeleted: () => void;
};

function OrderDetailModal({ order, onClose, onStatusChange, onDeleted }: OrderDetailModalProps) {
  const [loading, setLoading] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleTransition = async (next: OrderStatus) => {
    setLoading(next);
    setError(null);
    const result = await updateOrderStatus(order.id, next);
    setLoading(null);
    if ('error' in result) {
      if (result.error === 'stock_insufficient') {
        const names = result.details.map((d) => d.productName).join(', ');
        setError(`No hay stock suficiente para revivir este pedido${names ? ` (${names})` : ''}.`);
        return;
      }
      const messages: Record<string, string> = {
        unauthorized: 'No tenés permisos para cambiar este pedido.',
        invalid_transition: 'Transición de estado no permitida.',
        not_found: 'Pedido no encontrado.',
      };
      setError(messages[result.error] ?? 'Error al actualizar el estado.');
      return;
    }
    toast.success('Pedido actualizado');
    // 6.6: confirmar cierra el detalle y vuelve al listado ya actualizado,
    // en vez de dejar el modal abierto.
    onStatusChange();
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    const result = await deleteOrder(order.id);
    if ('error' in result) {
      toast.error(
        result.error === 'unauthorized' ? 'No tenés permisos para borrar este pedido.' : 'Pedido no encontrado.'
      );
      return;
    }
    toast.success('Pedido borrado');
    onDeleted();
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
            <p className="text-xs text-white/40 font-mono">{orderDisplayRef(order)}</p>
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
          {order.status === 'cancelled' && order.cancelled_by === 'system' && (
            <div className="space-y-2">
              <p className="text-xs text-white/40 text-center">
                El sistema canceló este pedido por vencimiento. Si la venta sí ocurrió, podés revivirlo.
              </p>
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => handleTransition('confirmed')}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading === 'confirmed' ? 'Reviviendo...' : 'Revivir pedido'}
              </button>
            </div>
          )}
          {order.status === 'delivered' && (
            <p className="text-xs text-white/40 text-center">
              Este pedido está en estado terminal y no puede modificarse.
            </p>
          )}
          {order.status === 'cancelled' && order.cancelled_by !== 'system' && (
            <p className="text-xs text-white/40 text-center">
              Este pedido está en estado terminal y no puede modificarse.
            </p>
          )}

          {/* 4.1: borrar está disponible para cualquier estado, por fuera de
              las transiciones de status de arriba. */}
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-red-300 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            Borrar pedido
          </button>
        </div>
      </div>

      {/* 4.3: aviso distinto para entregados — bajan los ingresos históricos,
          no es solo "esta acción es irreversible". */}
      <ConfirmModal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="Borrar pedido"
        message={
          order.status === 'delivered'
            ? `Este pedido ya fue entregado. Borrarlo va a bajar tus ingresos históricos en ${formatPrice(order.total_cents)}. La dueña no puede deshacer esto desde el panel.`
            : 'Vas a borrar este pedido. La dueña no puede deshacer esto desde el panel.'
        }
        confirmLabel="Sí, borrar"
        variant="destructive"
      />
    </div>
  );
}

export function OrdersPanel({
  initialOrders,
  initialTotal,
  initialPageSize,
  sections,
  initialDeepLinkOrder,
  initialBacklogCount,
  waLifecycleEffectiveFrom,
}: Props) {
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [total, setTotal] = useState(initialTotal);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // task 5.2/5.3: si la URL trae `?order=<uuid>` (deep link de WhatsApp), ese
  // pedido se resolvió server-side y puede no estar en la página actual.
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(initialDeepLinkOrder);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 7.6: cuando está en true, la selección lógica es "todos los pedidos que
  // coinciden con los filtros vigentes" (no una lista de ids) — `selectedIds`
  // sigue reflejando la página actual, se usa solo para el estado visual del
  // checkbox de cabecera y para poder volver a "solo esta página".
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [batchLoading, setBatchLoading] = useState<OrderStatus | null>(null);
  const [backlogCount, setBacklogCount] = useState(initialBacklogCount);
  // 4.2/4.3: cantidad exacta + desglose de entregados de la selección vigente,
  // resuelto server-side justo antes de mostrar la confirmación de borrado en
  // lote (selectAllMatching puede abarcar más pedidos de los que están cargados).
  const [batchDeleteImpact, setBatchDeleteImpact] = useState<{ total: number; deliveredCount: number } | null>(null);
  const [batchDeleteLoading, setBatchDeleteLoading] = useState(false);

  const isFirstRender = useRef(true);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const fetchOrders = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    const result = await listOrders({
      status: f.status,
      channel: f.channel,
      date_from: f.date_from || undefined,
      date_to: f.date_to || undefined,
      section_id: f.section_id || undefined,
      search: f.search || undefined,
      created_before: f.created_before || undefined,
      page: p,
    });
    setLoading(false);
    if ('error' in result) {
      toast.error('No se pudieron cargar los pedidos');
      return;
    }
    setOrders(result.orders);
    setTotal(result.total);
    setPageSize(result.pageSize);
    // 7.6: cambiar de página o de filtro invalida cualquier selección previa
    // (dejar pedidos seleccionados que ya no se ven es el bug que se evita).
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, []);

  // 12.1/12.2/12.3: los filtros viven en la consulta, no en memoria — cada
  // cambio de filtro o de página vuelve a pedirle al servidor el conjunto
  // ya filtrado y pagina sobre eso.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchOrders(filters, page);
  }, [filters, page, fetchOrders]);

  // Búsqueda con debounce: el texto se escribe libre en `searchInput` y recién
  // después de una pausa entra a `filters.search`, que es lo que dispara la consulta.
  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const refreshBacklogCount = useCallback(async () => {
    const result = await getBacklogPendingCount();
    if ('count' in result) setBacklogCount(result.count);
  }, []);

  const updateFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handleBacklogBannerClick = () => {
    setSearchInput('');
    setFilters({
      ...DEFAULT_FILTERS,
      status: 'pending',
      channel: 'whatsapp',
      created_before: waLifecycleEffectiveFrom,
    });
    setPage(1);
  };

  const handleStatusChange = () => {
    setSelectedOrder(null);
    fetchOrders(filters, page);
    refreshBacklogCount();
  };

  const toggleSelected = (orderId: string) => {
    // Tocar un pedido puntual siempre vuelve a selección "por id": ya no es
    // exacto decir "todos los que coinciden con el filtro" si la dueña acaba
    // de excluir uno a mano.
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const allPageSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o.id));
  const somePageSelected = orders.some((o) => selectedIds.has(o.id));
  // Toda la página está seleccionada y el filtro tiene coincidencias fuera de
  // ella: ahí (y solo ahí) tiene sentido ofrecer "seleccionar todos".
  const canOfferSelectAllMatching = allPageSelected && total > orders.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = !allPageSelected && somePageSelected;
    }
  }, [allPageSelected, somePageSelected]);

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  // 7.6/4.2: la misma selección lógica (ids puntuales o "todos los que
  // coinciden con el filtro") la necesitan tanto el cambio de estado en lote
  // como el borrado en lote — se arma en un solo lugar.
  const buildBatchSelection = (): string[] | { filters: ListOrdersFilters } =>
    selectAllMatching
      ? {
          filters: {
            status: filters.status,
            channel: filters.channel,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
            section_id: filters.section_id || undefined,
            search: filters.search || undefined,
            created_before: filters.created_before || undefined,
          },
        }
      : Array.from(selectedIds);

  const handleBatchAction = async (nextStatus: 'confirmed' | 'cancelled') => {
    if (selectedIds.size === 0) return;
    setBatchLoading(nextStatus);
    const selection = buildBatchSelection();
    const result = await batchUpdateOrderStatus(selection, nextStatus);
    setBatchLoading(null);
    if ('error' in result) {
      toast.error('No tenés permisos para esta acción.');
      return;
    }
    const { updated, failed } = result;
    const { noun, verb } = BATCH_ACTION_WORDS[nextStatus];
    if (failed.length === 0) {
      toast.success(`${updated.length} pedido${updated.length === 1 ? '' : 's'} ${noun}${updated.length === 1 ? '' : 's'}.`);
    } else {
      toast.info(
        `${updated.length} ${noun}${updated.length === 1 ? '' : 's'}, ${failed.length} no ${failed.length === 1 ? 'pudo' : 'pudieron'} ${verb} (${summarizeBatchFailures(failed)}).`
      );
    }
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    fetchOrders(filters, page);
    refreshBacklogCount();
  };

  // 4.2/4.3: antes de mostrar la confirmación, resuelve server-side la
  // cantidad exacta y cuántos son entregados — selectAllMatching puede
  // abarcar pedidos que no están en la página cargada.
  const handleOpenBatchDeleteConfirm = async () => {
    if (selectedIds.size === 0) return;
    setBatchDeleteLoading(true);
    const impact = await getOrderDeleteImpact(buildBatchSelection());
    setBatchDeleteLoading(false);
    if ('error' in impact) {
      toast.error('No tenés permisos para esta acción.');
      return;
    }
    setBatchDeleteImpact(impact);
  };

  const handleConfirmBatchDelete = async () => {
    const result = await batchDeleteOrders(buildBatchSelection());
    setBatchDeleteImpact(null);
    if ('error' in result) {
      toast.error('No tenés permisos para esta acción.');
      return;
    }
    const { deletedCount, failed } = result;
    if (failed.length === 0) {
      toast.success(`${deletedCount} pedido${deletedCount === 1 ? '' : 's'} borrado${deletedCount === 1 ? '' : 's'}.`);
    } else {
      toast.info(`${deletedCount} borrado${deletedCount === 1 ? '' : 's'}, ${failed.length} no se ${failed.length === 1 ? 'encontró' : 'encontraron'}.`);
    }
    setSelectedIds(new Set());
    setSelectAllMatching(false);
    fetchOrders(filters, page);
    refreshBacklogCount();
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportOrdersCsv({
        status: filters.status,
        channel: filters.channel,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        section_id: filters.section_id || undefined,
        search: filters.search || undefined,
        created_before: filters.created_before || undefined,
      });
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1 className="text-xl font-bold text-[#FBF7EC] mb-6">Pedidos</h1>

      {/* 10.4/10.5: banner de backlog — sin botón de descarte, desaparece solo
          cuando no quedan pendientes previos a la fecha de corte. */}
      {backlogCount > 0 && (
        <button
          type="button"
          onClick={handleBacklogBannerClick}
          className="w-full flex items-center gap-3 px-4 py-3 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left hover:bg-amber-500/15 transition-colors cursor-pointer"
        >
          <AlertTriangle size={16} className="text-amber-300 flex-shrink-0" />
          <p className="text-sm text-amber-200 flex-1">
            Tenés {backlogCount} pedido{backlogCount === 1 ? '' : 's'} pendiente{backlogCount === 1 ? '' : 's'} de antes del nuevo sistema de vencimiento. Revisalos para confirmar o cancelar.
          </p>
        </button>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por # de pedido..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/6 border border-white/10 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>

          {/* Status */}
          <div className="w-44">
            <Select
              value={filters.status}
              onChange={(v) => updateFilters({ status: v as Filters['status'] })}
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

          {/* Channel (6.2) */}
          <div className="w-44">
            <Select
              value={filters.channel}
              onChange={(v) => updateFilters({ channel: v as Filters['channel'] })}
              options={[
                { value: 'all', label: 'Todos los canales' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'mercadopago', label: 'Mercado Pago' },
              ]}
              ariaLabel="Filtrar por canal"
            />
          </div>

          {/* Section */}
          {sections.length > 0 && (
            <div className="w-44">
              <Select
                value={filters.section_id}
                onChange={(v) => updateFilters({ section_id: v })}
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
            onChange={(v) => updateFilters({ date_from: v })}
            placeholder="Desde"
            max={filters.date_to || undefined}
            ariaLabel="Fecha desde"
          />
          {/* Date to */}
          <DatePicker
            value={filters.date_to}
            onChange={(v) => updateFilters({ date_to: v })}
            placeholder="Hasta"
            min={filters.date_from || undefined}
            ariaLabel="Fecha hasta"
          />

          {hasActiveFilters(filters) && (
            <button
              type="button"
              onClick={handleClearFilters}
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

      {/* Batch action bar (7.4/7.6) */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-3 rounded-xl bg-white/8 border border-white/15 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs text-white/60">
              {selectAllMatching
                ? `Los ${total} pedidos que coinciden con el filtro están seleccionados.`
                : `${selectedIds.size} seleccionado${selectedIds.size === 1 ? '' : 's'}`}
            </p>
            {selectAllMatching ? (
              <button
                type="button"
                onClick={() => setSelectAllMatching(false)}
                className="text-xs text-[#F5C84B] hover:underline cursor-pointer mt-0.5"
              >
                Solo esta página
              </button>
            ) : canOfferSelectAllMatching ? (
              <button
                type="button"
                onClick={() => setSelectAllMatching(true)}
                className="text-xs text-[#F5C84B] hover:underline cursor-pointer mt-0.5"
              >
                Seleccionar los {total} pedidos que coinciden con el filtro
              </button>
            ) : null}
          </div>
          <button
            type="button"
            disabled={batchLoading !== null}
            onClick={() => handleBatchAction('confirmed')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {batchLoading === 'confirmed' ? 'Confirmando...' : 'Confirmar seleccionados'}
          </button>
          <button
            type="button"
            disabled={batchLoading !== null}
            onClick={() => handleBatchAction('cancelled')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/20 hover:bg-red-500/25 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {batchLoading === 'cancelled' ? 'Cancelando...' : 'Cancelar seleccionados'}
          </button>
          <button
            type="button"
            disabled={batchLoading !== null || batchDeleteLoading}
            onClick={handleOpenBatchDeleteConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-white/60 hover:text-red-300 hover:bg-red-500/10 border border-white/15 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {batchDeleteLoading ? 'Calculando...' : 'Borrar seleccionados'}
          </button>
        </div>
      )}

      {/* 4.2/4.3: cantidad exacta + aviso distinto si la selección incluye
          pedidos entregados (bajan los ingresos históricos). */}
      <ConfirmModal
        open={batchDeleteImpact !== null}
        onClose={() => setBatchDeleteImpact(null)}
        onConfirm={handleConfirmBatchDelete}
        title="Borrar pedidos"
        message={
          batchDeleteImpact
            ? batchDeleteImpact.deliveredCount > 0
              ? `Vas a borrar ${batchDeleteImpact.total} pedido${batchDeleteImpact.total === 1 ? '' : 's'}, de los cuales ${batchDeleteImpact.deliveredCount} ya ${batchDeleteImpact.deliveredCount === 1 ? 'fue entregado' : 'fueron entregados'}. Eso va a bajar tus ingresos históricos. La dueña no puede deshacer esto desde el panel.`
              : `Vas a borrar ${batchDeleteImpact.total} pedido${batchDeleteImpact.total === 1 ? '' : 's'}. La dueña no puede deshacer esto desde el panel.`
            : ''
        }
        confirmLabel="Sí, borrar"
        variant="destructive"
      />

      {/* List */}
      {!loading && orders.length === 0 && !hasActiveFilters(filters) && (
        <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-12 text-center">
          <ClipboardList size={32} className="mx-auto text-white/20 mb-3" />
          <p className="text-sm text-white/40">Todavía no recibiste pedidos.</p>
        </div>
      )}

      {!loading && orders.length === 0 && hasActiveFilters(filters) && (
        <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
          <p className="text-sm text-white/40">Ningún pedido coincide con los filtros aplicados.</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className={`space-y-2 ${loading ? 'opacity-50' : ''}`}>
          {/* 7.6: checkbox de cabecera — selecciona/deselecciona toda la página
              visible; queda indeterminado cuando la selección es parcial. */}
          <div className="flex items-center gap-3 px-4 py-1">
            <input
              ref={headerCheckboxRef}
              type="checkbox"
              checked={allPageSelected}
              onChange={toggleSelectAllPage}
              className="flex-shrink-0 w-4 h-4 cursor-pointer accent-[#F5C84B]"
              aria-label="Seleccionar todos los pedidos de esta página"
            />
            <p className="text-xs text-white/40">Seleccionar todos</p>
          </div>
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-3 bg-white/6 border border-white/10 rounded-xl px-4 py-3"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(order.id)}
                onChange={() => toggleSelected(order.id)}
                className="flex-shrink-0 w-4 h-4 cursor-pointer accent-[#F5C84B]"
                aria-label={`Seleccionar pedido ${orderDisplayRef(order)}`}
              />

              {/* Date + display ref */}
              <div className="flex-shrink-0 w-28">
                <p className="text-xs text-white/60">{formatDate(order.created_at)}</p>
                <p className="text-xs text-white/30 font-mono mt-0.5">{orderDisplayRef(order)}</p>
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

      {/* Pagination controls (12.3) */}
      {total > pageSize && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/8 border border-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Página anterior"
          >
            <ChevronLeft size={14} />
          </button>
          <p className="text-xs text-white/40">Página {page} de {totalPages}</p>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/8 border border-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Página siguiente"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusChange={handleStatusChange}
          onDeleted={handleStatusChange}
        />
      )}
    </div>
  );
}
