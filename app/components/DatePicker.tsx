'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

export type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  className?: string;
  ariaLabel?: string;
};

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAYS_ES = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function parseDate(iso: string): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDisplay(iso: string): string {
  const p = parseDate(iso);
  if (!p) return '';
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function compareDate(a: string, b: string): number {
  if (!a || !b) return 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Seleccionar',
  min,
  max,
  className = '',
  ariaLabel,
}: DatePickerProps) {
  const today = todayISO();
  const parsed = parseDate(value);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState<number>(() => parsed?.y ?? parseDate(today)!.y);
  const [viewMonth, setViewMonth] = useState<number>(() => parsed?.m ?? parseDate(today)!.m);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPicker = useCallback(() => {
    const p = parseDate(value);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    } else {
      const t = parseDate(today)!;
      setViewYear(t.y);
      setViewMonth(t.m);
    }
    setOpen(true);
  }, [value, today]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        close();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open, close]);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const selectDay = (iso: string) => {
    onChange(iso);
    close();
  };

  const isDisabled = (iso: string): boolean => {
    if (min && compareDate(iso, min) < 0) return true;
    if (max && compareDate(iso, max) > 0) return true;
    return false;
  };

  const buildGrid = () => {
    const firstDayOfMonth = new Date(viewYear, viewMonth - 1, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;
    const totalDays = daysInMonth(viewYear, viewMonth);
    const cells: Array<{ iso: string; inMonth: boolean }> = [];

    const prevMonthDays = daysInMonth(
      viewMonth === 1 ? viewYear - 1 : viewYear,
      viewMonth === 1 ? 12 : viewMonth - 1,
    );
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 1 ? 12 : viewMonth - 1;
      const y = viewMonth === 1 ? viewYear - 1 : viewYear;
      cells.push({ iso: toISO(y, m, d), inMonth: false });
    }

    for (let d = 1; d <= totalDays; d++) {
      cells.push({ iso: toISO(viewYear, viewMonth, d), inMonth: true });
    }

    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 12 ? 1 : viewMonth + 1;
      const y = viewMonth === 12 ? viewYear + 1 : viewYear;
      cells.push({ iso: toISO(y, m, d), inMonth: false });
    }

    return cells;
  };

  const cells = open ? buildGrid() : [];

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        onClick={() => (open ? close() : openPicker())}
        className={[
          'flex items-center gap-2 rounded-xl border border-white/15',
          'bg-white/5 px-3 py-2 text-sm text-[#FBF7EC]',
          'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#F5C84B]/30 cursor-pointer',
          'transition-colors whitespace-nowrap',
          open ? 'ring-2 ring-[#F5C84B]/30 bg-white/10' : '',
          !value ? 'text-white/40' : '',
        ].filter(Boolean).join(' ')}
      >
        <Calendar size={14} className="shrink-0 text-white/40" />
        <span>{value ? formatDisplay(value) : placeholder}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-50 mt-2 rounded-xl border border-white/15 bg-[#0E1820] p-3 shadow-2xl backdrop-blur-md"
          style={{ minWidth: '252px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-medium text-[#FBF7EC]">
              {MONTHS_ES[viewMonth - 1]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_ES.map((d) => (
              <div key={d} className="w-8 h-7 flex items-center justify-center text-xs text-white/30 font-medium">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((cell, idx) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === today;
              const disabled = isDisabled(cell.iso);
              const outOfMonth = !cell.inMonth;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabled || outOfMonth}
                  onClick={() => selectDay(cell.iso)}
                  className={[
                    'w-8 h-8 rounded-md text-sm flex items-center justify-center transition-colors',
                    outOfMonth
                      ? 'text-white/15 cursor-default'
                      : disabled
                        ? 'text-white/20 cursor-not-allowed opacity-40'
                        : isSelected
                          ? 'bg-[#F5C84B] text-[#16222E] font-semibold cursor-pointer'
                          : isToday
                            ? 'border border-white/30 text-white/80 hover:bg-white/10 cursor-pointer'
                            : 'text-white/80 hover:bg-white/10 cursor-pointer',
                  ].filter(Boolean).join(' ')}
                >
                  {parseDate(cell.iso)?.d}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => { selectDay(today); }}
              disabled={isDisabled(today)}
              className="text-xs text-white/50 hover:text-white/80 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Hoy
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(''); close(); }}
                className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors cursor-pointer"
              >
                <X size={11} />
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
