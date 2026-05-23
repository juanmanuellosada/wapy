-- whitelist: gates who can register and carries role grant hints.

CREATE TABLE public.whitelist (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  grant_role    text NOT NULL DEFAULT 'owner' CHECK (grant_role IN ('owner', 'superadmin')),
  invite_token  text UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  invited_at    timestamptz NOT NULL DEFAULT NOW(),
  registered_at timestamptz
);

-- Enforce lowercase email on insert/update
CREATE OR REPLACE FUNCTION public.whitelist_lowercase_email()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email = lower(NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER whitelist_lowercase_email_trigger
  BEFORE INSERT OR UPDATE OF email ON public.whitelist
  FOR EACH ROW EXECUTE FUNCTION public.whitelist_lowercase_email();

-- RLS: superadmin-only direct access
ALTER TABLE public.whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whitelist_superadmin_all"
  ON public.whitelist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

-- Public security-definer function: lets signup flow check whitelist without exposing table.
-- Returns (allowed boolean, invite_token text).
CREATE OR REPLACE FUNCTION public.whitelist_check_email(p_email text)
RETURNS TABLE (allowed boolean, invite_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.whitelist%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.whitelist WHERE email = lower(p_email);
  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_row.invite_token;
  ELSE
    RETURN QUERY SELECT FALSE, NULL::text;
  END IF;
END;
$$;

-- Grant execute to anon role so the signup page can call it
GRANT EXECUTE ON FUNCTION public.whitelist_check_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.whitelist_check_email(text) TO authenticated;

-- Index on email
CREATE INDEX whitelist_email_idx ON public.whitelist (email);
