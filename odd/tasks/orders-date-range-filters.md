# Orders date range filters

## Goal
Add custom start/end date filtering to dashboard order metrics while keeping the existing 30d, 90d, and year-to-date options as presets.

## Tasks
- [x] Update the order stats server contract to accept preset or custom date ranges and compute metrics over the selected inclusive range.
- [x] Update the orders dashboard metrics UI with start/end date inputs and preset buttons.
- [x] Add focused regression coverage for custom ranges and run relevant checks.

## Evidence
- `getOrderStats` accepts only the supported presets or `{ date_from, date_to }`; custom bounds represent inclusive `America/Argentina/Buenos_Aires` calendar days converted to UTC, and the same bounded orders set feeds KPIs, charts, products, sections, and margin.
- The dashboard exposes existing presets alongside `DatePicker` start/end controls; valid changes refresh automatically and invalid inverted ranges show inline feedback without a request.
- `npx --no-install vitest run lib/store/orders/actions.test.ts` passed: 77 tests, including UTC-deployment coverage that retains `2024-02-01T02:59:59.999Z` in the Argentine Jan 31 range while excluding `2024-02-01T03:00:00.000Z`, plus invalid runtime preset rejection.
