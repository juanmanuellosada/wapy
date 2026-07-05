export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// GET /api/cron/check-subscriptions
//
// Daily cron that applies store blocks. This is the ONLY endpoint that sets
// blocked_at to a timestamp. (Decision 4: webhook registers, cron blocks.)
//
// Idempotent by design: each phase only updates stores matching its own
// filter, independent of the other phases.
//
// Phase 1: Block stores with expired trial and no subscription (mp_preapproval_id NULL).
// Phase 2: Block stores whose subscription has been paused/cancelled for > GRACE_DAYS.
// Phase 3: Reconciliation — unblock stores whose subscription is authorized but
// still carry a stale blocked_at (safety net if the webhook missed the unblock).
// ---------------------------------------------------------------------------

const GRACE_DAYS = 5;

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
  // Phase 2: subscription paused/cancelled for > GRACE_DAYS, not exempt, not already blocked
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

  // ---------------------------------------------------------------------------
  // Phase 3: reconciliation — unblock stores that are authorized but still
  // carry a stale blocked_at (safety net if the webhook missed the unblock).
  // ---------------------------------------------------------------------------
  const { data: phase3Rows, error: phase3Error } = await admin
    .from('stores')
    .update({ blocked_at: null, updated_at: now })
    .eq('mp_subscription_status', 'authorized')
    .not('blocked_at', 'is', null)
    .select('id');

  if (phase3Error) {
    console.error('[cron/check-subscriptions] Phase 3 error', { phase3Error });
    return NextResponse.json({ error: 'Phase 3 failed', detail: phase3Error.message }, { status: 500 });
  }

  const phase3Count = phase3Rows?.length ?? 0;

  const summary = {
    phase1_blocked: phase1Count,
    phase2_blocked: phase2Count,
    phase3_unblocked: phase3Count,
    total_blocked: phase1Count + phase2Count,
    run_at: now,
  };

  console.info('[cron/check-subscriptions] Run complete', summary);

  return NextResponse.json(summary);
}
