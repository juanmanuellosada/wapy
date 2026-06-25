/**
 * Coupon validity helpers — shared by server actions and client context.
 *
 * Argentina timezone: UTC-3 fixed (AR does not observe DST as of 2024).
 * If AR reintroduces DST, update AR_OFFSET_MINUTES and the comment here.
 */

const AR_OFFSET_MINUTES = -3 * 60; // UTC-3

/**
 * Normalizes a coupon code: uppercase + trim.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Returns true if the coupon is still within its validity window.
 *
 * - expires_at === null  → never expires (always valid).
 * - expires_at = "YYYY-MM-DD" → valid through 23:59:59 of that date in AR time (UTC-3).
 *
 * @param expiresAt - ISO date string ("YYYY-MM-DD") or null.
 * @param now       - Current UTC date. Defaults to new Date().
 */
export function isCouponValid(expiresAt: string | null, now: Date = new Date()): boolean {
  if (expiresAt === null) return true;

  // Build the deadline: expires_at at 23:59:59 AR = expires_at+1day at 02:59:59 UTC
  // Parse the date parts to avoid timezone ambiguity in Date constructor.
  const [year, month, day] = expiresAt.split('-').map(Number);

  // End of day in AR: next day 00:00:00 AR = next day 03:00:00 UTC
  // i.e., deadline = expires_at + 1 day at 03:00:00 UTC (exclusive upper bound)
  const deadlineUtc = Date.UTC(year, month - 1, day + 1, 0 - AR_OFFSET_MINUTES / 60, 0, 0);

  return now.getTime() < deadlineUtc;
}

/**
 * Calculates the discount amount given the coupon type/value and a cart total.
 * Returns a non-negative amount; for `fixed` coupons the discount is capped at `cartTotal`.
 *
 * @param discountType  - 'percent' | 'fixed'
 * @param discountValue - For 'percent': 0 < v ≤ 100. For 'fixed': positive amount.
 * @param cartTotal     - Current cart total (same currency unit as discountValue).
 */
export function calculateDiscount(
  discountType: 'percent' | 'fixed',
  discountValue: number,
  cartTotal: number,
): number {
  if (cartTotal <= 0) return 0;
  if (discountType === 'percent') {
    return Math.round((cartTotal * discountValue) / 100 * 100) / 100;
  }
  // fixed: cap at cartTotal so final total is never negative
  return Math.min(discountValue, cartTotal);
}
