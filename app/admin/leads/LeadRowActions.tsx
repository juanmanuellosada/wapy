'use client';

import { useState, useTransition } from 'react';
import type { Database } from '@/lib/supabase/types';
import { approveLead, deleteLead } from '@/lib/leads/actions';
import { ConfirmModal } from '@/app/components/ConfirmModal';

type LeadRow = Database['public']['Tables']['leads']['Row'];

interface Props {
  row: LeadRow;
}

export function LeadRowActions({ row }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'warn' | 'error'; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleApprove() {
    setFeedback(null);
    startTransition(async () => {
      const result = await approveLead({ id: row.id });
      if ('error' in result) {
        const messages: Record<string, string> = {
          invalid_state: 'Lead no encontrado o ya procesado.',
          already_whitelisted: 'Este mail ya estaba invitado.',
          forbidden: 'Sin permiso.',
        };
        setFeedback({ type: 'error', message: messages[result.error] ?? result.message ?? 'Error.' });
      } else if (!result.mail_sent) {
        setFeedback({
          type: 'warn',
          message: `Aprobado, pero el invite no se envió: ${result.mail_error ?? 'error desconocido'}. Re-invitar desde Whitelist.`,
        });
      } else {
        setFeedback({ type: 'ok', message: 'Aprobado · invite enviado.' });
        setTimeout(() => setFeedback(null), 4000);
      }
    });
  }

  function handleDelete() {
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    setFeedback(null);
    setConfirmOpen(false);
    startTransition(async () => {
      const result = await deleteLead({ id: row.id });
      if ('error' in result) {
        setFeedback({ type: 'error', message: result.message ?? 'No se pudo borrar.' });
      }
      // On ok: revalidatePath in action refreshes the table
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 justify-end">
        {row.status === 'new' && (
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            aria-label={`Aprobar lead de ${row.email}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-400 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isPending ? 'Procesando…' : 'Aprobar'}
          </button>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={`Borrar lead de ${row.email}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Borrar
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs text-right max-w-[200px] ${
            feedback.type === 'ok'
              ? 'text-green-700'
              : feedback.type === 'warn'
              ? 'text-yellow-700'
              : 'text-red-600'
          }`}
        >
          {feedback.message}
        </p>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Borrar lead"
        message={`¿Borrar el lead de "${row.name}" (${row.email})? Esta acción no se puede deshacer.`}
        confirmLabel="Sí, borrar"
        variant="destructive"
      />
    </div>
  );
}
