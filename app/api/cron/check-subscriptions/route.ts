export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// GET /api/cron/check-subscriptions
//
// Daily cron that applies store blocks. This is the ONLY endpoint that sets
// blocked_at. (Decision 4: webhook registers, cron blocks.)
//
// Idempotent by design: only updates stores where blocked_at IS NULL.
//
// Phase 1: Block stores with expired trial and no subscription (mp_preapproval_id NULL).
// Phase 2: Block stores whose subscription has been paused/cancelled for > 7 days.
// ---------------------------------------------------------------------------

const GRACE_DAYS = 7;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // --- Auth: Bearer token from CRON_SECRET ---
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/check-subscriptions] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // Phase 1: trial expired, no subscription, not exempt, not already blocked
  // ---------------------------------------------------------------------------
  const { data: phase1Rows, error: phase1Error } = await admin
    .from('stores')
    .update({ blocked_at: now, updated_at: now })
    .eq('payment_exempt', false)
    .is('blocked_at', null)
    .is('mp_preapproval_id', null)
    .lt('trial_ends_at', now)
    .select('id');

  if (phase1Error) {
    console.error('[cron/check-subscriptions] Phase 1 error', { phase1Error });
    return NextResponse.json({ error: 'Phase 1 failed', detail: phase1Error.message }, { status: 500 });
  }

  const phase1Count = phase1Rows?.length ?? 0;

  // ---------------------------------------------------------------------------
  // Phase 2: subscription paused/cancelled for > 7 days, not exempt, not already blocked
  // ---------------------------------------------------------------------------
  const graceCutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: phase2Rows, error: phase2Error } = await admin
    .from('stores')
    .update({ blocked_at: now, updated_at: now })
    .eq('payment_exempt', false)
    .is('blocked_at', null)
    .in('mp_subscription_status', ['paused', 'cancelled'])
    .lt('subscription_status_changed_at', graceCutoff)
    .select('id');

  if (phase2Error) {
    console.error('[cron/check-subscriptions] Phase 2 error', { phase2Error });
    return NextResponse.json({ error: 'Phase 2 failed', detail: phase2Error.message }, { status: 500 });
  }

  const phase2Count = phase2Rows?.length ?? 0;

  const summary = {
    phase1_blocked: phase1Count,
    phase2_blocked: phase2Count,
    total_blocked: phase1Count + phase2Count,
    run_at: now,
  };

  console.info('[cron/check-subscriptions] Run complete', summary);

  return NextResponse.json(summary);
}
