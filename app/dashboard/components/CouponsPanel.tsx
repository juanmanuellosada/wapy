'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Loader2, CheckCircle, BadgePercent } from 'lucide-react';
import { saveCoupon, deleteCoupon, toggleCoupon } from '@/lib/store/coupons/actions';
import { isCouponValid } from '@/lib/store/coupons/validity';
import type { Coupon, SaveCouponInput } from '@/lib/store/coupons/actions';
import type { Store } from '@/lib/onboarding/state';
import { DatePicker } from '@/app/components/DatePicker';

type Props = {
  store: Store;
  initialCoupons: Coupon[];
};

function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Returns the display status label and color class for a coupon. */
function getCouponStatus(coupon: Coupon): { label: string; color: string } {
  if (!coupon.is_active) return { label: 'Inactivo', color: 'text-white/40' };
  if (!isCouponValid(coupon.expires_at)) return { label: 'Vencido', color: 'text-red-400' };
  if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
    return { label: 'Agotado', color: 'text-orange-400' };
  }
  return { label: 'Activo', color: 'text-green-400' };
}

// ---------------------------------------------------------------------------
// CouponModal — create / edit
// ---------------------------------------------------------------------------

type ModalProps = {
  coupon?: Coupon | null;
  onSaved: (c: Coupon) => void;
  onClose: () => void;
};

