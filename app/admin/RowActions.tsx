'use client';

import { useState, useTransition } from 'react';
import type { Database } from '@/lib/supabase/types';
import { reinviteEntry, removeWhitelistEntry } from '@/lib/admin/actions';

type WhitelistRow = Database['public']['Tables']['whitelist']['Row'];

interface Props {
  row: WhitelistRow;
}

export function RowActions({ row }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; message: string } | null>(null);

  function handleReinvite() {
    setFeedback(null);
    startTransition(async () => {
      const result = await reinviteEntry({ id: row.id });
      if ('error' in result) {
        const messages: Record<string, string> = {
          already_registered: 'Ya está registrado.',
          not_found: 'No encontrado.',
          forbidden: 'Sin permiso.',
          unknown: 'Error inesperado.',
        };
        setFeedback({ type: 'error', message: messages[result.error] ?? result.message ?? 'Error.' });
      } else if (!result.mail_sent) {
        setFeedback({ type: 'error', message: `Re-invitado, pero el mail falló: ${result.mail_error}` });
      } else {
        setFeedback({ type: 'ok', message: 'Mail reenviado.' });
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  }

  function handleRemove() {
    const confirmed = window.confirm(
      `¿Seguro que querés quitar "${row.email}" de la whitelist?\n\nSi todavía no se registró, perderá acceso al invite link.`
    );
    if (!confirmed) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await removeWhitelistEntry({ id: row.id });
      if ('error' in result) {
        setFeedback({ type: 'error', message: result.message ?? 'No se pudo quitar.' });
      }
      // On ok: revalidatePath in the action refreshes the table
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 justify-end">
        {!row.registered_at && (
          <button
            type="button"
            onClick={handleReinvite}
            disabled={isPending}
            aria-label={`Re-invitar a ${row.email}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#16222E]/5 text-[#16222E] border border-[#16222E]/15 hover:bg-[#16222E]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C84B] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-3.5 h-3.5"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                clipRule="evenodd"
              />
            </svg>
            {isPending ? 'Enviando…' : 'Re-invitar'}
          </button>
        )}

        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          aria-label={`Quitar a ${row.email} de la whitelist`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
              clipRule="evenodd"
            />
          </svg>
          Quitar
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`text-xs ${
            feedback.type === 'ok' ? 'text-green-700' : 'text-red-600'
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
