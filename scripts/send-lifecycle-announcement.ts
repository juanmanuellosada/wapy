// One-off script: sends the WhatsApp order lifecycle announcement
// (emails/WhatsAppLifecycleAnnouncement.tsx) to every registered store owner,
// before the 036_whatsapp_order_lifecycle migration goes live.
//
// Usage:
//   npx tsx scripts/send-lifecycle-announcement.ts --dry-run   # list recipients, sends nothing
//   npx tsx scripts/send-lifecycle-announcement.ts             # sends for real, asks to confirm first
//
// Safety:
//   - Requires typing an exact confirmation phrase interactively before sending anything real.
//     Never sends unattended (no TTY + no --dry-run aborts).
//   - A failed send for one store does not stop the batch; it's recorded and can be retried
//     by running the script again.
//   - Keeps a local log (send-lifecycle-announcement.log.json, gitignored) of who already
//     received the email, so re-running the script never sends a duplicate.

import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import type { Database } from '../lib/supabase/types';
import { sendWhatsAppLifecycleAnnouncementEmail } from '../lib/email';

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env.local'));
} catch {
  // No .env.local (e.g. env vars already exported in the shell) — continue.
}

const CONFIRMATION_PHRASE = 'ENVIAR ANUNCIO';
const LOG_PATH = path.join(__dirname, 'send-lifecycle-announcement.log.json');

type LogStatus = 'sent' | 'failed' | 'skipped_no_email';

interface LogEntry {
  storeId: string;
  storeName: string;
  email: string | null;
  status: LogStatus;
  at: string;
}

function loadLog(): LogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  return JSON.parse(readFileSync(LOG_PATH, 'utf8')) as LogEntry[];
}

function saveLog(entries: LogEntry[]) {
  writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Missing env var: SUPABASE_SERVICE_ROLE_KEY');
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function confirm(recipientCount: number): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error(
      'No hay una terminal interactiva para confirmar. Corré el script desde una terminal, ' +
        'o usá --dry-run para solo previsualizar los destinatarios.',
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Vas a enviar el anuncio a ${recipientCount} tienda(s). ` +
      `Escribí "${CONFIRMATION_PHRASE}" para confirmar: `,
  );
  rl.close();
  return answer.trim() === CONFIRMATION_PHRASE;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const admin = createAdminClient();
  const log = loadLog();
  const alreadySent = new Set(log.filter((e) => e.status === 'sent').map((e) => e.storeId));

  const { data: stores, error } = await admin.from('stores').select('id, name, owner_id');
  if (error) throw new Error(`No se pudieron leer las tiendas: ${error.message}`);

  const pending = (stores ?? []).filter((s) => !alreadySent.has(s.id));

  console.log(`Tiendas registradas: ${stores?.length ?? 0}`);
  console.log(`Ya enviadas en una corrida anterior: ${alreadySent.size}`);
  console.log(`Pendientes de enviar: ${pending.length}`);

  if (pending.length === 0) {
    console.log('Nada para enviar.');
    return;
  }

  if (dryRun) {
    for (const store of pending) console.log(`  - [dry-run] ${store.name} (${store.id})`);
    return;
  }

  const confirmed = await confirm(pending.length);
  if (!confirmed) {
    console.log('Confirmación no recibida. Cancelado, no se envió nada.');
    return;
  }

  let sent = 0;
  let failed = 0;
  let skippedNoEmail = 0;

  for (const store of pending) {
    let email: string | null = null;
    try {
      const { data: ownerData } = await admin.auth.admin.getUserById(store.owner_id);
      email = ownerData?.user?.email ?? null;

      if (!email) {
        skippedNoEmail += 1;
        log.push({ storeId: store.id, storeName: store.name, email: null, status: 'skipped_no_email', at: new Date().toISOString() });
        saveLog(log);
        console.warn(`  - sin email de dueña, salteada: ${store.name} (${store.id})`);
        continue;
      }

      await sendWhatsAppLifecycleAnnouncementEmail({ to: email, storeName: store.name });
      sent += 1;
      log.push({ storeId: store.id, storeName: store.name, email, status: 'sent', at: new Date().toISOString() });
      saveLog(log);
      console.log(`  - enviado: ${store.name} <${email}>`);
    } catch (err) {
      failed += 1;
      log.push({ storeId: store.id, storeName: store.name, email, status: 'failed', at: new Date().toISOString() });
      saveLog(log);
      console.error(`  - FALLÓ: ${store.name} (${store.id})`, err);
    }
  }

  console.log(`\nListo. Enviados: ${sent}. Fallidos: ${failed}. Sin email: ${skippedNoEmail}.`);
  if (failed > 0) console.log('Volvé a correr el script para reintentar los fallidos (no duplica los ya enviados).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
