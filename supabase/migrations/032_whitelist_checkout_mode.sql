-- Admin invite form: add checkout_mode to whitelist so the store type is set at invite time.
-- Nullable, no default. When NULL, onboarding falls back to 'whatsapp'.

ALTER TABLE public.whitelist ADD COLUMN checkout_mode text CHECK (checkout_mode IN ('whatsapp','mercadopago'));
