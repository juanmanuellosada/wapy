'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Loader2, ChevronLeft } from 'lucide-react';
import { SortableList } from './SortableList';
import { saveSections } from '@/lib/onboarding/actions';
import type { Store, Section } from '@/lib/onboarding/state';

type Props = {
  store: Store;
  initialSections: Section[];
};

type SectionDraft = {
  id: string; // real DB id or temp id prefixed with 'new-'
  name: string;
  slug: string;
  position: number;
  isNew?: boolean;
};

function slugifySection(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function StepSections({ store, initialSections }: Props) {
  const router = useRouter();
  const [sections, setSections] = useState<SectionDraft[]>(
    initialSections.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      position: s.position,
    }))
  );
  const [newName, setNewName] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const handleAddSection = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setSections((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: trimmed,
        slug: slugifySection(trimmed),
        position: prev.length,
        isNew: true,
      },
    ]);
    setNewName('');
    setAddingNew(false);
  };

  const handleDelete = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i })));
  };

  const handleReorder = (newOrder: SectionDraft[]) => {
    setSections(newOrder.map((s, i) => ({ ...s, position: i })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (sections.length === 0) {
      setServerError('Agregá al menos una sección para continuar.');
      return;
    }

    setSubmitting(true);

    const result = await saveSections({
      sections: sections.map((s) => ({
        id: s.isNew ? undefined : s.id,
        name: s.name,
        slug: s.slug,
        position: s.position,
      })),
    });

    if ('error' in result) {
      setServerError(result.error);
      setSubmitting(false);
      return;
    }

    router.push('/onboarding/products');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {serverError && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
          {serverError}
        </div>
      )}

      <div>
        <p className="text-sm text-white/50 mb-4">
          Las secciones organizan tu catálogo. Podés arrastrarlas para cambiar el orden.
        </p>

        {sections.length > 0 && (
          <SortableList
            items={sections}
            onReorder={handleReorder}
            renderItem={(section, handle) => (
              <div className="flex items-center gap-2 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5">
                {handle}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#FBF7EC] truncate">{section.name}</p>
                  <p className="text-xs text-white/30 truncate">/{section.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(section.id)}
                  className="flex-shrink-0 w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                  aria-label={`Eliminar sección ${section.name}`}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          />
        )}

        {sections.length === 0 && !addingNew && (
          <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
            <p className="text-sm text-white/40">Todavía no tenés secciones. Agregá la primera.</p>
          </div>
        )}
      </div>

      {/* Add new section */}
      {addingNew ? (
        <div className="flex gap-2">
          <input
            ref={newInputRef}
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAddSection(); }
              if (e.key === 'Escape') { setAddingNew(false); setNewName(''); }
            }}
            placeholder="Nombre de la sección"
            maxLength={40}
            className="flex-1 rounded-xl bg-white/8 border border-[#F5C84B]/50 text-[#FBF7EC] placeholder-white/30 px-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]"
          />
          <button
            type="button"
            onClick={handleAddSection}
            disabled={!newName.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm disabled:opacity-40 cursor-pointer"
          >
            Agregar
          </button>
          <button
            type="button"
            onClick={() => { setAddingNew(false); setNewName(''); }}
            className="px-3 py-2.5 rounded-xl text-white/50 hover:text-white/80 text-sm cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="flex items-center gap-2 text-sm text-[#F5C84B] hover:text-[#FAE08A] font-semibold transition-colors cursor-pointer"
        >
          <Plus size={16} />
          Agregar sección
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => router.push('/onboarding/look')}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} />
          Atrás
        </button>
        <button
          type="submit"
          disabled={submitting || sections.length === 0}
          className="min-h-[44px] px-8 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Siguiente →
        </button>
      </div>
    </form>
  );
}
