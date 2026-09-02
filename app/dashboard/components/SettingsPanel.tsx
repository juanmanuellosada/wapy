'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { renameSlug, toggleStoreStatus, deleteStore, saveWaLifecycleConfig } from '@/lib/dashboard/actions';
import { checkSlugAvailable } from '@/lib/onboarding/actions';
import { RenameSlugModal } from './RenameSlugModal';
import { DeleteStoreModal } from './DeleteStoreModal';
import { MercadoPagoPanel } from './MercadoPagoPanel';
import { saveCatalogSortPreferences } from '@/lib/store/actions';
import { SORT_MODES, isSortMode, type SortMode } from '@/lib/storefront/sorting';
import type { Store } from '@/lib/onboarding/state';

type MpConnectionStatus = {
  connected: boolean;
  revoked: boolean;
  mpUserId?: string;
};

type Props = {
  store: Store;
  mpStatus: MpConnectionStatus;
  checkoutMode: 'whatsapp' | 'mercadopago';
  mpConnectResult?: 'success' | 'error' | null;
  mpError?: string | null;
};

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'reserved' | 'invalid' | 'same';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export function SettingsPanel({ store, mpStatus, checkoutMode, mpConnectResult, mpError }: Props) {
  const router = useRouter();

  // --------------------------------------------------------------------------
  // Slug rename
  // --------------------------------------------------------------------------
  const [slugValue, setSlugValue] = useState(store.slug ?? '');
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSuccess, setRenameSuccess] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const slugCheckIdRef = useRef(0);

  const checkSlug = useCallback(
    async (slug: string) => {
      if (!slug || slug.length < 2) { setSlugStatus('idle'); return; }
      if (slug === store.slug) { setSlugStatus('same'); return; }
      if (!SLUG_REGEX.test(slug)) { setSlugStatus('invalid'); return; }

      const id = ++slugCheckIdRef.current;
      setSlugStatus('checking');
      const result = await checkSlugAvailable(slug, store.id ?? undefined);
      if (id !== slugCheckIdRef.current) return;
      setSlugStatus(result.available ? 'available' : (result.reason ?? 'invalid'));
    },
    [store.slug, store.id]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkSlug(slugValue), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [slugValue, checkSlug]);

  const handleRenameConfirm = async () => {
    setRenameError(null);
    const result = await renameSlug({ newSlug: slugValue });
    if ('error' in result) {
      setRenameError(result.error);
      setShowRenameModal(false);
      return;
    }
    setShowRenameModal(false);
    setRenameSuccess(true);
    setSlugStatus('same');
    setTimeout(() => setRenameSuccess(false), 4000);
    router.refresh();
  };

  // --------------------------------------------------------------------------
  // Pause / unpause
  // --------------------------------------------------------------------------
  const [storeStatus, setStoreStatus] = useState(store.status);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggle = async () => {
    setToggling(true);
    setToggleError(null);
    const result = await toggleStoreStatus();
    setToggling(false);
    setShowPauseConfirm(false);
    if ('error' in result) {
      setToggleError(result.error);
      return;
    }
    setStoreStatus(result.status);
  };

  // --------------------------------------------------------------------------
  // Delete store
  // --------------------------------------------------------------------------
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    const result = await deleteStore({ confirmSlug: store.slug ?? '' });
    if ('error' in result) {
      setDeleteError(result.error);
      setShowDeleteModal(false);
      return;
    }
    // Redirect to onboarding after delete
    router.push('/onboarding');
  };

  // --------------------------------------------------------------------------
  // WhatsApp pending order lifecycle
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Orden del catálogo
  // --------------------------------------------------------------------------
  const [defaultSort, setDefaultSort] = useState<SortMode>(
    isSortMode(store.default_product_sort) ? store.default_product_sort : 'manual'
  );
  const [outOfStockLast, setOutOfStockLast] = useState(store.out_of_stock_last ?? true);
  const [sortSaving, setSortSaving] = useState(false);
  const [sortError, setSortError] = useState<string | null>(null);
  const [sortSuccess, setSortSuccess] = useState(false);

  const handleSaveSortPreferences = async () => {
    setSortSaving(true);
    setSortError(null);
    setSortSuccess(false);
    const result = await saveCatalogSortPreferences({
      default_product_sort: defaultSort,
      out_of_stock_last: outOfStockLast,
    });
    setSortSaving(false);
    if ('error' in result) {
      setSortError(result.error);
      return;
    }
    setSortSuccess(true);
    setTimeout(() => setSortSuccess(false), 4000);
  };

  const [waTtlDays, setWaTtlDays] = useState(store.wa_pending_ttl_days ?? 7);
  const [waAutoConfirm, setWaAutoConfirm] = useState(store.wa_auto_confirm ?? false);
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  const [waSuccess, setWaSuccess] = useState(false);

  const handleSaveWaLifecycle = async () => {
    setWaSaving(true);
    setWaError(null);
    setWaSuccess(false);
    const result = await saveWaLifecycleConfig({
      wa_pending_ttl_days: waTtlDays,
      wa_auto_confirm: waAutoConfirm,
    });
    setWaSaving(false);
    if ('error' in result) {
      setWaError(result.error);
      return;
    }
    setWaSuccess(true);
    setTimeout(() => setWaSuccess(false), 4000);
  };

  // --------------------------------------------------------------------------
  // Dates
  // --------------------------------------------------------------------------
  const createdAt = store.created_at ? new Date(store.created_at).toLocaleDateString('es-AR') : '—';
  const publishedAt = store.published_at ? new Date(store.published_at).toLocaleDateString('es-AR') : '—';

  // --------------------------------------------------------------------------
  // Slug status indicator
  // --------------------------------------------------------------------------
  const slugStatusInfo: Record<SlugStatus, { icon: React.ReactNode; text: string; color: string } | null> = {
    idle: null,
    same: null,
    checking: { icon: <Loader2 size={14} className="animate-spin text-white/40" />, text: 'Verificando...', color: 'text-white/40' },
    available: { icon: <CheckCircle size={14} className="text-green-400" />, text: 'Slug disponible', color: 'text-green-400' },
    taken: { icon: <XCircle size={14} className="text-red-400" />, text: 'Ya está en uso por otra tienda', color: 'text-red-400' },
    reserved: { icon: <XCircle size={14} className="text-red-400" />, text: 'Reservado por el sistema', color: 'text-red-400' },
    invalid: { icon: <XCircle size={14} className="text-red-400" />, text: 'Formato inválido', color: 'text-red-400' },
  };
  const slugInfo = slugStatusInfo[slugStatus];
  const canRename = slugStatus === 'available';

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold text-[#FBF7EC]">Configuración</h1>

      {/* ------------------------------------------------------------------ */}
      {/* Mercado Pago */}
      {/* ------------------------------------------------------------------ */}
      <MercadoPagoPanel
        mpStatus={mpStatus}
        checkoutMode={checkoutMode}
        mpConnectResult={mpConnectResult}
        mpError={mpError}
      />

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Slug rename */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-[#FBF7EC]">Dirección de tu tienda</h2>

        {renameError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {renameError}
          </div>
        )}
        {renameSuccess && (
          <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-300 flex items-center gap-2">
            <CheckCircle size={14} />
            Slug cambiado correctamente.
          </div>
        )}

        <div>
          <label htmlFor="settings-slug" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Slug
          </label>
          <div className="flex items-center gap-0">
            <span className="flex-shrink-0 text-sm text-white/40 bg-white/5 border border-r-0 border-white/15 rounded-l-xl px-3 py-3">
              wapy.com.ar/
            </span>
            <div className="relative flex-1">
              <input
                id="settings-slug"
                type="text"
                autoComplete="off"
                value={slugValue}
                maxLength={32}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                  setSlugValue(val);
                }}
                className="w-full rounded-l-none rounded-r-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors pr-8"
              />
              {slugInfo && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {slugInfo.icon}
                </span>
              )}
            </div>
          </div>
          {slugInfo && (
            <p className={`text-xs flex items-center gap-1 mt-1 ${slugInfo.color}`}>
              {slugInfo.text}
            </p>
          )}
          <p className="text-xs text-white/30 mt-1">
            Los links anteriores se redirigen automáticamente al cambiar el slug.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowRenameModal(true)}
          disabled={!canRename}
          className="min-h-[44px] px-6 rounded-xl bg-white/10 text-[#FBF7EC] font-semibold text-sm hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Cambiar slug
        </button>
      </section>

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Pause / unpause */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-[#FBF7EC]">Estado de la tienda</h2>

        {toggleError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {toggleError}
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">Tienda activa</p>
            <p className="text-xs text-white/50 mt-0.5">
              {storeStatus === 'published'
                ? 'Tu tienda está visible para los visitantes.'
                : 'Tu tienda está pausada. Los visitantes ven "En mantenimiento".'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPauseConfirm(true)}
            disabled={toggling}
            role="switch"
            aria-checked={storeStatus === 'published'}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              storeStatus === 'published' ? 'bg-green-500' : 'bg-white/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                storeStatus === 'published' ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
            <span className="sr-only">
              {storeStatus === 'published' ? 'Pausar tienda' : 'Activar tienda'}
            </span>
          </button>
        </div>

        {/* Pause confirmation inline */}
        {showPauseConfirm && (
          <div className="bg-white/5 border border-white/15 rounded-xl p-4 space-y-3">
            <p className="text-sm text-[#FBF7EC]">
              {storeStatus === 'published'
                ? '¿Pausar tu tienda? Los visitantes verán "En mantenimiento" en lugar de productos. Podés volver a activarla cuando quieras.'
                : '¿Volver a publicar tu tienda?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowPauseConfirm(false)}
                className="flex-1 min-h-[40px] rounded-xl border border-white/20 text-white/70 font-semibold text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleToggle}
                disabled={toggling}
                className="flex-1 min-h-[40px] rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {toggling && <Loader2 size={14} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        )}
      </section>

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Catalog sort preferences */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-[#FBF7EC]">Orden del catálogo</h2>
        <p className="text-xs text-white/50">
          Cómo se ordenan los productos dentro de cada sección de tu tienda. Cada sección puede tener su propio
          orden desde la pestaña Secciones; lo que elijas acá aplica a las que están en &quot;Como en la tienda&quot;.
        </p>

        {sortError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {sortError}
          </div>
        )}
        {sortSuccess && (
          <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-300 flex items-center gap-2">
            <CheckCircle size={14} />
            Orden guardado.
          </div>
        )}

        <div>
          <label htmlFor="default-sort" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Orden por defecto
          </label>
          <select
            id="default-sort"
            value={defaultSort}
            onChange={(e) => {
              if (isSortMode(e.target.value)) setDefaultSort(e.target.value);
            }}
            className="w-full sm:w-72 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors cursor-pointer"
          >
            {SORT_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-white/30 mt-1">
            Las secciones con un orden propio no se ven afectadas por este cambio.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">Mostrar los productos sin stock al final</p>
            <p className="text-xs text-white/50 mt-1">
              Se aplica a todas las secciones, sin importar cómo estén ordenadas: primero lo que se puede comprar y
              después lo agotado, respetando el orden elegido dentro de cada grupo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOutOfStockLast((v) => !v)}
            role="switch"
            aria-checked={outOfStockLast}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              outOfStockLast ? 'bg-[#F5C84B]' : 'bg-white/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                outOfStockLast ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
            <span className="sr-only">
              {outOfStockLast ? 'Dejar de mandar los agotados al final' : 'Mandar los agotados al final'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveSortPreferences}
          disabled={sortSaving}
          className="min-h-[44px] px-6 rounded-xl bg-white/10 text-[#FBF7EC] font-semibold text-sm hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
        >
          {sortSaving && <Loader2 size={14} className="animate-spin" />}
          Guardar
        </button>
      </section>

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* WhatsApp pending order lifecycle */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-[#FBF7EC]">Pedidos de WhatsApp sin confirmar</h2>
        <p className="text-xs text-white/50">
          Wapy no tiene forma de saber si un pedido de WhatsApp se cobró: el pago se arregla por fuera del sistema.
          Por eso, si un pedido queda pendiente sin que lo confirmes, el sistema aplica una política al vencer el plazo.
        </p>

        {waError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {waError}
          </div>
        )}
        {waSuccess && (
          <div role="status" className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-sm text-green-300 flex items-center gap-2">
            <CheckCircle size={14} />
            Configuración guardada.
          </div>
        )}

        <div>
          <label htmlFor="wa-ttl-days" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
            Días antes de aplicar la política
          </label>
          <input
            id="wa-ttl-days"
            type="number"
            min={1}
            max={30}
            step={1}
            value={waTtlDays}
            onChange={(e) => setWaTtlDays(Number(e.target.value))}
            className="w-24 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] px-4 py-3 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
          />
          <p className="text-xs text-white/30 mt-1">Entre 1 y 30 días. Por defecto, 7.</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">Confirmar automáticamente en vez de cancelar</p>
            <p className="text-xs text-white/50 mt-1">
              Apagado (recomendado): al vencer el plazo, el pedido se cancela solo, repone el stock y libera el cupón
              usado. Si después confirmás que sí se vendió, podés revertir esa cancelación a mano.
            </p>
            <p className="text-xs text-amber-300/80 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
              Prendido: el pedido pasa a confirmado sin que hayas verificado que se pagó. Vas a registrar como venta
              pedidos que quizás nunca se concretaron, lo que infla tus ingresos y no repone el stock de lo que en
              realidad no se vendió. Activalo solo si sabés que casi todos tus pedidos de WhatsApp se concretan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWaAutoConfirm((v) => !v)}
            role="switch"
            aria-checked={waAutoConfirm}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              waAutoConfirm ? 'bg-amber-500' : 'bg-white/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                waAutoConfirm ? 'translate-x-[22px]' : 'translate-x-0.5'
              }`}
            />
            <span className="sr-only">
              {waAutoConfirm ? 'Desactivar confirmación automática' : 'Activar confirmación automática'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveWaLifecycle}
          disabled={waSaving}
          className="min-h-[44px] px-6 rounded-xl bg-white/10 text-[#FBF7EC] font-semibold text-sm hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
        >
          {waSaving && <Loader2 size={14} className="animate-spin" />}
          Guardar
        </button>
      </section>

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Read-only store info */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[#FBF7EC]">Datos de la tienda</h2>
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Creada el</span>
            <span className="text-[#FBF7EC] font-mono">{createdAt}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Publicada el</span>
            <span className="text-[#FBF7EC] font-mono">{publishedAt}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Slug actual</span>
            <span className="text-[#FBF7EC] font-mono">{store.slug}</span>
          </div>
        </div>
      </section>

      <hr className="border-white/10" />

      {/* ------------------------------------------------------------------ */}
      {/* Danger zone */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} />
          Zona peligrosa
        </h2>

        {deleteError && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
            {deleteError}
          </div>
        )}

        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#FBF7EC]">Eliminar tienda</p>
            <p className="text-xs text-white/50 mt-0.5">
              Borra la tienda, secciones, productos e imágenes. Esta acción es irreversible.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="flex-shrink-0 min-h-[36px] px-4 rounded-xl border border-red-500/40 text-red-400 font-semibold text-sm hover:bg-red-500/10 hover:border-red-500/60 transition-colors cursor-pointer"
          >
            Eliminar
          </button>
        </div>
      </section>

      {/* Modals */}
      {showRenameModal && (
        <RenameSlugModal
          oldSlug={store.slug ?? ''}
          newSlug={slugValue}
          onConfirm={handleRenameConfirm}
          onClose={() => setShowRenameModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteStoreModal
          slug={store.slug ?? ''}
          onConfirm={handleDeleteConfirm}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