function CouponModal({ coupon, onSaved, onClose }: ModalProps) {
  const isEdit = !!coupon;

  const [code, setCode] = useState(coupon?.code ?? '');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>(
    (coupon?.discount_type as 'percent' | 'fixed') ?? 'percent'
  );
  const [discountValue, setDiscountValue] = useState(
    coupon?.discount_value != null ? String(coupon.discount_value) : ''
  );
  const [expiresAt, setExpiresAt] = useState(coupon?.expires_at ?? '');
  const [minPurchase, setMinPurchase] = useState(
    coupon?.min_purchase != null ? String(coupon.min_purchase) : ''
  );
  const [maxUses, setMaxUses] = useState(
    coupon?.max_uses != null ? String(coupon.max_uses) : ''
  );
  const [isActive, setIsActive] = useState(coupon?.is_active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedValue = parseFloat(discountValue.replace(',', '.'));
    if (isNaN(parsedValue) || parsedValue <= 0) {
      setError('El valor del descuento debe ser un número mayor a 0.');
      return;
    }
    if (discountType === 'percent' && parsedValue > 100) {
      setError('El porcentaje no puede superar 100.');
      return;
    }

    const input: SaveCouponInput = {
      id: coupon?.id,
      code,
      discount_type: discountType,
      discount_value: parsedValue,
      expires_at: expiresAt || null,
      min_purchase: minPurchase ? parseFloat(minPurchase.replace(',', '.')) : null,
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      is_active: isActive,
    };

    setSaving(true);
    const result = await saveCoupon(input);
    setSaving(false);

    if ('error' in result) {
      setError(result.error);
      return;
    }

    // Build the updated/created coupon for optimistic update
    const saved: Coupon = {
      id: coupon?.id ?? '',
      store_id: coupon?.store_id ?? '',
      code: code.trim().toUpperCase(),
      discount_type: discountType,
      discount_value: parsedValue,
      expires_at: expiresAt || null,
      min_purchase: minPurchase ? parseFloat(minPurchase) : null,
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      uses_count: coupon?.uses_count ?? 0,
      is_active: isActive,
      created_at: coupon?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onSaved(saved);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#16222E] p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Editar cupón' : 'Nuevo cupón'}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-[#FBF7EC]">
            {isEdit ? 'Editar cupón' : 'Nuevo cupón'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 mb-4"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Code */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1" htmlFor="coupon-code">
              Código *
            </label>
            <input
              id="coupon-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={50}
              required
              placeholder="Ej: VERANO20"
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B] uppercase tracking-wider"
            />
          </div>

          {/* Discount type toggle */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">
              Tipo de descuento *
            </label>
            <div className="flex rounded-xl overflow-hidden border border-white/15">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  discountType === 'percent'
                    ? 'bg-[#F5C84B]/15 text-[#F5C84B]'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                Porcentaje (%)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('fixed')}
                className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  discountType === 'fixed'
                    ? 'bg-[#F5C84B]/15 text-[#F5C84B]'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                Monto fijo ($)
              </button>
            </div>
          </div>

          {/* Discount value */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1" htmlFor="coupon-value">
              {discountType === 'percent' ? 'Porcentaje (0–100) *' : 'Monto a descontar *'}
            </label>
            <input
              id="coupon-value"
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              min="0.01"
              max={discountType === 'percent' ? 100 : undefined}
              step="0.01"
              required
              placeholder={discountType === 'percent' ? 'Ej: 20' : 'Ej: 500'}
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1" htmlFor="coupon-expires">
              Vencimiento (opcional — vacío = no vence)
            </label>
            <DatePicker
              value={expiresAt}
              onChange={setExpiresAt}
              placeholder="Sin vencimiento"
              min={new Date().toISOString().slice(0, 10)}
              className="w-full"
              fullWidth
              ariaLabel="Fecha de vencimiento"
            />
          </div>

          {/* Min purchase */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1" htmlFor="coupon-min">
              Mínimo de compra (opcional)
            </label>
            <input
              id="coupon-min"
              type="number"
              value={minPurchase}
              onChange={(e) => setMinPurchase(e.target.value)}
              min="0"
              step="0.01"
              placeholder="Ej: 1000"
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]"
            />
          </div>

          {/* Max uses */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1" htmlFor="coupon-max-uses">
              Límite de usos (opcional)
            </label>
            <input
              id="coupon-max-uses"
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min="1"
              step="1"
              placeholder="Ej: 100"
              className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                isActive ? 'bg-[#F5C84B]' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-white/70">
              {isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold py-2.5 text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear cupón'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CouponsPanel
// ---------------------------------------------------------------------------

export function CouponsPanel({ store, initialCoupons }: Props) {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [modalCoupon, setModalCoupon] = useState<Coupon | null | undefined>(undefined);
  // undefined = modal closed; null = new; Coupon = edit
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const storeId = store.id;
  void storeId; // keep TS happy if unused

  function handleSaved(saved: Coupon) {
    setCoupons((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setModalCoupon(undefined);
    setSuccessId(saved.id || '__new__');
    setTimeout(() => setSuccessId(null), 2500);
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setServerError(null);
    const result = await deleteCoupon(id);
    setDeleting(false);
    if ('error' in result) {
      setServerError(result.error);
      return;
    }
    setCoupons((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
  }

  async function handleToggle(coupon: Coupon) {
    setToggling(coupon.id);
    setServerError(null);
    const result = await toggleCoupon(coupon.id, !coupon.is_active);
    setToggling(null);
    if ('error' in result) {
      setServerError(result.error);
      return;
    }
    setCoupons((prev) =>
      prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c))
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-xl font-bold text-[#FBF7EC]">Cupones</h1>
        <button
          type="button"
          onClick={() => setModalCoupon(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] transition-colors cursor-pointer"
        >
          <Plus size={14} />
          Nuevo cupón
        </button>
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 mb-4"
        >
          {serverError}
        </div>
      )}

      <p className="text-sm text-white/50 mb-4">
        Los cupones de descuento los aplica el cliente en el carrito al momento de comprar. El código se registra en el pedido.
      </p>

      {coupons.length === 0 ? (
        <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-10 text-center">
          <BadgePercent size={28} className="text-white/20 mx-auto mb-2" />
          <p className="text-sm text-white/40">No hay cupones. Creá el primero.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {coupons.map((coupon) => {
            const status = getCouponStatus(coupon);
            const isTogglingThis = toggling === coupon.id;
            const usesLabel =
              coupon.max_uses !== null
                ? `${coupon.uses_count} / ${coupon.max_uses} usos`
                : `${coupon.uses_count} usos`;

            return (
              <div
                key={coupon.id}
                className="flex items-center gap-3 border border-white/10 rounded-xl px-4 py-3 bg-white/4"
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  status.label === 'Activo'
                    ? 'bg-green-400'
                    : status.label === 'Vencido'
                    ? 'bg-red-400'
                    : status.label === 'Agotado'
                    ? 'bg-orange-400'
                    : 'bg-white/20'
                }`} />

                {/* Code + info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#FBF7EC] font-mono tracking-wide">
                      {coupon.code}
                    </span>
                    <span className="text-xs text-white/40">
                      {coupon.discount_type === 'percent'
                        ? `${coupon.discount_value}% off`
                        : `${formatARS(coupon.discount_value)} off`}
                    </span>
                    <span className={`text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-white/30">{usesLabel}</span>
                    {coupon.expires_at && (
                      <span className="text-xs text-white/30">
                        Vence: {coupon.expires_at}
                      </span>
                    )}
                    {coupon.min_purchase !== null && (
                      <span className="text-xs text-white/30">
                        Mín: {formatARS(coupon.min_purchase)}
                      </span>
                    )}
                  </div>
                </div>

                {successId === coupon.id && (
                  <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                )}

                {/* Toggle active */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={coupon.is_active}
                  onClick={() => handleToggle(coupon)}
                  disabled={isTogglingThis}
                  className={`relative w-9 h-4.5 rounded-full transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 ${
                    coupon.is_active ? 'bg-[#F5C84B]' : 'bg-white/20'
                  }`}
                  aria-label={coupon.is_active ? 'Desactivar cupón' : 'Activar cupón'}
                  style={{ minWidth: '36px', height: '18px' }}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      coupon.is_active ? 'translate-x-[18px]' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => setModalCoupon(coupon)}
                  className="w-7 h-7 rounded-lg text-white/40 hover:text-[#F5C84B] flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                  aria-label={`Editar cupón ${coupon.code}`}
                >
                  <Pencil size={13} />
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(coupon.id)}
                  className="w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                  aria-label={`Eliminar cupón ${coupon.code}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {modalCoupon !== undefined && (
        <CouponModal
          coupon={modalCoupon}
          onSaved={handleSaved}
          onClose={() => setModalCoupon(undefined)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
        >
          <div className="bg-[#16222E] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-[#FBF7EC] mb-2">¿Eliminar cupón?</h3>
            <p className="text-sm text-white/50 mb-5">
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-medium text-white/60 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-bold py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
