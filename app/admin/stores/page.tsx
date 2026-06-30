import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import { AdminShell } from '../_components/AdminShell';
import { getSubscriptionState } from '@/lib/subscription/state';
import { StoreExemptActions } from './StoreExemptActions';
import { AdminDeleteStoreButton } from './AdminDeleteStoreButton';
import type { SubscriptionState } from '@/lib/subscription/state';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — Tiendas — Wapy',
};

async function getSessionUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/admin/stores');

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role !== 'superadmin') redirect('/onboarding');

  return user;
}

const STATE_LABELS: Record<SubscriptionState, string> = {
  exempt: 'Exenta',
  trial: 'Trial',
  active: 'Activa',
  grace: 'Gracia',
  blocked: 'Bloqueada',
};

const STATE_BADGE: Record<SubscriptionState, string> = {
  exempt: 'bg-blue-100 text-blue-800 border border-blue-200',
  trial: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  active: 'bg-green-100 text-green-800 border border-green-200',
  grace: 'bg-orange-100 text-orange-800 border border-orange-200',
  blocked: 'bg-red-100 text-red-800 border border-red-200',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function AdminStoresPage() {
  const user = await getSessionUser();
  const admin = createAdminClient();

  const { data: stores } = await admin
    .from('stores')
    .select('id, name, slug, plan, payment_exempt, payment_exempt_reason, trial_ends_at, mp_subscription_status, subscription_status_changed_at, blocked_at, mp_preapproval_id, status, owner_id')
    .order('created_at', { ascending: false });

  // Resolve owner emails in bulk (concurrent, not sequential) from auth.users.
  const ownerIds = [...new Set((stores ?? []).map((s) => s.owner_id).filter(Boolean))] as string[];
  const userResults = await Promise.all(
    ownerIds.map((id) => admin.auth.admin.getUserById(id)),
  );
  const emailByOwnerId = new Map<string, string>();
  userResults.forEach(({ data }) => {
    if (data?.user?.id && data.user.email) {
      emailByOwnerId.set(data.user.id, data.user.email);
    }
  });

  const now = new Date();
  const rows = (stores ?? []).map((s) => ({
    ...s,
    subState: getSubscriptionState(s, now),
    ownerEmail: emailByOwnerId.get(s.owner_id ?? '') ?? null,
  }));

  return (
    <AdminShell email={user.email ?? ''} currentTab="stores">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Tiendas</h1>
          <p className="text-sm text-white/50">
            {rows.length} {rows.length === 1 ? 'tienda' : 'tiendas'} en total
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#16222E]/10">
            <h2 className="text-sm font-bold text-[#16222E]">Estado de suscripciones</h2>
          </div>
          <div className="overflow-x-auto">
            {rows.length === 0 ? (
              <div className="text-center py-16 text-[#16222E]/50 text-sm">No hay tiendas todavía.</div>
            ) : (
              <table className="w-full text-sm" aria-label="Tabla de tiendas">
                <thead>
                  <tr className="bg-[#16222E]/5 text-[#16222E]/60 text-xs uppercase tracking-wide">
                    <th className="px-4 py-3 text-left font-semibold">Tienda</th>
                    <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Email dueño</th>
                    <th className="px-4 py-3 text-left font-semibold">Plan</th>
                    <th className="px-4 py-3 text-left font-semibold">Estado</th>
                    <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Trial vence</th>
                    <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">MP Status</th>
                    <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">Motivo exención</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#16222E]/8">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="bg-white hover:bg-[#FBF7EC]/60 transition-colors duration-150"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#16222E] truncate max-w-[150px]">{row.name}</p>
                        <p className="text-xs text-[#16222E]/40 truncate">/{row.slug}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {row.ownerEmail ? (
                          <span className="text-xs text-[#16222E]/70 truncate block max-w-[180px]" title={row.ownerEmail}>
                            {row.ownerEmail}
                          </span>
                        ) : (
                          <span className="text-xs text-[#16222E]/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.plan === 'pro'
                            ? 'bg-[#F5C84B]/20 text-[#7B5C00] border border-[#F5C84B]/40'
                            : row.plan === 'medio'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'bg-[#16222E]/8 text-[#16222E] border border-[#16222E]/15'
                        }`}>
                          {row.plan === 'pro' ? 'Pro' : row.plan === 'medio' ? 'Medio' : 'Inicial'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATE_BADGE[row.subState]}`}>
                          {STATE_LABELS[row.subState]}
                        </span>
                        {row.payment_exempt && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            exenta
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#16222E]/60 whitespace-nowrap hidden md:table-cell">
                        {formatDate(row.trial_ends_at)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {row.mp_subscription_status ? (
                          <span className="text-xs text-[#16222E]/70 font-mono">{row.mp_subscription_status}</span>
                        ) : (
                          <span className="text-xs text-[#16222E]/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell max-w-[180px]">
                        {row.payment_exempt_reason ? (
                          <span className="text-xs text-[#16222E]/70 truncate block" title={row.payment_exempt_reason}>
                            {row.payment_exempt_reason}
                          </span>
                        ) : (
                          <span className="text-xs text-[#16222E]/30">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <StoreExemptActions
                            storeId={row.id}
                            storeName={row.name}
                            isExempt={row.payment_exempt}
                            currentReason={row.payment_exempt_reason}
                          />
                          <AdminDeleteStoreButton storeId={row.id} storeSlug={row.slug} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
