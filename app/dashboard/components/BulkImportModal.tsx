'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { FileArchive, X, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Select } from '@/app/components/Select';
import { compressImage, MAX_FINAL_BYTES } from '@/lib/images/compress';
import { uploadProductImageAction } from '@/lib/onboarding/upload-actions';
import { bulkCreateProducts } from '@/lib/store/actions';
import { deriveProductName, dedupeNames } from '@/lib/store/bulk-import/filename';
import {
  MAX_ZIP_BYTES,
  MAX_PHOTOS_PER_ZIP,
  isIgnorableZipEntry,
  hasAcceptedImageExtension,
} from '@/lib/store/bulk-import/zip';
import type { Section } from '@/lib/onboarding/state';

const UPLOAD_POOL_SIZE = 3;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function mimeForFilename(path: string): string {
  const lower = path.toLowerCase();
  const ext = Object.keys(MIME_BY_EXTENSION).find((e) => lower.endsWith(e));
  return ext ? MIME_BY_EXTENSION[ext] : 'application/octet-stream';
}

function parsePriceCents(display: string): number {
  const cleaned = display.replace(/[^0-9,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return 0;
  return Math.round(num * 100);
}

type PendingEntry = {
  path: string; // ruta original dentro del ZIP, solo para mostrar errores
  productName: string; // nombre ya derivado y deduplicado
  getFile: () => File;
};

type UploadedPhoto = { path: string; productName: string; url: string };
type FailedPhoto = { path: string; productName: string; reason: string; file: File };

/** Descomprime el ZIP y arma la lista de entradas válidas, ya con el nombre de producto resuelto. */
async function extractZipEntries(zipFile: File): Promise<PendingEntry[]> {
  const buffer = new Uint8Array(await zipFile.arrayBuffer());
  const fflate = await import('fflate');

  const paths: string[] = [];
  const data = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    fflate.unzip(
      buffer,
      {
        filter(entry) {
          if (isIgnorableZipEntry(entry.name, entry.originalSize)) return false;
          if (!hasAcceptedImageExtension(entry.name)) return false;
          paths.push(entry.name);
          return true;
        },
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
  });

  if (paths.length === 0) {
    throw new Error('El ZIP no contiene fotos válidas (.jpg, .jpeg, .png o .webp).');
  }
  if (paths.length > MAX_PHOTOS_PER_ZIP) {
    throw new Error(
      `El ZIP trae ${paths.length} fotos y el máximo por importación es ${MAX_PHOTOS_PER_ZIP}. Dividilo en varios ZIP más chicos.`
    );
  }

  const productNames = dedupeNames(paths.map((p) => deriveProductName(p)));

  return paths.map((path, i) => ({
    path,
    productName: productNames[i],
    getFile: () => {
      const bytes = data[path];
      delete data[path]; // liberar la referencia apenas se toma
      const filename = path.split('/').pop() || path;
      return new File([new Uint8Array(bytes)], filename, { type: mimeForFilename(path) });
    },
  }));
}

/** Sube las entradas con un pool de concurrencia acotada, tolerando fallos parciales. */
async function uploadWithPool(
  entries: PendingEntry[],
  storeId: string,
  onProgress: (done: number) => void
): Promise<{ succeeded: UploadedPhoto[]; failed: FailedPhoto[] }> {
  const succeeded: UploadedPhoto[] = [];
  const failed: FailedPhoto[] = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      const rawFile = entry.getFile();
      try {
        const compressed = await compressImage(rawFile);
        if (compressed.size > MAX_FINAL_BYTES) {
          failed.push({
            path: entry.path,
            productName: entry.productName,
            reason: 'Sigue pesando más de 5 MB después de comprimir.',
            file: rawFile,
          });
        } else {
          const fd = new FormData();
          fd.append('file', compressed);
          fd.append('storeId', storeId);
          const result = await uploadProductImageAction(fd);
          if (result.ok) {
            succeeded.push({ path: entry.path, productName: entry.productName, url: result.url });
          } else {
            failed.push({
              path: entry.path,
              productName: entry.productName,
              reason: result.message ?? 'No se pudo subir la imagen.',
              file: rawFile,
            });
          }
        }
      } catch {
        failed.push({
          path: entry.path,
          productName: entry.productName,
          reason: 'Error inesperado al subir la imagen.',
          file: rawFile,
        });
      } finally {
        done++;
        onProgress(done);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPLOAD_POOL_SIZE, entries.length) }, worker));
  return { succeeded, failed };
}

type Phase = 'idle' | 'reading' | 'uploading' | 'creating' | 'summary';

