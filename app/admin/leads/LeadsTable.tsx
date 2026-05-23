import type { Database } from '@/lib/supabase/types';
import { LeadRowActions } from './LeadRowActions';

type LeadRow = Database['public']['Tables']['leads']['Row'];

function formatRelativeAgo(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) return diffMins <= 1 ? 'hace un momento' : `hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
}

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  new: {
    label: 'Nuevo',
    classes: 'bg-blue-100 text-blue-800 border border-blue-200',
  },
  approved: {
    label: 'Aprobado',
    classes: 'bg-green-100 text-green-800 border border-green-200',
  },
  declined: {
    label: 'Rechazado',
    classes: 'bg-red-100 text-red-800 border border-red-200',
  },
};

const PLAN_BADGE: Record<string, string> = {
  inicial: 'bg-[#16222E]/8 text-[#16222E] border border-[#16222E]/15',
  pro: 'bg-[#F5C84B]/20 text-[#7B5C00] border border-[#F5C84B]/40',
};

interface Props {
  rows: LeadRow[];
}

export function LeadsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-[#16222E]/50 text-sm">
        No hay leads todavía. Cuando alguien llene el formulario de la landing, aparecerá acá.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#16222E]/10">
      <table className="w-full text-sm" aria-label="Tabla de leads">
        <thead>
          <tr className="bg-[#16222E]/5 text-[#16222E]/60 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-semibold">Nombre</th>
            <th className="px-4 py-3 text-left font-semibold">Email</th>
            <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">WhatsApp</th>
            <th className="px-4 py-3 text-left font-semibold">Plan</th>
            <th className="px-4 py-3 text-left font-semibold">Estado</th>
            <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Recibido</th>
            <th className="px-4 py-3 text-right font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#16222E]/8">
          {rows.map((row) => {
            const statusBadge = STATUS_BADGE[row.status] ?? STATUS_BADGE['new'];
            const planBadge = PLAN_BADGE[row.plan] ?? PLAN_BADGE['inicial'];
            return (
              <tr
                key={row.id}
                className="bg-white hover:bg-[#FBF7EC]/60 transition-colors duration-150"
              >
                <td className="px-4 py-3 font-medium text-[#16222E] max-w-[140px] truncate">
                  {row.name}
                </td>
                <td className="px-4 py-3 text-[#16222E]/80 max-w-[200px] truncate">
                  {row.email}
                </td>
                <td className="px-4 py-3 text-[#16222E]/70 whitespace-nowrap hidden sm:table-cell">
                  {row.whatsapp}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${planBadge}`}
                  >
                    {row.plan === 'pro' ? 'Pro' : 'Inicial'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge.classes}`}
                  >
                    {statusBadge.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#16222E]/50 whitespace-nowrap text-xs hidden md:table-cell">
                  {formatRelativeAgo(row.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <LeadRowActions row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
