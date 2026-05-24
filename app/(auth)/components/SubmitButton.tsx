'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  label: string;
  loadingLabel?: string;
  /**
   * Override loading state. When the form is submitted via a manual server
   * action dispatch (not via `<form action>`), useFormStatus does not fire,
   * so callers must thread the pending state from useActionState's 3rd return.
   */
  pending?: boolean;
}

export function SubmitButton({ label, loadingLabel = 'Cargando...', pending: pendingProp }: SubmitButtonProps) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingProp ?? formPending;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={[
        'w-full min-h-[44px] rounded-xl font-bold text-sm text-[#16222E]',
        'bg-[#F5C84B] hover:bg-[#D9A92A] active:bg-[#D9A92A]',
        'focus:outline-none focus:ring-2 focus:ring-[#F5C84B] focus:ring-offset-2 focus:ring-offset-[#FBF7EC]',
        'transition-colors duration-150 cursor-pointer',
        'flex items-center justify-center gap-2',
        pending ? 'opacity-70 cursor-not-allowed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {pending ? loadingLabel : label}
    </button>
  );
}
