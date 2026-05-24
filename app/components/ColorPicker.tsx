'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';

// ---------------------------------------------------------------------------
// Color math — pure functions, no deps
// ---------------------------------------------------------------------------

type HSV = { h: number; s: number; v: number }; // h: 0–360, s/v: 0–100
type RGB = { r: number; g: number; b: number };  // 0–255

function hexToRgb(hex: string): RGB | null {
  const clean = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : Math.round((delta / max) * 100);
  const v = Math.round(max * 100);

  return { h, s, v };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const ss = s / 100;
  const vv = v / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vv - c;

  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; b = 0; }
  else if (h < 120){ r = x; g = c; b = 0; }
  else if (h < 180){ r = 0; g = c; b = x; }
  else if (h < 240){ r = 0; g = x; b = c; }
  else if (h < 300){ r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function hexToHsv(hex: string): HSV | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : null;
}

function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

// ---------------------------------------------------------------------------
// Clamp helper
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// ---------------------------------------------------------------------------
// ColorPicker component
// ---------------------------------------------------------------------------

type ColorPickerProps = {
  value: string;
  onChange: (hex: string) => void;
  id?: string;
  ariaLabel?: string;
};

const PLANE_SIZE = 220;
const HUE_HEIGHT = 14;
const THUMB_R = 8;

