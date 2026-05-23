-- handle_new_user: bridges auth.users → public.users on signup.
-- SECURITY DEFINER so it can write to public.users regardless of session role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Look up the grant_role from the whitelist (case-insensitive).
  SELECT grant_role INTO v_role FROM public.whitelist WHERE email = lower(NEW.email);

  -- Default to 'owner' if not whitelisted.
  v_role := COALESCE(v_role, 'owner');

  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, v_role);

  -- Mark as registered in the whitelist if the email was there
  UPDATE public.whitelist
  SET registered_at = NOW()
  WHERE email = lower(NEW.email) AND registered_at IS NULL;

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
