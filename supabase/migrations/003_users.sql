-- public.users: application identity bridging Supabase Auth.
-- One row per auth.users row; role determines RLS access.

CREATE TABLE public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'superadmin')),
  created_at  timestamptz NOT NULL DEFAULT NOW(),
  updated_at  timestamptz NOT NULL DEFAULT NOW()
);

-- updated_at trigger
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "users_select_self"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own row, but NOT the role column
CREATE POLICY "users_update_self"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.users WHERE id = auth.uid()));

-- Superadmins can read all users
CREATE POLICY "users_select_superadmin"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

-- Superadmins can update any user (including role)
CREATE POLICY "users_update_superadmin"
  ON public.users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

-- Index on email for fast lookups
CREATE INDEX users_email_idx ON public.users (email);
