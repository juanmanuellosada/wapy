'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

type Props = { url: string };

export function CopyLinkButton({ url }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="w-full min-h-[44px] rounded-xl border-2 border-[#16222E] text-[#16222E] font-bold text-sm hover:bg-[#16222E] hover:text-[#FBF7EC] transition-colors flex items-center justify-center gap-2 cursor-pointer"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copiado!' : 'Copiar link de tu tienda'}
    </button>
  );
}
