'use client';

interface Props {
  url: string;
}

export default function WhatsAppNotifyButton({ url }: Props) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
      style={{ background: '#25d366', color: '#ffffff' }}
    >
      Avisar al vendedor por WhatsApp
    </a>
  );
}
