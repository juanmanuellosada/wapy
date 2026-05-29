"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import type { CatalogFilters } from "./filters";
import { DEFAULT_FILTERS } from "./filters";

export interface SectionLite {
  id: string;
  name: string;
}

interface Props {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  sections: SectionLite[];
  accentColor: string;
}

// ─── Active pills ─────────────────────────────────────────────────────────────

function ActivePills({
  filters,
  sections,
  accentColor,
  onRemove,
  onClearAll,
}: {
  filters: CatalogFilters;
  sections: SectionLite[];
  accentColor: string;
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  const pills: { key: string; label: string }[] = [];

  if (filters.q.trim()) pills.push({ key: "q", label: `Buscar: ${filters.q.trim()}` });
  if (filters.priceMin !== null && filters.priceMax !== null) {
    pills.push({
      key: "price",
      label: `Precio: $${filters.priceMin.toLocaleString("es-AR")} – $${filters.priceMax.toLocaleString("es-AR")}`,
    });
  } else if (filters.priceMin !== null) {
    pills.push({ key: "price", label: `Precio desde: $${filters.priceMin.toLocaleString("es-AR")}` });
  } else if (filters.priceMax !== null) {
    pills.push({ key: "price", label: `Precio hasta: $${filters.priceMax.toLocaleString("es-AR")}` });
  }
  for (const id of filters.sectionIds) {
    const sec = sections.find((s) => s.id === id);
    if (sec) pills.push({ key: `sec:${id}`, label: `Sección: ${sec.name}` });
  }
  if (filters.inStockOnly) pills.push({ key: "stock", label: "Con stock" });

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
        >
          {p.label}
          <button
            onClick={() => onRemove(p.key)}
            className="flex items-center justify-center h-4 w-4 rounded-full cursor-pointer transition-opacity hover:opacity-70"
            aria-label={`Quitar filtro ${p.label}`}
          >
            <X className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {pills.length >= 2 && (
        <button
          onClick={onClearAll}
          className="text-xs font-medium rounded-full px-2.5 py-1 cursor-pointer transition-opacity hover:opacity-70"
          style={{ color: "var(--store-ink-muted)" }}
        >
          Limpiar todos
        </button>
      )}
    </div>
  );
}

// ─── Filter controls (shared between popover and sheet) ───────────────────────

function FilterControls({
  draft,
  onChange,
  sections,
  accentColor,
}: {
  draft: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  sections: SectionLite[];
  accentColor: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
          Buscar
        </label>
        <input
          type="search"
          value={draft.q}
          onChange={(e) => onChange({ ...draft, q: e.target.value })}
          placeholder="Nombre del producto..."
          className="store-search-input px-3 py-2 text-sm w-full"
          aria-label="Buscar productos"
        />
      </div>

      {/* Price range */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
          Precio (ARS)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={100}
            value={draft.priceMin ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...draft, priceMin: v === "" ? null : parseInt(v, 10) });
            }}
            placeholder="Mínimo"
            className="store-search-input px-3 py-2 text-sm w-full"
            aria-label="Precio mínimo"
          />
          <span className="text-xs shrink-0" style={{ color: "var(--store-ink-muted)" }}>–</span>
          <input
            type="number"
            min={0}
            step={100}
            value={draft.priceMax ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...draft, priceMax: v === "" ? null : parseInt(v, 10) });
            }}
            placeholder="Máximo"
            className="store-search-input px-3 py-2 text-sm w-full"
            aria-label="Precio máximo"
          />
        </div>
      </div>

      {/* Sections */}
      {sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--store-ink-secondary)" }}>
            Sección
          </span>
          <div className="flex flex-col gap-1">
            {sections.map((s) => {
              const checked = draft.sectionIds.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked
                        ? draft.sectionIds.filter((id) => id !== s.id)
                        : [...draft.sectionIds, s.id];
                      onChange({ ...draft, sectionIds: next });
                    }}
                    style={{ accentColor }}
                    aria-label={`Filtrar por sección ${s.name}`}
                  />
                  <span className="text-sm" style={{ color: "var(--store-ink)" }}>
                    {s.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Stock */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.inStockOnly}
          onChange={(e) => onChange({ ...draft, inStockOnly: e.target.checked })}
          style={{ accentColor }}
          aria-label="Mostrar solo productos con stock disponible"
        />
        <span className="text-sm font-medium" style={{ color: "var(--store-ink)" }}>
          Sólo con stock
        </span>
      </label>
    </div>
  );
}

