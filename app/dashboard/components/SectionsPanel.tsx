'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X, Loader2, CheckCircle, Pencil, GripVertical, ChevronRight } from 'lucide-react';
import { saveStoreSections } from '@/lib/store/actions';
import type { Store, Section } from '@/lib/onboarding/state';

type Props = {
  store: Store;
  initialSections: Section[];
  sectionsCount: number;
  sectionsLimit: number;
  limitIsUnlimited: boolean;
};

type SectionDraft = {
  id: string; // real DB id or temp id prefixed with 'new-'
  name: string;
  slug: string;
  position: number;
  parent_id: string | null;
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

function makeUniqueSlug(base: string, existing: SectionDraft[]): string {
  const slugBase = slugifySection(base) || 'seccion';
  const usedSlugs = new Set(existing.map((s) => s.slug));
  if (!usedSlugs.has(slugBase)) return slugBase;
  let i = 2;
  while (usedSlugs.has(`${slugBase}-${i}`)) i++;
  return `${slugBase}-${i}`;
}

// ---------------------------------------------------------------------------
// SortableSectionItem — renders a single draggable row (top-level or sub)
// ---------------------------------------------------------------------------

type SortableItemProps = {
  section: SectionDraft;
  isSubsection: boolean;
  editingId: string | null;
  onEdit: (id: string) => void;
  onNameChange: (id: string, name: string) => void;
  onEditCommit: () => void;
  onDelete: (id: string) => void;
  onAddSubsection?: (parentId: string) => void;
  expanded?: boolean;
  onToggle?: (id: string) => void;
  childCount?: number;
};

function SortableSectionItem({
  section,
  isSubsection,
  editingId,
  onEdit,
  onNameChange,
  onEditCommit,
  onDelete,
  onAddSubsection,
  expanded,
  onToggle,
  childCount,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { type: 'item', parentId: section.parent_id },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const hasChildren = !isSubsection && (childCount ?? 0) > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-2 border border-white/10 rounded-xl px-3 py-2.5 ${
          isSubsection ? 'bg-white/4 ml-6' : 'bg-white/6'
        }`}
      >
        {/* Toggle (only for top-level with children) */}
        {!isSubsection && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggle?.(section.id)}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors cursor-pointer"
            aria-label={expanded ? 'Colapsar subsecciones' : 'Expandir subsecciones'}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
        {isSubsection && <div className="flex-shrink-0 w-5" />}

        {/* Drag handle */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 p-1 touch-none flex-shrink-0"
          aria-label="Mover"
        >
          <GripVertical size={16} />
        </button>

        {/* Name / inline edit */}
        <div className="flex-1 min-w-0">
          {editingId === section.id ? (
            <input
              type="text"
              autoFocus
              value={section.name}
              maxLength={40}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onNameChange(section.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault();
                  onEditCommit();
                }
              }}
              onBlur={onEditCommit}
              className="w-full bg-white/8 border border-[#F5C84B]/50 rounded-lg px-2 py-0.5 text-sm font-semibold text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-[#F5C84B] truncate"
              aria-label={`Editar nombre de sección ${section.name}`}
            />
          ) : (
            <p className="text-sm font-semibold text-[#FBF7EC] truncate">{section.name}</p>
          )}
          <p className="text-xs text-white/30 truncate">/{section.slug}</p>
        </div>

        {/* + Subsección (only on top-level) */}
        {!isSubsection && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onAddSubsection?.(section.id)}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-white/30 hover:text-[#F5C84B] transition-colors cursor-pointer px-1 py-1 rounded"
            title="Agregar subsección"
            aria-label={`Agregar subsección a ${section.name}`}
          >
            <Plus size={12} />
            <span className="hidden sm:inline">Sub</span>
          </button>
        )}

        {/* Edit pencil */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onEdit(section.id)}
          className="flex-shrink-0 w-7 h-7 rounded-lg text-white/40 hover:text-[#F5C84B] flex items-center justify-center transition-colors cursor-pointer"
          aria-label={`Editar nombre de sección ${section.name}`}
        >
          <Pencil size={13} />
        </button>

        {/* Delete */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(section.id)}
          className="flex-shrink-0 w-7 h-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
          aria-label={`Eliminar sección ${section.name}`}
        >
          <X size={14} />
        </button>
      </div>

      {/* Child drop zone — shown only when this top-level section is expanded */}
      {!isSubsection && expanded && (
        <SubsectionDropZone parentId={section.id} hasChildren={hasChildren} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubsectionDropZone — droppable wrapper that wraps the children list.
// We make it droppable so a subsection dragged from another parent can land here.
// ---------------------------------------------------------------------------

function SubsectionDropZone({ parentId, hasChildren }: { parentId: string; hasChildren: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `container-${parentId}`,
    data: { type: 'container', parentId },
  });

  return (
    <div
      ref={setNodeRef}
      className={`ml-6 mt-1 rounded-xl transition-colors ${
        isOver ? 'bg-[#F5C84B]/5 ring-1 ring-[#F5C84B]/20' : ''
      } ${!hasChildren ? 'min-h-[8px]' : ''}`}
    />
  );
}

// ---------------------------------------------------------------------------
// DragOverlay preview pill
// ---------------------------------------------------------------------------

function DragPreview({ name, isSubsection }: { name: string; isSubsection: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 border border-white/20 rounded-xl px-3 py-2.5 shadow-xl ${
        isSubsection ? 'bg-[#16222E]/95 ml-6' : 'bg-[#16222E]/95'
      }`}
    >
      <GripVertical size={16} className="text-white/40" />
      <p className="text-sm font-semibold text-[#FBF7EC] truncate max-w-[200px]">{name}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionsPanel
// ---------------------------------------------------------------------------

export function SectionsPanel({ store, initialSections, sectionsLimit, limitIsUnlimited }: Props) {
  const [sections, setSections] = useState<SectionDraft[]>(() =>
    initialSections.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      position: s.position,
      parent_id: (s as unknown as { parent_id: string | null }).parent_id ?? null,
    }))
  );

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNewParentId, setAddingNewParentId] = useState<string | null>(null); // null = top-level, string = subsection of that id
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Derived
  const topLevel = sections.filter((s) => s.parent_id === null).sort((a, b) => a.position - b.position);
  const topLevelCount = topLevel.length;
  const atSectionsLimit = !limitIsUnlimited && topLevelCount >= sectionsLimit;
  const activeSection = activeId ? sections.find((s) => s.id === activeId) : null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function childrenOf(parentId: string) {
    return sections.filter((s) => s.parent_id === parentId).sort((a, b) => a.position - b.position);
  }

  function reassignPositions(list: SectionDraft[]): SectionDraft[] {
    // Assign positions per group: top-level among themselves, children per parent
    const result = [...list];
    const byParent = new Map<string | null, SectionDraft[]>();
    for (const s of result) {
      const key = s.parent_id;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(s);
    }
    const out: SectionDraft[] = [];
    for (const [, group] of byParent) {
      group.forEach((s, i) => out.push({ ...s, position: i }));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Toggle
  // ---------------------------------------------------------------------------

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Add section (top-level)
  // ---------------------------------------------------------------------------

  const handleAddSection = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setSections((prev) => {
      const slug = makeUniqueSlug(trimmed, prev);
      const newSection: SectionDraft = {
        id: `new-${Date.now()}`,
        name: trimmed,
        slug,
        position: prev.filter((s) => s.parent_id === null).length,
        parent_id: null,
        isNew: true,
      };
      return [...prev, newSection];
    });
    setNewName('');
    setAddingNew(false);
    setAddingNewParentId(null);
  };

  // ---------------------------------------------------------------------------
  // Add subsection
  // ---------------------------------------------------------------------------

  const handleAddSubsection = (parentId: string) => {
    setExpandedIds((prev) => new Set([...prev, parentId]));
    setAddingNewParentId(parentId);
    setAddingNew(true);
    setNewName('');
  };

  const handleAddSubsectionCommit = () => {
    const trimmed = newName.trim();
    if (!trimmed || !addingNewParentId) return;

    setSections((prev) => {
      const slug = makeUniqueSlug(trimmed, prev);
      const siblings = prev.filter((s) => s.parent_id === addingNewParentId);
      const newSub: SectionDraft = {
        id: `new-${Date.now()}`,
        name: trimmed,
        slug,
        position: siblings.length,
        parent_id: addingNewParentId,
        isNew: true,
      };
      return [...prev, newSub];
    });
    setNewName('');
    setAddingNew(false);
    setAddingNewParentId(null);
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  const handleDelete = (id: string) => {
    setSections((prev) => {
      // Remove the item and all its children (cascade)
      const filtered = prev.filter((s) => s.id !== id && s.parent_id !== id);
      return reassignPositions(filtered);
    });
  };

  // ---------------------------------------------------------------------------
  // Inline edit
  // ---------------------------------------------------------------------------

  const handleNameChange = (id: string, name: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name, slug: slugifySection(name) || s.slug } : s
      )
    );
  };

  const handleEditCommit = () => setEditingId(null);

  // ---------------------------------------------------------------------------
  // Drag handlers
  // ---------------------------------------------------------------------------

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    if (activeIdStr === overIdStr) return;

    const activeSec = sections.find((s) => s.id === activeIdStr);
    if (!activeSec) return;

    const overType = (over.data.current as { type?: string })?.type;

    // Case 1: dropped on a container → reparent subsection to that container's parent
    if (overType === 'container') {
      const newParentId = (over.data.current as { parentId: string }).parentId;
      // Only allow reparenting subsections (activeSec.parent_id !== null)
      if (activeSec.parent_id === null) return;
      // Target parent must be top-level (not itself a subsection)
      const targetParent = sections.find((s) => s.id === newParentId);
      if (!targetParent || targetParent.parent_id !== null) return;

      setSections((prev) => {
        const newSiblings = prev.filter((s) => s.parent_id === newParentId);
        const updated = prev.map((s) =>
          s.id === activeIdStr
            ? { ...s, parent_id: newParentId, position: newSiblings.length }
            : s
        );
        return reassignPositions(updated);
      });
      // Expand target parent
      setExpandedIds((prev) => new Set([...prev, newParentId]));
      return;
    }

    const overSec = sections.find((s) => s.id === overIdStr);
    if (!overSec) return;

    // Case 2: both are top-level → reorder top-level
    if (activeSec.parent_id === null && overSec.parent_id === null) {
      setSections((prev) => {
        const topLevelItems = prev.filter((s) => s.parent_id === null).sort((a, b) => a.position - b.position);
        const oldIdx = topLevelItems.findIndex((s) => s.id === activeIdStr);
        const newIdx = topLevelItems.findIndex((s) => s.id === overIdStr);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const reordered = arrayMove(topLevelItems, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
        const others = prev.filter((s) => s.parent_id !== null);
        return [...reordered, ...others];
      });
      return;
    }

    // Case 3: both are subsections under the same parent → reorder within parent
    if (
      activeSec.parent_id !== null &&
      overSec.parent_id !== null &&
      activeSec.parent_id === overSec.parent_id
    ) {
      const parentId = activeSec.parent_id;
      setSections((prev) => {
        const siblings = prev.filter((s) => s.parent_id === parentId).sort((a, b) => a.position - b.position);
        const oldIdx = siblings.findIndex((s) => s.id === activeIdStr);
        const newIdx = siblings.findIndex((s) => s.id === overIdStr);
        if (oldIdx === -1 || newIdx === -1) return prev;
        const reordered = arrayMove(siblings, oldIdx, newIdx).map((s, i) => ({ ...s, position: i }));
        const others = prev.filter((s) => s.parent_id !== parentId);
        return [...others, ...reordered];
      });
      return;
    }

    // Case 4: subsection dropped on a different parent's subsection → reparent
    if (
      activeSec.parent_id !== null &&
      overSec.parent_id !== null &&
      activeSec.parent_id !== overSec.parent_id
    ) {
      const newParentId = overSec.parent_id;
      // Target parent must be top-level
      const targetParent = sections.find((s) => s.id === newParentId);
      if (!targetParent || targetParent.parent_id !== null) return;

      setSections((prev) => {
        const newSiblings = prev.filter((s) => s.parent_id === newParentId);
        const overIdx = newSiblings.findIndex((s) => s.id === overIdStr);
        const insertAt = overIdx === -1 ? newSiblings.length : overIdx;
        const withoutActive = prev.filter((s) => s.id !== activeIdStr);
        const updated = withoutActive.map((s) => {
          if (s.parent_id === newParentId && s.position >= insertAt) {
            return { ...s, position: s.position + 1 };
          }
          return s;
        });
        updated.push({ ...activeSec, parent_id: newParentId, position: insertAt });
        return reassignPositions(updated);
      });
      setExpandedIds((prev) => new Set([...prev, newParentId]));
    }
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    setServerError(null);

    const result = await saveStoreSections({
      sections: sections.map((s) => ({
        id: s.isNew ? undefined : s.id,
        name: s.name,
        slug: s.slug,
        position: s.position,
        parent_id: s.parent_id,
      })),
    });

    setSaving(false);

    if ('error' in result) {
      setServerError(result.error);
      return;
    }

    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isAddingForParent = addingNew && addingNewParentId !== null;
  const isAddingTopLevel = addingNew && addingNewParentId === null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold text-[#FBF7EC]">Secciones</h1>
        {!limitIsUnlimited && (
          <span
            className={`text-xs font-medium tabular-nums ${
              atSectionsLimit ? 'text-[#F5C84B]' : 'text-white/40'
            }`}
          >
            {topLevelCount} / {sectionsLimit}
          </span>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 mb-4"
        >
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <p className="text-sm text-white/50">
          Las secciones organizan tu catálogo. Podés arrastrarlas para cambiar el orden. Usá el toggle ▸ para expandir y agregar subsecciones.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={topLevel.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2">
              {topLevel.map((section) => {
                const children = childrenOf(section.id);
                const isExpanded = expandedIds.has(section.id);

                return (
                  <div key={section.id}>
                    <SortableSectionItem
                      section={section}
                      isSubsection={false}
                      editingId={editingId}
                      onEdit={setEditingId}
                      onNameChange={handleNameChange}
                      onEditCommit={handleEditCommit}
                      onDelete={handleDelete}
                      onAddSubsection={handleAddSubsection}
                      expanded={isExpanded}
                      onToggle={handleToggle}
                      childCount={children.length}
                    />

                    {/* Subsections list (expanded) */}
                    {isExpanded && (
                      <div className="ml-6 mt-1 flex flex-col gap-1.5">
                        <SortableContext
                          items={children.map((c) => c.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {children.map((child) => (
                            <SortableSectionItem
                              key={child.id}
                              section={child}
                              isSubsection={true}
                              editingId={editingId}
                              onEdit={setEditingId}
                              onNameChange={handleNameChange}
                              onEditCommit={handleEditCommit}
                              onDelete={handleDelete}
                            />
                          ))}
                        </SortableContext>

                        {/* Drop zone for reparenting from other parents */}
                        <SubsectionDropZone
                          parentId={section.id}
                          hasChildren={children.length > 0}
                        />

                        {/* Inline add subsection form */}
                        {isAddingForParent && addingNewParentId === section.id ? (
                          <div className="flex gap-2 mt-1">
                            <input
                              type="text"
                              autoFocus
                              value={newName}
                              onChange={(e) => setNewName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddSubsectionCommit();
                                }
                                if (e.key === 'Escape') {
                                  setAddingNew(false);
                                  setAddingNewParentId(null);
                                  setNewName('');
                                }
                              }}
                              placeholder="Nombre de la subsección"
                              maxLength={40}
                              className="flex-1 rounded-xl bg-white/8 border border-[#F5C84B]/50 text-[#FBF7EC] placeholder-white/30 px-4 py-2 text-sm focus:outline-none focus:border-[#F5C84B]"
                            />
                            <button
                              type="button"
                              onClick={handleAddSubsectionCommit}
                              disabled={!newName.trim()}
                              className="px-3 py-2 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm disabled:opacity-40 cursor-pointer"
                            >
                              Agregar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAddingNew(false);
                                setAddingNewParentId(null);
                                setNewName('');
                              }}
                              className="px-2 py-2 rounded-xl text-white/50 hover:text-white/80 text-sm cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeSection ? (
              <DragPreview
                name={activeSection.name}
                isSubsection={activeSection.parent_id !== null}
              />
            ) : null}
          </DragOverlay>
        </DndContext>

        {topLevel.length === 0 && !addingNew && (
          <div className="border-2 border-dashed border-white/15 rounded-xl px-6 py-8 text-center">
            <p className="text-sm text-white/40">No hay secciones. Agregá la primera.</p>
          </div>
        )}

        {/* Add new top-level section input */}
        {isAddingTopLevel ? (
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSection();
                }
                if (e.key === 'Escape') {
                  setAddingNew(false);
                  setNewName('');
                }
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
              onClick={() => {
                setAddingNew(false);
                setNewName('');
              }}
              className="px-3 py-2.5 rounded-xl text-white/50 hover:text-white/80 text-sm cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setAddingNew(true);
                setAddingNewParentId(null);
              }}
              disabled={atSectionsLimit}
              className="flex items-center gap-2 text-sm text-[#F5C84B] hover:text-[#FAE08A] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Agregar sección
            </button>
            {!limitIsUnlimited && atSectionsLimit && (
              <a
                href="/#precios"
                className="text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                Pasate a Pro para sumar secciones ilimitadas →
              </a>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          {success && (
            <span className="flex items-center gap-1.5 text-sm text-green-400">
              <CheckCircle size={14} />
              Guardado
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] px-6 rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
