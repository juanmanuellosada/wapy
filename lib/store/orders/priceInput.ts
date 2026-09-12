// Parseo de montos ingresados a mano en el formulario de venta manual
// (ManualSaleModal). Separado en su propio módulo para poder testearlo sin
// depender de jsdom/testing-library, que este proyecto no usa.

/** Cents → texto editable, formato es-AR ("150050" → "1.500,50"). */
export function formatPriceDisplay(cents: number): string {
  return (cents / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 });
}

/**
 * Texto editable → cents. Acepta tanto el formato es-AR ("1.500,50") como el
 * de punto decimal ("1500.50"), porque quien carga la venta puede escribir
 * cualquiera de los dos por costumbre.
 *
 * Heurística: si el texto trae una coma, esa coma es SIEMPRE el separador
 * decimal (formato es-AR) y cualquier punto es de miles, se descarta. Sin
 * coma, un único punto seguido de exactamente 1 o 2 cifras HASTA EL FINAL se
 * interpreta como separador decimal ("1500.50" → 1500,50); en cualquier otro
 * caso (ningún punto, más de uno, o un punto seguido de 3+ cifras) los
 * puntos son separadores de miles y se descartan ("1.500" → 1500, "1.234.567"
 * → 1234567).
 */
export function parsePriceDisplay(display: string): number {
  const cleaned = display.replace(/[^0-9.,]/g, '');
  if (!cleaned) return 0;

  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const dotCount = (cleaned.match(/\./g) ?? []).length;
    const isDecimalDot = dotCount === 1 && /\.\d{1,2}$/.test(cleaned);
    normalized = isDecimalDot ? cleaned : cleaned.replace(/\./g, '');
  }

  const num = parseFloat(normalized);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}