// ─── Desktop popover ──────────────────────────────────────────────────────────

function DesktopPopover({
  filters,
  sections,
  accentColor,
  onApply,
}: {
  filters: CatalogFilters;
  sections: SectionLite[];
  accentColor: string;
  onApply: (next: CatalogFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogFilters>(filters);
  const popoverRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Sync draft when external filters change (e.g. pill removal)
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  function handleClearAll() {
    setDraft(DEFAULT_FILTERS);
    onApply(DEFAULT_FILTERS);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
        style={{
          background: open ? accentColor : "var(--store-border)",
          color: open ? "#ffffff" : "var(--store-ink-secondary)",
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Abrir panel de filtros"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filtros
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 mt-2 z-30 rounded-2xl p-4 min-w-[260px]"
          style={{
            background: "var(--store-surface)",
            boxShadow: "var(--store-shadow-lg)",
            border: "1px solid var(--store-border)",
          }}
          role="dialog"
          aria-label="Filtros del catálogo"
        >
          <FilterControls
            draft={draft}
            onChange={setDraft}
            sections={sections}
            accentColor={accentColor}
          />
          <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--store-border)" }}>
            <button
              onClick={handleClearAll}
              className="flex-1 rounded-full py-2 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
            >
              Limpiar todos
            </button>
            <button
              onClick={handleApply}
              className="flex-1 rounded-full py-2 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: accentColor, color: "#ffffff" }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mobile bottom-sheet ──────────────────────────────────────────────────────

function MobileSheet({
  filters,
  sections,
  accentColor,
  onApply,
}: {
  filters: CatalogFilters;
  sections: SectionLite[];
  accentColor: string;
  onApply: (next: CatalogFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogFilters>(filters);

  // Sync draft when external filters change
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  function handleClearAll() {
    setDraft(DEFAULT_FILTERS);
    onApply(DEFAULT_FILTERS);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
        style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
        aria-haspopup="dialog"
        aria-label="Abrir panel de filtros"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Filtros
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl flex flex-col"
            style={{
              background: "var(--store-surface)",
              maxHeight: "80dvh",
              boxShadow: "var(--store-shadow-lg)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Filtros del catálogo"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: "1px solid var(--store-border)" }}
            >
              <h2 className="text-base font-semibold" style={{ color: "var(--store-ink)" }}>
                Filtros
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: "var(--store-ink-secondary)" }}
                aria-label="Cerrar panel de filtros"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <FilterControls
                draft={draft}
                onChange={setDraft}
                sections={sections}
                accentColor={accentColor}
              />
            </div>

            {/* Footer */}
            <div
              className="flex items-center gap-3 px-5 py-4 shrink-0"
              style={{ borderTop: "1px solid var(--store-border)" }}
            >
              <button
                onClick={handleClearAll}
                className="flex-1 rounded-full py-3 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: "var(--store-border)", color: "var(--store-ink-secondary)" }}
              >
                Limpiar todos
              </button>
              <button
                onClick={handleApply}
                className="flex-1 rounded-full py-3 text-sm font-semibold cursor-pointer transition-opacity hover:opacity-80"
                style={{ background: accentColor, color: "#ffffff" }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function CatalogFilters({ filters, onChange, sections, accentColor }: Props) {
  function handlePillRemove(key: string) {
    if (key === "q") onChange({ ...filters, q: "" });
    else if (key === "price") onChange({ ...filters, priceMin: null, priceMax: null });
    else if (key === "stock") onChange({ ...filters, inStockOnly: false });
    else if (key.startsWith("sec:")) {
      const id = key.slice(4);
      onChange({ ...filters, sectionIds: filters.sectionIds.filter((s) => s !== id) });
    }
  }

  function handleClearAll() {
    onChange(DEFAULT_FILTERS);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Button row */}
      <div className="flex items-center gap-2">
        {/* Desktop popover */}
        <div className="hidden lg:block">
          <DesktopPopover
            filters={filters}
            sections={sections}
            accentColor={accentColor}
            onApply={onChange}
          />
        </div>
        {/* Mobile sheet */}
        <div className="lg:hidden">
          <MobileSheet
            filters={filters}
            sections={sections}
            accentColor={accentColor}
            onApply={onChange}
          />
        </div>
      </div>

      {/* Active pills */}
      <ActivePills
        filters={filters}
        sections={sections}
        accentColor={accentColor}
        onRemove={handlePillRemove}
        onClearAll={handleClearAll}
      />
    </div>
  );
}
