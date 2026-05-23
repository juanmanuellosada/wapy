import type { Database } from '@/lib/supabase/types';
import { RowActions } from './RowActions';

type WhitelistRow = Database['public']['Tables']['whitelist']['Row'];

function getStatus(row: WhitelistRow): 'registered' | 'expired' | 'invited' {
  if (row.registered_at) return 'registered';
  const expiresAt = new Date(row.invited_at).getTime() + 7 * 24 * 60 * 60 * 1000;
  if (Date.now() > expiresAt) return 'expired';
  return 'invited';
}

function formatRelative(isoDate: string | null): string {
  if (!isoDate) return '—';
  const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
  const diffMs = new Date(isoDate).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) >= 1) return rtf.format(diffDays, 'day');
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (Math.abs(diffHours) >= 1) return rtf.format(diffHours, 'hour');
  const diffMins = Math.round(diffMs / (1000 * 60));
  return rtf.format(diffMins, 'minute');
}

function formatTrial(trialEndsAt: string | null): { label: string; expired: boolean } {
  if (!trialEndsAt) return { label: '—', expired: false };
  const diffMs = new Date(trialEndsAt).getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 0) {
    return { label: `Vence en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`, expired: false };
  }
  const absDays = Math.abs(diffDays);
  return { label: `Venció hace ${absDays} ${absDays === 1 ? 'día' : 'días'}`, expired: true };
}

const STATUS_BADGE: Record<
  'registered' | 'expired' | 'invited',
  { label: string; classes: string }
> = {
  registered: {
    label: 'Registrado',
    classes: 'bg-green-100 text-green-800 border border-green-200',
  },
  invited: {
    label: 'Invitado',
    classes: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  },
  expired: {
    label: 'Expirado',
    classes: 'bg-red-100 text-red-800 border border-red-200',
  },
};

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-[#16222E]/10 text-[#16222E] border border-[#16222E]/20',
  superadmin: 'bg-[#F5C84B]/30 text-[#7B5C00] border border-[#F5C84B]/60',
};

const PLAN_BADGE: Record<string, string> = {
  inicial: 'bg-[#16222E]/8 text-[#16222E] border border-[#16222E]/15',
  pro: 'bg-[#F5C84B]/20 text-[#7B5C00] border border-[#F5C84B]/40',
};

interface Props {
  rows: WhitelistRow[];
}

export function WhitelistTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-[#16222E]/50 text-sm">
        No hay entradas en la whitelist todavía.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#16222E]/10">
      <table className="w-full text-sm" aria-label="Tabla de whitelist">
        <thead>
          <tr className="bg-[#16222E]/5 text-[#16222E]/60 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-semibold">Email</th>
            <th className="px-4 py-3 text-left font-semibold">Rol</th>
            <th className="px-4 py-3 text-left font-semibold">Plan</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Invitado</th>
            <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Registrado</th>
            <th className="px-4 py-3 text-left font-semibold">Trial</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#16222E]/8">
          {rows.map((row) => {
            const status = getStatus(row);
            const badge = STATUS_BADGE[status];
            const roleBadge = ROLE_BADGE[row.grant_role] ?? ROLE_BADGE['owner'];
            const trial = formatTrial(row.trial_ends_at);
            const planBadge = row.plan ? (PLAN_BADGE[row.plan] ?? PLAN_BADGE['inicial']) : null;
            return (
              <tr
                key={row.id}
                className="bg-white hover:bg-[#FBF7EC]/60 transition-colors duration-150"
              >
                <td className="px-4 py-3 font-medium text-[#16222E] max-w-[200px] truncate">
                  {row.email}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge}`}
                  >
                    {row.grant_role === 'superadmin' ? 'Superadmin' : 'Owner'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {planBadge ? (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${planBadge}`}
                    >
                      {row.plan === 'pro' ? 'Pro' : 'Inicial'}
                    </span>
                  ) : (
                    <span className="text-[#16222E]/30 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.classes}`}
                    aria-label={`Estado: ${badge.label}`}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#16222E]/60 whitespace-nowrap hidden md:table-cell">
                  {formatRelative(row.invited_at)}
                </td>
                <td className="px-4 py-3 text-[#16222E]/60 whitespace-nowrap hidden md:table-cell">
                  {formatRelative(row.registered_at)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`text-xs ${
                      trial.expired
                        ? 'text-red-600 font-semibold'
                        : 'text-[#16222E]/60'
                    }`}
                  >
                    {trial.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
