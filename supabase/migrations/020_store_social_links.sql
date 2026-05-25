-- social_links: store social network URLs (instagram, facebook, tiktok, twitter, youtube).
-- WhatsApp is intentionally excluded — it lives in whatsapp_number.
-- NOT NULL DEFAULT '{}' so consumers never have to null-check the column.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;
