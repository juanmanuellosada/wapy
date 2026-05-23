-- Landing revamp: leads capture table.
-- Visitors submit the pricing form, server action INSERTs via admin client.
-- Anon has NO policy, so only superadmins can read/manage. createLead bypasses
-- RLS by using the admin client server-side.

CREATE TABLE public.leads (
  id            uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  whatsapp      text NOT NULL,
  plan          text NOT NULL CHECK (plan IN ('inicial', 'pro')),
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'declined')),
  approved_at   timestamptz,
  approved_by   uuid REFERENCES public.users(id),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_superadmin_all"
  ON public.leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'superadmin'
    )
  );

CREATE INDEX leads_status_idx ON public.leads (status);
CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