type Props = {
  storeId: string;
  sections: Section[];
  onClose: () => void;
  /** Se llama cada vez que se crea al menos un producto (import inicial o reintento). */
  onImported?: (created: number) => void;
  /** Si se pasa, el resumen ofrece un acceso directo a la grilla de edición masiva. */
  onOpenGrid?: () => void;
};

export function BulkImportModal({ storeId, sections, onClose, onImported, onOpenGrid }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileError, setFileError] = useState<string | null>(null);

  const [sectionId, setSectionId] = useState<string | null>(null);
  const [priceDisplay, setPriceDisplay] = useState('');

  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [failed, setFailed] = useState<FailedPhoto[]>([]);
  const [createdCount, setCreatedCount] = useState(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingBatch, setPendingBatch] = useState<UploadedPhoto[] | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);

  const processing = phase === 'reading' || phase === 'uploading' || phase === 'creating';

  // Advertir antes de cerrar la pestaña mientras el import está en curso.
  useEffect(() => {
    if (!processing) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [processing]);

  useEffect(() => {
    if (processing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [processing, onClose]);

  const attemptCreate = useCallback(
    async (batch: UploadedPhoto[]) => {
      const items = batch.map((p) => ({ name: p.productName, imageUrl: p.url }));
      const priceCents = priceDisplay.trim() !== '' ? parsePriceCents(priceDisplay) : undefined;
      const result = await bulkCreateProducts(items, {
        sectionId: sectionId || null,
        ...(priceCents !== undefined ? { priceCents } : {}),
      });
      if ('error' in result) {
        setCreateError(result.error);
        setPendingBatch(batch);
      } else {
        setCreateError(null);
        setPendingBatch(null);
        setCreatedCount((prev) => prev + result.created);
        onImported?.(result.created);
      }
    },
    [priceDisplay, sectionId, onImported]
  );

  const handleFile = useCallback(
    async (zipFile: File) => {
      setFileError(null);

      if (!zipFile.name.toLowerCase().endsWith('.zip')) {
        setFileError('El archivo tiene que ser un .zip.');
        return;
      }
      if (zipFile.size > MAX_ZIP_BYTES) {
        setFileError(
          `El ZIP pesa más de ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))} MB. Dividilo en varios ZIP más chicos.`
        );
        return;
      }

      setPhase('reading');
      let entries: PendingEntry[];
      try {
        entries = await extractZipEntries(zipFile);
      } catch (e) {
        setPhase('idle');
        setFileError(e instanceof Error ? e.message : 'No pudimos leer el ZIP. Verificá que no esté dañado.');
        return;
      }

      setTotal(entries.length);
      setProcessed(0);
      setPhase('uploading');

      const { succeeded, failed: newFailed } = await uploadWithPool(entries, storeId, setProcessed);
      setFailed(newFailed);

      if (succeeded.length > 0) {
        setPhase('creating');
        await attemptCreate(succeeded);
      }
      setPhase('summary');
    },
    [storeId, attemptCreate]
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        setFileError('El archivo tiene que ser un .zip.');
        return;
      }
      const zipFile = accepted[0];
      if (zipFile) void handleFile(zipFile);
    },
    [handleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: phase !== 'idle',
  });

  const handleRetryFailed = useCallback(async () => {
    if (failed.length === 0) return;
    setRetryBusy(true);
    const entries: PendingEntry[] = failed.map((f) => ({
      path: f.path,
      productName: f.productName,
      getFile: () => f.file,
    }));

    setTotal(entries.length);
    setProcessed(0);
    setPhase('uploading');

    const { succeeded, failed: stillFailed } = await uploadWithPool(entries, storeId, setProcessed);
    setFailed(stillFailed);

    if (succeeded.length > 0) {
      setPhase('creating');
      await attemptCreate(succeeded);
    }
    setPhase('summary');
    setRetryBusy(false);
  }, [failed, storeId, attemptCreate]);

  const handleRetryCreate = useCallback(async () => {
    if (!pendingBatch) return;
    setRetryBusy(true);
    setPhase('creating');
    await attemptCreate(pendingBatch);
    setPhase('summary');
    setRetryBusy(false);
  }, [pendingBatch, attemptCreate]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar productos desde ZIP"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => !processing && onClose()}
        aria-hidden
      />

      <div className="relative z-10 w-full sm:max-w-lg bg-[#1A2634] rounded-t-2xl sm:rounded-2xl border border-white/10 max-h-[90dvh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-[#1A2634] border-b border-white/10 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="font-bold text-[#FBF7EC]">Importar productos desde ZIP</h2>
          {!processing && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg text-white/50 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-5">
          {phase === 'idle' && (
            <>
              <div>
                <label htmlFor="bulk-section" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                  Sección <span className="text-white/30 font-normal">(opcional, para todo el lote)</span>
                </label>
                <Select
                  id="bulk-section"
                  value={sectionId}
                  onChange={setSectionId}
                  options={[
                    { value: '', label: 'Sin sección' },
                    ...sections.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  placeholder="Sin sección"
                  ariaLabel="Sección para todo el lote"
                />
              </div>

              <div>
                <label htmlFor="bulk-price" className="block text-sm font-semibold text-[#FBF7EC] mb-1.5">
                  Precio (ARS) <span className="text-white/30 font-normal">(opcional, para todo el lote)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">$</span>
                  <input
                    id="bulk-price"
                    type="text"
                    inputMode="numeric"
                    value={priceDisplay}
                    onChange={(e) => setPriceDisplay(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl bg-white/8 border border-white/15 text-[#FBF7EC] placeholder-white/30 pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#F5C84B]/70 transition-colors"
                  />
                </div>
                <p className="text-xs text-white/40 mt-1">
                  Cargar un precio no publica los productos: igual quedan en borrador hasta que los publiques a
                  mano.
                </p>
              </div>

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-[#F5C84B] bg-[#F5C84B]/5'
                    : 'border-white/20 hover:border-[#F5C84B]/50 hover:bg-white/3'
                }`}
              >
                <input {...getInputProps()} />
                <FileArchive size={28} className="text-white/30 mx-auto mb-2" />
                <p className="text-sm text-white/50">Arrastrá o clickeá para subir un ZIP con las fotos</p>
                <p className="text-xs text-white/30 mt-1">
                  Máx. 60 MB · hasta {MAX_PHOTOS_PER_ZIP} fotos · .jpg, .jpeg, .png, .webp
                </p>
              </div>

              {fileError && (
                <p role="alert" className="text-xs text-red-400">
                  {fileError}
                </p>
              )}
            </>
          )}

          {processing && (
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <Loader2 size={28} className="text-[#F5C84B] animate-spin" />
              <p className="text-sm text-[#FBF7EC] font-semibold">
                {phase === 'reading' && 'Leyendo el ZIP…'}
                {phase === 'uploading' && `Procesando ${processed} de ${total}`}
                {phase === 'creating' && 'Creando los productos…'}
              </p>
              {phase === 'uploading' && total > 0 && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-[#F5C84B] transition-all"
                    style={{ width: `${Math.round((processed / total) * 100)}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-amber-300/80">No cierres esta pestaña hasta que termine.</p>
            </div>
          )}

          {phase === 'summary' && (
            <div className="space-y-4">
              {createdCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>
                    Se {createdCount === 1 ? 'creó 1 producto' : `crearon ${createdCount} productos`} en borrador.
                  </span>
                </div>
              )}

              {createError && (
                <div
                  role="alert"
                  className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300 space-y-2"
                >
                  <p>No pudimos crear los productos: {createError}</p>
                  {pendingBatch && (
                    <button
                      type="button"
                      onClick={handleRetryCreate}
                      disabled={retryBusy}
                      className="text-xs font-semibold text-red-200 underline hover:text-white disabled:opacity-50 cursor-pointer"
                    >
                      Reintentar creación ({pendingBatch.length} foto{pendingBatch.length === 1 ? '' : 's'} ya
                      subidas)
                    </button>
                  )}
                </div>
              )}

              {failed.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-300">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>
                      {failed.length} foto{failed.length === 1 ? '' : 's'} no se {failed.length === 1 ? 'pudo' : 'pudieron'} subir.
                    </span>
                  </div>
                  <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-white/60 bg-white/5 rounded-xl border border-white/10 p-3">
                    {failed.map((f) => (
                      <li key={f.path}>
                        <span className="text-white/80">{f.path.split('/').pop()}</span>: {f.reason}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={handleRetryFailed}
                    disabled={retryBusy}
                    className="text-xs font-semibold text-[#F5C84B] hover:text-[#FAE08A] disabled:opacity-50 cursor-pointer"
                  >
                    Reintentar solo las fallidas ({failed.length})
                  </button>
                </div>
              )}

              {createdCount === 0 && failed.length === 0 && !createError && (
                <p className="text-sm text-white/60">No se creó ningún producto.</p>
              )}

              <div className="flex gap-3 pt-2">
                {createdCount > 0 && onOpenGrid && (
                  <button
                    type="button"
                    onClick={onOpenGrid}
                    className="flex-1 min-h-[44px] rounded-xl bg-[#F5C84B] text-[#16222E] font-bold text-sm hover:bg-[#FAE08A] transition-colors cursor-pointer"
                  >
                    Ir a edición masiva
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] rounded-xl border border-white/20 text-white/70 font-semibold text-sm hover:border-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
