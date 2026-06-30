'use client';

import { useState } from 'react';
import { Calculator, ExternalLink } from 'lucide-react';

const IVA = 0.21;
const FEES = [
  { plazo: 'Al instante', rate: 0.0660 },
  { plazo: '10 días',     rate: 0.0461 },
  { plazo: '18 días',     rate: 0.0356 },
  { plazo: '35 días',     rate: 0.0156 },
];

const fmtPct = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtARS = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n);

export function MpFeesSimulator() {
  const [importe, setImporte] = useState('');

  const importeNum = parseFloat(importe);
  const validImporte = !isNaN(importeNum) && importeNum > 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-[#F5C84B] flex-shrink-0" />
        <h3 className="text-sm font-semibold text-[#FBF7EC]">Comisiones de Mercado Pago</h3>
      </div>

      <p className="text-xs text-white/50">
        Porcentajes para Buenos Aires, Chubut y Entre Ríos. Pueden variar según tu provincia.
      </p>

      {/* Importe input */}
      <div className="space-y-1.5">
        <label htmlFor="mp-importe" className="text-xs font-medium text-white/70">
          Importe de la venta (ARS)
        </label>
        <input
          id="mp-importe"
          type="number"
          min="0"
          step="0.01"
          placeholder="Ej: 10000"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          className="w-full bg-white/8 border border-white/15 rounded-xl px-4 py-3 text-sm text-[#FBF7EC] placeholder-white/30 focus:outline-none focus:border-[#009EE3]/50 focus:ring-1 focus:ring-[#009EE3]/30 transition-colors"
        />
      </div>

      {/* Fees table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[340px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left text-xs font-medium text-white/50 pb-2 pr-3">Plazo</th>
              <th className="text-right text-xs font-medium text-white/50 pb-2 px-3">Comisión</th>
              <th className="text-right text-xs font-medium text-white/50 pb-2 px-3">Con IVA</th>
              <th className="text-right text-xs font-medium text-white/50 pb-2 pl-3">Recibís</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {FEES.map(({ plazo, rate }) => {
              const rateConIva = rate * (1 + IVA);
              const recibis = validImporte ? importeNum - importeNum * rateConIva : null;
              return (
                <tr key={plazo}>
                  <td className="text-[#FBF7EC] py-2.5 pr-3 font-medium">{plazo}</td>
                  <td className="text-white/70 py-2.5 px-3 text-right tabular-nums">{fmtPct(rate)}</td>
                  <td className="text-white/70 py-2.5 px-3 text-right tabular-nums">{fmtPct(rateConIva)}</td>
                  <td className="text-[#F5C84B] py-2.5 pl-3 text-right tabular-nums font-medium">
                    {recibis !== null ? fmtARS(recibis) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Ejemplo fijo */}
      <div className="bg-white/5 rounded-xl px-3 py-2.5 text-xs text-white/60">
        <span className="font-medium text-white/80">Ejemplo:</span> vendés $200 a 35 días → comisión
        1,56% = $3,12 + IVA = $3,78 → recibís $196,22.
      </div>

      {/* Aclaraciones */}
      <ul className="space-y-1 text-xs text-white/50 list-disc list-inside">
        <li>El IVA (21%) se aplica sobre la comisión, no sobre el total de la venta.</li>
        <li>
          No incluye retenciones impositivas (Ingresos Brutos, Ganancias), que dependen de tu
          situación fiscal.
        </li>
        <li>Wapy no cobra ninguna comisión adicional.</li>
      </ul>

      {/* Links */}
      <div className="space-y-2 pt-1 border-t border-white/10">
        <a
          href="https://www.mercadopago.com.ar/ayuda/33399"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-[#009EE3] hover:underline"
        >
          <ExternalLink size={12} />
          Ver comisiones oficiales de Mercado Pago
        </a>
        <div className="text-xs text-white/50">
          Podés configurar en qué plazo se acreditan tus pagos desde tu cuenta de Mercado Pago
          (Costos → Procesamiento de pagos).{' '}
          <a
            href="https://www.mercadopago.com.ar/costs-section/merchant-svcs/processing/options"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#009EE3] hover:underline inline-flex items-center gap-1"
          >
            Elegir plazo de acreditación
            <ExternalLink size={10} />
          </a>
        </div>
      </div>
    </div>
  );
}
