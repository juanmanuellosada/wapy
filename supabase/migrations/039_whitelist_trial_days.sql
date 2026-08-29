-- Permite al superadmin pactar una duración de prueba distinta del default
-- (TRIAL_DAYS) al dar de alta manualmente a alguien en la whitelist.
--
-- Se guarda como cantidad de días, no como fecha: el vencimiento se calcula
-- recién cuando la persona crea su tienda, para que la duración pactada no
-- se consuma durante la ventana de invitación (INVITE_TTL_DAYS).
alter table public.whitelist
  add column trial_days integer
  constraint whitelist_trial_days_range check (trial_days is null or (trial_days between 0 and 365));

comment on column public.whitelist.trial_days is
  'Duración de prueba (en días) pactada al invitar manualmente. Nulo = usar el default del sistema (TRIAL_DAYS). El reloj arranca cuando la persona crea su tienda, no cuando se la invita.';
