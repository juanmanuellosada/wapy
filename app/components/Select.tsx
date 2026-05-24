'use client';

import {
  useId,
  useRef,
  useState,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import { ChevronDown } from 'lucide-react';

export type SelectOption<T = string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export type SelectProps<T extends string = string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  id,
  disabled = false,
  ariaLabel,
  className = '',
}: SelectProps<T>) {
  const uid = useId();
  const listboxId = `${uid}-listbox`;

  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [flipUp, setFlipUp] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const typeBufferRef = useRef('');
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedLabel =
    value !== null
      ? (options.find((o) => o.value === value)?.label ?? placeholder)
      : null;

  const enabledIndices = options
    .map((o, i) => (o.disabled ? null : i))
    .filter((i): i is number => i !== null);

  // ── open / close ──────────────────────────────────────────────────────────

  const openDropdown = useCallback(() => {
    if (disabled) return;

    // Flip detection
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const estimatedHeight = 288; // max-h-72 = 288px
      setFlipUp(rect.bottom + estimatedHeight > window.innerHeight);
    }

    // Pre-focus the selected option (or first enabled)
    const selectedIdx = value !== null ? options.findIndex((o) => o.value === value) : -1;
    const idx = selectedIdx >= 0 ? selectedIdx : (enabledIndices[0] ?? -1);
    setFocusedIndex(idx);
    setOpen(true);
  }, [disabled, value, options, enabledIndices]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setFocusedIndex(-1);
  }, []);

  const select = useCallback(
    (idx: number) => {
      const opt = options[idx];
      if (!opt || opt.disabled) return;
      onChange(opt.value);
      closeDropdown();
      triggerRef.current?.focus();
    },
    [options, onChange, closeDropdown],
  );

  // ── click outside ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        closeDropdown();
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open, closeDropdown]);

  // ── focus first option when popover mounts ────────────────────────────────

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = popoverRef.current?.querySelector<HTMLElement>(
      `[id="${uid}-option-${focusedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, focusedIndex, uid]);

  // ── keyboard on trigger ───────────────────────────────────────────────────

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      openDropdown();
    }
  };

  // ── keyboard in popover ───────────────────────────────────────────────────

  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = (direction: 1 | -1) => {
      const current = enabledIndices.indexOf(focusedIndex);
      const next =
        direction === 1
          ? enabledIndices[(current + 1) % enabledIndices.length]
          : enabledIndices[(current - 1 + enabledIndices.length) % enabledIndices.length];
      if (next !== undefined) setFocusedIndex(next);
    };

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        if (enabledIndices.length) setFocusedIndex(enabledIndices[0]);
        break;
      case 'End':
        e.preventDefault();
        if (enabledIndices.length) setFocusedIndex(enabledIndices[enabledIndices.length - 1]);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) select(focusedIndex);
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        triggerRef.current?.focus();
        break;
      case 'Tab':
        closeDropdown();
        break;
      default: {
        // Type-to-find
        if (e.key.length === 1) {
          e.preventDefault();
          typeBufferRef.current += e.key.toLowerCase();
          if (typeTimerRef.current) clearTimeout(typeTimerRef.current);
          typeTimerRef.current = setTimeout(() => {
            typeBufferRef.current = '';
          }, 500);

          const char = typeBufferRef.current;
          // Find next enabled option whose label starts with the buffer
          const startFrom = focusedIndex < 0 ? 0 : focusedIndex + 1;
          const rotated = [...options.slice(startFrom), ...options.slice(0, startFrom)];
          const match = rotated.find(
            (o) => !o.disabled && o.label.toLowerCase().startsWith(char),
          );
          if (match) {
            setFocusedIndex(options.indexOf(match));
          }
        }
      }
    }
  };

  // ── derived a11y values ───────────────────────────────────────────────────

  const activeDescendant =
    open && focusedIndex >= 0 ? `${uid}-option-${focusedIndex}` : undefined;

  // ── render ────────────────────────────────────────────────────────────────

  const popover = open && (
    <div
      ref={popoverRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel ?? placeholder}
      onKeyDown={handleListKeyDown}
      tabIndex={-1}
      className={[
        'absolute left-0 right-0 z-50',
        'bg-[#16222E] border border-white/15 rounded-xl shadow-xl',
        'overflow-y-auto',
        'mt-1',
        flipUp ? 'bottom-full mb-1 mt-0' : 'top-full',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ maxHeight: '280px' }}
    >
      {options.map((opt, i) => {
        const isSelected = opt.value === value;
        const isFocused = i === focusedIndex;
        return (
          <button
            key={opt.value}
            id={`${uid}-option-${i}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-disabled={opt.disabled}
            disabled={opt.disabled}
            onPointerDown={(e) => {
              // prevent blur of trigger before select fires
              e.preventDefault();
              select(i);
            }}
            onMouseEnter={() => !opt.disabled && setFocusedIndex(i)}
            className={[
              'w-full text-left px-4 py-2.5 text-sm transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isSelected
                ? 'bg-[#F5C84B]/20 text-[#F5C84B]'
                : isFocused
                  ? 'bg-white/10 text-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? closeDropdown() : openDropdown())}
        onKeyDown={handleTriggerKeyDown}
        className={[
          'w-full flex items-center justify-between gap-2',
          'rounded-xl border min-h-[44px] px-4 py-2.5 text-sm',
          'transition-colors cursor-pointer',
          'focus:outline-none',
          selectedLabel !== null ? 'text-[#FBF7EC]' : 'text-white/40',
          open
            ? 'bg-white/8 border-white/15 ring-2 ring-[#F5C84B]'
            : 'bg-white/8 border-white/15 hover:border-white/30',
          disabled ? 'opacity-40 cursor-not-allowed' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="truncate">{selectedLabel ?? placeholder}</span>
        <ChevronDown
          size={16}
          className={[
            'shrink-0 text-white/40 transition-transform duration-150',
            open ? 'rotate-180' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </button>

      {popover}
    </div>
  );
}