export function ColorPicker({ value, onChange, id, ariaLabel }: ColorPickerProps) {
  // Internal HSV state — keeps hue when saturation is dragged to 0
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? { h: 0, s: 100, v: 100 });

  // Hex input local state (so user can type freely without intermediate onChange fires)
  const [hexInput, setHexInput] = useState(value.toLowerCase());
  const [copied, setCopied] = useState(false);

  const planeRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Sync incoming value changes (controlled)
  useEffect(() => {
    const incoming = hexToHsv(value);
    if (!incoming) return;
    // Only update internal state if the hex differs from what we'd produce
    if (hsvToHex(hsv) !== value.toLowerCase()) {
      setHsv(incoming);
    }
    setHexInput(value.toLowerCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Derive the pure-hue color for the plane background
  const hueHex = hsvToHex({ h: hsv.h, s: 100, v: 100 });

  // ---------------------------------------------------------------------------
  // SV plane drag
  // ---------------------------------------------------------------------------

  const planeDragging = useRef(false);

  const updateFromPlaneEvent = useCallback(
    (e: PointerEvent) => {
      const el = planeRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const s = clamp(Math.round(((e.clientX - rect.left) / rect.width) * 100), 0, 100);
      const v = clamp(Math.round((1 - (e.clientY - rect.top) / rect.height) * 100), 0, 100);
      const next = { ...hsv, s, v };
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange]
  );

  const handlePlanePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      planeDragging.current = true;
      updateFromPlaneEvent(e.nativeEvent as PointerEvent);
    },
    [updateFromPlaneEvent]
  );

  const handlePlanePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!planeDragging.current) return;
      updateFromPlaneEvent(e.nativeEvent as PointerEvent);
    },
    [updateFromPlaneEvent]
  );

  const handlePlanePointerUp = useCallback(() => {
    planeDragging.current = false;
  }, []);

  const handlePlaneKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 1;
      let { s, v } = hsv;
      if (e.key === 'ArrowRight') s = clamp(s + step, 0, 100);
      else if (e.key === 'ArrowLeft') s = clamp(s - step, 0, 100);
      else if (e.key === 'ArrowUp') v = clamp(v + step, 0, 100);
      else if (e.key === 'ArrowDown') v = clamp(v - step, 0, 100);
      else return;
      e.preventDefault();
      const next = { ...hsv, s, v };
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange]
  );

  // ---------------------------------------------------------------------------
  // Hue slider drag
  // ---------------------------------------------------------------------------

  const hueDragging = useRef(false);

  const updateFromHueEvent = useCallback(
    (e: PointerEvent) => {
      const el = hueRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = clamp(Math.round(((e.clientX - rect.left) / rect.width) * 360), 0, 360);
      const next = { ...hsv, h };
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange]
  );

  const handleHuePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      hueDragging.current = true;
      updateFromHueEvent(e.nativeEvent as PointerEvent);
    },
    [updateFromHueEvent]
  );

  const handleHuePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!hueDragging.current) return;
      updateFromHueEvent(e.nativeEvent as PointerEvent);
    },
    [updateFromHueEvent]
  );

  const handleHuePointerUp = useCallback(() => {
    hueDragging.current = false;
  }, []);

  const handleHueKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 1;
      let { h } = hsv;
      if (e.key === 'ArrowRight') h = clamp(h + step, 0, 360);
      else if (e.key === 'ArrowLeft') h = clamp(h - step, 0, 360);
      else return;
      e.preventDefault();
      const next = { ...hsv, h };
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange]
  );

  // ---------------------------------------------------------------------------
  // Hex input
  // ---------------------------------------------------------------------------

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setHexInput(raw);
    // Normalise: strip leading # if user typed it
    const stripped = raw.replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(stripped)) {
      const hex = '#' + stripped.toLowerCase();
      const parsed = hexToHsv(hex);
      if (parsed) {
        setHsv(parsed);
        onChange(hex);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Copy
  // ---------------------------------------------------------------------------

  const handleCopy = async () => {
    const hex = hsvToHex(hsv);
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silent fail
    }
  };

  // ---------------------------------------------------------------------------
  // Derived positions for thumbs
  // ---------------------------------------------------------------------------

  const thumbX = (hsv.s / 100) * PLANE_SIZE;
  const thumbY = (1 - hsv.v / 100) * PLANE_SIZE;
  const hueX = (hsv.h / 360) * 100; // percentage

  const currentHex = hsvToHex(hsv);

  return (
    <div className="space-y-3 select-none" id={id}>
      {/* SV plane */}
      <div
        ref={planeRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel ?? 'Seleccionar color'}
        aria-valuetext={`Saturación ${hsv.s}%, Brillo ${hsv.v}%`}
        onPointerDown={handlePlanePointerDown}
        onPointerMove={handlePlanePointerMove}
        onPointerUp={handlePlanePointerUp}
        onKeyDown={handlePlaneKeyDown}
        className="relative rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B]"
        style={{
          width: PLANE_SIZE,
          height: PLANE_SIZE,
          cursor: planeDragging.current ? 'none' : 'crosshair',
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, ${hueHex})
          `,
        }}
      >
        {/* Thumb */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: thumbX,
            top: thumbY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full border-2 shadow-md"
            style={{
              width: THUMB_R * 2,
              height: THUMB_R * 2,
              backgroundColor: currentHex,
              borderColor: 'rgba(255,255,255,0.9)',
              boxShadow: '0 0 0 1.5px rgba(22,34,46,0.4), 0 2px 6px rgba(0,0,0,0.4)',
            }}
          />
        </div>
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        role="slider"
        tabIndex={0}
        aria-label="Matiz"
        aria-valuetext={`Matiz ${hsv.h}°`}
        onPointerDown={handleHuePointerDown}
        onPointerMove={handleHuePointerMove}
        onPointerUp={handleHuePointerUp}
        onKeyDown={handleHueKeyDown}
        className="relative rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5C84B]"
        style={{
          width: PLANE_SIZE,
          height: HUE_HEIGHT,
          cursor: hueDragging.current ? 'grabbing' : 'grab',
          background:
            'linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
        }}
      >
        {/* Thumb */}
        <div
          className="absolute top-1/2 pointer-events-none"
          style={{
            left: `${hueX}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full border-2"
            style={{
              width: HUE_HEIGHT + 4,
              height: HUE_HEIGHT + 4,
              backgroundColor: `hsl(${hsv.h} 100% 50%)`,
              borderColor: 'rgba(255,255,255,0.9)',
              boxShadow: '0 0 0 1.5px rgba(22,34,46,0.4), 0 2px 4px rgba(0,0,0,0.3)',
            }}
          />
        </div>
      </div>

      {/* Bottom row: swatch + hex input + copy */}
      <div className="flex items-center gap-3" style={{ width: PLANE_SIZE }}>
        {/* Swatch preview */}
        <div
          className="flex-shrink-0 rounded-lg border border-[#16222E]/20"
          style={{
            width: 40,
            height: 40,
            backgroundColor: currentHex,
          }}
          aria-hidden
        />

        {/* Hex input */}
        <input
          type="text"
          value={hexInput}
          onChange={handleHexChange}
          maxLength={7}
          spellCheck={false}
          aria-label="Código hexadecimal del color"
          className="flex-1 min-w-0 rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#F5C84B]/70 focus:bg-white/10 transition-colors"
          placeholder="#rrggbb"
        />

        {/* Copy button */}
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar hex al portapapeles"
          title={copied ? '¡Copiado!' : 'Copiar hex'}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-white/40 hover:text-[#F5C84B] hover:bg-white/8 transition-colors cursor-pointer"
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}
